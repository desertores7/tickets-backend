import { AnalyzeMapResult } from '../contracts/ievent-ai.service';
import { MAP_GRID_SCALE, STAGE_BAND_CELLS, STAGE_SPAN_CELLS } from '../core/map-grid';
import { toGridAnalysis } from '../core/map-grid-analysis';
import { rasterizeMapAnalysis } from './map-grid-rasterizer';
import { normalizeMapLayout } from './map-layout-normalizer';

/**
 * Reglas del mapa generado, con los datos reales de los flyers que las
 * rompieron. Las entradas van en celdas del MODELO (24×24), que es como las
 * manda la IA; las aserciones van en celdas de la grilla, escaladas por
 * `MAP_GRID_SCALE`. Cada bloque de acá es un caso que salió mal en producción:
 * mesas rectangulares, un campo general colgando fuera del plano, el escenario
 * abajo, y sectores llamados por su precio.
 */

type RawGroup = Record<string, unknown>;

/** Respuesta cruda con el schema del prompt 24×24 (sin unitCells). */
function analyze(
  groups: RawGroup[],
  extra: {
    categories?: Array<Record<string, unknown>>;
    stage?: Record<string, unknown>;
    stageLayout?: unknown;
  } = {}
): AnalyzeMapResult {
  const result = normalizeMapLayout({
    mapArea: null,
    stage: extra.stage ?? { visible: true, position: 'top' },
    stageLayout:
      extra.stageLayout ?? { kind: 'rect', cell: { col: 2, row: 1, colSpan: 22, rowSpan: 2 } },
    categories: extra.categories ?? [],
    layout: { groups }
  });
  rasterizeMapAnalysis(result);
  return result;
}

const seq = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => String(from + i));

function groupById(result: AnalyzeMapResult, id: string) {
  const group = result.layout.groups.find(g => g.id === id);
  if (!group) throw new Error(`falta el grupo ${id}`);
  return group;
}

function unitSizes(result: AnalyzeMapResult, id: string) {
  const cells = groupById(result, id).unitCells ?? [];
  return [...new Set(cells.map(c => `${c.colSpan}x${c.rowSpan}`))];
}

describe('tamaño de unidad', () => {
  // El caso de Baires en su Salsa: el modelo mandó rowSpan 10 para 5 filas
  // (múltiplo exacto, que el prompt viejo permitía) y cada mesa salía 1×2.
  it('una mesa es cuadrada aunque el bbox venga al doble de alto', () => {
    const result = analyze([
      {
        id: 'mesas',
        elementType: 'table',
        layoutType: 'grid',
        labels: seq(50),
        rows: 5,
        columns: 10,
        cell: { col: 7, row: 5, colSpan: 10, rowSpan: 10 }
      }
    ]);

    expect(unitSizes(result, 'mesas')).toEqual([`${MAP_GRID_SCALE}x${MAP_GRID_SCALE}`]);
  });

  it('el bloque de mesas ocupa lo que necesita y no el doble', () => {
    const result = analyze([
      {
        id: 'mesas',
        elementType: 'table',
        layoutType: 'grid',
        labels: seq(50),
        rows: 5,
        columns: 10,
        cell: { col: 7, row: 5, colSpan: 10, rowSpan: 10 }
      }
    ]);

    const cells = groupById(result, 'mesas').unitCells ?? [];
    expect(new Set(cells.map(c => c.row)).size).toBe(5);
    expect(new Set(cells.map(c => c.col)).size).toBe(10);
    const height = Math.max(...cells.map(c => c.row + c.rowSpan - 1)) - Math.min(...cells.map(c => c.row)) + 1;
    expect(height).toBe(5 * MAP_GRID_SCALE);
  });

  it('una silla nunca es más alta que ancha', () => {
    const result = analyze([
      {
        id: 'sillas',
        elementType: 'seat',
        layoutType: 'column',
        labels: seq(12),
        cell: { col: 3, row: 4, colSpan: 2, rowSpan: 24 }
      }
    ]);

    expect(unitSizes(result, 'sillas')).toEqual([`${MAP_GRID_SCALE}x${MAP_GRID_SCALE}`]);
  });

  it('ninguna unidad supera las 2 celdas por eje', () => {
    const result = analyze([
      {
        id: 'palcos',
        elementType: 'palco',
        layoutType: 'row',
        labels: seq(4),
        cell: { col: 2, row: 6, colSpan: 20, rowSpan: 6 }
      }
    ]);

    for (const cell of groupById(result, 'palcos').unitCells ?? []) {
      expect(cell.colSpan).toBeLessThanOrEqual(2 * MAP_GRID_SCALE);
      expect(cell.rowSpan).toBeLessThanOrEqual(2 * MAP_GRID_SCALE);
    }
  });
});

describe('zonas', () => {
  // Reencuentro Internacional: los palcos llegaban hasta la fila 13 y el
  // GENERAL seguía hasta la 20, empujando el escenario fuera de la vista.
  it('el campo general no se cuelga por debajo de los palcos', () => {
    const result = analyze([
      {
        id: 'izquierda',
        elementType: 'palco',
        layoutType: 'column',
        labels: seq(10),
        cell: { col: 4, row: 4, colSpan: 1, rowSpan: 10 }
      },
      {
        id: 'derecha',
        elementType: 'palco',
        layoutType: 'column',
        labels: seq(10, 11),
        cell: { col: 19, row: 4, colSpan: 1, rowSpan: 10 }
      },
      {
        id: 'general',
        elementType: 'zone',
        layoutType: 'zone',
        labels: ['GENERAL'],
        cell: { col: 8, row: 11, colSpan: 8, rowSpan: 10 }
      }
    ]);

    const general = groupById(result, 'general');
    const cell = (general.unitCells ?? [])[0] ?? general.cell!;
    const lastRigidRow = 13 * MAP_GRID_SCALE;
    expect(cell.row + cell.rowSpan - 1).toBeLessThanOrEqual(lastRigidRow);
  });

  it('un mapa de puras zonas se deja como vino', () => {
    const result = analyze([
      {
        id: 'campo',
        elementType: 'zone',
        layoutType: 'zone',
        labels: ['CAMPO'],
        cell: { col: 6, row: 6, colSpan: 12, rowSpan: 12 }
      },
      {
        id: 'platea',
        elementType: 'zone',
        layoutType: 'zone',
        labels: ['PLATEA'],
        cell: { col: 6, row: 19, colSpan: 12, rowSpan: 4 }
      }
    ]);

    const campo = groupById(result, 'campo');
    const cell = (campo.unitCells ?? [])[0] ?? campo.cell!;
    expect(cell.colSpan).toBe(12 * MAP_GRID_SCALE);
    expect(cell.rowSpan).toBe(12 * MAP_GRID_SCALE);
  });
});

describe('composición', () => {
  // Reventonazo Salsero: el GENERAL salía corrido media grilla a la izquierda y
  // la columna A-D quedaba suelta a cuatro celdas del bloque de mesas.
  it('la zona se alinea con el bloque que acompaña', () => {
    const result = analyze([
      {
        id: 'lateral',
        elementType: 'palco',
        layoutType: 'column',
        labels: ['A', 'B', 'C', 'D'],
        cell: { col: 6, row: 7, colSpan: 1, rowSpan: 4 }
      },
      {
        id: 'vip',
        elementType: 'table',
        layoutType: 'grid',
        labels: seq(35),
        rows: 7,
        columns: 5,
        cell: { col: 11, row: 7, colSpan: 5, rowSpan: 7 }
      },
      {
        id: 'general',
        elementType: 'zone',
        layoutType: 'zone',
        labels: ['GENERAL'],
        cell: { col: 8, row: 15, colSpan: 8, rowSpan: 3 }
      }
    ]);

    const vip = groupById(result, 'vip').unitCells ?? [];
    const vipCols = vip.map(c => c.col);
    const general = groupById(result, 'general');
    const zone = (general.unitCells ?? [])[0] ?? general.cell!;

    expect(zone.col).toBe(Math.min(...vipCols));
    expect(zone.col + zone.colSpan - 1).toBe(Math.max(...vipCols));
  });

  it('una zona sin nada arriba ni abajo se deja donde está', () => {
    const result = analyze([
      {
        id: 'izq',
        elementType: 'palco',
        layoutType: 'column',
        labels: seq(4),
        cell: { col: 3, row: 6, colSpan: 1, rowSpan: 4 }
      },
      {
        id: 'der',
        elementType: 'palco',
        layoutType: 'column',
        labels: seq(4, 5),
        cell: { col: 20, row: 6, colSpan: 1, rowSpan: 4 }
      },
      {
        id: 'campo',
        elementType: 'zone',
        layoutType: 'zone',
        labels: ['CAMPO'],
        cell: { col: 8, row: 6, colSpan: 8, rowSpan: 4 }
      }
    ]);

    const campo = groupById(result, 'campo');
    const zone = (campo.unitCells ?? [])[0] ?? campo.cell!;
    expect(zone.col).toBe((8 - 1) * MAP_GRID_SCALE + 1);
  });
});

describe('escenario', () => {
  it('sin escenario dibujado va arriba', () => {
    const result = analyze(
      [
        {
          id: 'palcos',
          elementType: 'palco',
          layoutType: 'column',
          labels: seq(6),
          cell: { col: 4, row: 6, colSpan: 1, rowSpan: 6 }
        }
      ],
      { stage: { visible: false, position: null }, stageLayout: null }
    );

    expect(result.stage.position).toBe('top');
  });

  // El flyer de Reencuentro marca ENTRADA arriba a la izquierda. Antes eso
  // mandaba el escenario al borde opuesto y salía el mapa dado vuelta.
  it('la ENTRADA no da vuelta el mapa', () => {
    const result = analyze(
      [
        {
          id: 'palcos',
          elementType: 'palco',
          layoutType: 'column',
          labels: seq(6),
          cell: { col: 4, row: 6, colSpan: 1, rowSpan: 6 }
        }
      ],
      {
        stage: { visible: false, position: null, entranceAt: 'top' },
        stageLayout: null
      }
    );

    expect(result.stage.position).toBe('top');
  });

  it('el escenario mide 2 x 9 en celdas del modelo, no de borde a borde', () => {
    const result = analyze(
      [
        {
          id: 'palcos',
          elementType: 'palco',
          layoutType: 'column',
          labels: seq(6),
          cell: { col: 4, row: 6, colSpan: 1, rowSpan: 6 }
        }
      ],
      { stage: { visible: false, position: null }, stageLayout: null }
    );

    const cell = result.stage.layout && result.stage.layout.kind === 'rect'
      ? result.stage.layout.cell
      : null;
    expect(cell?.colSpan).toBe(STAGE_SPAN_CELLS);
    expect(cell?.rowSpan).toBe(STAGE_BAND_CELLS);
  });

  it('un escenario dibujado en otro borde se respeta', () => {
    const result = analyze(
      [
        {
          id: 'palcos',
          elementType: 'palco',
          layoutType: 'column',
          labels: seq(6),
          cell: { col: 4, row: 6, colSpan: 1, rowSpan: 6 }
        }
      ],
      {
        stage: { visible: true, position: 'bottom' },
        stageLayout: { kind: 'rect', cell: { col: 7, row: 22, colSpan: 10, rowSpan: 2 } }
      }
    );

    expect(result.stage.position).toBe('bottom');
  });
});

describe('nombres de sector', () => {
  // Reencuentro rotula los sectores solo con el precio; el modelo lo copiaba
  // tal cual y Entradas mostraba "$ 1.500.000" donde va el nombre.
  it('una categoría rotulada con el precio recibe el tipo adelante', () => {
    const result = analyze(
      [
        {
          id: 'palcos',
          elementType: 'palco',
          layoutType: 'column',
          labels: seq(6),
          category: 'p1',
          cell: { col: 4, row: 6, colSpan: 1, rowSpan: 6 }
        }
      ],
      {
        categories: [
          { id: 'p1', label: '$ 1.500.000', detectedPrice: 1500000, elementType: 'palco' }
        ]
      }
    );

    const category = result.categories.find(c => c.id === 'p1');
    expect(category?.label).toBe('PALCO $ 1.500.000');
  });

  it('un nombre de verdad no se toca', () => {
    const result = analyze(
      [
        {
          id: 'palcos',
          elementType: 'palco',
          layoutType: 'column',
          labels: seq(6),
          category: 'vip',
          cell: { col: 4, row: 6, colSpan: 1, rowSpan: 6 }
        }
      ],
      {
        categories: [
          { id: 'vip', label: 'PALCO VIP', detectedPrice: 1500000, elementType: 'palco' }
        ]
      }
    );

    expect(result.categories.find(c => c.id === 'vip')?.label).toBe('PALCO VIP');
  });
});

describe('identidad de unidad', () => {
  // Sin esto el guardado vuelve a emparejar por nombre, y el nombre se
  // renumera: las tandas terminan corridas una unidad.
  it('toGridAnalysis conserva los unitIds', () => {
    const unitIds = [
      '4db814eb-28e4-48d9-8739-08f014c6ea7f',
      '8f15254e-331e-4e8b-916a-380b9795acc8'
    ];
    const grid = toGridAnalysis({
      categories: [],
      layout: {
        groups: [
          {
            id: 'palcos',
            elementType: 'palco',
            layoutType: 'column',
            labels: ['PALCO 1', 'PALCO 2'],
            unitIds,
            count: 2,
            cell: { col: 4, row: 4, colSpan: 1, rowSpan: 2 },
            unitCells: [
              { col: 4, row: 4, colSpan: 1, rowSpan: 1 },
              { col: 4, row: 5, colSpan: 1, rowSpan: 1 }
            ]
          }
        ]
      }
    });

    expect(grid?.layout.groups[0].unitIds).toEqual(unitIds);
  });

  it('descarta unitIds que no coinciden con la cantidad de labels', () => {
    const grid = toGridAnalysis({
      categories: [],
      layout: {
        groups: [
          {
            id: 'palcos',
            elementType: 'palco',
            layoutType: 'column',
            labels: ['PALCO 1', 'PALCO 2'],
            unitIds: ['4db814eb-28e4-48d9-8739-08f014c6ea7f'],
            count: 2,
            cell: { col: 4, row: 4, colSpan: 1, rowSpan: 2 }
          }
        ]
      }
    });

    expect(grid?.layout.groups[0].unitIds).toBeUndefined();
  });
});
