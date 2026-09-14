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
import { normalizeMapLayout } from './map-layout-normalizer';
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

/**
 * Grupos sin recuadro en la imagen.
 *
 * Sin recuadro no hay derivación espacial, y el mapa vuelve a armarse con el
 * `position` / `lane` / `stackOrder` que eligió el modelo — que es de donde
 * salen los mapas con la numeración perfecta y los bloques desordenados. Es una
 * sola advertencia para todo el mapa: si faltan los recuadros suelen faltar
 * varios, y N advertencias iguales no dicen más que una.
 */
function checkMissingBoxes(result: AnalyzeMapResult): MapLayoutWarning[] {
  const missing = result.layout.groups.filter(g => !g.box);
  if (!missing.length) return [];

  const sample = missing.slice(0, 3).map(describeGroup).join(', ');
  const rest = missing.length > 3 ? ` y ${missing.length - 3} más` : '';

  return [
    warn(
      'MISSING_GROUP_BOX',
      missing.length === 1 ? missing[0]!.id : null,
      `${missing.length} sector(es) sin recuadro en la imagen (${sample}${rest}): ` +
        'la ubicación se resolvió sin geometría y el orden de los bloques puede no coincidir con el plano.'
    )
  ];
}

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
  warnings.push(...checkDuplicateLabels(result));
  warnings.push(...checkMissingBoxes(result));

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
