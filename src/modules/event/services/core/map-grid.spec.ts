import {
  MAP_GRID_SIZE,
  STAGE_BAND_CELLS,
  STAGE_SPAN_CELLS,
  MapGridError,
  MapSectorLayout,
  assertNoOverlaps,
  layoutKeys,
  layoutToLegacyGeometry,
  packLayouts,
  snapLegacyGeometry,
  stageLayoutFromAnalysis,
  validateSectorLayout
} from './map-grid';

const N = MAP_GRID_SIZE;
// Calculado a partir de las constantes actuales en vez de hardcodeado: si
// `MAP_GRID_SIZE` o la escala cambian, este test se ajusta solo en vez de
// quedar con valores viejos (fue justo lo que pasó acá: la grilla bajó de
// 48 a 24 y este test se quedó esperando los valores de la grilla vieja).
const STAGE_OFFSET = Math.round((N - STAGE_SPAN_CELLS) / 2) + 1;

const rect = (col: number, row: number, colSpan: number, rowSpan: number): MapSectorLayout => ({
  kind: 'rect',
  cell: { col, row, colSpan, rowSpan }
});

describe('map-grid', () => {
  describe('validateSectorLayout', () => {
    it('acepta rect y cells válidos', () => {
      expect(validateSectorLayout(rect(1, 1, N, N), 'A')).toEqual(rect(1, 1, N, N));
      expect(
        validateSectorLayout(
          { kind: 'cells', cells: [{ col: 3, row: 3, colSpan: 1, rowSpan: 1 }] },
          'A'
        ).kind
      ).toBe('cells');
    });

    it('rechaza celdas fuera de 1..MAP_GRID_SIZE', () => {
      expect(() => validateSectorLayout(rect(N - 4, 1, 6, 1), 'A')).toThrow(MapGridError);
      expect(() => validateSectorLayout(rect(0, 1, 1, 1), 'A')).toThrow(MapGridError);
    });

    it('rechaza cells no 1×1 o duplicadas', () => {
      expect(() =>
        validateSectorLayout({ kind: 'cells', cells: [{ col: 1, row: 1, colSpan: 2, rowSpan: 1 }] }, 'A')
      ).toThrow(MapGridError);
      const c = { col: 1, row: 1, colSpan: 1, rowSpan: 1 };
      expect(() => validateSectorLayout({ kind: 'cells', cells: [c, c] }, 'A')).toThrow(MapGridError);
    });
  });

  it('assertNoOverlaps detecta celdas compartidas', () => {
    expect(() =>
      assertNoOverlaps([
        { id: 'a', label: 'A', layout: rect(1, 1, 4, 4) },
        { id: 'b', label: 'B', layout: rect(4, 4, 2, 2) }
      ])
    ).toThrow(/comparten la celda \(4, 4\)/);
    expect(() =>
      assertNoOverlaps([
        { id: 'a', label: 'A', layout: rect(1, 1, 4, 4) },
        { id: 'b', label: 'B', layout: rect(5, 1, 2, 2) }
      ])
    ).not.toThrow();
  });

  it('packLayouts recorta la zona grande en L y traslada la rígida', () => {
    const stage = rect(2, 1, 22, 2);
    const blocked = new Set(layoutKeys(stage));
    const result = packLayouts(
      [
        { id: 'vip', label: 'VIP', layout: rect(10, 3, 10, 3) },
        { id: 'mesa', label: 'Mesa', layout: rect(2, 2, 1, 1), rigid: true },
        { id: 'fans', label: 'Fans', layout: rect(2, 3, 16, 6) }
      ],
      blocked
    );
    expect(result.unresolved).toEqual([]);
    expect(result.layouts.get('fans')!.kind).toBe('cells');
    expect(result.layouts.get('mesa')).not.toEqual(rect(2, 2, 1, 1));
    const all = [stage, ...result.layouts.values()].flatMap(layoutKeys);
    expect(new Set(all).size).toBe(all.length);
  });

  it('round-trip: geometry legacy derivada no cambia las celdas', () => {
    const l: MapSectorLayout = {
      kind: 'cells',
      cells: [
        { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
        { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
        { col: 1, row: 2, colSpan: 1, rowSpan: 1 }
      ]
    };
    const geometry = layoutToLegacyGeometry(l);
    expect(geometry.type).toBe('polygon');
    expect(new Set(layoutKeys(snapLegacyGeometry(geometry)!))).toEqual(new Set(layoutKeys(l)));
    expect(layoutToLegacyGeometry(rect(3, 4, 2, 2))).toEqual({
      type: 'rect',
      x: 2 / N,
      y: 3 / N,
      w: 2 / N,
      h: 2 / N
    });
  });

  it('stageLayoutFromAnalysis usa stage.layout o el default por posición', () => {
    // Escenario de medida fija (STAGE_SPAN_CELLS × STAGE_BAND_CELLS) y centrado.
    expect(stageLayoutFromAnalysis(null)).toEqual(
      rect(STAGE_OFFSET, 1, STAGE_SPAN_CELLS, STAGE_BAND_CELLS)
    );
    expect(stageLayoutFromAnalysis({ stage: { position: 'bottom' } })).toEqual(
      rect(STAGE_OFFSET, N - STAGE_BAND_CELLS + 1, STAGE_SPAN_CELLS, STAGE_BAND_CELLS)
    );
    expect(stageLayoutFromAnalysis({ stage: { layout: rect(5, 5, 3, 3) } })).toEqual(rect(5, 5, 3, 3));
  });
});
