import { AnalyzeMapResult } from '../contracts/ievent-ai.service';
import { MAP_GRID_SCALE, layoutKeys } from '../core/map-grid';
import { rasterizeMapAnalysis } from './map-grid-rasterizer';
import { normalizeMapLayout } from './map-layout-normalizer';

/**
 * Las entradas van en celdas del MODELO (24×24), como las manda la IA; las
 * aserciones, en celdas de la grilla del mapa (×`MAP_GRID_SCALE`).
 */
const S = MAP_GRID_SCALE;
/** Columna o fila del modelo llevada a la grilla. */
const g = (n: number) => (n - 1) * S + 1;

/** Respuesta cruda con el schema del prompt 24×24 (sin unitCells). */
function analyze(groups: Array<Record<string, unknown>>, stageLayout?: unknown): AnalyzeMapResult {
  const result = normalizeMapLayout({
    mapArea: null,
    stage: { visible: true, position: 'top' },
    stageLayout: stageLayout ?? {
      kind: 'rect',
      cell: { col: 2, row: 1, colSpan: 22, rowSpan: 2 }
    },
    categories: [],
    layout: { groups }
  });
  rasterizeMapAnalysis(result);
  return result;
}

const labels = (n: number, prefix = 'M') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

function occupied(result: AnalyzeMapResult): string[] {
  const keys: string[] = [];
  if (result.stage.layout) keys.push(...layoutKeys(result.stage.layout));
  for (const g of result.layout.groups) {
    const cells = g.footprintCells?.length ? g.footprintCells : (g.unitCells ?? []);
    for (const c of cells) keys.push(...layoutKeys({ kind: 'rect', cell: c }));
  }
  return keys;
}

describe('rasterizeMapAnalysis', () => {
  it('expande una grilla 5×10 en 50 unidades uniformes de una celda del modelo', () => {
    const result = analyze([
      {
        id: 'mesas',
        elementType: 'table',
        layoutType: 'grid',
        rows: 5,
        columns: 10,
        ordering: 'row_major',
        labels: labels(50),
        cell: { col: 7, row: 4, colSpan: 10, rowSpan: 5 }
      }
    ]);

    const group = result.layout.groups[0]!;
    expect(group.unitCells).toHaveLength(50);
    expect(group.unitCells!.every(c => c.colSpan === S && c.rowSpan === S)).toBe(true);
    expect(group.unitCells![0]).toEqual({ col: g(7), row: g(4), colSpan: S, rowSpan: S });
    expect(group.unitCells![11]).toEqual({ col: g(8), row: g(5), colSpan: S, rowSpan: S });
    expect(group.cell).toEqual({ col: g(7), row: g(4), colSpan: 10 * S, rowSpan: 5 * S });
  });

  it('ignora unitCells irregulares del modelo y las regenera uniformes', () => {
    const result = analyze([
      {
        id: 'mesas',
        elementType: 'table',
        layoutType: 'grid',
        rows: 1,
        columns: 3,
        labels: labels(3),
        cell: { col: 3, row: 5, colSpan: 6, rowSpan: 2 },
        unitCells: [
          { col: 3, row: 5, colSpan: 1, rowSpan: 1 },
          { col: 4, row: 5, colSpan: 3, rowSpan: 2 },
          { col: 8, row: 5, colSpan: 1, rowSpan: 2 }
        ]
      }
    ]);

    // Una mesa mide siempre una celda del modelo, aunque el bbox venga más grande.
    const units = result.layout.groups[0]!.unitCells!;
    expect(units).toEqual([
      { col: g(3), row: g(5), colSpan: S, rowSpan: S },
      { col: g(3) + S, row: g(5), colSpan: S, rowSpan: S },
      { col: g(3) + 2 * S, row: g(5), colSpan: S, rowSpan: S }
    ]);
  });

  it('agranda el bbox si es más chico que la grilla de unidades', () => {
    const result = analyze([
      {
        id: 'palcos',
        elementType: 'palco',
        layoutType: 'column',
        labels: labels(6, 'P'),
        cell: { col: 1, row: 5, colSpan: 1, rowSpan: 2 }
      }
    ]);

    const group = result.layout.groups[0]!;
    expect(group.unitCells).toHaveLength(6);
    expect(new Set(group.unitCells!.map(c => `${c.col}:${c.row}`)).size).toBe(6);
    expect(group.unitCells!.every(c => c.colSpan === S && c.rowSpan === S)).toBe(true);
  });

  it('respeta la L del footprint y el bloque del hueco, sin solapes', () => {
    const fans = [
      [2, 3], [3, 3],
      [2, 4], [3, 4], [4, 4], [5, 4]
    ].map(([col, row]) => ({ col, row, colSpan: 1, rowSpan: 1 }));
    const result = analyze([
      {
        id: 'fans',
        elementType: 'zone',
        layoutType: 'zone',
        labels: ['FANS'],
        cell: { col: 2, row: 3, colSpan: 4, rowSpan: 2 },
        footprintCells: fans,
        shape: 'l'
      },
      {
        id: 'vip',
        elementType: 'zone',
        layoutType: 'zone',
        labels: ['VIP'],
        cell: { col: 4, row: 3, colSpan: 2, rowSpan: 1 }
      }
    ]);

    const [fansGroup, vip] = result.layout.groups;
    // El footprint viaja en celdas 1×1 de la grilla: cada celda del modelo son S².
    expect(fansGroup!.footprintCells).toHaveLength(6 * S * S);
    expect(vip!.cell).toEqual({ col: g(4), row: g(3), colSpan: 2 * S, rowSpan: S });
    const keys = occupied(result);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('unifica el tamaño de unidad entre grupos de la misma categoría', () => {
    const result = analyze([
      {
        id: 'palcos-left',
        elementType: 'palco',
        layoutType: 'column',
        category: 'palco',
        labels: labels(4, 'PL'),
        cell: { col: 3, row: 3, colSpan: 3, rowSpan: 4 }
      },
      {
        id: 'palcos-bottom',
        elementType: 'palco',
        layoutType: 'row',
        category: 'palco',
        labels: labels(4, 'PB'),
        cell: { col: 7, row: 18, colSpan: 8, rowSpan: 1 }
      },
      {
        id: 'boxes-left',
        elementType: 'box',
        layoutType: 'column',
        category: 'boxes',
        labels: labels(4, 'BX'),
        cell: { col: 1, row: 3, colSpan: 2, rowSpan: 4 }
      }
    ]);

    const left = result.layout.groups.find(g => g.id === 'palcos-left')!;
    const bottom = result.layout.groups.find(g => g.id === 'palcos-bottom')!;
    const boxes = result.layout.groups.find(g => g.id === 'boxes-left')!;
    // Natural: laterales 3×1, abajo 2×1 → canónico = 2×1 (el más chico), en celdas del modelo.
    const wide = (c: { colSpan: number; rowSpan: number }) => c.colSpan === 2 * S && c.rowSpan === S;
    expect(left.unitCells!.every(wide)).toBe(true);
    expect(bottom.unitCells!.every(wide)).toBe(true);
    // Otra categoría no se mezcla.
    expect(boxes.unitCells!.every(wide)).toBe(true);
    expect(new Set(occupied(result)).size).toBe(occupied(result).length);
  });

  it('anida VIP en FANS y no mete FANS dentro de CAMPO (stack de 3)', () => {
    const result = normalizeMapLayout({
      mapArea: null,
      stage: { visible: true, position: 'top' },
      stageLayout: {
        kind: 'rect',
        cell: { col: 4, row: 2, colSpan: 16, rowSpan: 2 }
      },
      categories: [
        {
          id: 'fans-4-life',
          label: 'FANS 4 LIFE',
          detectedPrice: 140000,
          elementType: 'zone',
          saleMode: 'general_admission',
          selectionUnit: 'ticket',
          color: '#c90052'
        },
        {
          id: 'vip-real-g',
          label: 'VIP REAL G',
          detectedPrice: 250000,
          elementType: 'zone',
          saleMode: 'general_admission',
          selectionUnit: 'ticket',
          color: '#ffff75'
        },
        {
          id: 'campo',
          label: 'CAMPO',
          detectedPrice: 70000,
          elementType: 'zone',
          saleMode: 'general_admission',
          selectionUnit: 'ticket',
          color: '#65001f'
        }
      ],
      layout: {
        groups: [
          {
            id: 'vip-real-g-center',
            elementType: 'zone',
            layoutType: 'zone',
            labels: ['VIP REAL G'],
            category: 'vip-real-g',
            cell: { col: 4, row: 5, colSpan: 16, rowSpan: 2 }
          },
          {
            id: 'fans-4-life-center',
            elementType: 'zone',
            layoutType: 'zone',
            labels: ['FANS 4 LIFE'],
            category: 'fans-4-life',
            cell: { col: 4, row: 7, colSpan: 16, rowSpan: 3 }
          },
          {
            id: 'campo-center',
            elementType: 'zone',
            layoutType: 'zone',
            labels: ['CAMPO'],
            category: 'campo',
            cell: { col: 4, row: 10, colSpan: 16, rowSpan: 5 }
          }
        ]
      }
    });
    rasterizeMapAnalysis(result);

    const vip = result.layout.groups.find(g => g.id === 'vip-real-g-center')!;
    const fans = result.layout.groups.find(g => g.id === 'fans-4-life-center')!;
    const campo = result.layout.groups.find(g => g.id === 'campo-center')!;

    expect(vip.cell!.colSpan).toBeLessThan(16 * S);
    expect(fans.footprintCells?.length).toBeGreaterThan(0);
    expect(fans.shape).toBe('l');
    // CAMPO sigue siendo rectángulo sólido debajo, no la L.
    expect(campo.footprintCells == null || campo.footprintCells.length === 0).toBe(true);
    expect(campo.shape === 'l').toBe(false);
    expect(new Set(occupied(result)).size).toBe(occupied(result).length);
  });

  it('anida VIP en el notch de FANS (L Tetris) cuando venían apilados', () => {
    const result = normalizeMapLayout({
      mapArea: null,
      stage: { visible: true, position: 'top' },
      stageLayout: {
        kind: 'rect',
        cell: { col: 4, row: 2, colSpan: 16, rowSpan: 2 }
      },
      categories: [
        {
          id: 'fans-4-life',
          label: 'FANS 4 LIFE',
          detectedPrice: 140000,
          elementType: 'zone',
          saleMode: 'general_admission',
          selectionUnit: 'ticket',
          color: '#c90052'
        },
        {
          id: 'vip-real-g',
          label: 'VIP REAL G',
          detectedPrice: 250000,
          elementType: 'zone',
          saleMode: 'general_admission',
          selectionUnit: 'ticket',
          color: '#ffff75'
        }
      ],
      layout: {
        groups: [
          {
            id: 'vip-real-g-center',
            elementType: 'zone',
            layoutType: 'zone',
            labels: ['VIP REAL G'],
            category: 'vip-real-g',
            cell: { col: 4, row: 5, colSpan: 16, rowSpan: 2 }
          },
          {
            id: 'fans-4-life-center',
            elementType: 'zone',
            layoutType: 'zone',
            labels: ['FANS 4 LIFE'],
            category: 'fans-4-life',
            cell: { col: 4, row: 7, colSpan: 16, rowSpan: 3 }
          }
        ]
      }
    });
    rasterizeMapAnalysis(result);

    const vip = result.layout.groups.find(g => g.id === 'vip-real-g-center')!;
    const fans = result.layout.groups.find(g => g.id === 'fans-4-life-center')!;

    // VIP queda en el notch superior derecho (más angosto que el bloque).
    expect(vip.cell!.colSpan).toBeLessThan(16 * S);
    expect(vip.cell!.row).toBe(g(5));
    expect(vip.footprintCells == null || vip.footprintCells.length === 0).toBe(true);

    // FANS es L: ocupa el union menos el VIP.
    expect(fans.footprintCells?.length).toBeGreaterThan(0);
    expect(fans.shape).toBe('l');
    const fanKeys = new Set(
      (fans.footprintCells ?? []).flatMap(c =>
        Array.from({ length: c.colSpan * c.rowSpan }, (_, i) => {
          const col = c.col + (i % c.colSpan);
          const row = c.row + Math.floor(i / c.colSpan);
          return `${col}:${row}`;
        })
      )
    );
    // Ninguna celda del VIP está en FANS.
    for (let r = vip.cell!.row; r < vip.cell!.row + vip.cell!.rowSpan; r++) {
      for (let c = vip.cell!.col; c < vip.cell!.col + vip.cell!.colSpan; c++) {
        expect(fanKeys.has(`${c}:${r}`)).toBe(false);
      }
    }
    expect(new Set(occupied(result)).size).toBe(occupied(result).length);
  });

  it('no anida SUPER PULLMAN dentro de PULLMAN (misma altura, bandas apiladas)', () => {
    const result = analyze([
      {
        id: 'super-pullman',
        elementType: 'section',
        layoutType: 'zone',
        labels: ['SUPER PULLMAN'],
        category: 'super-pullman',
        cell: { col: 4, row: 15, colSpan: 16, rowSpan: 3 }
      },
      {
        id: 'pullman',
        elementType: 'section',
        layoutType: 'zone',
        labels: ['PULLMAN'],
        category: 'pullman',
        cell: { col: 4, row: 18, colSpan: 16, rowSpan: 3 }
      }
    ]);
    const sp = result.layout.groups.find(g => g.id === 'super-pullman')!;
    const pu = result.layout.groups.find(g => g.id === 'pullman')!;
    expect(sp.footprintCells == null || sp.footprintCells.length === 0).toBe(true);
    expect(pu.footprintCells == null || pu.footprintCells.length === 0).toBe(true);
    expect(sp.cell).toEqual({ col: g(4), row: g(15), colSpan: 16 * S, rowSpan: 3 * S });
    expect(pu.cell).toEqual({ col: g(4), row: g(18), colSpan: 16 * S, rowSpan: 3 * S });
  });

  it('resuelve en código los solapes entre grupos y con el escenario', () => {
    const result = analyze([
      {
        id: 'campo',
        elementType: 'zone',
        layoutType: 'zone',
        labels: ['CAMPO'],
        cell: { col: 2, row: 2, colSpan: 20, rowSpan: 10 }
      },
      {
        id: 'mesas',
        elementType: 'table',
        layoutType: 'row',
        labels: labels(4),
        cell: { col: 5, row: 5, colSpan: 4, rowSpan: 1 }
      }
    ]);

    const keys = occupied(result);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.warnings.filter(w => w.code === 'GRID_OVERLAP_UNRESOLVED')).toEqual([]);
  });
});
