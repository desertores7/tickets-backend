import type { MapReplicateSector } from '../contracts/ievent-ai.service';

export const MAP_SECTOR_MAX = 100;

export type RawTableGrid = {
  ticketTypeName?: string;
  rows?: number;
  cols?: number;
  originX?: number;
  originY?: number;
  cellW?: number;
  cellH?: number;
  gapX?: number | null;
  gapY?: number | null;
  startNumber?: number | null;
  tableNumbers?: number[] | null;
  shape?: 'rect' | 'ellipse' | null;
  color?: string | null;
  nameTemplate?: string | null;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampSize(n: number): number {
  return Math.max(0.01, Math.min(1, n));
}

function formatName(template: string, n: number, i: number): string {
  return template.replaceAll('{n}', String(n)).replaceAll('{i}', String(i));
}

export type RawFloorPlanRegion = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

const DEFAULT_FLOOR_PLAN: RawFloorPlanRegion = { x: 0.05, y: 0.05, w: 0.9, h: 0.55 };

const CANVAS_PAD = 0.05;

/** Convierte coords 0–1 del plano (sin footer de precios) → canvas interactivo con márgenes. */
export function floorPlanLocalToCanvas(
  x: number,
  y: number,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } {
  const avail = 1 - 2 * CANVAS_PAD;
  return {
    x: CANVAS_PAD + x * avail,
    y: CANVAS_PAD + y * avail,
    w: w * avail,
    h: h * avail
  };
}

/** Convierte bbox en imagen completa → coords locales del plano (0–1). */
export function imageCoordToFloorPlanLocal(
  x: number,
  y: number,
  w: number,
  h: number,
  region: RawFloorPlanRegion
): { x: number; y: number; w: number; h: number } {
  const rx = clamp01(Number(region.x) ?? 0);
  const ry = clamp01(Number(region.y) ?? 0);
  const rw = Math.max(0.05, clampSize(Number(region.w) ?? 1));
  const rh = Math.max(0.05, clampSize(Number(region.h) ?? 1));
  return {
    x: clamp01((x - rx) / rw),
    y: clamp01((y - ry) / rh),
    w: clampSize(w / rw),
    h: clampSize(h / rh)
  };
}

/** Re-escala sectores para ocupar el canvas manteniendo proporciones relativas. */
export function fitSectorsToInteractiveCanvas(sectors: MapReplicateSector[]): MapReplicateSector[] {
  const sellable = sectors.filter(s => s.sellable);
  if (sellable.length === 0) return sectors;

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const s of sellable) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + s.w);
    maxY = Math.max(maxY, s.y + s.h);
  }

  const rangeW = maxX - minX || 1;
  const rangeH = maxY - minY || 1;
  const pad = 0.05;
  const availW = 1 - 2 * pad;
  const availH = 1 - 2 * pad;
  const scale = Math.min(availW / rangeW, availH / rangeH);
  const offsetX = pad + (availW - rangeW * scale) / 2;
  const offsetY = pad + (availH - rangeH * scale) / 2;

  const mapOne = (s: MapReplicateSector): MapReplicateSector => ({
    ...s,
    x: clamp01(offsetX + (s.x - minX) * scale),
    y: clamp01(offsetY + (s.y - minY) * scale),
    w: clampSize(s.w * scale),
    h: clampSize(s.h * scale)
  });

  return sectors.map(s => (s.sellable ? mapOne(s) : s));
}

const DEFAULT_TIER_COLORS = ['#D4AF37', '#C0C0C0', '#CD7F32', '#22c55e', '#8b5cf6'];

/** Grilla única numerada con tandas por rango (ej. mesas 1–10 gold, 11–20 silver…). */
export function expandTieredNumberedGrid(
  ticketTypes: Array<{ name: string; quantity: number; color?: string }>,
  opts?: { cols?: number; originX?: number; originY?: number; cellW?: number; cellH?: number }
): MapReplicateSector[] {
  if (!ticketTypes.length) return [];

  const cols = opts?.cols ?? 5;
  const cellW = opts?.cellW ?? 0.075;
  const cellH = opts?.cellH ?? 0.085;
  const gapX = 0.012;
  const gapY = 0.012;
  const originX = opts?.originX ?? 0.22;
  const originY = opts?.originY ?? 0.08;

  const tierByNumber = new Map<number, { name: string; color?: string }>();
  let n = 1;
  let tierIndex = 0;
  for (const tt of ticketTypes) {
    const qty = Math.max(1, Math.floor(tt.quantity) || 1);
    const tierColor =
      tt.color ?? DEFAULT_TIER_COLORS[tierIndex % DEFAULT_TIER_COLORS.length];
    tierIndex++;
    for (let i = 0; i < qty; i++) {
      tierByNumber.set(n++, { name: tt.name, color: tierColor });
    }
  }

  const total = tierByNumber.size;
  const rows = Math.ceil(total / cols);
  const out: MapReplicateSector[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const num = row * cols + col + 1;
      if (num > total || out.length >= MAP_SECTOR_MAX) break;
      const tier = tierByNumber.get(num)!;
      const localX = originX + col * (cellW + gapX);
      const localY = originY + row * (cellH + gapY);
      const placed = floorPlanLocalToCanvas(localX, localY, cellW, cellH);
      out.push({
        name: String(num),
        shape: 'rect',
        x: placed.x,
        y: placed.y,
        w: placed.w,
        h: placed.h,
        color: tier.color,
        ticketTypeName: tier.name,
        sellable: true
      });
    }
  }

  return out;
}

/** Fallback: grillas apiladas por tanda (cuando no hay grilla central única). */
export function synthesizeGridsFromTicketTypes(
  ticketTypes: Array<{ name: string; quantity: number; color?: string }>
): RawTableGrid[] {
  if (!ticketTypes.length) return [];

  const cols = 5;
  const cellW = 0.075;
  const cellH = 0.085;
  const gapX = 0.014;
  const gapY = 0.014;
  const gridOriginX = 0.22;
  let originY = 0.08;
  let startNumber = 1;
  const grids: RawTableGrid[] = [];

  for (const tt of ticketTypes) {
    const qty = Math.max(1, Math.floor(tt.quantity) || 1);
    const rows = Math.ceil(qty / cols);
    grids.push({
      ticketTypeName: tt.name,
      rows,
      cols,
      originX: gridOriginX,
      originY,
      cellW,
      cellH,
      gapX,
      gapY,
      startNumber,
      color: tt.color ?? undefined,
      nameTemplate: '{n}',
      shape: 'rect'
    });
    originY += rows * (cellH + gapY) + 0.025;
    startNumber += qty;
  }

  return grids;
}

export function parseFloorPlanRegion(raw: unknown): RawFloorPlanRegion {
  if (!raw || typeof raw !== 'object') return DEFAULT_FLOOR_PLAN;
  const r = raw as RawFloorPlanRegion;
  return {
    x: clamp01(Number(r.x) || DEFAULT_FLOOR_PLAN.x!),
    y: clamp01(Number(r.y) || DEFAULT_FLOOR_PLAN.y!),
    w: clampSize(Number(r.w) || DEFAULT_FLOOR_PLAN.w!),
    h: clampSize(Number(r.h) || DEFAULT_FLOOR_PLAN.h!)
  };
}

/** Expande tableGrids de la IA a sectores en canvas interactivo. */
export function expandTableGrids(grids: RawTableGrid[]): MapReplicateSector[] {
  const out: MapReplicateSector[] = [];

  for (const grid of grids) {
    const rows = Math.max(1, Math.min(20, Math.floor(Number(grid.rows) || 1)));
    const cols = Math.max(1, Math.min(20, Math.floor(Number(grid.cols) || 1)));
    const originX = clamp01(Number(grid.originX) || 0);
    const originY = clamp01(Number(grid.originY) || 0);
    const cellW = clampSize(Number(grid.cellW) || 0.05);
    const cellH = clampSize(Number(grid.cellH) || 0.05);
    const gapX = Math.max(0, Number(grid.gapX) || 0);
    const gapY = Math.max(0, Number(grid.gapY) || 0);
    const shape = grid.shape === 'ellipse' ? 'ellipse' : 'rect';
    const ticketTypeName = String(grid.ticketTypeName ?? '').trim() || 'General';
    const color = grid.color ? String(grid.color).trim() : undefined;
    const nameTemplate = String(grid.nameTemplate ?? '{n}').trim() || '{n}';
    const startNumber = Math.max(1, Math.floor(Number(grid.startNumber) || 1));
    const explicitNumbers = Array.isArray(grid.tableNumbers)
      ? grid.tableNumbers.map(n => Math.floor(Number(n))).filter(n => Number.isFinite(n))
      : null;

    let idx = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (out.length >= MAP_SECTOR_MAX) return out;

        const n = explicitNumbers?.[idx] ?? startNumber + idx;
        const localX = originX + col * (cellW + gapX);
        const localY = originY + row * (cellH + gapY);
        const placed = floorPlanLocalToCanvas(localX, localY, cellW, cellH);

        out.push({
          name: formatName(nameTemplate, n, idx + 1),
          shape,
          x: placed.x,
          y: placed.y,
          w: placed.w,
          h: placed.h,
          color,
          ticketTypeName,
          sellable: true
        });
        idx += 1;
      }
    }
  }

  return out;
}

export function normalizeMapSector(
  raw: Record<string, unknown>,
  region?: RawFloorPlanRegion,
  coordsInFullImage = false
): MapReplicateSector | null {
  const name = String(raw.name ?? '').trim();
  if (!name) return null;

  const sellable = raw.sellable !== false;
  const shape = raw.shape === 'ellipse' ? 'ellipse' : 'rect';
  let localX = clamp01(Number(raw.x) || 0);
  let localY = clamp01(Number(raw.y) || 0);
  let localW = clampSize(Number(raw.w) || 0.05);
  let localH = clampSize(Number(raw.h) || 0.05);

  if (coordsInFullImage && region) {
    const local = imageCoordToFloorPlanLocal(localX, localY, localW, localH, region);
    localX = local.x;
    localY = local.y;
    localW = local.w;
    localH = local.h;
  }

  const placed = floorPlanLocalToCanvas(localX, localY, localW, localH);

  return {
    name: name.slice(0, 80),
    shape,
    x: placed.x,
    y: placed.y,
    w: placed.w,
    h: placed.h,
    color: raw.color ? String(raw.color).trim().slice(0, 32) : undefined,
    ticketTypeName: String(raw.ticketTypeName ?? raw.ticketType ?? 'General')
      .trim()
      .slice(0, 120),
    sellable
  };
}

export function mergeSectors(
  direct: MapReplicateSector[],
  fromGrids: MapReplicateSector[]
): MapReplicateSector[] {
  const sellableDirect = direct.filter(s => s.sellable);
  const nonSellable = direct.filter(s => !s.sellable);
  const combined = [...fromGrids, ...sellableDirect];
  const capped = combined.slice(0, MAP_SECTOR_MAX);
  return [...capped, ...nonSellable.slice(0, Math.max(0, MAP_SECTOR_MAX - capped.length))];
}
