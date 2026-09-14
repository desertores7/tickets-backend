/**
 * Derivación determinística del placement a partir de la geometría del plano.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * El modelo extrae bien QUÉ hay en el plano (números, agrupación, precios) pero
 * falla sistemáticamente al traducir DÓNDE está a `position` + `lane` +
 * `stackOrder`. El error típico y repetido: dos columnas apiladas una debajo de
 * la otra sobre el mismo costado (mesas 1..6 arriba de la barra, 11..14 debajo)
 * se declaran como `lane: 0` y `lane: 1`, y el frontend las dibuja lado a lado.
 * El mapa queda con todos los números correctos y la disposición equivocada.
 *
 * `normalizeSideColumnLanes` empujaba todavía más en esa dirección: forzaba a
 * `stackOrder: 0` a TODA columna del mismo costado y las separaba solo por lane,
 * así que un apilamiento vertical real era imposible de expresar.
 *
 * LA SOLUCIÓN
 *
 * El prompt pide un `box` normalizado 0..1 por grupo. Con los recuadros en la
 * mano, el placement es aritmética, no criterio: dos grupos que se pisan en X y
 * están separados en Y son el MISMO lane apilados; dos grupos separados en X son
 * lanes distintos. Eso no depende del tipo de plano ni de haber visto antes un
 * flyer parecido.
 *
 * Solo se aplica si TODOS los grupos traen recuadro. Mezclar geometría real con
 * placement adivinado deja el mapa peor que cualquiera de las dos cosas por
 * separado: los grupos con box quedarían ubicados con una lógica y el resto con
 * otra, sin nada que los concilie.
 */
import type {
  AiEventMapArea,
  AiEventMapBox,
  AiEventMapLayoutGroup,
  MapGroupPosition
} from '../contracts/ievent-ai.service';

/** Un grupo ocupa un lane distinto si se pisa menos que esto en X. */
const LANE_OVERLAP_RATIO = 0.5;

/** Corte de bandas: <1/3 izquierda, >2/3 derecha, el resto centro. */
const SIDE_BAND = 1 / 3;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Lee un recuadro del payload crudo del modelo.
 *
 * Acepta `w/h` y también `width/height`, y un recuadro dado por esquinas
 * (`x2/y2`): los modelos alternan entre las tres formas y rechazar dos de ellas
 * desactivaría la derivación entera por una diferencia de nombre.
 */
export function parseBox(raw: unknown): AiEventMapBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;

  const x = Number(b.x);
  const y = Number(b.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  let w = Number(b.w ?? b.width);
  let h = Number(b.h ?? b.height);

  if (!Number.isFinite(w)) {
    const x2 = Number(b.x2 ?? b.right);
    w = Number.isFinite(x2) ? x2 - x : NaN;
  }
  if (!Number.isFinite(h)) {
    const y2 = Number(b.y2 ?? b.bottom);
    h = Number.isFinite(y2) ? y2 - y : NaN;
  }

  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w <= 0 || h <= 0) return null;

  const nx = clamp01(x);
  const ny = clamp01(y);
  return {
    x: round3(nx),
    y: round3(ny),
    w: round3(Math.min(1 - nx, clamp01(w))),
    h: round3(Math.min(1 - ny, clamp01(h)))
  };
}

type Frame = { x: number; y: number; w: number; h: number };

/**
 * Marco de referencia = unión de los recuadros de los grupos.
 *
 * No se usa `mapArea`: el modelo lo estima aparte y suele venir más generoso que
 * el plano real (mete el banner de precios o el logo). Renormalizar contra la
 * unión de los propios grupos hace que el plano ocupe siempre 0..1 completo, que
 * es lo que necesitan los cortes de banda para no mandar todo al centro.
 */
function contentFrame(boxes: AiEventMapBox[], mapArea: AiEventMapArea | null): Frame {
  if (!boxes.length) {
    return mapArea
      ? { x: mapArea.x, y: mapArea.y, w: mapArea.w, h: mapArea.h }
      : { x: 0, y: 0, w: 1, h: 1 };
  }

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }

  const w = maxX - minX;
  const h = maxY - minY;
  // Un plano de una sola columna o una sola fila haría dividir por ~0.
  return {
    x: minX,
    y: minY,
    w: w > 0.01 ? w : 1,
    h: h > 0.01 ? h : 1
  };
}

function toFrame(box: AiEventMapBox, frame: Frame): AiEventMapBox {
  return {
    x: (box.x - frame.x) / frame.w,
    y: (box.y - frame.y) / frame.h,
    w: box.w / frame.w,
    h: box.h / frame.h
  };
}

type Placed = {
  group: AiEventMapLayoutGroup;
  /** Recuadro renormalizado contra el marco del plano. */
  box: AiEventMapBox;
  cx: number;
  cy: number;
};

type Band = 'left' | 'center' | 'right';

/**
 * Banda horizontal del grupo.
 *
 * Se decide por el CENTRO y no por los bordes: una zona GENERAL ancha que arranca
 * en x=0.30 y termina en x=0.70 es del centro aunque toque las dos bandas
 * laterales.
 */
function bandOf(cx: number): Band {
  if (cx < SIDE_BAND) return 'left';
  if (cx > 1 - SIDE_BAND) return 'right';
  return 'center';
}

/**
 * De los costados solo se emiten `left` / `right`.
 *
 * Las nueve posiciones del enum expresan dos cosas a la vez (costado y altura) y
 * la altura ya la lleva `stackOrder`, que es más fino: con `top_left` + `left` +
 * `bottom_left` un costado de cuatro bloques apilados no se puede describir, y
 * peor, cada bucket se ordena por separado y se pierde la relación entre ellos.
 * Un costado = un bucket ordenado de arriba hacia abajo.
 */
function positionOf(band: Band): MapGroupPosition {
  if (band === 'left') return 'left';
  if (band === 'right') return 'right';
  return 'center';
}

/** Rango vertical ocupado por los grupos laterales. */
function sideYRange(items: Placed[]): { top: number; bottom: number } | null {
  if (!items.length) return null;
  let top = 1;
  let bottom = 0;
  for (const p of items) {
    top = Math.min(top, p.box.y);
    bottom = Math.max(bottom, p.box.y + p.box.h);
  }
  return { top, bottom };
}

/**
 * Una banda central que pasa por encima o por debajo de las columnas laterales.
 *
 * El frontend necesita `top_center` / `bottom_center` para dejar que la banda
 * cruce todo el ancho en vez de meterla entre las columnas: es la tribuna
 * general de un estadio o el pullman de un teatro. Es geometría, no semántica —
 * la banda va arriba o abajo cuando su franja vertical no se cruza con ninguna
 * columna lateral.
 */
function centerBandPosition(
  p: Placed,
  sides: { top: number; bottom: number } | null
): MapGroupPosition {
  if (!sides) return 'center';
  const bottom = p.box.y + p.box.h;
  if (bottom <= sides.top) return 'top_center';
  if (p.box.y >= sides.bottom) return 'bottom_center';
  return 'center';
}

/** Fracción del más angosto de los dos que comparten X. */
function horizontalOverlapRatio(a: AiEventMapBox, b: AiEventMapBox): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const overlap = right - left;
  if (overlap <= 0) return 0;
  const narrowest = Math.min(a.w, b.w);
  return narrowest > 0 ? overlap / narrowest : 0;
}

/**
 * Agrupa en lanes por solapamiento horizontal (union-find sobre los pares).
 *
 * Es transitivo a propósito: tres columnas A-B-C donde A pisa a B y B pisa a C
 * son un solo lane aunque A y C no se toquen. Son la misma columna del plano
 * dibujada con anchos apenas distintos, y partirlas las mandaría a lanes
 * paralelas — justo el error que esto viene a arreglar.
 */
function clusterLanes(items: Placed[]): Placed[][] {
  const parent = items.map((_, i) => i);

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    let cur = i;
    while (parent[cur] !== root) {
      const next = parent[cur]!;
      parent[cur] = root;
      cur = next;
    }
    return root;
  };

  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const ratio = horizontalOverlapRatio(items[i]!.box, items[j]!.box);
      if (ratio >= LANE_OVERLAP_RATIO) union(i, j);
    }
  }

  const byRoot = new Map<number, Placed[]>();
  items.forEach((item, i) => {
    const root = find(i);
    const list = byRoot.get(root) ?? [];
    list.push(item);
    byRoot.set(root, list);
  });

  return [...byRoot.values()];
}

function meanCx(cluster: Placed[]): number {
  return cluster.reduce((acc, p) => acc + p.cx, 0) / cluster.length;
}

/** Peso 1..10 del lado más grande del plano; nunca 0 (el frontend dibujaría NaN). */
function weightOf(value: number, max: number): number {
  if (!(max > 0)) return 5;
  return Math.min(10, Math.max(1, Math.round((value / max) * 10)));
}

export type SpatialPlacementResult = {
  groups: AiEventMapLayoutGroup[];
  /** false → faltaban recuadros; el placement quedó como lo mandó el modelo. */
  applied: boolean;
  /** Ids sin recuadro (vacío cuando applied). */
  missingBox: string[];
  /** Ids cuyo position/lane/stackOrder cambió respecto de lo declarado. */
  corrected: string[];
};

/**
 * Recalcula position / lane / stackOrder / pesos desde los recuadros.
 *
 * Devuelve los grupos intactos si a alguno le falta el recuadro: ahí el
 * verificador emite MISSING_GROUP_BOX y el pipeline sigue con las heurísticas
 * viejas, que es lo que había antes de esto.
 */
export function applySpatialPlacement(
  groups: AiEventMapLayoutGroup[],
  mapArea: AiEventMapArea | null
): SpatialPlacementResult {
  if (!groups.length) {
    return { groups, applied: false, missingBox: [], corrected: [] };
  }

  const missingBox = groups.filter(g => !g.box).map(g => g.id);
  if (missingBox.length) {
    return { groups, applied: false, missingBox, corrected: [] };
  }

  const frame = contentFrame(
    groups.map(g => g.box!),
    mapArea
  );

  const placed: Placed[] = groups.map(group => {
    const box = toFrame(group.box!, frame);
    return {
      group,
      box,
      cx: box.x + box.w / 2,
      cy: box.y + box.h / 2
    };
  });

  const maxW = Math.max(...placed.map(p => p.box.w));
  const maxH = Math.max(...placed.map(p => p.box.h));

  const byBand = new Map<Band, Placed[]>();
  for (const p of placed) {
    const band = bandOf(p.cx);
    const list = byBand.get(band) ?? [];
    list.push(p);
    byBand.set(band, list);
  }

  const resolved = new Map<
    string,
    { position: MapGroupPosition; lane: number | null; stackOrder: number }
  >();

  const sides = sideYRange([...(byBand.get('left') ?? []), ...(byBand.get('right') ?? [])]);

  for (const [band, items] of byBand) {
    const clusters = clusterLanes(items);

    // lane 0 = el más cercano al centro del venue, como define el contrato.
    // En el centro el criterio es el orden de lectura: no hay "hacia afuera".
    const ordered =
      band === 'center'
        ? [...clusters].sort((a, b) => meanCx(a) - meanCx(b))
        : [...clusters].sort(
            (a, b) => Math.abs(meanCx(a) - 0.5) - Math.abs(meanCx(b) - 0.5)
          );

    ordered.forEach((cluster, laneIdx) => {
      const lane = ordered.length > 1 ? laneIdx : band === 'center' ? null : 0;
      // Orden visual del plano: el de más arriba en la imagen es el 0.
      const stacked = [...cluster].sort((a, b) => a.cy - b.cy);
      stacked.forEach((p, stackIdx) => {
        const position =
          band === 'center' ? centerBandPosition(p, sides) : positionOf(band);
        resolved.set(p.group.id, { position, lane, stackOrder: stackIdx });
      });
    });
  }

  const corrected: string[] = [];
  const next = placed.map(p => {
    const place = resolved.get(p.group.id)!;
    const before = p.group;

    if (
      before.position !== place.position ||
      (before.lane ?? null) !== place.lane ||
      (before.stackOrder ?? 0) !== place.stackOrder
    ) {
      corrected.push(before.id);
    }

    return {
      ...before,
      position: place.position,
      lane: place.lane,
      stackOrder: place.stackOrder,
      // Los pesos también salen del recuadro: el modelo los estima "relativo a
      // los vecinos" de memoria, y el recuadro ya tiene la proporción medida.
      widthWeight: weightOf(p.box.w, maxW),
      heightWeight: weightOf(p.box.h, maxH)
    };
  });

  return { groups: next, applied: true, missingBox: [], corrected };
}

/**
 * Borde opuesto a la entrada.
 *
 * Cuando el plano no dibuja escenario pero sí marca ENTRADA / INGRESO, el frente
 * es el otro extremo: el público entra por el fondo. Sin este ancla el modelo
 * pone el escenario arriba por costumbre y da vuelta el mapa entero — pasó con
 * un plano que tenía la entrada arriba a la izquierda y salió con el ESCENARIO
 * ahí mismo.
 */
export function oppositeEdge(
  entrance: 'top' | 'bottom' | 'left' | 'right' | 'center' | null
): 'top' | 'bottom' | 'left' | 'right' | null {
  switch (entrance) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
    default:
      return null;
  }
}
