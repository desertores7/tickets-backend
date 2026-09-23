/**
 * Verificación determinística del layout devuelto por la IA.
 *
 * No corrige nada ni llama al modelo: compara lo que el modelo dijo contra lo
 * que efectivamente entregó y devuelve las inconsistencias. Corre en menos de
 * un milisegundo y no depende del tipo de plano, así que funciona igual en un
 * flyer que nunca se vio.
 *
 * Los tres cruces cubren los dos tipos de mapa que suben las productoras:
 *
 *  - DECLARED_COUNT_MISMATCH y GRID_SHAPE_MISMATCH atrapan los planos de
 *    unidades numeradas (mesas, palcos, boxes), donde la falla típica es que
 *    el modelo liste menos labels de los que contó.
 *  - CATEGORY_WITHOUT_GROUP atrapa los planos de zonas, donde la tabla de
 *    precios del propio flyer es la lista de sectores que tiene que haber.
 *
 * Consumido por EventAiService.analyzeSalesMap. Lo que devuelve NO viaja al
 * productor: dispara la reparación dirigida y queda en el log y en
 * `event_ai_map_run` para poder revisarlo después.
 */
import {
  AiEventMapLayoutGroup,
  AnalyzeMapResult,
  MapLayoutWarning,
  MapLayoutWarningCode
} from '../contracts/ievent-ai.service';
import { normalizeMapLayout, UNRESOLVED_CATEGORY_ID } from './map-layout-normalizer';
import { expandCell, isSectorLayout, layoutKeys, parseCellKey } from '../core/map-grid';
import { applySpatialPlacement } from './map-spatial-layout';

/** Etiqueta legible de un grupo para los mensajes. */
function describeGroup(group: AiEventMapLayoutGroup): string {
  const first = group.labels[0];
  const last = group.labels[group.labels.length - 1];
  if (!first) return group.id;
  if (group.labels.length === 1) return `"${first}"`;
  return `"${first}"…"${last}"`;
}

function warn(
  code: MapLayoutWarningCode,
  groupId: string | null,
  message: string
): MapLayoutWarning {
  return { code, groupId, message };
}

/**
 * El modelo declaró un total y entregó otra cantidad de labels.
 *
 * Es la señal más barata y más confiable de que se olvidó elementos: cuando
 * omite, casi siempre cuenta bien y lista de menos. El normalizador se queda
 * con labels.length (correcto, porque es lo único verificable), así que sin
 * esta comparación el faltante desaparece sin dejar rastro.
 */
function checkDeclaredCount(
  group: AiEventMapLayoutGroup,
  declared: number | null
): MapLayoutWarning | null {
  if (declared === null || declared <= 0) return null;
  if (group.layoutType === 'zone') return null;
  const actual = group.labels.length;
  if (declared === actual) return null;

  return warn(
    'DECLARED_COUNT_MISMATCH',
    group.id,
    declared > actual
      ? `El grupo ${describeGroup(group)} declara ${declared} elementos y solo listó ${actual}: ` +
          `faltan ${declared - actual}.`
      : `El grupo ${describeGroup(group)} declara ${declared} elementos y listó ${actual}.`
  );
}

/**
 * Una grilla cuyas filas por columnas no dan los labels que tiene.
 *
 * El frontend dibuja rows × columns celdas: si sobran, quedan huecos al final
 * de la última fila. Es el mismo faltante que el cruce anterior, visto desde la
 * forma en lugar del total, y atrapa el caso en que el modelo no declaró count.
 */
function checkGridShape(group: AiEventMapLayoutGroup): MapLayoutWarning | null {
  if (group.layoutType !== 'grid') return null;
  if (!group.rows || !group.columns) return null;

  const cells = group.rows * group.columns;
  const actual = group.labels.length;
  if (cells === actual) return null;

  return warn(
    'GRID_SHAPE_MISMATCH',
    group.id,
    `La grilla ${describeGroup(group)} es de ${group.rows}×${group.columns} ` +
      `(${cells} lugares) pero tiene ${actual} elementos.`
  );
}

/**
 * Una categoría con precio que no aparece en ningún grupo del mapa.
 *
 * En los planos de zonas la tabla de SECTORES y PRECIOS es la lista completa de
 * lo que se vende: si el flyer declara nueve sectores y el layout trae siete,
 * el propio flyer delata los dos que faltan. Solo se consideran las categorías
 * con precio detectado, porque son las que con certeza son una zona a la venta.
 */
function checkCategoriesWithoutGroup(result: AnalyzeMapResult): MapLayoutWarning[] {
  const used = new Set<string>();
  for (const group of result.layout.groups) {
    if (group.category) used.add(group.category);
    for (const assignment of group.categoryAssignments) used.add(assignment.category);
  }

  return result.categories
    .filter(category => category.detectedPrice !== null && !used.has(category.id))
    .map(category =>
      warn(
        'CATEGORY_WITHOUT_GROUP',
        null,
        `"${category.label}" figura en los precios del flyer pero no tiene ningún sector en el mapa.`
      )
    );
}

/**
 * Un grupo (o un rango dentro de un grupo) cuyo texto de categoría no calzó
 * con ninguna categoría real (`UNRESOLVED_CATEGORY_ID`, ver
 * map-layout-normalizer.ts).
 *
 * Antes esto no se detectaba: se adivinaba una categoría del mismo tipo y la
 * tanda de un sector quedaba pegada a otro sin que nadie se enterara. Ahora se
 * marca para que dispare reparación con visión (VISION_REPAIR_CODES) y, si ni
 * así se resuelve, el sector sale sin tanda asignada en vez de robarle la de
 * otro.
 */
function checkCategoryAssignmentsUnresolved(result: AnalyzeMapResult): MapLayoutWarning[] {
  const warnings: MapLayoutWarning[] = [];
  for (const group of result.layout.groups) {
    const unresolved =
      group.category === UNRESOLVED_CATEGORY_ID ||
      group.categoryAssignments.some(a => a.category === UNRESOLVED_CATEGORY_ID);
    if (!unresolved) continue;
    warnings.push(
      warn(
        'CATEGORY_ASSIGNMENT_UNRESOLVED',
        group.id,
        `No se pudo identificar a qué sector de precios corresponde ${describeGroup(group)}.`
      )
    );
  }
  return warnings;
}

/**
 * Dos sectores con el mismo nombre dentro del mismo nivel.
 *
 * El guardado los rechaza (la puerta no sabría cuál escaneó), así que conviene
 * avisarlo en el análisis y no cuando el productor aprieta guardar. Si el plano
 * tiene pisos y el modelo los declaró, cada piso se evalúa por separado.
 */
function checkDuplicateLabels(result: AnalyzeMapResult): MapLayoutWarning[] {
  const seen = new Map<string, string>();
  const warnings: MapLayoutWarning[] = [];

  for (const group of result.layout.groups) {
    if (group.layoutType === 'zone') continue;
    const level = (group.level ?? '').trim().toLowerCase();
    for (const label of group.labels) {
      const key = `${level}\u0000${label.trim().toLowerCase()}`;
      const previous = seen.get(key);
      if (previous && previous !== group.id) {
        warnings.push(
          warn(
            'DUPLICATE_LABEL',
            group.id,
            group.level
              ? `"${label}" aparece dos veces en ${group.level}.`
              : `"${label}" aparece en dos grupos. Si son de pisos distintos, falta indicar el piso.`
          )
        );
      }
      seen.set(key, group.id);
    }
  }

  // Un mismo label repetido muchas veces no aporta N advertencias iguales.
  const unique = new Map<string, MapLayoutWarning>();
  for (const w of warnings) unique.set(w.message, w);
  return [...unique.values()];
}

/** Celdas 1×1 que ocupa un grupo según lo que declaró el modelo (cell o footprint). */
function occupiedKeys(group: AiEventMapLayoutGroup): string[] {
  // unitCells no cuenta: el modelo no las define, las genera el rasterizado.
  const cells = group.footprintCells?.length
    ? group.footprintCells
    : group.cell
      ? [group.cell]
      : [];
  const keys = new Set<string>();
  for (const c of cells) for (const k of expandCell(c)) keys.add(k);
  return [...keys];
}

/**
 * Geometría en celdas de cada grupo (prompt 24×24).
 *
 * - MISSING_GROUP_CELLS: el grupo no trae `cell` ni `unitCells`, así que el
 *   rasterizado lo ubica a ciegas.
 *
 * `unitCells` no se exige: las genera el rasterizado, uniformes.
 */
function checkGroupCells(result: AnalyzeMapResult): MapLayoutWarning[] {
  const warnings: MapLayoutWarning[] = [];
  const missing = result.layout.groups.filter(g => !g.cell && !g.unitCells?.length && !g.box);
  if (missing.length) {
    const sample = missing.slice(0, 3).map(describeGroup).join(', ');
    const rest = missing.length > 3 ? ` y ${missing.length - 3} más` : '';
    warnings.push(
      warn(
        'MISSING_GROUP_CELLS',
        missing.length === 1 ? missing[0]!.id : null,
        `${missing.length} sector(es) sin celdas en la grilla 24×24 (${sample}${rest}): ` +
          'emití cell y unitCells para cada uno.'
      )
    );
  }

  return warnings;
}

/**
 * Dos grupos (o un grupo y el escenario) que ocupan la misma celda. Una
 * advertencia por par.
 */
function checkCellOverlaps(result: AnalyzeMapResult): MapLayoutWarning[] {
  const owner = new Map<string, string>();
  const labelOf = new Map<string, string>();
  const stage = result.stage.layout;
  if (stage && isSectorLayout(stage)) {
    for (const k of layoutKeys(stage)) owner.set(k, STAGE_ID);
    labelOf.set(STAGE_ID, 'el escenario');
  }

  const warnings: MapLayoutWarning[] = [];
  const seenPairs = new Set<string>();
  for (const group of result.layout.groups) {
    labelOf.set(group.id, `el sector ${describeGroup(group)}`);
    for (const k of occupiedKeys(group)) {
      const prev = owner.get(k);
      if (prev === undefined) {
        owner.set(k, group.id);
        continue;
      }
      if (prev === group.id) continue;
      const pair = `${prev}|${group.id}`;
      if (seenPairs.has(pair)) continue;
      seenPairs.add(pair);
      const { col, row } = parseCellKey(k);
      warnings.push(
        warn(
          'CELL_OVERLAP',
          group.id,
          `${labelOf.get(group.id)} pisa a ${labelOf.get(prev)} en la celda (${col}, ${row}). ` +
            'Ninguna celda puede pertenecer a dos sectores ni al escenario; usá footprintCells para las formas L/U.'
        )
      );
    }
  }
  return warnings;
}

const STAGE_ID = '__stage__';

/**
 * Corre todos los cruces sobre el layout ya normalizado.
 *
 * `declaredCounts` es el `count` tal como lo mandó el modelo, por id de grupo:
 * el normalizador lo reemplaza por labels.length, así que hay que capturarlo
 * antes de normalizar y pasarlo acá.
 */
export function verifyMapLayout(
  result: AnalyzeMapResult,
  declaredCounts: Map<string, number>
): MapLayoutWarning[] {
  const warnings: MapLayoutWarning[] = [];

  for (const group of result.layout.groups) {
    const declared = declaredCounts.get(group.id) ?? null;
    const countWarning = checkDeclaredCount(group, declared);
    if (countWarning) warnings.push(countWarning);

    // Si el total ya falló, la forma de la grilla dice lo mismo con otras
    // palabras: una sola advertencia por grupo alcanza.
    if (!countWarning) {
      const gridWarning = checkGridShape(group);
      if (gridWarning) warnings.push(gridWarning);
    }
  }

  warnings.push(...checkCategoriesWithoutGroup(result));
  warnings.push(...checkCategoryAssignmentsUnresolved(result));
  warnings.push(...checkDuplicateLabels(result));
  warnings.push(...checkGroupCells(result));
  warnings.push(...checkCellOverlaps(result));

  return warnings;
}

/**
 * `count` crudo por grupo, leído del JSON del modelo antes de normalizar.
 *
 * Los ids se recalculan al normalizar (se slugifican y se desduplican), así que
 * se toma la posición del grupo en el array — el normalizador preserva el orden
 * y descarta solo los grupos sin labels, que de todos modos no se verifican.
 */
export function collectDeclaredCounts(
  raw: Record<string, unknown>,
  result: AnalyzeMapResult
): Map<string, number> {
  const counts = new Map<string, number>();

  const layout = raw.layout && typeof raw.layout === 'object' ? (raw.layout as Record<string, unknown>) : raw;
  const rawGroups = Array.isArray(layout.groups)
    ? layout.groups
    : Array.isArray((raw as Record<string, unknown>).groups)
      ? ((raw as Record<string, unknown>).groups as unknown[])
      : [];

  if (rawGroups.length !== result.layout.groups.length) return counts;

  for (let i = 0; i < rawGroups.length; i++) {
    const item = rawGroups[i];
    if (!item || typeof item !== 'object') continue;
    const declared = Number((item as Record<string, unknown>).count);
    if (!Number.isInteger(declared) || declared <= 0) continue;
    counts.set(result.layout.groups[i]!.id, declared);
  }

  return counts;
}

/**
 * Mezcla los grupos corregidos por la pasada de reparación sobre el layout
 * original, emparejando por id.
 *
 * Solo reemplaza lo que vino: un grupo que la reparación no devolvió queda
 * exactamente como estaba. Los ids nuevos se agregan al final, que es el caso
 * de un sector que faltaba entero en el mapa.
 *
 * Devuelve una copia; no toca el original, para poder descartar la reparación
 * si deja el mapa peor de lo que estaba.
 */
export function mergeRepairedGroups(
  original: AnalyzeMapResult,
  repairPayload: Record<string, unknown>
): { result: AnalyzeMapResult; changed: boolean } {
  const rawGroups = Array.isArray(repairPayload.groups) ? repairPayload.groups : [];
  const rawCategories = Array.isArray(repairPayload.categories) ? repairPayload.categories : [];

  if (!rawGroups.length && !rawCategories.length) {
    return { result: original, changed: false };
  }

  // El normalizador es el que sabe interpretar la salida del modelo: la
  // reparación pasa por el mismo camino en vez de confiar en el crudo.
  const normalized = normalizeMapLayout({
    stage: original.stage,
    categories: [...original.categories, ...rawCategories],
    layout: { groups: rawGroups }
  });

  const byId = new Map(normalized.layout.groups.map(g => [g.id, g]));
  let changed = false;

  let groups = original.layout.groups.map(group => {
    const fixed = byId.get(group.id);
    if (!fixed) return group;
    byId.delete(group.id);
    changed = true;
    // El recuadro de la reparación vale solo si trae uno: si no, se conserva el
    // del análisis original, que vio el plano entero.
    const box = fixed.box ?? group.box;
    return {
      ...fixed,
      box,
      // Sin celdas en la reparación se conservan las del análisis original.
      cell: fixed.cell ?? group.cell,
      unitCells: fixed.unitCells?.length ? fixed.unitCells : group.unitCells,
      footprintCells: fixed.unitCells?.length || fixed.cell ? fixed.footprintCells : group.footprintCells,
      // Sin recuadro no hay geometría que mande, y el placement del análisis
      // original —que miró todo el plano— es mejor que el de la reparación, que
      // solo vio un recorte del problema. Con recuadro da igual lo que venga
      // acá: applySpatialPlacement lo recalcula unas líneas más abajo.
      position: group.position,
      lane: group.lane,
      stackOrder: group.stackOrder
    };
  });

  // Lo que sobra son sectores que no existían: van al final.
  for (const added of byId.values()) {
    groups.push(added);
    changed = true;
  }

  if (!changed) return { result: original, changed: false };

  // Un sector agregado o un recuadro que antes faltaba cambian el plano: hay que
  // rehacer la derivación sobre el conjunto completo, no dejarlo pegado al final
  // con el placement que haya adivinado la reparación.
  const spatial = applySpatialPlacement(groups, original.mapArea);
  if (spatial.applied) groups = spatial.groups;

  const categoryIds = new Set(original.categories.map(c => c.id));
  const categories = [
    ...original.categories,
    ...normalized.categories.filter(c => !categoryIds.has(c.id))
  ];

  return {
    result: { ...original, categories, layout: { ...original.layout, groups } },
    changed: true
  };
}

/**
 * Problemas que solo se arreglan mirando el plano otra vez: faltan labels o
 * sectores, o falta el piso. GRID_SHAPE_MISMATCH entra porque una grilla con
 * más lugares que labels casi siempre es un label que el modelo no listó
 * (el caso inverso ya lo corrige el normalizador). Todo lo demás (solapes,
 * celdas fuera de rango, celdas faltantes, unitCells) lo resuelven
 * `fixStructuralIssues` y el rasterizado sin llamar al modelo.
 */
export const VISION_REPAIR_CODES: ReadonlySet<MapLayoutWarningCode> = new Set<MapLayoutWarningCode>([
  'DECLARED_COUNT_MISMATCH',
  'GRID_SHAPE_MISMATCH',
  'CATEGORY_WITHOUT_GROUP',
  'CATEGORY_ASSIGNMENT_UNRESOLVED',
  'DUPLICATE_LABEL'
]);

export function needsVisionRepair(warnings: MapLayoutWarning[]): boolean {
  return warnings.some(w => VISION_REPAIR_CODES.has(w.code));
}

/**
 * Arreglos estructurales en código, sin segunda llamada: una grilla cuyo
 * rows × columns no coincide con los labels se re-dimensiona conservando las
 * columnas. Devuelve cuántos grupos tocó.
 */
export function fixStructuralIssues(result: AnalyzeMapResult): number {
  let fixed = 0;
  result.layout.groups = result.layout.groups.map(group => {
    if (group.layoutType !== 'grid') return group;
    const n = group.labels.length;
    if (!n) return group;
    const columns = Math.min(n, Math.max(1, group.columns ?? Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / columns);
    if (group.rows === rows && group.columns === columns) return group;
    fixed++;
    return { ...group, rows, columns };
  });
  return fixed;
}
