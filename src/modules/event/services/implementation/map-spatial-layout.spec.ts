import type { AiEventMapBox, AiEventMapLayoutGroup } from '../contracts/ievent-ai.service';
import { applySpatialPlacement, oppositeEdge, parseBox } from './map-spatial-layout';

function group(
  id: string,
  box: AiEventMapBox | null,
  patch: Partial<AiEventMapLayoutGroup> = {}
): AiEventMapLayoutGroup {
  return {
    id,
    elementType: 'table',
    layoutType: 'column',
    position: 'center',
    lane: null,
    stackOrder: 0,
    box,
    outline: null,
    cell: null,
    containedBy: null,
    containedAt: null,
    shape: 'rect',
    labelOrientation: 'horizontal',
    shapeNotch: null,
    widthWeight: 5,
    heightWeight: 5,
    level: null,
    count: 1,
    rows: null,
    columns: null,
    ordering: null,
    labels: [id],
    category: null,
    categoryAssignments: [],
    requiresGeometryFallback: false,
    confidence: 0.9,
    ...patch
  };
}

function placementOf(groups: AiEventMapLayoutGroup[], id: string) {
  const g = groups.find(x => x.id === id)!;
  return { position: g.position, lane: g.lane, stackOrder: g.stackOrder };
}

describe('map-spatial-layout', () => {
  describe('parseBox', () => {
    it('acepta w/h, width/height y esquinas x2/y2', () => {
      expect(parseBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({
        x: 0.1,
        y: 0.2,
        w: 0.3,
        h: 0.4
      });
      expect(parseBox({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toEqual({
        x: 0.1,
        y: 0.2,
        w: 0.3,
        h: 0.4
      });
      expect(parseBox({ x: 0.1, y: 0.2, x2: 0.4, y2: 0.6 })).toEqual({
        x: 0.1,
        y: 0.2,
        w: 0.3,
        h: 0.4
      });
    });

    it('descarta recuadros sin superficie o sin números', () => {
      expect(parseBox({ x: 0.1, y: 0.2, w: 0, h: 0.4 })).toBeNull();
      expect(parseBox({ x: 'a', y: 0.2, w: 0.3, h: 0.4 })).toBeNull();
      expect(parseBox(null)).toBeNull();
    });
  });

  describe('applySpatialPlacement', () => {
    it('no hace nada si falta algún recuadro', () => {
      const groups = [
        group('a', { x: 0.1, y: 0.1, w: 0.1, h: 0.2 }),
        group('b', null)
      ];

      const out = applySpatialPlacement(groups, null);

      expect(out.applied).toBe(false);
      expect(out.missingBox).toEqual(['b']);
      expect(out.groups).toBe(groups);
    });

    /**
     * El caso que motivó todo esto: plano de mesas con dos bloques apilados en
     * cada costado. El modelo los devolvía como lanes paralelas y el mapa salía
     * con las columnas lado a lado en vez de una debajo de la otra.
     */
    it('apila los grupos que comparten x y separa por lane los que comparten y', () => {
      const groups = [
        // Costado izquierdo: 1..6 arriba, BARRA en el medio, 11..14 abajo.
        group('mesas-1-6', { x: 0.08, y: 0.21, w: 0.09, h: 0.24 }),
        group('mesas-11-14', { x: 0.08, y: 0.5, w: 0.09, h: 0.22 }),
        // Columna corta 7/8, a la derecha de las anteriores y a la misma altura.
        group('mesas-7-8', { x: 0.2, y: 0.21, w: 0.09, h: 0.24 }),
        // Centro: dos grillas apiladas y el general abajo.
        group('grilla-9-18', { x: 0.33, y: 0.21, w: 0.34, h: 0.16 }, { layoutType: 'grid' }),
        group('grilla-1-10', { x: 0.33, y: 0.39, w: 0.34, h: 0.16 }, { layoutType: 'grid' }),
        group('general', { x: 0.33, y: 0.58, w: 0.34, h: 0.3 }, {
          layoutType: 'zone',
          elementType: 'zone'
        }),
        // Costado derecho: 19..22, después 23/24, después 15..19.
        group('mesas-19-22', { x: 0.71, y: 0.21, w: 0.09, h: 0.24 }),
        group('mesas-23-24', { x: 0.71, y: 0.5, w: 0.09, h: 0.14 }),
        group('mesas-15-19', { x: 0.71, y: 0.68, w: 0.09, h: 0.2 })
      ];

      const out = applySpatialPlacement(groups, null);
      expect(out.applied).toBe(true);

      // Izquierda: 7/8 es el lane más cercano al centro; 1..6 y 11..14 comparten
      // lane y se ordenan de arriba hacia abajo.
      expect(placementOf(out.groups, 'mesas-7-8')).toEqual({
        position: 'left',
        lane: 0,
        stackOrder: 0
      });
      expect(placementOf(out.groups, 'mesas-1-6')).toEqual({
        position: 'left',
        lane: 1,
        stackOrder: 0
      });
      expect(placementOf(out.groups, 'mesas-11-14')).toEqual({
        position: 'left',
        lane: 1,
        stackOrder: 1
      });

      // Derecha: un solo lane, tres bloques apilados en orden visual.
      expect(placementOf(out.groups, 'mesas-19-22')).toEqual({
        position: 'right',
        lane: 0,
        stackOrder: 0
      });
      expect(placementOf(out.groups, 'mesas-23-24')).toEqual({
        position: 'right',
        lane: 0,
        stackOrder: 1
      });
      expect(placementOf(out.groups, 'mesas-15-19')).toEqual({
        position: 'right',
        lane: 0,
        stackOrder: 2
      });

      // Centro: apilado, el general último.
      expect(placementOf(out.groups, 'grilla-9-18')).toEqual({
        position: 'center',
        lane: null,
        stackOrder: 0
      });
      expect(placementOf(out.groups, 'grilla-1-10')).toEqual({
        position: 'center',
        lane: null,
        stackOrder: 1
      });
      expect(placementOf(out.groups, 'general')).toEqual({
        position: 'center',
        lane: null,
        stackOrder: 2
      });
    });

    it('ignora el placement que mandó el modelo y reporta lo corregido', () => {
      // Las bandas se calculan sobre la unión de los recuadros, así que hacen
      // falta el centro y el otro costado para que "izquierda" signifique algo:
      // dos columnas solas SON el plano entero y caen al centro, que es correcto.
      const groups = [
        group('arriba', { x: 0.08, y: 0.15, w: 0.1, h: 0.2 }, {
          position: 'left',
          lane: 0,
          stackOrder: 0
        }),
        // El modelo la declaró como lane paralela; el recuadro dice que está abajo.
        group('abajo', { x: 0.08, y: 0.5, w: 0.1, h: 0.2 }, {
          position: 'left',
          lane: 1,
          stackOrder: 0
        }),
        group('centro', { x: 0.3, y: 0.15, w: 0.4, h: 0.55 }, { layoutType: 'grid' }),
        group('derecha', { x: 0.82, y: 0.15, w: 0.1, h: 0.55 })
      ];

      const out = applySpatialPlacement(groups, null);

      expect(placementOf(out.groups, 'arriba')).toEqual({
        position: 'left',
        lane: 0,
        stackOrder: 0
      });
      expect(placementOf(out.groups, 'abajo')).toEqual({
        position: 'left',
        lane: 0,
        stackOrder: 1
      });
      expect(out.corrected).toContain('abajo');
    });

    it('manda al centro un plano que es una sola columna', () => {
      const groups = [
        group('arriba', { x: 0.1, y: 0.1, w: 0.1, h: 0.2 }),
        group('abajo', { x: 0.1, y: 0.5, w: 0.1, h: 0.2 })
      ];

      const out = applySpatialPlacement(groups, null);

      expect(placementOf(out.groups, 'arriba')).toEqual({
        position: 'center',
        lane: null,
        stackOrder: 0
      });
      expect(placementOf(out.groups, 'abajo')).toEqual({
        position: 'center',
        lane: null,
        stackOrder: 1
      });
    });

    it('deriva pesos proporcionales al recuadro', () => {
      const groups = [
        group('ancho', { x: 0.1, y: 0.1, w: 0.6, h: 0.5 }),
        group('angosto', { x: 0.75, y: 0.1, w: 0.06, h: 0.5 })
      ];

      const out = applySpatialPlacement(groups, null);
      const ancho = out.groups.find(g => g.id === 'ancho')!;
      const angosto = out.groups.find(g => g.id === 'angosto')!;

      expect(ancho.widthWeight).toBe(10);
      expect(angosto.widthWeight).toBe(1);
      // Nunca 0: el frontend dibujaría NaN.
      expect(angosto.widthWeight).toBeGreaterThanOrEqual(1);
    });
  });

  describe('oppositeEdge', () => {
    it('devuelve el borde opuesto a la entrada', () => {
      expect(oppositeEdge('top')).toBe('bottom');
      expect(oppositeEdge('bottom')).toBe('top');
      expect(oppositeEdge('left')).toBe('right');
      expect(oppositeEdge('right')).toBe('left');
      expect(oppositeEdge('center')).toBeNull();
      expect(oppositeEdge(null)).toBeNull();
    });
  });
});
