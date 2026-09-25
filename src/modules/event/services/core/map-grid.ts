/**
 * Modelo de grilla del mapa de sectores.
 *
 * Única fuente de verdad del layout: un canvas fijo de 24×24 celdas, índices
 * 1-based. Cada sector (y el escenario) ocupa un conjunto de celdas:
 *
 *  - `rect`:  bloque rectangular sólido.
 *  - `cells`: forma libre (L, U, escalones…) como celdas 1×1, estilo Tetris.
 *
 * Ninguna celda puede pertenecer a dos sectores ni pisar el escenario.
 *
 * La geometría vieja en coords 0..1 (`geometry`) solo se DERIVA desde acá
 * (`layoutToLegacyGeometry`), nunca al revés. La única excepción es la
 * migración de datos existentes (`snapLegacyGeometry`).
 *
 * Sin imports de Nest ni alias de paths: lo usan también las migraciones, que
 * en producción corren con node plano sobre `dist/`.
 */

/**
 * Grilla del mapa guardado y del editor.
 *
 * El modelo sigue describiendo el plano en 24×24 —es el problema fácil, y con
 * más columnas se equivoca— y su respuesta se multiplica al entrar. El doble de
 * resolución es para el productor: le permite correr un bloque media celda,
 * armar formas más finas y acomodar los huecos, sin pedirle a la IA algo que no
 * hace bien.
 *
 * La escala es exacta (×2) a propósito: cada celda del modelo son cuatro de la
 * grilla, sin redondeo.
 */
export const MAP_GRID_SIZE = 24;

/** Grilla en la que razona el modelo. `MAP_GRID_SIZE` es un múltiplo de esta. */
export const MODEL_GRID_SIZE = 24;

/** Celdas de la grilla por cada celda del modelo. */
export const MAP_GRID_SCALE = MAP_GRID_SIZE / MODEL_GRID_SIZE;

/** Grosor del escenario en celdas. */
export const STAGE_BAND_CELLS = 2 * MAP_GRID_SCALE;

/** Largo del escenario en celdas: medida fija, igual que en el editor. */
export const STAGE_SPAN_CELLS = 9 * MAP_GRID_SCALE;

export type MapGridCell = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

export type MapSectorLayout =
  | { kind: 'rect'; cell: MapGridCell }
  | { kind: 'cells'; cells: MapGridCell[] };

export type MapStagePositionLike = 'top' | 'bottom' | 'left' | 'right' | 'center';

/** Geometría legacy 0..1, derivada del layout. Deprecada. */
export type LegacyMapGeometry =
  | { type: 'rect'; x: number; y: number; w: number; h: number; color?: string }
  | { type: 'polygon'; points: Array<{ x: number; y: number }>; color?: string };

export type NormBox = { x: number; y: number; w: number; h: number };

/** Error de dominio: el caller lo traduce a 400. */
export class MapGridError extends Error {}

const FULL_FRAME: NormBox = { x: 0, y: 0, w: 1, h: 1 };

export function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

export function parseCellKey(key: string): { col: number; row: number } {
  const [c, r] = key.split(':');
  return { col: Number(c), row: Number(r) };
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

function inRange(n: number): boolean {
  return n >= 1 && n <= MAP_GRID_SIZE;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function clampCell(cell: MapGridCell): MapGridCell {
  const col = clampInt(cell.col, 1, MAP_GRID_SIZE);
  const row = clampInt(cell.row, 1, MAP_GRID_SIZE);
  return {
    col,
    row,
    colSpan: clampInt(cell.colSpan, 1, MAP_GRID_SIZE - col + 1),
    rowSpan: clampInt(cell.rowSpan, 1, MAP_GRID_SIZE - row + 1)
  };
}

// ---------------------------------------------------------------------------
// Validación estricta (entrada de la API)
// ---------------------------------------------------------------------------

function readCell(raw: unknown, where: string): MapGridCell {
  if (!raw || typeof raw !== 'object') {
    throw new MapGridError(`${where}: celda inválida`);
  }
  const r = raw as Record<string, unknown>;
  const { col, row, colSpan, rowSpan } = r;
  if (!isInt(col) || !isInt(row) || !isInt(colSpan) || !isInt(rowSpan)) {
    throw new MapGridError(`${where}: col, row, colSpan y rowSpan tienen que ser enteros`);
  }
  if (colSpan < 1 || rowSpan < 1) {
    throw new MapGridError(`${where}: colSpan y rowSpan tienen que ser ≥ 1`);
  }
  const lastCol = col + colSpan - 1;
  const lastRow = row + rowSpan - 1;
  if (!inRange(col) || !inRange(row) || !inRange(lastCol) || !inRange(lastRow)) {
    throw new MapGridError(
      `${where}: la celda se sale de la grilla ${MAP_GRID_SIZE}×${MAP_GRID_SIZE} (índices 1..${MAP_GRID_SIZE})`
    );
  }
  return { col, row, colSpan, rowSpan };
}

/**
 * Valida y normaliza un layout que llega por la API. Lanza MapGridError con un
 * mensaje listo para el productor.
 */
export function validateSectorLayout(raw: unknown, label: string): MapSectorLayout {
  if (!raw || typeof raw !== 'object') {
    throw new MapGridError(`${label}: falta el layout en grilla`);
  }
  const r = raw as Record<string, unknown>;
  if (r.kind === 'rect') {
    return { kind: 'rect', cell: readCell(r.cell, label) };
  }
  if (r.kind === 'cells') {
    if (!Array.isArray(r.cells) || r.cells.length === 0) {
      throw new MapGridError(`${label}: un layout "cells" necesita al menos una celda`);
    }
    const seen = new Set<string>();
    const cells: MapGridCell[] = [];
    for (const rawCell of r.cells) {
      const c = readCell(rawCell, label);
      if (c.colSpan !== 1 || c.rowSpan !== 1) {
        throw new MapGridError(`${label}: un layout "cells" solo admite celdas 1×1`);
      }
      const key = cellKey(c.col, c.row);
      if (seen.has(key)) {
        throw new MapGridError(`${label}: la celda (${c.col}, ${c.row}) está repetida`);
      }
      seen.add(key);
      cells.push({ col: c.col, row: c.row, colSpan: 1, rowSpan: 1 });
    }
    return { kind: 'cells', cells };
  }
  throw new MapGridError(`${label}: kind de layout inválido (usá "rect" o "cells")`);
}

/** true si el valor guardado es un layout válido (lectura tolerante). */
export function isSectorLayout(raw: unknown): raw is MapSectorLayout {
  try {
    validateSectorLayout(raw, 'layout');
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Celdas
// ---------------------------------------------------------------------------

export function expandCell(cell: MapGridCell): string[] {
  const out: string[] = [];
  for (let row = cell.row; row < cell.row + cell.rowSpan; row++) {
    for (let col = cell.col; col < cell.col + cell.colSpan; col++) {
      out.push(cellKey(col, row));
    }
  }
  return out;
}

export function layoutKeys(layout: MapSectorLayout): string[] {
  if (layout.kind === 'rect') return expandCell(layout.cell);
  const set = new Set<string>();
  for (const c of layout.cells) for (const k of expandCell(c)) set.add(k);
  return [...set];
}

export function layoutArea(layout: MapSectorLayout): number {
  return layoutKeys(layout).length;
}

export function boundsOfKeys(keys: Iterable<string>): MapGridCell | null {
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -Infinity;
  let maxR = -Infinity;
  for (const k of keys) {
    const { col, row } = parseCellKey(k);
    minC = Math.min(minC, col);
    minR = Math.min(minR, row);
    maxC = Math.max(maxC, col);
    maxR = Math.max(maxR, row);
  }
  if (!Number.isFinite(minC)) return null;
  return { col: minC, row: minR, colSpan: maxC - minC + 1, rowSpan: maxR - minR + 1 };
}

export function layoutBounds(layout: MapSectorLayout): MapGridCell {
  if (layout.kind === 'rect') return { ...layout.cell };
  return boundsOfKeys(layoutKeys(layout)) ?? { col: 1, row: 1, colSpan: 1, rowSpan: 1 };
}

/** Conjunto de claves → layout: `rect` si es un rectángulo sólido, si no `cells`. */
export function layoutFromKeys(keys: Iterable<string>): MapSectorLayout | null {
  const list = [...new Set(keys)];
  const bounds = boundsOfKeys(list);
  if (!bounds) return null;
  if (bounds.colSpan * bounds.rowSpan === list.length) {
    return { kind: 'rect', cell: bounds };
  }
  const cells = list
    .map(parseCellKey)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map(({ col, row }) => ({ col, row, colSpan: 1, rowSpan: 1 }));
  return { kind: 'cells', cells };
}

/** Componentes conexas en 4 direcciones, la más grande primero. */
export function connectedComponents(keys: Iterable<string>): string[][] {
  const remaining = new Set(keys);
  const out: string[][] = [];
  while (remaining.size) {
    const start = remaining.values().next().value as string;
    remaining.delete(start);
    const comp = [start];
    const stack = [start];
    while (stack.length) {
      const { col, row } = parseCellKey(stack.pop()!);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const k = cellKey(col + dc, row + dr);
        if (remaining.has(k)) {
          remaining.delete(k);
          comp.push(k);
          stack.push(k);
        }
      }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

export function isConnectedLayout(layout: MapSectorLayout): boolean {
  return connectedComponents(layoutKeys(layout)).length <= 1;
}

export function translateLayout(layout: MapSectorLayout, dc: number, dr: number): MapSectorLayout {
  if (layout.kind === 'rect') {
    return {
      kind: 'rect',
      cell: { ...layout.cell, col: layout.cell.col + dc, row: layout.cell.row + dr }
    };
  }
  return {
    kind: 'cells',
    cells: layout.cells.map(c => ({ ...c, col: c.col + dc, row: c.row + dr }))
  };
}

function keysFitCanvas(keys: string[]): boolean {
  return keys.every(k => {
    const { col, row } = parseCellKey(k);
    return inRange(col) && inRange(row);
  });
}

// ---------------------------------------------------------------------------
// Anti-overlap
// ---------------------------------------------------------------------------

export type MapGridItem = {
  id: string;
  /** Nombre para mensajes de error. */
  label: string;
  layout: MapSectorLayout;
};

export type MapGridOverlap = { a: string; b: string; col: number; row: number };

/** Primer solape por par de ítems (a/b son ids). */
export function findOverlaps(items: MapGridItem[]): MapGridOverlap[] {
  const owner = new Map<string, string>();
  const pairs = new Map<string, MapGridOverlap>();
  for (const item of items) {
    for (const k of layoutKeys(item.layout)) {
      const prev = owner.get(k);
      if (prev !== undefined && prev !== item.id) {
        const pairKey = `${prev}|${item.id}`;
        if (!pairs.has(pairKey)) {
          const { col, row } = parseCellKey(k);
          pairs.set(pairKey, { a: prev, b: item.id, col, row });
        }
        continue;
      }
      owner.set(k, item.id);
    }
  }
  return [...pairs.values()];
}

export function assertNoOverlaps(items: MapGridItem[]): void {
  const overlaps = findOverlaps(items);
  if (!overlaps.length) return;
  const labelOf = new Map(items.map(i => [i.id, i.label]));
  const first = overlaps[0];
  const more = overlaps.length > 1 ? ` (y ${overlaps.length - 1} solape(s) más)` : '';
  throw new MapGridError(
    `"${labelOf.get(first.a)}" y "${labelOf.get(first.b)}" comparten la celda ` +
      `(${first.col}, ${first.row})${more}. Cada celda puede pertenecer a un solo sector.`
  );
}

export type PackInput = MapGridItem & {
  /**
   * Rígido = no se recorta, solo se traslada (mesas/palcos de una grilla).
   * Los no rígidos (zonas) ceden las celdas en conflicto si les queda una
   * forma conexa razonable; si no, se trasladan enteros.
   */
  rigid?: boolean;
};

export type PackResult = {
  layouts: Map<string, MapSectorLayout>;
  /** Ítems que no entraron en ningún lado: quedan con su layout original. */
  unresolved: string[];
  /** Ítems que se movieron o recortaron. */
  adjusted: string[];
};

/** Mínimo de celdas que tiene que conservar una zona recortada. */
const MIN_CARVE_RATIO = 0.5;

function shiftKeys(keys: string[], dc: number, dr: number): string[] {
  return keys.map(k => {
    const { col, row } = parseCellKey(k);
    return cellKey(col + dc, row + dr);
  });
}

function spiralFree(keys: string[], blocked: Set<string>): { dc: number; dr: number } | null {
  for (let radius = 0; radius <= MAP_GRID_SIZE; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (radius > 0 && Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
        const moved = shiftKeys(keys, dc, dr);
        if (!keysFitCanvas(moved)) continue;
        if (moved.some(k => blocked.has(k))) continue;
        return { dc, dr };
      }
    }
  }
  return null;
}

/**
 * Pack tipo Tetris. Procesa en el orden recibido: cada ítem reclama sus celdas
 * libres; si choca, recorta (no rígido) o se traslada al hueco más cercano.
 * `blocked` se muta con las celdas reclamadas (pasale el escenario).
 */
export function packLayouts(items: PackInput[], blocked: Set<string> = new Set()): PackResult {
  const layouts = new Map<string, MapSectorLayout>();
  const unresolved: string[] = [];
  const adjusted: string[] = [];

  for (const item of items) {
    const keys = layoutKeys(item.layout).filter(k => keysFitCanvas([k]));
    if (!keys.length) {
      unresolved.push(item.id);
      layouts.set(item.id, item.layout);
      continue;
    }
    const hasConflict = keys.some(k => blocked.has(k));
    let result: MapSectorLayout | null = null;

    if (!hasConflict) {
      result = layoutFromKeys(keys);
      if (item.layout.kind === 'cells' && result?.kind === 'rect') result = item.layout;
    } else {
      if (!item.rigid) {
        const free = keys.filter(k => !blocked.has(k));
        const main = connectedComponents(free)[0] ?? [];
        if (main.length >= Math.max(1, Math.ceil(keys.length * MIN_CARVE_RATIO))) {
          result = layoutFromKeys(main);
        }
      }
      if (!result) {
        const shift = spiralFree(keys, blocked);
        if (shift) result = layoutFromKeys(shiftKeys(keys, shift.dc, shift.dr));
      }
      if (result) adjusted.push(item.id);
    }

    if (!result) {
      unresolved.push(item.id);
      layouts.set(item.id, item.layout);
      continue;
    }
    for (const k of layoutKeys(result)) blocked.add(k);
    layouts.set(item.id, result);
  }

  return { layouts, unresolved, adjusted };
}

// ---------------------------------------------------------------------------
// Rasterizado 0..1 → grilla
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Recuadro 0..1 (relativo a `frame`) → celda. Bordes redondeados half-open
 * para que dos bloques que se tocan no se coman la misma fila/columna.
 */
export function boxToCell(box: NormBox, frame: NormBox = FULL_FRAME): MapGridCell {
  const fw = frame.w > 0 ? frame.w : 1;
  const fh = frame.h > 0 ? frame.h : 1;
  const x = clamp01((box.x - frame.x) / fw);
  const y = clamp01((box.y - frame.y) / fh);
  const x2 = clamp01((box.x + Math.max(0, box.w) - frame.x) / fw);
  const y2 = clamp01((box.y + Math.max(0, box.h) - frame.y) / fh);
  const n = MAP_GRID_SIZE;
  const c0 = Math.min(n - 1, Math.max(0, Math.round(x * n)));
  const r0 = Math.min(n - 1, Math.max(0, Math.round(y * n)));
  const c1 = Math.min(n, Math.max(c0 + 1, Math.round(x2 * n)));
  const r1 = Math.min(n, Math.max(r0 + 1, Math.round(y2 * n)));
  return { col: c0 + 1, row: r0 + 1, colSpan: c1 - c0, rowSpan: r1 - r0 };
}

export function cellToBox(cell: MapGridCell): NormBox {
  const n = MAP_GRID_SIZE;
  return {
    x: (cell.col - 1) / n,
    y: (cell.row - 1) / n,
    w: cell.colSpan / n,
    h: cell.rowSpan / n
  };
}

function pointInPolygon(x: number, y: number, pts: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > y !== b.y > y) {
      const xCross = ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
      if (x < xCross) inside = !inside;
    }
  }
  return inside;
}

/**
 * Polígono 0..1 → celdas cuyo centro cae adentro. Si el polígono es tan fino
 * que no contiene ningún centro, cae al recuadro envolvente.
 */
export function rasterizePolygon(
  points: Array<{ x: number; y: number }>,
  frame: NormBox = FULL_FRAME
): MapSectorLayout | null {
  const pts = points
    .map(p => ({
      x: clamp01((Number(p.x) - frame.x) / (frame.w || 1)),
      y: clamp01((Number(p.y) - frame.y) / (frame.h || 1))
    }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 3) return null;
  const n = MAP_GRID_SIZE;
  const keys: string[] = [];
  for (let row = 1; row <= n; row++) {
    for (let col = 1; col <= n; col++) {
      if (pointInPolygon((col - 0.5) / n, (row - 0.5) / n, pts)) keys.push(cellKey(col, row));
    }
  }
  if (keys.length) {
    return layoutFromKeys(connectedComponents(keys)[0]);
  }
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    kind: 'rect',
    cell: boxToCell({ x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY })
  };
}

/**
 * SOLO para migrar datos viejos: geometría 0..1 → layout en grilla.
 */
export function snapLegacyGeometry(raw: unknown): MapSectorLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  if (g.type === 'polygon' && Array.isArray(g.points)) {
    return rasterizePolygon(g.points as Array<{ x: number; y: number }>);
  }
  const x = Number(g.x);
  const y = Number(g.y);
  const w = Number(g.w);
  const h = Number(g.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return { kind: 'rect', cell: boxToCell({ x, y, w, h }) };
}

// ---------------------------------------------------------------------------
// Derivado legacy: layout → geometry 0..1
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number };

function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return a / 2;
}

/** Contorno exterior ortogonal de un polyomino, en unidades de celda. */
function traceOutline(keys: string[]): Pt[] {
  const set = new Set(keys);
  const has = (c: number, r: number) => set.has(cellKey(c, r));
  // Aristas dirigidas en sentido horario (y hacia abajo); vértices = esquinas
  // de celda en coords (col-1, row-1).
  const out = new Map<string, Pt[]>();
  const add = (a: Pt, b: Pt) => {
    const k = `${a.x},${a.y}`;
    const list = out.get(k) ?? [];
    list.push(b);
    out.set(k, list);
  };
  for (const k of set) {
    const { col, row } = parseCellKey(k);
    const x0 = col - 1;
    const y0 = row - 1;
    const x1 = col;
    const y1 = row;
    if (!has(col, row - 1)) add({ x: x0, y: y0 }, { x: x1, y: y0 });
    if (!has(col + 1, row)) add({ x: x1, y: y0 }, { x: x1, y: y1 });
    if (!has(col, row + 1)) add({ x: x1, y: y1 }, { x: x0, y: y1 });
    if (!has(col - 1, row)) add({ x: x0, y: y1 }, { x: x0, y: y0 });
  }

  const loops: Pt[][] = [];
  for (;;) {
    const startKey = [...out.entries()].find(([, v]) => v.length > 0)?.[0];
    if (!startKey) break;
    const [sx, sy] = startKey.split(',').map(Number);
    const loop: Pt[] = [{ x: sx, y: sy }];
    let cur: Pt = { x: sx, y: sy };
    for (let guard = 0; guard < 4 * set.size + 4; guard++) {
      const list = out.get(`${cur.x},${cur.y}`);
      if (!list?.length) break;
      const next = list.shift()!;
      if (next.x === sx && next.y === sy) break;
      loop.push(next);
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  if (!loops.length) return [];
  loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  const loop = loops[0];
  // Quitar vértices colineales.
  return loop.filter((p, i) => {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const next = loop[(i + 1) % loop.length];
    return !((prev.x === p.x && p.x === next.x) || (prev.y === p.y && p.y === next.y));
  });
}

export function layoutToLegacyGeometry(
  layout: MapSectorLayout,
  color?: string | null
): LegacyMapGeometry {
  const colorPart = color?.trim() ? { color: color.trim() } : {};
  const keys = layoutKeys(layout);
  const bounds = boundsOfKeys(keys);
  if (!bounds) return { type: 'rect', x: 0, y: 0, w: 0, h: 0, ...colorPart };
  if (bounds.colSpan * bounds.rowSpan === keys.length) {
    return { type: 'rect', ...cellToBox(bounds), ...colorPart };
  }
  const outline = traceOutline(keys);
  if (outline.length < 3) {
    return { type: 'rect', ...cellToBox(bounds), ...colorPart };
  }
  const n = MAP_GRID_SIZE;
  return {
    type: 'polygon',
    points: outline.map(p => ({ x: p.x / n, y: p.y / n })),
    ...colorPart
  };
}

// ---------------------------------------------------------------------------
// Escenario
// ---------------------------------------------------------------------------

/** Mismo default que el editor del frontend (`defaultStageCell`). */
/** Celda del modelo (24×24) llevada a la grilla del mapa. */
export function scaleModelCell(cell: MapGridCell): MapGridCell {
  const n = MAP_GRID_SCALE;
  return {
    col: (cell.col - 1) * n + 1,
    row: (cell.row - 1) * n + 1,
    colSpan: cell.colSpan * n,
    rowSpan: cell.rowSpan * n
  };
}

/** Layout del modelo llevado a la grilla del mapa. */
export function scaleModelLayout(layout: MapSectorLayout): MapSectorLayout {
  if (layout.kind === 'rect') return { kind: 'rect', cell: scaleModelCell(layout.cell) };
  return { kind: 'cells', cells: layout.cells.map(scaleModelCell) };
}

export function defaultStageLayout(position: MapStagePositionLike | null | undefined): MapSectorLayout {
  const n = MAP_GRID_SIZE;
  // Medida fija y centrada. Un escenario de borde a borde se comía el ancho
  // del plano y dejaba todo lo vendible apretado contra el centro.
  const band = STAGE_BAND_CELLS;
  const span = STAGE_SPAN_CELLS;
  const offset = Math.max(1, Math.round((n - span) / 2) + 1);
  switch (position) {
    case 'bottom':
      return { kind: 'rect', cell: { col: offset, row: n - band + 1, colSpan: span, rowSpan: band } };
    case 'left':
      return { kind: 'rect', cell: { col: 1, row: offset, colSpan: band, rowSpan: span } };
    case 'right':
      return { kind: 'rect', cell: { col: n - band + 1, row: offset, colSpan: band, rowSpan: span } };
    case 'center':
      return {
        kind: 'rect',
        cell: {
          col: offset,
          row: 10 * MAP_GRID_SCALE,
          colSpan: span,
          rowSpan: 4 * MAP_GRID_SCALE
        }
      };
    case 'top':
    default:
      return { kind: 'rect', cell: { col: offset, row: 1, colSpan: span, rowSpan: band } };
  }
}

/** Posición del escenario inferida de su celda (para `analysis.stage.position`). */
export function inferStagePosition(cell: MapGridCell): MapStagePositionLike {
  const n = MAP_GRID_SIZE;
  const cx = cell.col + (cell.colSpan - 1) / 2;
  const cy = cell.row + (cell.rowSpan - 1) / 2;
  const edge = n / 4;
  if (cy <= edge) return 'top';
  if (cy >= n - edge + 1) return 'bottom';
  if (cx <= edge) return 'left';
  if (cx >= n - edge + 1) return 'right';
  return 'center';
}

/**
 * Planos viejos y el editor guardaban el escenario como un sector más
 * ("ESCENARIO"). En el modelo de grilla vive aparte (`stageLayout`).
 */
export function isStageSectorName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase();
  return n === 'escenario' || n === 'stage';
}

/**
 * Lee `analysis.stage` guardado (JSON libre) y devuelve el layout del
 * escenario: `stage.layout` si es válido, si no el default por posición.
 */
export function stageLayoutFromAnalysis(analysis: unknown): MapSectorLayout {
  const stage =
    analysis && typeof analysis === 'object'
      ? ((analysis as Record<string, unknown>).stage as Record<string, unknown> | undefined)
      : undefined;
  if (stage && isSectorLayout(stage.layout)) return stage.layout;
  const pos = stage?.position;
  const position =
    pos === 'top' || pos === 'bottom' || pos === 'left' || pos === 'right' || pos === 'center'
      ? pos
      : 'top';
  return defaultStageLayout(position);
}
