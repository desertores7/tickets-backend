import {
  MapGridCell,
  MapSectorLayout,
  NormBox,
  boundsOfKeys,
  boxToCell,
  clampCell,
  expandCell,
  inferStagePosition,
  isSectorLayout,
  layoutBounds,
  parseCellKey
} from './map-grid';

/**
 * Forma canónica del `analysis` que viaja al editor de grilla.
 *
 * Regla: la ocupación sale SOLO de celdas (`cell` / `unitCells` /
 * `footprintCells`), un único lugar por entidad. Se descartan recuadros 0..1
 * (`box`, `outline`), el layout semántico viejo (`lane`, `stackOrder`, pesos,
 * `containedBy`…), `confidence` y el escenario duplicado: el escenario vive en
 * `stageLayout` del mapa y acá solo queda `visible` + `position`.
 *
 * Sin imports de Nest: es dominio puro.
 */

export type GridAnalysisCategory = {
  id: string;
  label: string;
  detectedPrice: number | null;
  elementType: string;
  saleMode: string;
  selectionUnit: string;
  detectedCapacity: number | null;
  includedAdmissions: number | null;
  color: string | null;
};

export type GridAnalysisGroup = {
  id: string;
  elementType: string;
  layoutType: string;
  labels: string[];
  category: string | null;
  categoryAssignments: Array<Record<string, unknown>>;
  count: number;
  /** Bounding box del grupo. Siempre coincide con unitCells / footprintCells. */
  cell: MapGridCell | null;
  /** Celda de cada label (mesas/palcos/boxes), mismo orden que `labels`. */
  unitCells?: MapGridCell[];
  /** Solo en zonas que no son rectángulo sólido (L/U): celdas 1×1. */
  footprintCells?: MapGridCell[];
  ordering?: string;
  rows?: number;
  columns?: number;
  shape?: string;
  shapeNotch?: string;
  labelOrientation?: 'vertical';
  level?: string;
};

export type GridAnalysis = {
  grid: { cols: number; rows: number };
  /** Solo en la respuesta del job de análisis (recorte del plano en el flyer). */
  mapArea?: NormBox;
  stage: { visible: boolean; position: string };
  categories: GridAnalysisCategory[];
  layout: { groups: GridAnalysisGroup[] };
};

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readCell(v: unknown): MapGridCell | null {
  if (!isObj(v)) return null;
  const nums = [v.col, v.row, v.colSpan, v.rowSpan].map(Number);
  if (!nums.every(Number.isFinite)) return null;
  return clampCell({ col: nums[0], row: nums[1], colSpan: nums[2], rowSpan: nums[3] });
}

function readBox(v: unknown): NormBox | null {
  if (!isObj(v)) return null;
  const nums = [v.x, v.y, v.w, v.h].map(Number);
  if (!nums.every(Number.isFinite) || nums[2] <= 0 || nums[3] <= 0) return null;
  return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
}

function unitKeys(cells: MapGridCell[]): string[] {
  return [...new Set(cells.flatMap(expandCell))];
}

function toUnitCells(keys: string[]): MapGridCell[] {
  return keys
    .map(parseCellKey)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map(({ col, row }) => ({ col, row, colSpan: 1, rowSpan: 1 }));
}

function normalizeGroup(raw: Obj, mapArea: NormBox | null): GridAnalysisGroup | null {
  const id = str(raw.id);
  if (!id) return null;
  const labels = Array.isArray(raw.labels) ? raw.labels.filter((l): l is string => typeof l === 'string') : [];
  const count = numOrNull(raw.count) ?? Math.max(1, labels.length);

  // Footprint: explícito o desde un layout `cells` viejo; solo si NO es sólido.
  let footprintKeys: string[] | null = null;
  const rawFootprint = Array.isArray(raw.footprintCells)
    ? raw.footprintCells.map(readCell).filter((c): c is MapGridCell => !!c)
    : isSectorLayout(raw.layout) && raw.layout.kind === 'cells'
      ? raw.layout.cells
      : [];
  if (rawFootprint.length) {
    const keys = unitKeys(rawFootprint);
    const b = boundsOfKeys(keys)!;
    if (b.colSpan * b.rowSpan !== keys.length) footprintKeys = keys;
  }

  const rawUnits = Array.isArray(raw.unitCells)
    ? raw.unitCells.map(readCell).filter((c): c is MapGridCell => !!c)
    : [];
  const unitsMatch = rawUnits.length > 0 && rawUnits.length === Math.max(1, labels.length);

  // Un solo lugar: el bbox sale de las celdas reales si las hay.
  let cell: MapGridCell | null;
  if (footprintKeys) cell = boundsOfKeys(footprintKeys);
  else if (unitsMatch) cell = boundsOfKeys(unitKeys(rawUnits));
  else
    cell =
      readCell(raw.cell) ??
      (isSectorLayout(raw.layout) ? layoutBounds(raw.layout) : null) ??
      (readBox(raw.box) ? boxToCell(readBox(raw.box)!, mapArea ?? undefined) : null);

  const out: GridAnalysisGroup = {
    id,
    elementType: str(raw.elementType, 'zone'),
    layoutType: str(raw.layoutType, 'zone'),
    labels,
    category: strOrNull(raw.category),
    categoryAssignments: Array.isArray(raw.categoryAssignments)
      ? raw.categoryAssignments.filter(isObj)
      : [],
    count,
    cell
  };

  if (footprintKeys) {
    out.footprintCells = toUnitCells(footprintKeys);
    if (cell) out.unitCells = [cell];
  } else if (unitsMatch) {
    out.unitCells = rawUnits;
  }

  const ordering = strOrNull(raw.ordering);
  const rows = numOrNull(raw.rows);
  const columns = numOrNull(raw.columns);
  if (ordering) out.ordering = ordering;
  if (rows != null) out.rows = rows;
  if (columns != null) out.columns = columns;

  // La forma solo aporta si no hay footprint (que ya la describe) y no es rect.
  const shape = strOrNull(raw.shape);
  if (!footprintKeys && shape && shape !== 'rect') {
    out.shape = shape;
    const notch = strOrNull(raw.shapeNotch);
    if (notch) out.shapeNotch = notch;
  }
  if (raw.labelOrientation === 'vertical') out.labelOrientation = 'vertical';
  const level = strOrNull(raw.level);
  if (level) out.level = level;
  return out;
}

function normalizeCategory(raw: Obj): GridAnalysisCategory | null {
  const id = str(raw.id);
  if (!id) return null;
  return {
    id,
    label: str(raw.label, id),
    detectedPrice: numOrNull(raw.detectedPrice),
    elementType: str(raw.elementType, 'zone'),
    saleMode: str(raw.saleMode, 'general_admission'),
    selectionUnit: str(raw.selectionUnit, 'ticket'),
    detectedCapacity: numOrNull(raw.detectedCapacity),
    includedAdmissions: numOrNull(raw.includedAdmissions),
    color: strOrNull(raw.color)
  };
}

const POSITIONS = new Set(['top', 'bottom', 'left', 'right', 'center']);

/**
 * Limpia un `analysis` (guardado, recibido del editor o recién rasterizado) a
 * la forma canónica de celdas. Devuelve null si no hay nada utilizable.
 *
 * @param stageLayout escenario del mapa: de ahí sale `stage.position`.
 * @param keepMapArea solo para la respuesta del job de análisis.
 */
export function toGridAnalysis(
  raw: unknown,
  opts: { stageLayout?: MapSectorLayout | null; keepMapArea?: boolean } = {}
): GridAnalysis | null {
  if (!isObj(raw)) return null;
  const mapArea = readBox(raw.mapArea);
  const layoutRaw = isObj(raw.layout) ? raw.layout : {};
  const groups = (Array.isArray(layoutRaw.groups) ? layoutRaw.groups : [])
    .filter(isObj)
    .map(g => normalizeGroup(g, mapArea))
    .filter((g): g is GridAnalysisGroup => !!g);
  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .filter(isObj)
    .map(normalizeCategory)
    .filter((c): c is GridAnalysisCategory => !!c);

  const rawStage = isObj(raw.stage) ? raw.stage : {};
  const stageLayout =
    opts.stageLayout ?? (isSectorLayout(rawStage.layout) ? rawStage.layout : null);
  const position = stageLayout
    ? inferStagePosition(layoutBounds(stageLayout))
    : POSITIONS.has(str(rawStage.position))
      ? str(rawStage.position)
      : 'top';

  return {
    grid: { cols: 24, rows: 24 },
    ...(opts.keepMapArea && mapArea ? { mapArea } : {}),
    stage: { visible: true, position },
    categories,
    layout: { groups }
  };
}

/** Escenario del resultado del job: el que dejó el rasterizado. */
export function stageLayoutOfAnalysis(raw: unknown): MapSectorLayout | null {
  if (!isObj(raw) || !isObj(raw.stage)) return null;
  const layout = raw.stage.layout;
  if (isSectorLayout(layout)) return layout;
  const cell = readCell(raw.stage.cell);
  return cell ? { kind: 'rect', cell } : null;
}
