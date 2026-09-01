import type {
  AiEventMapCategory,
  AiEventMapCategoryAssignment,
  AiEventMapLayoutGroup,
  AiEventMapStage,
  AnalyzeMapResult,
  MapElementType,
  MapGroupOrdering,
  MapGroupPosition,
  MapLayoutType,
  MapStageAlignment,
  MapStagePosition,
  SaleMode,
  SelectionUnit
} from '../contracts/ievent-ai.service';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Acepta number o string con formato AR/US ("$1.000.000", "750,000", "40.000 ARS").
 * El prompt pide numero plano, pero el modelo a veces devuelve el texto del flyer.
 */
function parseNullableNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;

  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  if (typeof raw !== 'string') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  // Deja solo digitos y separadores; descarta simbolos, moneda y texto.
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return null;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized: string;

  if (lastDot === -1 && lastComma === -1) {
    normalized = cleaned;
  } else {
    // El separador mas a la derecha es decimal solo si deja 1-2 digitos detras.
    const sepIndex = Math.max(lastDot, lastComma);
    const decimals = cleaned.length - sepIndex - 1;
    if (decimals >= 1 && decimals <= 2) {
      normalized =
        cleaned.slice(0, sepIndex).replace(/[.,]/g, '') +
        '.' +
        cleaned.slice(sepIndex + 1);
    } else {
      normalized = cleaned.replace(/[.,]/g, '');
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseNullableInt(raw: unknown): number | null {
  const n = parseNullableNumber(raw);
  if (n === null) return null;
  return Math.floor(n);
}

function parseNonNegIntOrNull(raw: unknown): number | null {
  const n = parseNullableInt(raw);
  if (n === null || n < 0) return null;
  return n;
}

function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

function ensureUniqueId(baseId: string, used: Set<string>): string {
  let id = baseId;
  let counter = 2;
  while (used.has(id)) {
    id = `${baseId}-${counter}`;
    counter += 1;
  }
  used.add(id);
  return id;
}

function parseSaleMode(raw: unknown): SaleMode | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (s === 'whole_unit' || s === 'whole' || s === 'unit') return 'whole_unit';
  if (
    s === 'per_person' ||
    s === 'individual_seat' ||
    s === 'individual' ||
    s === 'por_persona' ||
    s === 'por_silla'
  ) {
    return 'per_person';
  }
  if (s === 'general_admission' || s === 'ga' || s === 'general' || s === 'campo') {
    return 'general_admission';
  }
  return null;
}

function parseSelectionUnit(raw: unknown): SelectionUnit | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'table' || s === 'mesa') return 'table';
  if (s === 'seat' || s === 'silla' || s === 'asiento' || s === 'chair') return 'seat';
  if (s === 'box' || s === 'boxes') return 'box';
  if (s === 'palco') return 'palco';
  if (s === 'ticket' || s === 'entrada') return 'ticket';
  if (s === 'section' || s === 'sector' || s === 'zone' || s === 'zona') return 'section';
  return null;
}

function parseElementType(raw: unknown): MapElementType | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'table' || s === 'mesa') return 'table';
  if (s === 'box' || s === 'boxes') return 'box';
  if (s === 'palco') return 'palco';
  if (s === 'seat' || s === 'silla' || s === 'asiento') return 'seat';
  if (s === 'zone' || s === 'zona') return 'zone';
  if (s === 'section' || s === 'sector') return 'section';
  return null;
}

function inferElementTypeFromLabel(label: string): MapElementType {
  if (/(palco)/i.test(label)) return 'palco';
  if (/(box)/i.test(label)) return 'box';
  if (/(campo|pista|general)/i.test(label)) return 'zone';
  if (/(mesa|table|\bm\d+)/i.test(label)) return 'table';
  if (/(silla|seat|asiento)/i.test(label)) return 'seat';
  return 'section';
}

function defaultSaleForType(type: MapElementType): SaleMode {
  if (type === 'zone') return 'general_admission';
  if (type === 'seat') return 'per_person';
  return 'whole_unit';
}

function defaultSelectionForType(type: MapElementType, saleMode: SaleMode): SelectionUnit {
  if (saleMode === 'general_admission' || type === 'zone') return 'ticket';
  if (saleMode === 'per_person') return 'seat';
  if (type === 'table') return 'table';
  if (type === 'box') return 'box';
  if (type === 'palco') return 'palco';
  if (type === 'seat') return 'seat';
  return 'section';
}

function parseStagePosition(raw: unknown): MapStagePosition | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'top' || s === 'bottom' || s === 'left' || s === 'right') return s;
  return null;
}

function parseStageAlignment(raw: unknown): MapStageAlignment | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'start' || s === 'left') return 'start';
  if (s === 'end' || s === 'right') return 'end';
  if (s === 'center') return 'center';
  return null;
}

function parseLayoutType(raw: unknown): MapLayoutType | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (s === 'column' || s === 'col') return 'column';
  if (s === 'row') return 'row';
  if (s === 'grid') return 'grid';
  if (s === 'zone' || s === 'zona') return 'zone';
  if (s === 'freeform' || s === 'free' || s === 'irregular') return 'freeform';
  return null;
}

function parseGroupPosition(raw: unknown): MapGroupPosition {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const allowed: MapGroupPosition[] = [
    'top_left',
    'top_center',
    'top_right',
    'left',
    'center',
    'right',
    'bottom_left',
    'bottom_center',
    'bottom_right'
  ];
  if ((allowed as string[]).includes(s)) return s as MapGroupPosition;
  if (s === 'top') return 'top_center';
  if (s === 'bottom') return 'bottom_center';
  return 'center';
}

function parseOrdering(raw: unknown): MapGroupOrdering | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const allowed: MapGroupOrdering[] = [
    'top_to_bottom',
    'bottom_to_top',
    'left_to_right',
    'right_to_left',
    'row_major',
    'column_major'
  ];
  if ((allowed as string[]).includes(s)) return s as MapGroupOrdering;
  return null;
}

function defaultOrdering(layoutType: MapLayoutType): MapGroupOrdering | null {
  if (layoutType === 'column') return 'top_to_bottom';
  if (layoutType === 'row') return 'left_to_right';
  if (layoutType === 'grid') return 'row_major';
  return null;
}

function normalizeStage(raw: unknown): AiEventMapStage {
  if (!raw || typeof raw !== 'object') {
    return {
      visible: false,
      position: null,
      alignment: null,
      inferred: false,
      confidence: 0.5
    };
  }
  const s = raw as Record<string, unknown>;
  const visible = s.visible === undefined ? false : Boolean(s.visible);
  return {
    visible,
    position: parseStagePosition(s.position),
    alignment: parseStageAlignment(s.alignment),
    inferred: Boolean(s.inferred),
    confidence: round3(clamp01(Number(s.confidence ?? 0.7)))
  };
}

function normalizeCategories(raw: unknown): AiEventMapCategory[] {
  const categories: AiEventMapCategory[] = [];
  const usedIds = new Set<string>();
  if (!Array.isArray(raw)) return categories;

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const label = String(c.label ?? '').trim().slice(0, 120);
    if (!label) continue;

    const elementType =
      parseElementType(c.elementType) ?? inferElementTypeFromLabel(label);

    const saleMode =
      parseSaleMode(c.saleMode ?? c.purchaseMode ?? c.entryType) ??
      defaultSaleForType(elementType);

    const selectionUnit =
      parseSelectionUnit(c.selectionUnit) ?? defaultSelectionForType(elementType, saleMode);

    categories.push({
      id: ensureUniqueId(slugify(String(c.id ?? label)), usedIds),
      label,
      detectedPrice: parseNullableNumber(c.detectedPrice ?? c.price),
      elementType,
      saleMode,
      selectionUnit,
      detectedCapacity: parseNullableInt(c.detectedCapacity ?? c.capacity),
      includedAdmissions: parseNullableInt(
        c.includedAdmissions ?? c.includedTickets ?? c.admissions
      ),
      color: parseHexColor(c.color ?? c.hexColor ?? c.fillColor),
      confidence: round3(clamp01(Number(c.confidence ?? 0.7)))
    });
  }

  return categories;
}

/** Acepta "#rrggbb" o "rrggbb"; cualquier otra cosa se descarta. */
function parseHexColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return `#${value.toLowerCase()}`;
}

function resolveCategoryId(
  rawCategory: string,
  categories: AiEventMapCategory[],
  fallbackElementType: MapElementType
): string {
  const raw = rawCategory.trim();
  if (raw) {
    const byId = categories.find(c => c.id === raw || c.id === slugify(raw));
    if (byId) return byId.id;
    const byLabel = categories.find(
      c => c.label.trim().toLowerCase() === raw.toLowerCase()
    );
    if (byLabel) return byLabel.id;
  }

  const byType = categories.find(c => c.elementType === fallbackElementType);
  if (byType) return byType.id;

  if (fallbackElementType === 'zone') {
    const ga = categories.find(c => c.saleMode === 'general_admission');
    if (ga) return ga.id;
  }

  return categories[0]?.id ?? 'unknown';
}

function normalizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const l of raw) {
    const label = String(l ?? '').trim().slice(0, 80);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

/** Compacta una secuencia per-label de category ids en rangos lineales. */
function compressCategoryRanges(
  categoryByIndex: string[]
): Array<{ category: string; from: number; to: number }> {
  if (!categoryByIndex.length) return [];
  const ranges: Array<{ category: string; from: number; to: number }> = [];
  let start = 0;
  let current = categoryByIndex[0]!;

  for (let i = 1; i <= categoryByIndex.length; i++) {
    if (i === categoryByIndex.length || categoryByIndex[i] !== current) {
      ranges.push({ category: current, from: start, to: i - 1 });
      if (i < categoryByIndex.length) {
        start = i;
        current = categoryByIndex[i]!;
      }
    }
  }
  return ranges;
}

/** Forma de grilla usada para traducir rectángulos ↔ índices lineales. */
type GridShape = {
  rows: number | null;
  columns: number | null;
  ordering: MapGroupOrdering | null;
};

type RectRange = {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
};

const EMPTY_RECT = {
  rowStart: null,
  rowEnd: null,
  columnStart: null,
  columnEnd: null
} as const;

function isGridShape(shape: GridShape): boolean {
  return Boolean(shape.rows && shape.columns);
}

function isColumnMajor(shape: GridShape): boolean {
  return shape.ordering === 'column_major';
}

/** Celda 1-based → índice 0-based en labels[]. */
function cellToIndex(row: number, column: number, shape: GridShape): number | null {
  const { rows, columns } = shape;
  if (!rows || !columns) return null;
  if (row < 1 || row > rows || column < 1 || column > columns) return null;
  return isColumnMajor(shape)
    ? (column - 1) * rows + (row - 1)
    : (row - 1) * columns + (column - 1);
}

/** Lee un rectángulo 1-based del payload crudo de la IA. */
function parseRect(r: Record<string, unknown>, shape: GridShape): RectRange | null {
  if (!isGridShape(shape)) return null;
  const rowStart = parseNullableInt(r.rowStart);
  const rowEnd = parseNullableInt(r.rowEnd);
  const columnStart = parseNullableInt(r.columnStart);
  const columnEnd = parseNullableInt(r.columnEnd);
  if (rowStart === null && rowEnd === null && columnStart === null && columnEnd === null) {
    return null;
  }

  const rows = shape.rows!;
  const columns = shape.columns!;
  // Columnas ausentes = "todas las columnas de esas filas" (caso típico: bandas).
  let r1 = rowStart ?? rowEnd ?? 1;
  let r2 = rowEnd ?? rowStart ?? rows;
  let c1 = columnStart ?? 1;
  let c2 = columnEnd ?? columns;
  if (r2 < r1) [r1, r2] = [r2, r1];
  if (c2 < c1) [c1, c2] = [c2, c1];

  return {
    rowStart: Math.max(1, Math.min(r1, rows)),
    rowEnd: Math.max(1, Math.min(r2, rows)),
    columnStart: Math.max(1, Math.min(c1, columns)),
    columnEnd: Math.max(1, Math.min(c2, columns))
  };
}

/** Rectángulo → índices 0-based cubiertos dentro de labels[]. */
function rectToIndexes(rect: RectRange, shape: GridShape, n: number): number[] {
  const out: number[] = [];
  for (let row = rect.rowStart; row <= rect.rowEnd; row++) {
    for (let column = rect.columnStart; column <= rect.columnEnd; column++) {
      const idx = cellToIndex(row, column, shape);
      if (idx !== null && idx < n) out.push(idx);
    }
  }
  return out;
}

/**
 * Rango lineal → rectángulo, cuando calza exacto en la grilla:
 * una sola fila parcial, o filas completas. Si no calza, null.
 */
function indexRangeToRect(from: number, to: number, shape: GridShape): RectRange | null {
  if (!isGridShape(shape)) return null;
  const rows = shape.rows!;
  const columns = shape.columns!;
  const major = isColumnMajor(shape) ? rows : columns;

  const majorFrom = Math.floor(from / major) + 1;
  const minorFrom = (from % major) + 1;
  const majorTo = Math.floor(to / major) + 1;
  const minorTo = (to % major) + 1;

  let rect: RectRange;
  if (majorFrom === majorTo) {
    rect = isColumnMajor(shape)
      ? {
          rowStart: minorFrom,
          rowEnd: minorTo,
          columnStart: majorFrom,
          columnEnd: majorTo
        }
      : {
          rowStart: majorFrom,
          rowEnd: majorTo,
          columnStart: minorFrom,
          columnEnd: minorTo
        };
  } else if (minorFrom === 1 && minorTo === major) {
    rect = isColumnMajor(shape)
      ? { rowStart: 1, rowEnd: rows, columnStart: majorFrom, columnEnd: majorTo }
      : { rowStart: majorFrom, rowEnd: majorTo, columnStart: 1, columnEnd: columns };
  } else {
    return null;
  }

  if (rect.rowEnd > rows || rect.columnEnd > columns) return null;
  return rect;
}

/** Labels del grupo + categoría por índice si venían en el legacy items[]. */
function extractLabelsAndPreset(
  g: Record<string, unknown>,
  categories: AiEventMapCategory[],
  elementType: MapElementType
): { labels: string[]; presetByIndex: Array<string | null> } {
  const labels: string[] = [];
  const presetByIndex: Array<string | null> = [];
  const seen = new Set<string>();

  const pushLabel = (rawLabel: unknown, rawCategory: unknown): void => {
    const label = String(rawLabel ?? '').trim().slice(0, 80);
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(label);
    const cat = String(rawCategory ?? '').trim();
    presetByIndex.push(cat ? resolveCategoryId(cat, categories, elementType) : null);
  };

  if (Array.isArray(g.labels) && g.labels.length) {
    for (const l of g.labels) pushLabel(l, null);
  }

  if (!labels.length && Array.isArray(g.items)) {
    for (const row of g.items) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      pushLabel(r.label, r.category ?? g.category);
    }
  }

  if (!labels.length && layoutTypeIsZone(g)) {
    pushLabel(String(g.id ?? g.label ?? 'GENERAL').trim() || 'GENERAL', g.category);
  }

  return { labels, presetByIndex };
}

/**
 * Construye los assignments finales.
 *
 * Acepta rectángulos (grillas), rangos lineales from/to y el legacy
 * `group.category` único. Siempre devuelve cobertura completa y sin solapes:
 * arma un mapa categoría-por-índice, lo comprime en bloques y recién ahí
 * deriva el rectángulo. Así el índice lineal nunca depende de la aritmética
 * del modelo.
 */
function normalizeAssignments(
  g: Record<string, unknown>,
  labels: string[],
  shape: GridShape,
  presetByIndex: Array<string | null>,
  categories: AiEventMapCategory[],
  elementType: MapElementType
): AiEventMapCategoryAssignment[] {
  const n = labels.length;
  if (n === 0) return [];

  const byIndex: Array<string | null> = Array.from({ length: n }, (_, i) =>
    presetByIndex[i] ?? null
  );

  const rawAssignments = Array.isArray(g.categoryAssignments)
    ? g.categoryAssignments
    : [];

  for (const row of rawAssignments) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const category = resolveCategoryId(
      String(r.category ?? ''),
      categories,
      elementType
    );

    const rect = parseRect(r, shape);
    if (rect) {
      for (const idx of rectToIndexes(rect, shape, n)) byIndex[idx] = category;
      continue;
    }

    let from = parseNullableInt(r.from);
    let to = parseNullableInt(r.to);
    if (from === null || to === null) continue;
    from = Math.max(0, Math.min(from, n - 1));
    to = Math.max(0, Math.min(to, n - 1));
    if (to < from) [from, to] = [to, from];
    for (let i = from; i <= to; i++) byIndex[i] = category;
  }

  const fallbackCat = resolveCategoryId(String(g.category ?? ''), categories, elementType);
  for (let i = 0; i < n; i++) {
    if (!byIndex[i]) byIndex[i] = fallbackCat;
  }

  return compressCategoryRanges(byIndex as string[]).map(range => ({
    category: range.category,
    ...(indexRangeToRect(range.from, range.to, shape) ?? EMPTY_RECT),
    from: range.from,
    to: range.to
  }));
}

function layoutTypeIsZone(g: Record<string, unknown>): boolean {
  const t = parseLayoutType(g.layoutType);
  return t === 'zone' || parseElementType(g.elementType) === 'zone';
}

function resolveGridShape(
  g: Record<string, unknown>,
  layoutType: MapLayoutType,
  ordering: MapGroupOrdering | null,
  count: number
): GridShape {
  if (layoutType !== 'grid') return { rows: null, columns: null, ordering: null };

  let rows = parseNullableInt(g.rows);
  let columns = parseNullableInt(g.columns);
  if (rows !== null && rows <= 0) rows = null;
  if (columns !== null && columns <= 0) columns = null;

  // La IA suele acertar una de las dos dimensiones; la otra se deriva del total.
  if (columns && !rows) rows = Math.ceil(count / columns);
  else if (rows && !columns) columns = Math.ceil(count / rows);
  else if (rows && columns && rows * columns < count) rows = Math.ceil(count / columns);

  return { rows, columns, ordering };
}

function normalizeGroups(
  raw: unknown,
  categories: AiEventMapCategory[]
): AiEventMapLayoutGroup[] {
  const groups: AiEventMapLayoutGroup[] = [];
  const usedIds = new Set<string>();
  if (!Array.isArray(raw)) return groups;

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const g = item as Record<string, unknown>;

    const elementTypeHint =
      parseElementType(g.elementType) ??
      (Array.isArray(g.labels) && g.labels[0]
        ? inferElementTypeFromLabel(String(g.labels[0]))
        : 'section');

    const { labels, presetByIndex } = extractLabelsAndPreset(
      g,
      categories,
      elementTypeHint
    );

    const elementType =
      parseElementType(g.elementType) ??
      (labels[0] ? inferElementTypeFromLabel(labels[0]) : elementTypeHint);

    let layoutType = parseLayoutType(g.layoutType);
    if (!layoutType) {
      layoutType = elementType === 'zone' ? 'zone' : 'row';
    }

    const countFromLabels = labels.length;
    const countRaw = parseNullableInt(g.count);
    const count = countFromLabels > 0 ? countFromLabels : Math.max(1, countRaw ?? 1);

    if (countFromLabels === 0 && layoutType !== 'zone') continue;

    const ordering = parseOrdering(g.ordering) ?? defaultOrdering(layoutType);
    const shape = resolveGridShape(g, layoutType, ordering, count);

    const categoryAssignments = normalizeAssignments(
      g,
      labels,
      shape,
      presetByIndex,
      categories,
      elementType
    );

    const requiresGeometryFallback =
      layoutType === 'freeform' || Boolean(g.requiresGeometryFallback);

    const id = ensureUniqueId(slugify(String(g.id ?? labels[0] ?? 'group')), usedIds);

    groups.push({
      id,
      elementType,
      layoutType,
      position: parseGroupPosition(g.position),
      lane: parseNonNegIntOrNull(g.lane),
      stackOrder: parseNonNegIntOrNull(g.stackOrder),
      count,
      rows: shape.rows,
      columns: shape.columns,
      ordering,
      labels,
      category: resolveGroupCategory(categoryAssignments),
      categoryAssignments,
      requiresGeometryFallback,
      confidence: round3(clamp01(Number(g.confidence ?? 0.7)))
    });
  }

  return groups;
}

/** Categoría única del grupo, o null si mezcla varias. */
function resolveGroupCategory(
  assignments: AiEventMapCategoryAssignment[]
): string | null {
  if (!assignments.length) return null;
  const unique = new Set(assignments.map(a => a.category));
  return unique.size === 1 ? assignments[0]!.category : null;
}

function ensureCategoriesForAssignments(
  categories: AiEventMapCategory[],
  groups: AiEventMapLayoutGroup[]
): AiEventMapCategory[] {
  const out = [...categories];
  const usedIds = new Set(out.map(c => c.id));

  for (const g of groups) {
    for (const a of g.categoryAssignments) {
      if (out.some(c => c.id === a.category)) continue;
      const saleMode = defaultSaleForType(g.elementType);
      const id = ensureUniqueId(slugify(a.category), usedIds);
      out.push({
        id,
        label: a.category,
        detectedPrice: null,
        elementType: g.elementType,
        saleMode,
        selectionUnit: defaultSelectionForType(g.elementType, saleMode),
        detectedCapacity: null,
        includedAdmissions: null,
        color: null,
        confidence: 0.55
      });
      a.category = id;
    }
  }

  return out;
}

/**
 * Fallback determinístico del frente del venue.
 *
 * Muchos flyers no dibujan el escenario (solo grid + barras + general), y el
 * modelo devuelve visible:false. El frontend igual necesita una orientación para
 * dibujar, así que se deduce: si hay una zona general por debajo de los grupos
 * premium, el frente está arriba. Se marca inferred:true y confidence baja para
 * que la UI pueda mostrarlo como tentativo.
 */
function resolveStage(
  stage: AiEventMapStage,
  groups: AiEventMapLayoutGroup[]
): AiEventMapStage {
  if (stage.visible && stage.position) {
    return { ...stage, alignment: stage.alignment ?? 'center' };
  }
  if (!groups.length) return stage;

  const zoneDepth = (g: AiEventMapLayoutGroup): number =>
    g.position.startsWith('bottom') ? 2 : g.position.startsWith('top') ? 0 : 1;

  const zones = groups.filter(g => g.elementType === 'zone');
  const others = groups.filter(g => g.elementType !== 'zone');

  let position: MapStagePosition = 'top';
  if (zones.length && others.length) {
    const zoneAvg =
      zones.reduce((acc, g) => acc + zoneDepth(g) + (g.stackOrder ?? 0), 0) / zones.length;
    const otherAvg =
      others.reduce((acc, g) => acc + zoneDepth(g) + (g.stackOrder ?? 0), 0) /
      others.length;
    // Zona general más abajo que el resto → escenario arriba, y viceversa.
    position = zoneAvg >= otherAvg ? 'top' : 'bottom';
  }

  return {
    visible: true,
    position: stage.position ?? position,
    alignment: stage.alignment ?? 'center',
    inferred: true,
    confidence: round3(Math.min(stage.confidence, 0.4))
  };
}

function isCampoGeneralZone(g: AiEventMapLayoutGroup): boolean {
  if (g.layoutType !== 'zone' && g.elementType !== 'zone') return false;
  const label = (g.labels[0] ?? g.id ?? '').toLowerCase();
  return /\b(campo|general|pista|standing)\b/.test(label);
}

/** Menor = más arriba en el slot (más cerca del escenario). */
function visualStackRank(g: AiEventMapLayoutGroup): number {
  if (g.layoutType === 'grid') return 0;
  if (g.layoutType === 'zone' || g.elementType === 'zone') return 10;
  if (g.layoutType === 'row') {
    const sample = (g.labels[0] ?? '').toLowerCase();
    if (/palco/.test(sample)) return 20;
    return 15;
  }
  if (g.layoutType === 'column') return 5;
  return 12;
}

function isPalcoSideColumn(g: AiEventMapLayoutGroup): boolean {
  if (g.elementType === 'palco') return true;
  return /palco/.test((g.labels[0] ?? g.id ?? '').toLowerCase());
}

function isBoxesSideColumn(g: AiEventMapLayoutGroup): boolean {
  if (g.elementType === 'box') return true;
  return /\bboxes?\b/.test((g.labels[0] ?? g.id ?? '').toLowerCase());
}

const SIDE_COLUMN_POSITIONS: MapGroupPosition[] = [
  'left',
  'right',
  'top_left',
  'bottom_left',
  'top_right',
  'bottom_right'
];

/** PALCO y BOXES en el mismo costado comparten stackOrder y se separan por lane. */
function normalizeSideColumnLanes(
  groups: AiEventMapLayoutGroup[]
): AiEventMapLayoutGroup[] {
  const laneById = new Map<string, { stackOrder: number; lane: number }>();

  for (const pos of SIDE_COLUMN_POSITIONS) {
    const columns = groups.filter(
      g => g.position === pos && g.layoutType === 'column'
    );
    if (columns.length <= 1) continue;

    const sorted = [...columns].sort((a, b) => {
      const aPalco = isPalcoSideColumn(a);
      const bPalco = isPalcoSideColumn(b);
      if (aPalco !== bPalco) return aPalco ? -1 : 1;
      const aBoxes = isBoxesSideColumn(a);
      const bBoxes = isBoxesSideColumn(b);
      if (aBoxes !== bBoxes) return aBoxes ? 1 : -1;
      return (a.lane ?? 99) - (b.lane ?? 99);
    });

    sorted.forEach((g, laneIdx) => {
      laneById.set(g.id, { stackOrder: 0, lane: laneIdx });
    });
  }

  return groups.map(g =>
    laneById.has(g.id) ? { ...g, ...laneById.get(g.id)! } : g
  );
}

/**
 * CAMPO GENERAL va debajo de la grilla central, no en la banda inferior con palcos.
 * Corrige cuando la IA lo coloca en bottom_* junto a la fila PALCO 25..30.
 */
function relocateMisplacedCampoGeneral(
  groups: AiEventMapLayoutGroup[]
): AiEventMapLayoutGroup[] {
  const hasCenterGrid = groups.some(
    g => g.position === 'center' && g.layoutType === 'grid'
  );
  if (!hasCenterGrid) return groups;

  const centerMaxStack = groups
    .filter(g => g.position === 'center')
    .reduce((max, g) => Math.max(max, g.stackOrder ?? 0), -1);

  return groups.map(g => {
    if (!isCampoGeneralZone(g)) return g;
    if (!g.position.startsWith('bottom')) return g;
    return {
      ...g,
      position: 'center' as MapGroupPosition,
      stackOrder: Math.max(1, centerMaxStack + 1),
      lane: null
    };
  });
}

/** Reasigna stackOrder dentro de cada position según jerarquía visual del venue. */
function normalizeStackOrders(
  groups: AiEventMapLayoutGroup[]
): AiEventMapLayoutGroup[] {
  const byPosition = new Map<MapGroupPosition, AiEventMapLayoutGroup[]>();
  for (const g of groups) {
    const list = byPosition.get(g.position) ?? [];
    list.push(g);
    byPosition.set(g.position, list);
  }

  const orderById = new Map<string, number>();

  for (const list of byPosition.values()) {
    if (list.length <= 1) continue;
    if (list.every(g => g.layoutType === 'column')) continue;

    const sorted = [...list].sort((a, b) => {
      const rankDiff = visualStackRank(a) - visualStackRank(b);
      if (rankDiff !== 0) return rankDiff;
      return (a.stackOrder ?? 0) - (b.stackOrder ?? 0);
    });
    sorted.forEach((g, idx) => orderById.set(g.id, idx));
  }

  return groups.map(g =>
    orderById.has(g.id) ? { ...g, stackOrder: orderById.get(g.id)! } : g
  );
}

export function normalizeMapLayout(raw: Record<string, unknown>): AnalyzeMapResult {
  const rawStage = normalizeStage(raw.stage);
  let categories = normalizeCategories(raw.categories);

  const layoutRaw =
    raw.layout && typeof raw.layout === 'object'
      ? (raw.layout as Record<string, unknown>)
      : raw;
  let groups = normalizeGroups(layoutRaw.groups ?? raw.groups, categories);
  categories = ensureCategoriesForAssignments(categories, groups);

  groups = groups.map(g => {
    const categoryAssignments = g.categoryAssignments.map(a => ({
      ...a,
      category: categories.some(c => c.id === a.category)
        ? a.category
        : resolveCategoryId(a.category, categories, g.elementType)
    }));
    return {
      ...g,
      categoryAssignments,
      category: resolveGroupCategory(categoryAssignments)
    };
  });

  groups = relocateMisplacedCampoGeneral(groups);
  groups = normalizeSideColumnLanes(groups);
  groups = normalizeStackOrders(groups);

  const anyGroupFallback = groups.some(g => g.requiresGeometryFallback);
  const layoutFallback = anyGroupFallback || Boolean(layoutRaw.requiresGeometryFallback);

  return {
    stage: resolveStage(rawStage, groups),
    categories,
    layout: {
      requiresGeometryFallback: layoutFallback,
      groups
    }
  };
}

export function summarizeMapLayout(result: AnalyzeMapResult): {
  groups: number;
  labels: number;
  tables: number;
  boxes: number;
  palcos: number;
  zones: number;
  freeform: number;
  requiresGeometryFallback: boolean;
} {
  let labels = 0;
  let tables = 0;
  let boxes = 0;
  let palcos = 0;
  let zones = 0;
  let freeform = 0;
  for (const g of result.layout.groups) {
    labels += g.labels.length;
    if (g.elementType === 'table') tables += g.labels.length;
    else if (g.elementType === 'box') boxes += g.labels.length;
    else if (g.elementType === 'palco') palcos += g.labels.length;
    else if (g.elementType === 'zone') zones += 1;
    if (g.layoutType === 'freeform') freeform += 1;
  }
  return {
    groups: result.layout.groups.length,
    labels,
    tables,
    boxes,
    palcos,
    zones,
    freeform,
    requiresGeometryFallback: result.layout.requiresGeometryFallback
  };
}
