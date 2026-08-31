import type {
  AiEventMapCategory,
  AiEventMapElement,
  AiEventMapElementShape,
  AiEventMapStage,
  AnalyzeMapResult
} from '../contracts/ievent-ai.service';

export const MAP_ELEMENT_MAX = 200;

const DEFAULT_VENUE_WIDTH = 1000;
const STAGE_MIN_Y = 0.03;

/** Bounds típicos para grilla central de mesas (SVG interactivo). */
const CENTRAL_TABLE_BOUNDS = {
  x0: 0.24,
  x1: 0.76,
  y0: 0.23,
  y1: 0.48
};

type RawTableGrid = {
  category?: string;
  categoryId?: string;
  rows?: number;
  cols?: number;
  originX?: number;
  originY?: number;
  cellW?: number;
  cellH?: number;
  gapX?: number | null;
  gapY?: number | null;
  startNumber?: number | null;
  count?: number | null;
  tableNumbers?: number[] | null;
  labelPrefix?: string | null;
  shape?: string | null;
  detectedPrice?: number | null;
  detectedCapacity?: number | null;
  confidence?: number | null;
};

type RawInventoryItem = {
  category?: string;
  prefix?: string;
  min?: number;
  max?: number;
  count?: number;
};

type GridBounds = { x0: number; x1: number; y0: number; y1: number };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampSize(n: number): number {
  return Math.max(0.01, Math.min(1, n));
}

function clampConfidence(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.5;
  return clamp01(n);
}

function parseNullableNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseNullableInt(raw: unknown): number | null {
  const n = parseNullableNumber(raw);
  if (n === null) return null;
  return Math.floor(n);
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

function categoryPrefix(categoryId: string): string {
  return categoryId.split('-')[0] ?? categoryId;
}

/** id estable: mesa-m12, palco-7, etc. */
function buildElementId(categoryId: string, label: string, rawId?: string): string {
  const trimmedId = rawId?.trim();
  if (trimmedId) {
    return slugify(trimmedId);
  }

  const numMatch = label.match(/(\d+)/);
  const prefix = categoryPrefix(categoryId);
  const normalizedLabel = label.trim();

  if (/^m?\d+$/i.test(normalizedLabel)) {
    const n = numMatch?.[1] ?? normalizedLabel.replace(/\D/g, '');
    return `${prefix}-m${n}`;
  }

  if (numMatch && (normalizedLabel.toLowerCase().includes('palco') || categoryId.includes('palco'))) {
    return `palco-${numMatch[1]}`;
  }

  if (numMatch && (normalizedLabel.toLowerCase().includes('box') || categoryId.includes('box'))) {
    return `box-${numMatch[1]}`;
  }

  const labelSlug = slugify(label);
  return labelSlug.includes(categoryId) ? labelSlug : `${categoryId}-${labelSlug}`;
}

function normalizeShape(raw: unknown): AiEventMapElementShape | null {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'circle' || s === 'ellipse') return 'circle';
  if (s === 'rectangle' || s === 'rect') return 'rectangle';
  if (s === 'polygon') return 'polygon';
  return null;
}

function normalizePoints(raw: unknown): Array<[number, number]> | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;

  const points: Array<[number, number]> = [];
  for (const p of raw) {
    if (Array.isArray(p) && p.length >= 2) {
      points.push([clamp01(Number(p[0])), clamp01(Number(p[1]))]);
    } else if (p && typeof p === 'object') {
      const row = p as { x?: unknown; y?: unknown };
      points.push([clamp01(Number(row.x)), clamp01(Number(row.y))]);
    } else {
      return null;
    }
  }

  return points.length >= 3 ? points : null;
}

function readCoord(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) {
      return clamp01(Number(raw[key]));
    }
  }
  return undefined;
}

function readSize(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) {
      return clampSize(Number(raw[key]));
    }
  }
  return undefined;
}

function resolveCategoryId(
  rawCategory: string,
  categoryIds: Set<string>,
  categories: AiEventMapCategory[]
): string | null {
  const category = slugify(rawCategory.trim());
  if (categoryIds.has(category)) return category;

  const byLabel = categories.find(
    c => slugify(c.label) === category || c.id.includes(category) || category.includes(c.id)
  );
  if (byLabel) return byLabel.id;

  if (categoryIds.size === 1) return [...categoryIds][0]!;

  return null;
}

function normalizeStage(raw: unknown): AiEventMapStage | null {
  if (!raw || typeof raw !== 'object') return null;

  const row = raw as Record<string, unknown>;
  const label = String(row.label ?? 'Escenario').trim().slice(0, 120);
  const x = readCoord(row, 'x');
  const yRaw = readCoord(row, 'y');
  const width = readSize(row, 'width', 'w');
  const height = readSize(row, 'height', 'h');

  if (x === undefined || yRaw === undefined || width === undefined || height === undefined) {
    return null;
  }

  const stage: AiEventMapStage = {
    id: 'stage',
    label: label || 'Escenario',
    x,
    y: Math.max(yRaw, STAGE_MIN_Y),
    width,
    height,
    confidence: clampConfidence(row.confidence)
  };

  const rotation = parseNullableNumber(row.rotation);
  if (rotation !== null) {
    stage.rotation = rotation;
  }

  return stage;
}

function normalizeCategories(raw: unknown): AiEventMapCategory[] {
  if (!Array.isArray(raw)) return [];

  const usedIds = new Set<string>();
  const categories: AiEventMapCategory[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const row = item as Record<string, unknown>;
    const label = String(row.label ?? '').trim().slice(0, 120);
    if (!label) continue;

    const baseId = slugify(label);
    const id = ensureUniqueId(baseId, usedIds);

    categories.push({
      id,
      label,
      detectedPrice: parseNullableNumber(row.detectedPrice ?? row.price),
      detectedCapacity: parseNullableInt(row.detectedCapacity ?? row.capacity),
      confidence: clampConfidence(row.confidence)
    });
  }

  return categories;
}

function normalizeElement(
  raw: Record<string, unknown>,
  categories: AiEventMapCategory[],
  usedIds: Set<string>
): AiEventMapElement | null {
  const label = String(raw.label ?? raw.name ?? '').trim().slice(0, 80);
  if (!label) return null;

  const shape = normalizeShape(raw.shape);
  if (!shape) return null;

  const categoryIds = new Set(categories.map(c => c.id));
  const category = resolveCategoryId(
    String(raw.category ?? raw.categoryId ?? ''),
    categoryIds,
    categories
  );
  if (!category) return null;

  const categoryMeta = categories.find(c => c.id === category);
  const rawId = String(raw.id ?? '').trim();
  const id = ensureUniqueId(buildElementId(category, label, rawId), usedIds);

  const hasOwnPrice = raw.detectedPrice !== undefined || raw.price !== undefined;
  const hasOwnCapacity =
    raw.detectedCapacity !== undefined ||
    raw.capacity !== undefined ||
    raw.detected_capacity !== undefined;

  const element: AiEventMapElement = {
    id,
    label,
    category,
    shape,
    detectedPrice: hasOwnPrice
      ? parseNullableNumber(raw.detectedPrice ?? raw.price)
      : (categoryMeta?.detectedPrice ?? null),
    detectedCapacity: hasOwnCapacity
      ? parseNullableInt(raw.detectedCapacity ?? raw.capacity)
      : (categoryMeta?.detectedCapacity ?? null),
    confidence: clampConfidence(raw.confidence)
  };

  const rotation = parseNullableNumber(raw.rotation);
  if (rotation !== null) {
    element.rotation = rotation;
  }

  if (shape === 'polygon') {
    const points = normalizePoints(raw.points);
    if (!points) return null;
    element.points = points;
    return element;
  }

  const x = readCoord(raw, 'x');
  const y = readCoord(raw, 'y');
  const width = readSize(raw, 'width', 'w');
  const height = readSize(raw, 'height', 'h');

  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return null;
  }

  element.x = x;
  element.y = y;
  element.width = width;
  element.height = height;
  return element;
}

function parseLabelNumber(label: string): number | null {
  const m = label.trim().match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function isNumberedUnitLabel(label: string): boolean {
  return /^(m|mesa|p|palco|b|box)?\s*-?\s*\d+$/i.test(label.trim()) || /^m?\d+$/i.test(label.trim());
}

/** Infer cols×rows para un bloque numerado (mesas centrales → 10×5 cuando count=50). */
export function inferGridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 1, rows: 1 };
  if (count === 50) return { cols: 10, rows: 5 };
  if (count === 40) return { cols: 10, rows: 4 };
  if (count === 30) return { cols: 10, rows: 3 };
  if (count === 24) return { cols: 4, rows: 6 };
  if (count === 20) return { cols: 5, rows: 4 };

  // Preferir ~10 columnas si divide bien
  for (const cols of [10, 8, 5, 6, 4]) {
    if (count % cols === 0) {
      return { cols, rows: count / cols };
    }
  }

  const cols = Math.min(10, Math.max(3, Math.ceil(Math.sqrt(count))));
  return { cols, rows: Math.ceil(count / cols) };
}

function isCollapsedSpatialGroup(els: AiEventMapElement[]): boolean {
  const withBox = els.filter(
    e => e.shape !== 'polygon' && e.x !== undefined && e.y !== undefined
  );
  if (withBox.length < 8) return false;

  const ys = withBox.map(e => e.y!);
  const xs = withBox.map(e => e.x!);
  const ySpan = Math.max(...ys) - Math.min(...ys);
  const xSpan = Math.max(...xs) - Math.min(...xs);
  const uniqueY = new Set(ys.map(y => Math.round(y * 40) / 40)).size; // buckets ~0.025
  const uniqueX = new Set(xs.map(x => Math.round(x * 40) / 40)).size;

  // Tira horizontal aplastada (el bug reportado: 2 filas a y≈0.15/0.20)
  if (uniqueY <= 3 && withBox.length >= 10) return true;
  if (ySpan < 0.12 && withBox.length >= 10) return true;
  // Todo apilado en una columna
  if (uniqueX <= 2 && withBox.length >= 10 && xSpan < 0.15) return true;

  return false;
}

function placeGridElements(params: {
  count: number;
  startNumber: number;
  labelPrefix: string;
  category: string;
  categoryMeta?: AiEventMapCategory;
  shape: AiEventMapElementShape;
  bounds: GridBounds;
  cols: number;
  rows: number;
  confidence: number;
  usedIds: Set<string>;
  detectedPrice: number | null;
  detectedCapacity: number | null;
}): AiEventMapElement[] {
  const {
    count,
    startNumber,
    labelPrefix,
    category,
    shape,
    bounds,
    cols,
    rows,
    confidence,
    usedIds,
    detectedPrice,
    detectedCapacity
  } = params;

  const gapRatio = 0.18;
  const usableW = Math.max(0.05, bounds.x1 - bounds.x0);
  const usableH = Math.max(0.05, bounds.y1 - bounds.y0);
  const cellW = clampSize(usableW / (cols + (cols - 1) * gapRatio));
  const cellH = clampSize(usableH / (rows + (rows - 1) * gapRatio));
  const gapX = cols > 1 ? (usableW - cellW * cols) / (cols - 1) : 0;
  const gapY = rows > 1 ? (usableH - cellH * rows) / (rows - 1) : 0;

  const out: AiEventMapElement[] = [];
  for (let i = 0; i < count; i++) {
    if (out.length >= MAP_ELEMENT_MAX) break;
    const row = Math.floor(i / cols);
    const col = i % cols;
    if (row >= rows) break;

    const n = startNumber + i;
    const label = `${labelPrefix}${n}`;
    const id = ensureUniqueId(buildElementId(category, label), usedIds);

    out.push({
      id,
      label,
      category,
      shape,
      x: clamp01(bounds.x0 + col * (cellW + gapX)),
      y: clamp01(bounds.y0 + row * (cellH + gapY)),
      width: cellW,
      height: cellH,
      detectedPrice,
      detectedCapacity,
      confidence
    });
  }

  return out;
}

function repairCollapsedNumberedGroups(
  elements: AiEventMapElement[],
  categories: AiEventMapCategory[],
  usedIds: Set<string>
): AiEventMapElement[] {
  const polygons = elements.filter(e => e.shape === 'polygon');
  const rectLike = elements.filter(e => e.shape !== 'polygon');

  const byCategory = new Map<string, AiEventMapElement[]>();
  for (const el of rectLike) {
    if (!isNumberedUnitLabel(el.label)) continue;
    const list = byCategory.get(el.category) ?? [];
    list.push(el);
    byCategory.set(el.category, list);
  }

  const keep = new Set<AiEventMapElement>(rectLike);
  const rebuilt: AiEventMapElement[] = [];

  for (const [category, group] of byCategory) {
    if (!isCollapsedSpatialGroup(group)) continue;

    for (const el of group) {
      keep.delete(el);
      usedIds.delete(el.id);
    }

    const numbers = group
      .map(e => parseLabelNumber(e.label))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);

    const count = numbers.length || group.length;
    const startNumber = numbers[0] ?? 1;
    const labelPrefix = /^p/i.test(group[0]?.label ?? '')
      ? 'P'
      : /^b/i.test(group[0]?.label ?? '')
        ? 'B'
        : 'M';

    const { cols, rows } = inferGridDimensions(count);
    const categoryMeta = categories.find(c => c.id === category);
    const isMesa = category.includes('mesa') || labelPrefix === 'M';

    const bounds: GridBounds = isMesa
      ? { ...CENTRAL_TABLE_BOUNDS }
      : {
          x0: Math.min(...group.map(e => e.x ?? 0.2)),
          x1: Math.max(...group.map(e => (e.x ?? 0.2) + (e.width ?? 0.04))),
          y0: Math.min(...group.map(e => e.y ?? 0.2)),
          y1: Math.max(
            Math.min(...group.map(e => e.y ?? 0.2)) + 0.25,
            Math.max(...group.map(e => (e.y ?? 0.2) + (e.height ?? 0.04)))
          )
        };

    // Si el span X del grupo colapsado es razonable, conservar ancho; forzar alto de grilla
    if (!isMesa) {
      const xs = group.map(e => e.x!).filter(Number.isFinite);
      if (xs.length) {
        bounds.x0 = Math.min(...xs);
        bounds.x1 = Math.max(...xs.map((x, i) => x + (group[i]?.width ?? 0.04)));
      }
    }

    rebuilt.push(
      ...placeGridElements({
        count,
        startNumber,
        labelPrefix,
        category,
        categoryMeta,
        shape: group[0]?.shape === 'rectangle' ? 'rectangle' : 'circle',
        bounds,
        cols,
        rows,
        confidence: group[0]?.confidence ?? 0.85,
        usedIds,
        detectedPrice: group[0]?.detectedPrice ?? categoryMeta?.detectedPrice ?? null,
        detectedCapacity: group[0]?.detectedCapacity ?? categoryMeta?.detectedCapacity ?? null
      })
    );
  }

  return [...[...keep], ...rebuilt, ...polygons];
}

function normalizeGridGeometry(grid: RawTableGrid): {
  rows: number;
  cols: number;
  originX: number;
  originY: number;
  cellW: number;
  cellH: number;
  gapX: number;
  gapY: number;
} {
  let rows = Math.max(1, Math.min(30, Math.floor(Number(grid.rows) || 1)));
  let cols = Math.max(1, Math.min(30, Math.floor(Number(grid.cols) || 1)));
  const countHint =
    parseNullableInt(grid.count) ??
    (Array.isArray(grid.tableNumbers) ? grid.tableNumbers.length : null) ??
    rows * cols;

  // Grilla aplastada (1–2 filas con muchos elementos) → redimensionar
  if (countHint >= 10 && rows <= 2) {
    const inferred = inferGridDimensions(countHint);
    cols = inferred.cols;
    rows = inferred.rows;
  } else if (countHint >= 10 && cols <= 2 && rows >= 10) {
    // columna única rara para mesas centrales — puede ser lateral OK; solo rehacer si parece mesa
    const prefix = String(grid.labelPrefix ?? 'M').toUpperCase();
    if (prefix === 'M' || prefix === 'MESA') {
      const inferred = inferGridDimensions(countHint);
      cols = inferred.cols;
      rows = inferred.rows;
    }
  }

  const prefix = String(grid.labelPrefix ?? 'M').toUpperCase();
  const isCentralMesa = (prefix === 'M' || prefix === 'MESA') && countHint >= 20;

  if (isCentralMesa) {
    const bounds = CENTRAL_TABLE_BOUNDS;
    const gapRatio = 0.18;
    const usableW = bounds.x1 - bounds.x0;
    const usableH = bounds.y1 - bounds.y0;
    const cellW = clampSize(usableW / (cols + (cols - 1) * gapRatio));
    const cellH = clampSize(usableH / (rows + (rows - 1) * gapRatio));
    const gapX = cols > 1 ? (usableW - cellW * cols) / (cols - 1) : 0;
    const gapY = rows > 1 ? (usableH - cellH * rows) / (rows - 1) : 0;
    return {
      rows,
      cols,
      originX: bounds.x0,
      originY: bounds.y0,
      cellW,
      cellH,
      gapX,
      gapY
    };
  }

  return {
    rows,
    cols,
    originX: clamp01(Number(grid.originX) || 0),
    originY: clamp01(Number(grid.originY) || 0),
    cellW: clampSize(Number(grid.cellW) || 0.045),
    cellH: clampSize(Number(grid.cellH) || 0.045),
    gapX: Math.max(0, Number(grid.gapX) || 0.01),
    gapY: Math.max(0, Number(grid.gapY) || 0.01)
  };
}

function expandTableGrids(
  grids: RawTableGrid[],
  categories: AiEventMapCategory[],
  usedIds: Set<string>,
  existingLabels: Set<string>
): AiEventMapElement[] {
  const categoryIds = new Set(categories.map(c => c.id));
  const out: AiEventMapElement[] = [];

  for (const grid of grids) {
    const category = resolveCategoryId(
      String(grid.category ?? grid.categoryId ?? ''),
      categoryIds,
      categories
    );
    if (!category) continue;

    const categoryMeta = categories.find(c => c.id === category);
    const geom = normalizeGridGeometry(grid);
    const shape = normalizeShape(grid.shape) ?? 'circle';
    const labelPrefix = String(grid.labelPrefix ?? 'M').trim() || 'M';
    const startNumber = Math.max(1, Math.floor(Number(grid.startNumber) || 1));
    const explicitNumbers = Array.isArray(grid.tableNumbers)
      ? grid.tableNumbers.map(n => Math.floor(Number(n))).filter(n => Number.isFinite(n))
      : null;
    const confidence = clampConfidence(grid.confidence ?? categoryMeta?.confidence ?? 0.85);
    const total = explicitNumbers?.length ?? geom.rows * geom.cols;

    for (let idx = 0; idx < total; idx++) {
      if (out.length >= MAP_ELEMENT_MAX) return out;

      const row = Math.floor(idx / geom.cols);
      const col = idx % geom.cols;
      if (row >= geom.rows) break;

      const n = explicitNumbers?.[idx] ?? startNumber + idx;
      const label = `${labelPrefix}${n}`;

      if (existingLabels.has(label.toLowerCase())) {
        continue;
      }

      const localX = geom.originX + col * (geom.cellW + geom.gapX);
      const localY = geom.originY + row * (geom.cellH + geom.gapY);
      const id = ensureUniqueId(buildElementId(category, label), usedIds);

      out.push({
        id,
        label,
        category,
        shape,
        x: clamp01(localX),
        y: clamp01(localY),
        width: geom.cellW,
        height: geom.cellH,
        detectedPrice: parseNullableNumber(grid.detectedPrice) ?? categoryMeta?.detectedPrice ?? null,
        detectedCapacity:
          parseNullableInt(grid.detectedCapacity) ?? categoryMeta?.detectedCapacity ?? null,
        confidence
      });
      existingLabels.add(label.toLowerCase());
    }
  }

  return out;
}

/**
 * Labels que cubrirá tableGrids — se quitan de elements[] para no bloquear la expansión
 * ni mezclar OCR lineal con la grilla espacial.
 */
function labelsCoveredByGrids(grids: RawTableGrid[]): Set<string> {
  const labels = new Set<string>();

  for (const grid of grids) {
    const labelPrefix = String(grid.labelPrefix ?? 'M').trim() || 'M';
    const startNumber = Math.max(1, Math.floor(Number(grid.startNumber) || 1));
    const geom = normalizeGridGeometry(grid);
    const explicitNumbers = Array.isArray(grid.tableNumbers)
      ? grid.tableNumbers.map(n => Math.floor(Number(n))).filter(n => Number.isFinite(n))
      : null;
    const total = explicitNumbers?.length ?? geom.rows * geom.cols;

    for (let idx = 0; idx < total; idx++) {
      const n = explicitNumbers?.[idx] ?? startNumber + idx;
      labels.add(`${labelPrefix}${n}`.toLowerCase());
    }
  }

  return labels;
}

function normalizeElements(
  raw: unknown,
  tableGrids: RawTableGrid[],
  categories: AiEventMapCategory[]
): AiEventMapElement[] {
  const usedIds = new Set<string>();
  const gridLabels = labelsCoveredByGrids(tableGrids);
  const elements: AiEventMapElement[] = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      if (elements.length >= MAP_ELEMENT_MAX) break;

      const normalized = normalizeElement(item as Record<string, unknown>, categories, usedIds);
      if (!normalized) continue;

      // Preferir tableGrids espaciales sobre elementos OCR aplastados de la misma serie
      if (gridLabels.has(normalized.label.toLowerCase())) {
        continue;
      }

      elements.push(normalized);
    }
  }

  const existingLabels = new Set(elements.map(e => e.label.toLowerCase()));

  if (tableGrids.length > 0) {
    const fromGrids = expandTableGrids(tableGrids, categories, usedIds, existingLabels);
    for (const el of fromGrids) {
      if (elements.length >= MAP_ELEMENT_MAX) break;
      elements.push(el);
      existingLabels.add(el.label.toLowerCase());
    }
  }

  return repairCollapsedNumberedGroups(elements, categories, usedIds);
}

/**
 * Completa números faltantes según inventory (ej. min=1 max=50 count=50).
 * Coloca los faltantes en grilla dentro de los bounds del grupo existente (o centrales para mesas).
 */
function fillMissingFromInventory(
  elements: AiEventMapElement[],
  inventory: RawInventoryItem[],
  categories: AiEventMapCategory[],
  usedIds: Set<string>
): AiEventMapElement[] {
  if (!inventory.length) return elements;

  const categoryIds = new Set(categories.map(c => c.id));
  const out = [...elements];
  const existingLabels = new Set(out.map(e => e.label.toLowerCase()));

  for (const item of inventory) {
    const prefix = String(item.prefix ?? '').trim();
    const min = Math.floor(Number(item.min));
    const max = Math.floor(Number(item.max));
    if (!prefix || !Number.isFinite(min) || !Number.isFinite(max) || max < min) continue;

    const count = Math.min(
      MAP_ELEMENT_MAX,
      parseNullableInt(item.count) ?? max - min + 1,
      max - min + 1
    );
    if (count < 2) continue;

    const category =
      resolveCategoryId(String(item.category ?? ''), categoryIds, categories) ??
      categories.find(c => c.id.includes(slugify(prefix)))?.id;
    if (!category) continue;

    const categoryMeta = categories.find(c => c.id === category);
    const siblings = out.filter(
      e => e.category === category && e.shape !== 'polygon' && e.x !== undefined
    );

    const missing: number[] = [];
    for (let n = min; n < min + count; n++) {
      const label = `${prefix}${n}`;
      if (!existingLabels.has(label.toLowerCase())) {
        missing.push(n);
      }
    }
    if (!missing.length) continue;

    // Si faltan muchos (>15% o >3), redistribuir toda la secuencia en grilla
    const expectedTotal = count;
    const presentCount = expectedTotal - missing.length;
    const needsFullRebuild =
      missing.length >= 3 ||
      presentCount / expectedTotal < 0.85 ||
      (siblings.length >= 8 && isCollapsedSpatialGroup(siblings));

    const { cols, rows } = inferGridDimensions(expectedTotal);
    const isMesa = category.includes('mesa') || /^m$/i.test(prefix);
    const bounds: GridBounds = isMesa
      ? { ...CENTRAL_TABLE_BOUNDS }
      : siblings.length
        ? {
            x0: Math.min(...siblings.map(e => e.x!)),
            x1: Math.max(...siblings.map(e => e.x! + (e.width ?? 0.04))),
            y0: Math.min(...siblings.map(e => e.y!)),
            y1: Math.max(
              Math.min(...siblings.map(e => e.y!)) + 0.25,
              Math.max(...siblings.map(e => e.y! + (e.height ?? 0.04)))
            )
          }
        : { ...CENTRAL_TABLE_BOUNDS };

    if (needsFullRebuild) {
      for (const el of siblings) {
        const idx = out.indexOf(el);
        if (idx >= 0) out.splice(idx, 1);
        usedIds.delete(el.id);
        existingLabels.delete(el.label.toLowerCase());
      }

      const rebuilt = placeGridElements({
        count: expectedTotal,
        startNumber: min,
        labelPrefix: prefix,
        category,
        categoryMeta,
        shape: siblings[0]?.shape === 'rectangle' ? 'rectangle' : 'circle',
        bounds,
        cols,
        rows,
        confidence: siblings[0]?.confidence ?? categoryMeta?.confidence ?? 0.85,
        usedIds,
        detectedPrice: siblings[0]?.detectedPrice ?? categoryMeta?.detectedPrice ?? null,
        detectedCapacity:
          siblings[0]?.detectedCapacity ?? categoryMeta?.detectedCapacity ?? null
      });

      for (const el of rebuilt) {
        out.push(el);
        existingLabels.add(el.label.toLowerCase());
      }
      continue;
    }

    // Pocos faltantes: insertar en huecos estimados de la grilla
    const gapRatio = 0.18;
    const usableW = Math.max(0.05, bounds.x1 - bounds.x0);
    const usableH = Math.max(0.05, bounds.y1 - bounds.y0);
    const cellW = clampSize(usableW / (cols + (cols - 1) * gapRatio));
    const cellH = clampSize(usableH / (rows + (rows - 1) * gapRatio));
    const gapX = cols > 1 ? (usableW - cellW * cols) / (cols - 1) : 0;
    const gapY = rows > 1 ? (usableH - cellH * rows) / (rows - 1) : 0;
    const shape = siblings[0]?.shape === 'rectangle' ? 'rectangle' : 'circle';

    for (const n of missing) {
      if (out.length >= MAP_ELEMENT_MAX) break;
      const i = n - min;
      const row = Math.floor(i / cols);
      const col = i % cols;
      const label = `${prefix}${n}`;
      const id = ensureUniqueId(buildElementId(category, label), usedIds);

      out.push({
        id,
        label,
        category,
        shape,
        x: clamp01(bounds.x0 + col * (cellW + gapX)),
        y: clamp01(bounds.y0 + row * (cellH + gapY)),
        width: cellW,
        height: cellH,
        detectedPrice: siblings[0]?.detectedPrice ?? categoryMeta?.detectedPrice ?? null,
        detectedCapacity:
          siblings[0]?.detectedCapacity ?? categoryMeta?.detectedCapacity ?? null,
        confidence: 0.7
      });
      existingLabels.add(label.toLowerCase());
    }
  }

  return out;
}

export function buildVenueDimensions(imageWidth?: number, imageHeight?: number): {
  width: number;
  height: number;
} {
  if (imageWidth && imageHeight && imageWidth > 0 && imageHeight > 0) {
    return {
      width: DEFAULT_VENUE_WIDTH,
      height: Math.max(100, Math.round(DEFAULT_VENUE_WIDTH * (imageHeight / imageWidth)))
    };
  }

  return { width: DEFAULT_VENUE_WIDTH, height: 800 };
}

export function normalizeMapAnalysis(
  raw: Record<string, unknown>,
  venue: { width: number; height: number }
): AnalyzeMapResult {
  const categories = normalizeCategories(raw.categories);
  const tableGrids = Array.isArray(raw.tableGrids)
    ? (raw.tableGrids as RawTableGrid[])
    : [];
  const inventory = Array.isArray(raw.inventory)
    ? (raw.inventory as RawInventoryItem[])
    : [];

  let elements = normalizeElements(raw.elements, tableGrids, categories);
  const usedIds = new Set(elements.map(e => e.id));
  elements = fillMissingFromInventory(elements, inventory, categories, usedIds);

  const stage = normalizeStage(raw.stage);

  // Preferir venue del modelo si trae aspect ratio válido; si no, el derivado de la imagen
  let finalVenue = venue;
  if (raw.venue && typeof raw.venue === 'object') {
    const v = raw.venue as { width?: unknown; height?: unknown };
    const w = Number(v.width);
    const h = Number(v.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w >= 100 && h >= 100) {
      finalVenue = { width: Math.round(w), height: Math.round(h) };
    }
  }

  return {
    venue: finalVenue,
    stage,
    categories,
    elements
  };
}
