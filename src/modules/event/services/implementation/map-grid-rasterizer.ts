import type {
  AiEventMapArea,
  AiEventMapBox,
  AiEventMapCell,
  AiEventMapLayoutGroup,
  AnalyzeMapResult
} from '../contracts/ievent-ai.service';
import {
  MAP_GRID_SCALE,
  MAP_GRID_SIZE,
  MapGridCell,
  MapSectorLayout,
  NormBox,
  boxToCell,
  clampCell,
  defaultStageLayout,
  expandCell,
  inferStagePosition,
  layoutArea,
  layoutBounds,
  layoutKeys,
  packLayouts,
  isSectorLayout,
  parseCellKey,
  scaleModelCell,
  scaleModelLayout
} from '../core/map-grid';

/**
 * Rasteriza el análisis de IA a la grilla fija 24×24.
 *
 * Después de esto el análisis trae, para el escenario y cada grupo, las celdas
 * exactas que ocupan — sin solapes — y los `box` pasan a ser derivados de esas
 * celdas (sobre `mapArea`). El editor del frontend los respeta tal cual
 * (`unitCells` / `footprintCells`) y ya no reconstruye nada desde recuadros.
 *
 * Pack tipo Tetris:
 *  1. El escenario reclama sus celdas primero.
 *  2. Grupos de varias unidades (mesas, palcos) son rígidos: solo se trasladan.
 *  3. Zonas, de menor a mayor: ceden las celdas en conflicto (quedan en L/U)
 *     o, si perderían más de la mitad, se corren al hueco libre más cercano.
 */

const FULL_AREA: AiEventMapArea = { x: 0, y: 0, w: 1, h: 1, confidence: 1 };

/** Margen de una celda alrededor del contenido al estirar los recuadros. */
/** Una zona recortada nunca baja de esto: si no, desaparece del plano. */
const MIN_ZONE_SPAN = 3 * MAP_GRID_SCALE;

const MARGIN = MAP_GRID_SCALE / MAP_GRID_SIZE;
/** Franja reservada al escenario cuando no vino dibujado. */
const STAGE_BAND = (2 * MAP_GRID_SCALE) / MAP_GRID_SIZE;

function labelsOf(group: AiEventMapLayoutGroup): string[] {
  if (group.labels.length) return group.labels;
  return Array.from({ length: Math.max(1, group.count || 1) }, (_, i) => `${group.id}-${i + 1}`);
}

function isRigid(group: AiEventMapLayoutGroup): boolean {
  return (
    group.layoutType !== 'zone' && group.layoutType !== 'freeform' && labelsOf(group).length > 1
  );
}

/** Cuántas unidades por eje. Mismo criterio que `desiredUnitGrid` del front. */
function unitGrid(group: AiEventMapLayoutGroup): { cols: number; rows: number } {
  const n = labelsOf(group).length;
  if (!isRigid(group)) return { cols: 1, rows: 1 };
  let cols: number;
  let rows: number;
  switch (group.layoutType) {
    case 'column':
      cols = 1;
      rows = n;
      break;
    case 'row':
      cols = n;
      rows = 1;
      break;
    default:
      cols = Math.max(1, group.columns ?? Math.ceil(Math.sqrt(n)));
      rows = Math.max(1, group.rows ?? Math.ceil(n / cols));
  }
  // Más unidades que celdas en un eje: se parte en líneas.
  if (cols > MAP_GRID_SIZE) {
    cols = MAP_GRID_SIZE;
    rows = Math.ceil(n / cols);
  }
  if (rows > MAP_GRID_SIZE) {
    rows = MAP_GRID_SIZE;
    cols = Math.min(MAP_GRID_SIZE, Math.ceil(n / rows));
  }
  return { cols, rows };
}

function fitSpan(cell: MapGridCell, colSpan: number, rowSpan: number): MapGridCell {
  const c = Math.min(MAP_GRID_SIZE, Math.max(cell.colSpan, colSpan));
  const r = Math.min(MAP_GRID_SIZE, Math.max(cell.rowSpan, rowSpan));
  const col = Math.min(
    MAP_GRID_SIZE - c + 1,
    Math.max(1, cell.col - Math.floor((c - cell.colSpan) / 2))
  );
  const row = Math.min(
    MAP_GRID_SIZE - r + 1,
    Math.max(1, cell.row - Math.floor((r - cell.rowSpan) / 2))
  );
  return { col, row, colSpan: c, rowSpan: r };
}

function unitIndexToRowCol(
  index: number,
  cols: number,
  rows: number,
  group: AiEventMapLayoutGroup
): { row: number; col: number } {
  if (group.layoutType === 'column') return { row: Math.min(index, rows - 1), col: 0 };
  if (group.layoutType === 'row' && rows === 1) return { row: 0, col: Math.min(index, cols - 1) };
  if (group.ordering === 'column_major') {
    return { col: Math.floor(index / rows), row: index % rows };
  }
  return { row: Math.floor(index / cols), col: index % cols };
}

type UnitSize = { uw: number; uh: number };

function naturalUnitSize(group: AiEventMapLayoutGroup, groupCell: MapGridCell): UnitSize {
  if (!isRigid(group)) return { uw: groupCell.colSpan, uh: groupCell.rowSpan };
  const { cols, rows } = unitGrid(group);
  const gc = fitSpan(groupCell, cols, rows);
  return {
    uw: Math.max(1, Math.floor(gc.colSpan / cols)),
    uh: Math.max(1, Math.floor(gc.rowSpan / rows))
  };
}

/** Misma categoría comercial (o mismo elementType) → mismo tamaño de unidad. */
function categorySizeKey(group: AiEventMapLayoutGroup): string {
  const cat = (group.category ?? '').trim().toLowerCase();
  if (cat) return `cat:${cat}`;
  return `type:${group.elementType}`;
}

/**
 * Normaliza la MAGNITUD de la unidad conservando su orientación.
 *
 * El tamaño de cada unidad no lo decide nadie: sale de dividir el bbox que
 * mandó el modelo por rows×columns. Como el prompt le permitía usar "un
 * múltiplo exacto" del grid, podía mandar 10×10 para una grilla de 10 columnas
 * y 5 filas, y cada mesa salía 1×2 —un rectángulo vertical donde el plano
 * dibuja un círculo—. Con otro flyer elegía otro múltiplo y la misma mesa salía
 * 1×1 o 2×2: de ahí la variabilidad.
 *
 * Reglas:
 *  - Mesas y sillas son cuadradas en todos los planos: 1×1, siempre.
 *  - El resto conserva si el modelo la midió más ancha que alta (o al revés),
 *    porque eso sí describe al plano, pero con la magnitud mínima.
 *  - Nunca más de 2 celdas por eje. Una unidad grande multiplica por N el alto
 *    del bloque y el mapa termina sin entrar en la vista.
 */
function normalizeUnitSize(elementType: string, size: UnitSize): UnitSize {
  // Una unidad mínima es una celda DEL MODELO, o sea `MAP_GRID_SCALE` celdas de
  // la grilla. La escala no la agranda en pantalla: hay el doble de celdas y
  // cada una mide la mitad.
  const unit = MAP_GRID_SCALE;
  if (elementType === 'table' || elementType === 'seat') return { uw: unit, uh: unit };
  if (size.uw === size.uh) return { uw: unit, uh: unit };
  return size.uw > size.uh ? { uw: 2 * unit, uh: unit } : { uw: unit, uh: 2 * unit };
}

/** El más chico: unificar nunca agranda unidades (evita pisar vecinos). */
function pickCanonicalSize(sizes: UnitSize[]): UnitSize {
  return sizes.reduce((best, s) => {
    const area = s.uw * s.uh;
    const bestArea = best.uw * best.uh;
    if (area !== bestArea) return area < bestArea ? s : best;
    if (s.uw !== best.uw) return s.uw < best.uw ? s : best;
    return s.uh < best.uh ? s : best;
  });
}

/**
 * Tamaño de unidad canónico por categoría, mirando todos los grupos rígidos.
 * Así palcos left/right/bottom quedan con el mismo colSpan×rowSpan aunque el
 * modelo haya mandado bboxes distintos.
 */
function canonicalUnitSizes(
  groups: AiEventMapLayoutGroup[],
  baseCells: Map<string, MapGridCell>
): Map<string, UnitSize> {
  const byKey = new Map<string, UnitSize[]>();
  for (const g of groups) {
    if (!isRigid(g)) continue;
    const cell = baseCells.get(g.id);
    if (!cell) continue;
    const key = categorySizeKey(g);
    const list = byKey.get(key) ?? [];
    list.push(naturalUnitSize(g, cell));
    byKey.set(key, list);
  }
  const elementByKey = new Map<string, string>();
  for (const g of groups) {
    if (!isRigid(g)) continue;
    elementByKey.set(categorySizeKey(g), g.elementType);
  }

  const out = new Map<string, UnitSize>();
  for (const [key, sizes] of byKey) {
    if (!sizes.length) continue;
    const canonical = pickCanonicalSize(sizes);
    out.set(key, normalizeUnitSize(elementByKey.get(key) ?? 'zone', canonical));
  }
  return out;
}

/** Celdas de cada unidad repartidas en tamaño uniforme dentro del grupo. */
function unitCellsFor(
  group: AiEventMapLayoutGroup,
  groupCell: MapGridCell,
  forced?: UnitSize
): MapGridCell[] {
  const labels = labelsOf(group);
  if (!isRigid(group)) return [groupCell];
  const { cols, rows } = unitGrid(group);
  const gc = fitSpan(groupCell, cols, rows);
  const uw = forced?.uw ?? Math.max(1, Math.floor(gc.colSpan / cols));
  const uh = forced?.uh ?? Math.max(1, Math.floor(gc.rowSpan / rows));
  // Con tamaño forzado (más chico) anclamos al origen del bbox: no recentramos
  // sobre un span que ya no usamos, para no correr la columna/fila hacia adentro.
  const offCol = forced
    ? groupCell.col
    : gc.col + Math.floor((gc.colSpan - uw * cols) / 2);
  const offRow = forced
    ? groupCell.row
    : gc.row + Math.floor((gc.rowSpan - uh * rows) / 2);
  return labels.map((_, index) => {
    const { row, col } = unitIndexToRowCol(Math.min(index, cols * rows - 1), cols, rows, group);
    return { col: offCol + col * uw, row: offRow + row * uh, colSpan: uw, rowSpan: uh };
  });
}

/** Rect del lienzo (0..1) donde se estiran los recuadros de la IA. */
function contentRect(result: AnalyzeMapResult): NormBox {
  const full = { x: MARGIN, y: MARGIN, w: 1 - 2 * MARGIN, h: 1 - 2 * MARGIN };
  const stage = result.stage;
  if (stage.box || !stage.position || stage.position === 'center') return full;
  const cut = STAGE_BAND + MARGIN;
  switch (stage.position) {
    case 'top':
      return { ...full, y: full.y + cut, h: full.h - cut };
    case 'bottom':
      return { ...full, h: full.h - cut };
    case 'left':
      return { ...full, x: full.x + cut, w: full.w - cut };
    case 'right':
      return { ...full, w: full.w - cut };
    default:
      return full;
  }
}

function makeStretch(boxes: AiEventMapBox[], content: NormBox): (b: AiEventMapBox) => MapGridCell {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const spanX = maxX - minX > 0.01 ? maxX - minX : 1;
  const spanY = maxY - minY > 0.01 ? maxY - minY : 1;
  return b =>
    boxToCell({
      x: content.x + ((b.x - minX) / spanX) * content.w,
      y: content.y + ((b.y - minY) / spanY) * content.h,
      w: (b.w / spanX) * content.w,
      h: (b.h / spanY) * content.h
    });
}

function isValidCell(cell: AiEventMapCell | null | undefined): cell is AiEventMapCell {
  return (
    !!cell &&
    [cell.col, cell.row, cell.colSpan, cell.rowSpan].every(n => Number.isFinite(n)) &&
    cell.colSpan >= 1 &&
    cell.rowSpan >= 1
  );
}

/** Celda → recuadro 0..1 de la imagen, sobre mapArea (inverso de boxToCell). */
function cellToAreaBox(cell: MapGridCell, area: AiEventMapArea): AiEventMapBox {
  const uw = area.w / MAP_GRID_SIZE;
  const uh = area.h / MAP_GRID_SIZE;
  return {
    x: round4(area.x + (cell.col - 1) * uw),
    y: round4(area.y + (cell.row - 1) * uh),
    w: round4(cell.colSpan * uw),
    h: round4(cell.rowSpan * uh)
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function unitCellsFromKeys(keys: string[]): AiEventMapCell[] {
  return keys
    .map(parseCellKey)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map(({ col, row }) => ({ col, row, colSpan: 1, rowSpan: 1 }));
}

function validCells(raw: AiEventMapCell[] | null | undefined): MapGridCell[] {
  return (raw ?? []).filter(isValidCell).map(clampCell);
}

function shiftCell(cell: MapGridCell, dc: number, dr: number): MapGridCell {
  return { ...cell, col: cell.col + dc, row: cell.row + dr };
}

function cellArea(c: MapGridCell): number {
  return c.colSpan * c.rowSpan;
}

function sameColBand(a: MapGridCell, b: MapGridCell): boolean {
  return a.col === b.col && a.colSpan === b.colSpan;
}

function verticallyAdjacent(upper: MapGridCell, lower: MapGridCell): boolean {
  return upper.row + upper.rowSpan === lower.row;
}

function unionCells(a: MapGridCell, b: MapGridCell): MapGridCell {
  const col = Math.min(a.col, b.col);
  const row = Math.min(a.row, b.row);
  const colEnd = Math.max(a.col + a.colSpan, b.col + b.colSpan);
  const rowEnd = Math.max(a.row + a.rowSpan, b.row + b.rowSpan);
  return { col, row, colSpan: colEnd - col, rowSpan: rowEnd - row };
}

function priceOf(result: AnalyzeMapResult, group: AiEventMapLayoutGroup): number {
  const id = group.category?.trim();
  if (!id) return 0;
  const cat = result.categories.find(c => c.id === id);
  const n = cat?.detectedPrice;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * Anida un bloque chico en la esquina de uno grande (Tetris L).
 * El padre pasa a ocupar el union; el hijo queda en el notch. El pack talla
 * el padre al reclamar primero el hijo → footprint L.
 */
function nestChildInParentCorner(
  baseCells: Map<string, MapGridCell>,
  parentId: string,
  childId: string,
  notch: 'top_right' | 'top_left' = 'top_right'
): void {
  const parent = baseCells.get(parentId);
  const child = baseCells.get(childId);
  if (!parent || !child) return;

  const union = unionCells(parent, child);
  // Ancho del notch ≈ 55–60 % del bloque; el brazo de la L se queda con el resto.
  const notchW = Math.max(
    2 * MAP_GRID_SCALE,
    Math.min(union.colSpan - 1, Math.round(union.colSpan * 0.58))
  );
  const notchH = Math.max(1, Math.min(child.rowSpan, union.rowSpan - 1));
  const childCell: MapGridCell = {
    col: notch === 'top_left' ? union.col : union.col + union.colSpan - notchW,
    row: union.row,
    colSpan: notchW,
    rowSpan: notchH
  };
  baseCells.set(parentId, union);
  baseCells.set(childId, childCell);
}

/**
 * VIP-en-FANS y similares: el modelo a menudo apila dos bandas del mismo ancho
 * en vez de una L con el premium en el hueco. Inferimos el nido en código.
 *
 * Candidato: zonas no rígidas, misma banda de columnas, adyacentes en vertical,
 * la de arriba más baja y más cara. El hijo tiene que ser una banda fina
 * (rowSpan ≤ 2): así VIP→FANS entra y FANS→CAMPO no (FANS suele ser más alto).
 * Entre padres candidatos se elige el de precio más cercano por debajo (el wrap
 * inmediato), no el más barato del stack.
 */
function applyTetrisZoneNests(
  result: AnalyzeMapResult,
  baseCells: Map<string, MapGridCell>
): Map<string, { childId: string; notch: 'top_right' | 'top_left' }> {
  const nests = new Map<string, { childId: string; notch: 'top_right' | 'top_left' }>();
  const zones = result.layout.groups.filter(g => !isRigid(g));
  if (zones.length < 2) return nests;

  /** Solo bandas chicas anidan: el wrap (FANS) no se mete dentro de CAMPO. */
  const MAX_NEST_CHILD_ROW_SPAN = 2 * MAP_GRID_SCALE;

  type Cand = {
    parent: AiEventMapLayoutGroup;
    child: AiEventMapLayoutGroup;
    childPrice: number;
    parentPrice: number;
  };
  const cands: Cand[] = [];

  for (const upper of zones) {
    const u = baseCells.get(upper.id);
    if (!u) continue;
    if (validCells(upper.footprintCells).length) continue;
    if (u.rowSpan > MAX_NEST_CHILD_ROW_SPAN) continue;

    for (const lower of zones) {
      if (upper.id === lower.id) continue;
      const l = baseCells.get(lower.id);
      if (!l) continue;
      if (validCells(lower.footprintCells).length) continue;
      if (!sameColBand(u, l) || !verticallyAdjacent(u, l)) continue;
      if (u.rowSpan >= l.rowSpan) continue;
      if (cellArea(u) >= cellArea(l)) continue;
      const up = priceOf(result, upper);
      const lp = priceOf(result, lower);
      if (up > 0 && lp > 0 && up <= lp) continue;
      cands.push({ parent: lower, child: upper, childPrice: up, parentPrice: lp });
    }
  }

  // containedBy del modelo / normalizer gana: ya trae el wrap correcto.
  for (const child of zones) {
    if (!child.containedBy) continue;
    const parent = zones.find(g => g.id === child.containedBy);
    if (!parent) continue;
    if (nests.has(parent.id)) continue;
    const notch =
      child.containedAt === 'top_left' || child.containedAt === 'bottom_left'
        ? 'top_left'
        : 'top_right';
    nestChildInParentCorner(baseCells, parent.id, child.id, notch);
    nests.set(parent.id, { childId: child.id, notch });
    child.footprintCells = null;
    parent.footprintCells = null;
    parent.shape = 'l';
    parent.shapeNotch = notch;
  }

  // Hijos más caros primero; a igual hijo, el padre de precio más cercano debajo.
  cands.sort((a, b) => {
    if (b.childPrice !== a.childPrice) return b.childPrice - a.childPrice;
    const da = Math.abs(a.childPrice - a.parentPrice);
    const db = Math.abs(b.childPrice - b.parentPrice);
    return da - db;
  });
  const usedChild = new Set<string>([...nests.values()].map(n => n.childId));
  const usedParent = new Set<string>(nests.keys());

  for (const { parent, child } of cands) {
    if (usedChild.has(child.id) || usedParent.has(child.id)) continue;
    if (usedChild.has(parent.id) || usedParent.has(parent.id)) continue;
    const notch: 'top_right' | 'top_left' = 'top_right';
    nestChildInParentCorner(baseCells, parent.id, child.id, notch);
    nests.set(parent.id, { childId: child.id, notch });
    usedChild.add(child.id);
    usedParent.add(parent.id);
    child.footprintCells = null;
    parent.footprintCells = null;
    child.containedBy = parent.id;
    child.containedAt = notch;
    parent.shape = 'l';
    parent.shapeNotch = notch;
  }

  return nests;
}

/**
 * Muta `result`: escenario y grupos quedan con celdas exactas y sin solapes.
 * Devuelve los ids de grupos que no entraron (también van a `warnings`).
 */
/**
 * Recorta las zonas para que no se salgan del área que ocupan los bloques
 * vendibles.
 *
 * El campo general es una mancha: su cupo lo escribe el productor y sus celdas
 * no representan nada vendible, así que al modelo no le cuesta nada estirarlo
 * para llenar el espacio que le sobra. En un plano real quedó de 8×10 colgando
 * siete filas por debajo del último palco, y eso empuja el escenario y el resto
 * fuera de la vista.
 *
 * El techo no es el TAMAÑO sino la EXTENSIÓN: una zona puede ser tan grande
 * como quiera mientras viva dentro del rectángulo que ocupan las mesas, palcos
 * y boxes. Lo que asome afuera se recorta, con un mínimo de 3 celdas por eje
 * para que no desaparezca.
 *
 * Un mapa de puras zonas (campo + plateas, sin nada rígido) no tiene contra qué
 * medirse y se deja tal cual.
 */
function clampZonesToRigidExtent(
  groups: AiEventMapLayoutGroup[],
  baseCells: Map<string, MapGridCell>
): void {
  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;
  let rigidCount = 0;

  for (const g of groups) {
    if (!isRigid(g)) continue;
    const cell = baseCells.get(g.id);
    if (!cell) continue;
    rigidCount++;
    minCol = Math.min(minCol, cell.col);
    minRow = Math.min(minRow, cell.row);
    maxCol = Math.max(maxCol, cell.col + cell.colSpan - 1);
    maxRow = Math.max(maxRow, cell.row + cell.rowSpan - 1);
  }

  if (rigidCount < 2 || !Number.isFinite(minCol)) return;

  for (const g of groups) {
    if (isRigid(g)) continue;
    const cell = baseCells.get(g.id);
    if (!cell) continue;

    const col = Math.max(cell.col, minCol);
    const row = Math.max(cell.row, minRow);
    const colEnd = Math.min(cell.col + cell.colSpan - 1, maxCol);
    const rowEnd = Math.min(cell.row + cell.rowSpan - 1, maxRow);

    const colSpan = Math.max(MIN_ZONE_SPAN, colEnd - col + 1);
    const rowSpan = Math.max(MIN_ZONE_SPAN, rowEnd - row + 1);
    if (col === cell.col && row === cell.row && colSpan === cell.colSpan && rowSpan === cell.rowSpan) {
      continue;
    }
    baseCells.set(g.id, clampCell({ col, row, colSpan, rowSpan }));
  }
}

/**
 * Alinea cada zona con el bloque vendible que tiene arriba o abajo.
 *
 * En el plano, el CAMPO GENERAL arranca y termina donde arranca y termina el
 * bloque de mesas: es el espacio que queda delante de ellas. El modelo, en
 * cambio, le da un rango de columnas propio, y la zona queda corrida —medio
 * bloque a la izquierda de la grilla— con el mapa entero desbalanceado.
 *
 * Además de lo feo, el corrimiento bloquea el compactado: las columnas que
 * quedan entre la grilla y una columna lateral no están vacías (la zona las
 * ocupa más abajo), así que el compactado por eje no las puede sacar y el
 * lateral queda suelto a tres o cuatro celdas. Alinear la zona libera esas
 * columnas y el compactado hace el resto.
 */
function alignZonesToNeighbour(
  groups: AiEventMapLayoutGroup[],
  baseCells: Map<string, MapGridCell>
): void {
  const rigid = groups
    .filter(isRigid)
    .map(g => baseCells.get(g.id))
    .filter((c): c is MapGridCell => !!c);
  if (!rigid.length) return;

  for (const g of groups) {
    if (isRigid(g)) continue;
    const zone = baseCells.get(g.id);
    if (!zone) continue;

    const zoneTop = zone.row;
    const zoneBottom = zone.row + zone.rowSpan - 1;

    // Vecinos verticales: los que están por encima o por debajo y comparten
    // aunque sea una columna. Un lateral que corre a lo largo de la zona no
    // cuenta — no es el bloque al que la zona acompaña.
    const neighbours = rigid.filter(c => {
      const top = c.row;
      const bottom = c.row + c.rowSpan - 1;
      const above = bottom < zoneTop;
      const below = top > zoneBottom;
      if (!above && !below) return false;
      const sharesColumn = c.col <= zone.col + zone.colSpan - 1 && c.col + c.colSpan - 1 >= zone.col;
      return sharesColumn;
    });
    if (!neighbours.length) continue;

    // El más ancho manda: es el que define el frente de la zona.
    const anchor = neighbours.reduce((best, c) => (c.colSpan > best.colSpan ? c : best));
    if (anchor.col === zone.col && anchor.colSpan === zone.colSpan) continue;

    baseCells.set(
      g.id,
      clampCell({ col: anchor.col, row: zone.row, colSpan: anchor.colSpan, rowSpan: zone.rowSpan })
    );
  }
}

/**
 * Lleva las celdas que mandó el modelo (24×24) a la grilla del mapa.
 *
 * Se hace de una sola vez y al principio: si quedara repartido por el pipeline,
 * cualquier función nueva que lea `cell` tendría que acordarse en qué espacio
 * está, y ese es el tipo de detalle que se olvida.
 */
function scaleModelResultToGrid(result: AnalyzeMapResult): void {
  if (MAP_GRID_SCALE === 1) return;

  for (const group of result.layout.groups) {
    const draft = group as AiEventMapLayoutGroup & {
      cell?: AiEventMapCell | null;
      unitCells?: AiEventMapCell[] | null;
      footprintCells?: AiEventMapCell[] | null;
    };
    if (draft.cell) draft.cell = scaleModelCell(draft.cell);
    // Las unidades se regeneran uniformes más abajo, pero el footprint de una
    // zona pintada a mano es forma, no reparto: viaja escalado.
    if (draft.unitCells?.length) draft.unitCells = draft.unitCells.map(scaleModelCell);
    if (draft.footprintCells?.length) {
      draft.footprintCells = expandToGridCells(draft.footprintCells);
    }
  }

  if (isSectorLayout(result.stage.layout)) {
    result.stage.layout = scaleModelLayout(result.stage.layout);
  }
}

/** Una celda 1×1 del modelo son `MAP_GRID_SCALE`² celdas 1×1 de la grilla. */
function expandToGridCells(cells: AiEventMapCell[]): AiEventMapCell[] {
  const out: AiEventMapCell[] = [];
  for (const cell of cells) {
    const scaled = scaleModelCell(cell);
    for (let dc = 0; dc < scaled.colSpan; dc++) {
      for (let dr = 0; dr < scaled.rowSpan; dr++) {
        out.push({ col: scaled.col + dc, row: scaled.row + dr, colSpan: 1, rowSpan: 1 });
      }
    }
  }
  return out;
}

export function rasterizeMapAnalysis(result: AnalyzeMapResult): string[] {
  // El modelo describe el plano en 24×24; el mapa vive en `MAP_GRID_SIZE`. Se
  // convierte acá, en la única puerta de entrada, y de este punto en adelante
  // todo el pipeline trabaja en celdas de la grilla.
  scaleModelResultToGrid(result);

  const area =
    result.mapArea && result.mapArea.w > 0 && result.mapArea.h > 0 ? result.mapArea : FULL_AREA;
  const groups = result.layout.groups;
  const content = contentRect(result);
  const allBoxed = groups.length > 0 && groups.every(g => g.box);
  const stageBox = result.stage.box;
  const stretch = allBoxed
    ? makeStretch([...groups.map(g => g.box!), ...(stageBox ? [stageBox] : [])], content)
    : null;

  // 1. Escenario: el que ubicó el modelo en la grilla manda; los recuadros
  //    0..1 quedan solo para análisis viejos.
  const stageLayout: MapSectorLayout = isSectorLayout(result.stage.layout)
    ? result.stage.layout
    : stageBox
      ? { kind: 'rect', cell: stretch ? stretch(stageBox) : boxToCell(stageBox, area) }
      : defaultStageLayout(result.stage.position ?? 'top');
  const stageCell = layoutBounds(stageLayout);
  const blocked = new Set(layoutKeys(stageLayout));

  // 2. Celda base de cada grupo.
  const baseCells = new Map<string, MapGridCell>();
  for (const g of groups) {
    let cell: MapGridCell;
    if (stretch) cell = stretch(g.box!);
    else if (isValidCell(g.cell)) cell = clampCell(g.cell);
    else if (g.box) cell = boxToCell(g.box, area);
    else cell = { col: 1, row: 1, colSpan: 4 * MAP_GRID_SCALE, rowSpan: 4 * MAP_GRID_SCALE };
    baseCells.set(g.id, cell);
  }

  // 2b. Tetris: anidar premium en el wrap (VIP dentro de FANS L, etc.).
  applyTetrisZoneNests(result, baseCells);

  // 2c. Una zona no puede ser más grande que todo lo vendible que la rodea.
  clampZonesToRigidExtent(groups, baseCells);

  // 2d. Y se alinea con el bloque que acompaña, en vez de flotar corrida.
  alignZonesToNeighbour(groups, baseCells);

  // Misma categoría ⇒ mismo tamaño de unidad (p. ej. palcos laterales vs abajo).
  const sizeByCategory = canonicalUnitSizes(groups, baseCells);

  const units = new Map<string, MapGridCell[]>();
  const items = groups.map(g => {
    // Las unidades SIEMPRE se generan acá, uniformes dentro del bbox: los
    // `unitCells` que pueda mandar el modelo se ignoran (salían irregulares y
    // eran el grueso de los tokens de salida). Zonas: un solo bloque; si son
    // L/U, su ocupación son los `footprintCells`.
    const footprint = isRigid(g) ? [] : validCells(g.footprintCells);
    const base = footprint.length
      ? layoutBounds({ kind: 'cells', cells: footprint })
      : baseCells.get(g.id)!;
    const forced = isRigid(g) ? sizeByCategory.get(categorySizeKey(g)) : undefined;
    const cells = unitCellsFor(g, base, forced).map(clampCell);
    units.set(g.id, cells);
    const keys = new Set((footprint.length ? footprint : cells).flatMap(expandCell));
    const layout: MapSectorLayout =
      !footprint.length && cells.length === 1
        ? { kind: 'rect', cell: cells[0] }
        : { kind: 'cells', cells: unitCellsFromKeys([...keys]) };
    return { id: g.id, label: g.id, layout, rigid: isRigid(g) };
  });

  // 3. Rígidos primero, después zonas; chicos antes que grandes.
  //    Tras el nest, el hijo (VIP) es más chico → se packea antes y talla la L.
  const ordered = [...items].sort(
    (a, b) => Number(b.rigid) - Number(a.rigid) || layoutArea(a.layout) - layoutArea(b.layout)
  );
  const packed = packLayouts(ordered, blocked);
  // 4. Escribir de vuelta.
  result.layout.groups = groups.map((g): AiEventMapLayoutGroup => {
    const before = items.find(i => i.id === g.id)!;
    const after = packed.layouts.get(g.id) ?? before.layout;
    const oldBounds = layoutBounds(before.layout);
    const newBounds = layoutBounds(after);
    const keys = layoutKeys(after);
    const solid = newBounds.colSpan * newBounds.rowSpan === keys.length;

    let unitCells: AiEventMapCell[];
    if (before.rigid) {
      const dc = newBounds.col - oldBounds.col;
      const dr = newBounds.row - oldBounds.row;
      unitCells = units.get(g.id)!.map(c => shiftCell(c, dc, dr));
    } else {
      unitCells = [newBounds];
    }

    const footprintCells = !before.rigid && !solid ? unitCellsFromKeys(keys) : null;
    // L tallada por el pack: marcar shape para el editor.
    const carvedL = Boolean(footprintCells?.length);
    return {
      ...g,
      cell: newBounds,
      box: cellToAreaBox(newBounds, area),
      // Zona L: unitCells = bbox; la ocupación real va en footprintCells.
      unitCells: before.rigid ? unitCells : carvedL ? [newBounds] : unitCells,
      footprintCells,
      shape: carvedL ? 'l' : g.shape === 'corner_cut' && solid ? 'rect' : g.shape,
      shapeNotch: carvedL ? (g.shapeNotch ?? 'top_right') : solid ? null : g.shapeNotch
    };
  });

  result.stage = {
    ...result.stage,
    visible: true,
    position: result.stage.position ?? inferStagePosition(stageCell),
    alignment: result.stage.alignment ?? 'center',
    box: cellToAreaBox(stageCell, area),
    cell: stageCell,
    layout: stageLayout
  };
  result.grid = { cols: MAP_GRID_SIZE, rows: MAP_GRID_SIZE };

  for (const id of packed.unresolved) {
    result.warnings.push({
      code: 'GRID_OVERLAP_UNRESOLVED',
      groupId: id,
      message: `El grupo "${id}" no entra en la grilla ${MAP_GRID_SIZE}×${MAP_GRID_SIZE} sin pisar otro sector.`
    });
  }
  return packed.unresolved;
}
