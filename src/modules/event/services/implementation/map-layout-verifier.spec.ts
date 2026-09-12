import {
  AiEventMapCategory,
  AiEventMapLayoutGroup,
  AnalyzeMapResult
} from '../contracts/ievent-ai.service';
import { collectDeclaredCounts, verifyMapLayout } from './map-layout-verifier';

/** Grupo con los defaults del normalizador; cada test pisa lo que le importa. */
function group(patch: Partial<AiEventMapLayoutGroup> = {}): AiEventMapLayoutGroup {
  return {
    id: 'grupo',
    elementType: 'table',
    layoutType: 'grid',
    position: 'center',
    lane: null,
    stackOrder: 0,
    outline: null,
    cell: null,
    containedBy: null,
    containedAt: null,
    shape: 'rect',
    labelOrientation: 'horizontal',
    shapeNotch: null,
    widthWeight: 8,
    heightWeight: 3,
    level: null,
    count: 0,
    rows: null,
    columns: null,
    ordering: 'row_major',
    labels: [],
    category: null,
    categoryAssignments: [],
    requiresGeometryFallback: false,
    confidence: 0.9,
    ...patch
  };
}

function category(patch: Partial<AiEventMapCategory> & { id: string }): AiEventMapCategory {
  return {
    label: patch.id,
    detectedPrice: 100000,
    elementType: 'zone',
    saleMode: 'general_admission',
    selectionUnit: 'ticket',
    detectedCapacity: null,
    includedAdmissions: null,
    color: null,
    confidence: 0.9,
    ...patch
  };
}

function result(
  groups: AiEventMapLayoutGroup[],
  categories: AiEventMapCategory[] = []
): AnalyzeMapResult {
  return {
    mapArea: null,
    stage: {
      visible: true,
      position: 'top',
      alignment: 'center',
      inferred: true,
      confidence: 0.5,
      outline: null
    },
    categories,
    layout: { requiresGeometryFallback: false, groups },
    warnings: []
  };
}

describe('map-layout-verifier', () => {
  describe('mapas de unidades numeradas', () => {
    it('detecta los labels que el modelo se olvidó de listar', () => {
      // Caso real: grilla blanca de un flyer de dos pisos. El modelo contó 10
      // (2x5) y listó 8, y el mapa salía con una fila corta sin avisar.
      const raw = { layout: { groups: [{ count: 10, rows: 2, columns: 5 }] } };
      const res = result([
        group({ id: 'centro', rows: 2, columns: 5, labels: ['1', '2', '3', '4', '5', '6', '7', '8'] })
      ]);

      const warnings = verifyMapLayout(res, collectDeclaredCounts(raw, res));

      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.code).toBe('DECLARED_COUNT_MISMATCH');
      expect(warnings[0]!.groupId).toBe('centro');
      expect(warnings[0]!.message).toContain('faltan 2');
    });

    it('detecta la grilla incompleta aunque el modelo no haya declarado count', () => {
      const raw = { layout: { groups: [{ rows: 2, columns: 5 }] } };
      const res = result([
        group({ rows: 2, columns: 5, labels: ['1', '2', '3', '4', '5', '6', '7', '8'] })
      ]);

      const warnings = verifyMapLayout(res, collectDeclaredCounts(raw, res));

      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.code).toBe('GRID_SHAPE_MISMATCH');
    });

    it('no avisa nada cuando la grilla está completa', () => {
      const raw = { layout: { groups: [{ count: 10, rows: 2, columns: 5 }] } };
      const res = result([
        group({ rows: 2, columns: 5, labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] })
      ]);

      expect(verifyMapLayout(res, collectDeclaredCounts(raw, res))).toEqual([]);
    });

    it('reporta el mismo defecto una sola vez por grupo', () => {
      const raw = { layout: { groups: [{ count: 10, rows: 2, columns: 5 }] } };
      const res = result([
        group({ rows: 2, columns: 5, labels: ['1', '2', '3', '4', '5', '6', '7', '8'] })
      ]);

      expect(verifyMapLayout(res, collectDeclaredCounts(raw, res))).toHaveLength(1);
    });
  });

  describe('mapas de zonas', () => {
    it('detecta sectores de la tabla de precios que no llegaron al mapa', () => {
      const categories = [
        category({ id: 'campo' }),
        category({ id: 'platea-a' }),
        category({ id: 'pullman' })
      ];
      const groups = ['campo', 'platea-a'].map(id =>
        group({
          id,
          layoutType: 'zone',
          elementType: 'zone',
          labels: [id.toUpperCase()],
          category: id,
          categoryAssignments: [
            {
              category: id,
              rowStart: null,
              rowEnd: null,
              columnStart: null,
              columnEnd: null,
              from: 0,
              to: 0
            }
          ]
        })
      );

      const warnings = verifyMapLayout(result(groups, categories), new Map());

      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.code).toBe('CATEGORY_WITHOUT_GROUP');
      expect(warnings[0]!.message).toContain('pullman');
    });

    it('ignora las categorías sin precio detectado', () => {
      const categories = [category({ id: 'general', detectedPrice: null })];
      const groups = [group({ layoutType: 'row', labels: ['A'] })];

      expect(verifyMapLayout(result(groups, categories), new Map())).toEqual([]);
    });

    it('no cuenta labels ni duplicados en una zona general', () => {
      const raw = { layout: { groups: [{ count: 1 }] } };
      const res = result([
        group({ id: 'campo', layoutType: 'zone', elementType: 'zone', labels: ['GENERAL'] })
      ]);

      expect(verifyMapLayout(res, collectDeclaredCounts(raw, res))).toEqual([]);
    });
  });

  describe('venues de varios pisos', () => {
    it('acepta el mismo número en dos pisos distintos', () => {
      const groups = [
        group({ id: 'p1', level: '1ER PISO - VIP', layoutType: 'row', labels: ['15', '16'] }),
        group({ id: 'p2', level: '2DO PISO', layoutType: 'row', labels: ['15', '16'] })
      ];

      expect(verifyMapLayout(result(groups), new Map())).toEqual([]);
    });

    it('avisa cuando hay números repetidos sin piso declarado', () => {
      const groups = [
        group({ id: 'a', layoutType: 'row', labels: ['15', '16'] }),
        group({ id: 'b', layoutType: 'row', labels: ['15', '16'] })
      ];

      const warnings = verifyMapLayout(result(groups), new Map());

      expect(warnings).toHaveLength(2);
      expect(warnings.every(w => w.code === 'DUPLICATE_LABEL')).toBe(true);
      expect(warnings[0]!.message).toContain('falta indicar el piso');
    });
  });

  describe('collectDeclaredCounts', () => {
    it('no asocia counts cuando el normalizador descartó grupos', () => {
      const raw = { layout: { groups: [{ count: 10 }, { count: 5 }, { count: 3 }] } };
      const res = result([group({ id: 'a', labels: ['1'] }), group({ id: 'b', labels: ['2'] })]);

      expect(collectDeclaredCounts(raw, res).size).toBe(0);
    });

    it('lee los counts del formato plano, sin layout', () => {
      const raw = { groups: [{ count: 4 }] };
      const res = result([group({ id: 'a', labels: ['1', '2', '3'] })]);

      expect(collectDeclaredCounts(raw, res).get('a')).toBe(4);
    });
  });
});
