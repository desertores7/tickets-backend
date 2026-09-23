import type { EventSocialNetwork } from '../../const/event-social-network.const';
import type { MapSectorLayout } from '../core/map-grid';

export type FlyerTicketTypeExtraction = {
  name: string;
  price: number;
  quantity?: number | null;
};

/** Red social impresa en el flyer (el WhatsApp de contacto casi siempre). */
export type FlyerSocialLinkExtraction = {
  network: EventSocialNetwork;
  url: string;
  label?: string | null;
};

export type FlyerEventExtraction = {
  title: string;
  description: string;
  /** HTML del “Contenido del evento” (Sobre el evento). '' si no hay material. */
  content: string;
  startDate: string;
  endDate: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueCountry: string;
  googleMapsQuery: string;
  ticketTypes: FlyerTicketTypeExtraction[];
  artistsLineup?: string | null;
  socialLinks: FlyerSocialLinkExtraction[];
};

export type HeroImageUsage = {
  input_tokens: number | null;
  input_tokens_details: {
    image_tokens: number | null;
    text_tokens: number | null;
  };
  output_tokens: number | null;
  total_tokens: number | null;
};

export type HeroImageMimeType = 'image/png' | 'image/webp' | 'image/jpeg';

export type AnalyzeFlyersResult = {
  extraction: FlyerEventExtraction;
  /** null si la generación del hero falló/timeout; la extracción igual se aplica */
  heroImageBase64: string | null;
  heroMimeType: HeroImageMimeType;
  /** Hero vertical móvil (1080×1543). null si falló la generación. */
  heroMobileImageBase64: string | null;
  heroMobileMimeType: HeroImageMimeType;
  heroWarning?: string | null;
  /** Modelo que produjo el hero (null si no se generó) */
  imageModelUsed?: string | null;
  /** quality enviada a images.edit (null si no se generó) */
  generationQuality?: 'low' | 'medium' | 'high' | null;
  /** size enviada a images.edit (null si no se generó) */
  generationSize?: string | null;
  /** output_format enviado a images.edit (null si no se generó) */
  generationFormat?: 'png' | 'webp' | 'jpeg' | null;
  /** true si se usó EVENT_AI_IMAGE_FALLBACK_MODEL */
  fallbackUsed?: boolean;
  /** Usage reportado por OpenAI images.edit (null si no hubo hero / sin usage) */
  heroUsage?: HeroImageUsage | null;
};

export type SuggestMapSectorItem = {
  name: string;
  /** Posición en la grilla 24×24 (fuente de verdad). */
  layout: MapSectorLayout;
  /** @deprecated x/y/w/h 0..1 derivados de `layout`. */
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  ticketTypeUuids: string[];
};

export type SuggestMapSectorsResult = {
  sectors: SuggestMapSectorItem[];
  warning: string | null;
};

/**
 * Lógica comercial de venta:
 * - whole_unit: se compra la unidad física completa
 * - per_person: se vende por persona/silla dentro de la unidad
 * - general_admission: acceso a zona general sin ubicación individual
 */
export type SaleMode = 'whole_unit' | 'per_person' | 'general_admission';

/** @deprecated Use SaleMode */
export type PurchaseMode = SaleMode | 'individual_seat';

export type SelectionUnit = 'table' | 'seat' | 'box' | 'palco' | 'ticket' | 'section';

export type MapElementType = 'table' | 'box' | 'palco' | 'seat' | 'zone' | 'section';

export type MapStagePosition = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type MapStageAlignment = 'start' | 'center' | 'end';

export type MapLayoutType = 'column' | 'row' | 'grid' | 'zone' | 'freeform';

export type MapGroupPosition =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right';

export type MapGroupOrdering =
  | 'top_to_bottom'
  | 'bottom_to_top'
  | 'left_to_right'
  | 'right_to_left'
  | 'row_major'
  | 'column_major';

/** Forma del sector para el motor de dibujo del frontend. */
export type MapShapeKind = 'rect' | 'l' | 'u' | 'ring' | 'trapezoid' | 'corner_cut';
export type MapLabelOrientation = 'horizontal' | 'vertical';
export type MapShapeNotch =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top_left'
  | 'top_right'
  | 'bottom_left'
  | 'bottom_right';
export type MapContainedAt =
  | 'top'
  | 'top_left'
  | 'top_right'
  | 'center'
  | 'bottom'
  | 'bottom_left'
  | 'bottom_right';

export type AiEventMapPoint = { x: number; y: number };

/**
 * Recuadro normalizado 0..1 de un elemento dentro de la imagen.
 *
 * Es la ÚNICA fuente de verdad espacial del análisis: `position`, `lane`,
 * `stackOrder` y los pesos se derivan de acá en el backend
 * (`map-spatial-layout.ts`), no los decide el modelo. Un modelo que elige
 * "izquierda / lane 1 / stackOrder 0" está interpretando la imagen dos veces —
 * primero la mira y después la traduce a un enum de 9 casilleros — y es en esa
 * segunda traducción donde se pierde el orden real: dos columnas apiladas una
 * debajo de la otra terminan declaradas como lanes paralelas y el mapa sale
 * desordenado aunque los números estén todos bien.
 */
export type AiEventMapBox = {
  /** Borde izquierdo, 0..1 sobre el ancho de la imagen. */
  x: number;
  /** Borde superior, 0..1 sobre el alto de la imagen (0 = arriba). */
  y: number;
  w: number;
  h: number;
};

/** Recuadro del plano dentro del flyer, normalizado 0..1. */
export type AiEventMapArea = {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
};

export type AiEventMapCell = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

/**
 * Escenario / frente del venue. El frontend posiciona.
 * `position: "center"` = arena (escenario en el medio del campo).
 */
export type AiEventMapStage = {
  visible: boolean;
  position: MapStagePosition | null;
  alignment: MapStageAlignment | null;
  /** true si el frente se dedujo por orientación en vez de estar dibujado. */
  inferred: boolean;
  confidence: number;
  /** Contorno opcional; null → el frontend sintetiza la banda. */
  outline: AiEventMapPoint[] | null;
  /** Recuadro del escenario en la imagen; null si no estaba dibujado. */
  box: AiEventMapBox | null;
  /**
   * Borde donde el plano marca la ENTRADA / INGRESO / ACCESO.
   *
   * Es el ancla de orientación más confiable que existe cuando el escenario no
   * está dibujado: el público entra por atrás, así que el frente es el borde
   * opuesto. Sin esto el modelo asume "escenario arriba" por costumbre y da
   * vuelta el mapa entero.
   */
  entranceAt: MapStagePosition | null;
  /** Bounding box del escenario en la grilla 24×24 (tras rasterizar). */
  cell?: AiEventMapCell | null;
  /** Celdas del escenario: ningún grupo las pisa. */
  layout?: MapSectorLayout | null;
};

export type AiEventMapCategory = {
  id: string;
  label: string;
  detectedPrice: number | null;
  elementType: MapElementType;
  saleMode: SaleMode;
  selectionUnit: SelectionUnit;
  /** Capacidad física máxima del elemento (ej. 10 personas por mesa). */
  detectedCapacity: number | null;
  /** Admisiones/precintos incluidos al comprar la unidad completa. */
  includedAdmissions: number | null;
  /** Extras que incluye el precio (tragos, botellas, merch, consumición), tal cual figuran en el flyer. null si no hay. */
  perks: string | null;
  /** Color con que el flyer pinta esa categoria, en hex (#rrggbb). null si no se distingue. */
  color: string | null;
  confidence: number;
};

/**
 * Bloque de labels[] que comparte categoría comercial.
 *
 * Dos representaciones del MISMO bloque:
 *
 * - RECTANGULAR (`rowStart/rowEnd/columnStart/columnEnd`): coordenadas de grilla
 *   1-based inclusive. Es lo que devuelve la IA para `layoutType: "grid"`, porque
 *   "filas 3 a 4, todas las columnas" es lo que el modelo realmente percibe y no
 *   lo obliga a hacer aritmética de índices sobre un array plano.
 *   null en grupos no-grilla (column/row/zone/freeform).
 *
 * - LINEAL (`from/to`): índices 0-based inclusive dentro de labels[].
 *   SIEMPRE presente. En grillas lo calcula el backend a partir del rectángulo
 *   usando rows/columns/ordering — determinístico, sin margen de error del modelo.
 *
 * El frontend puede usar cualquiera de las dos: from/to para pintar label por
 * label, el rectángulo para pintar bloques.
 */
export type AiEventMapCategoryAssignment = {
  category: string;
  /** 1-based inclusive. null si el grupo no es una grilla. */
  rowStart: number | null;
  rowEnd: number | null;
  columnStart: number | null;
  columnEnd: number | null;
  /** 0-based inclusive dentro de labels[]. Siempre presente. */
  from: number;
  to: number;
};

/** Grupo estructural del venue; el frontend genera la geometría SVG. */
export type AiEventMapLayoutGroup = {
  id: string;
  elementType: MapElementType;
  layoutType: MapLayoutType;
  position: MapGroupPosition;
  /** 0 = más cerca del centro; mayor = más hacia afuera. null si no aplica. */
  lane: number | null;
  /** 0 = arriba en un stack vertical; mayor = más abajo. null si no aplica. */
  stackOrder: number | null;
  /** Contorno 0..1 opcional; null → el frontend reparte por pesos. */
  outline: AiEventMapPoint[] | null;
  /**
   * Recuadro del grupo en la imagen original, 0..1.
   *
   * Lo pide el prompt para TODOS los grupos. Cuando el mapa entero lo trae,
   * `position` / `lane` / `stackOrder` / pesos se recalculan a partir de estos
   * recuadros y se descartan los que había mandado el modelo. null solo en
   * análisis viejos o cuando el modelo lo omitió.
   */
  box: AiEventMapBox | null;
  /**
   * Bounding box del grupo en la grilla 24×24. Tras `rasterizeMapAnalysis`
   * es exacto y no pisa a nadie.
   */
  cell: AiEventMapCell | null;
  /** Celda de cada label (mismo orden que `labels`). Lo llena el rasterizado. */
  unitCells?: AiEventMapCell[] | null;
  /** Celdas 1×1 ocupadas cuando la zona no es un rectángulo sólido (L/U). */
  footprintCells?: AiEventMapCell[] | null;
  /** Grupo contenedor visual (anillos / L). */
  containedBy: string | null;
  /** Apoyo dentro del contenedor. */
  containedAt: MapContainedAt | null;
  /** Forma con la que el plano dibuja el sector. */
  shape: MapShapeKind;
  /** Etiqueta horizontal o vertical (tribunas laterales). */
  labelOrientation: MapLabelOrientation;
  /** Esquina recortada (L), boca (U) o lado ancho (trapecio). */
  shapeNotch: MapShapeNotch | null;
  /** Ancho relativo 1..10 vs vecinos. Obligatorio para el motor de layout. */
  widthWeight: number;
  /** Alto relativo 1..10 vs vecinos. Obligatorio para el motor de layout. */
  heightWeight: number;
  /** Nivel impreso ("planta baja"); null si hay uno solo. */
  level: string | null;
  count: number;
  rows: number | null;
  columns: number | null;
  ordering: MapGroupOrdering | null;
  /** Labels en orden visual. */
  labels: string[];
  /**
   * Categoría única del grupo, o null si el grupo mezcla varias categorías
   * (grilla multicolor).
   */
  category: string | null;
  /** Bloques de categoría comercial dentro del grupo. */
  categoryAssignments: AiEventMapCategoryAssignment[];
  /** true si este grupo necesita geometría exacta (freeform / irregular). */
  requiresGeometryFallback: boolean;
  confidence: number;
};

export type AiEventMapLayout = {
  /** true si algún grupo requiere análisis geométrico más lento. */
  requiresGeometryFallback: boolean;
  groups: AiEventMapLayoutGroup[];
};

/**
 * Inconsistencias que el backend detecta comparando el layout contra lo que el
 * propio modelo declaró.
 *
 * INTERNAS: no se exponen en la respuesta del endpoint. Al productor no se le
 * pide que interprete un problema del modelo — su destino es el log, la tabla
 * `event_ai_map_run` y, cuando esté, disparar la reparación dirigida del
 * análisis para que el mapa llegue completo sin que nadie se entere.
 *
 * - DECLARED_COUNT_MISMATCH: el grupo declara N elementos y listó otra cantidad.
 * - GRID_SHAPE_MISMATCH: filas × columnas no coincide con los labels de la grilla.
 * - CATEGORY_WITHOUT_GROUP: hay una categoría con precio que no tiene sector.
 * - CATEGORY_ASSIGNMENT_UNRESOLVED: un grupo (o un rango dentro de un grupo)
 *   referencia una categoría con un texto que no calzó con ninguna de
 *   `categories`. Antes esto se adivinaba en silencio (misma `elementType` o
 *   directamente la primera categoría de la lista) y la tanda de un sector
 *   terminaba pegada a otro sector sin que nadie se enterara.
 * - DUPLICATE_LABEL: dos elementos con el mismo nombre dentro de un mismo nivel.
 * - MISSING_GROUP_CELLS: algún grupo llegó sin celdas en la grilla 24×24.
 * - CELL_OVERLAP: dos grupos (o un grupo y el escenario) comparten una celda.
 * - GRID_OVERLAP_UNRESOLVED: al rasterizar a la grilla 24×24 el grupo no
 *   encontró lugar sin pisar a otro; el productor lo termina en el editor.
 */
export type MapLayoutWarningCode =
  | 'DECLARED_COUNT_MISMATCH'
  | 'GRID_SHAPE_MISMATCH'
  | 'CATEGORY_WITHOUT_GROUP'
  | 'CATEGORY_ASSIGNMENT_UNRESOLVED'
  | 'DUPLICATE_LABEL'
  | 'MISSING_GROUP_CELLS'
  | 'CELL_OVERLAP'
  | 'GRID_OVERLAP_UNRESOLVED';

export type MapLayoutWarning = {
  code: MapLayoutWarningCode;
  /** Grupo afectado; null cuando la advertencia es del mapa entero. */
  groupId: string | null;
  /** Texto listo para mostrarle al productor. */
  message: string;
};

/**
 * Layout abstracto del mapa de ventas.
 * El frontend calcula geometría con position/lane/stackOrder/shape/pesos.
 */
export type AnalyzeMapResult = {
  /** Recuadro del plano en el flyer; null si no se aisló. */
  mapArea: AiEventMapArea | null;
  stage: AiEventMapStage;
  categories: AiEventMapCategory[];
  layout: AiEventMapLayout;
  /** Grilla fija sobre la que están las celdas (24×24). */
  grid?: { cols: number; rows: number };
  /**
   * Diagnóstico interno; no viaja en la respuesta HTTP (ver
   * AnalyzeFromMapResponse). Vacío = el mapa pasó todas las verificaciones.
   */
  warnings: MapLayoutWarning[];
};

export interface IEventAiService {
  analyzeFromFlyers(
    files: Express.Multer.File[],
    userId: string,
    eventUuid?: string | null
  ): Promise<AnalyzeFlyersResult>;

  /**
   * Análisis completo del plano. Lo corre el worker de la cola: tarda minutos.
   * `eventUuid` es opcional (puede no existir todavía durante el alta de un
   * evento nuevo) y se usa para contabilizar la cuota diaria por evento.
   */
  analyzeFromMapImage(
    file: Express.Multer.File,
    userId: string,
    eventUuid?: string | null
  ): Promise<AnalyzeMapResult>;

  /**
   * Valida el archivo y la configuración antes de encolar.
   *
   * Va aparte del análisis porque tiene que fallar en el request: un archivo
   * inválido no puede descubrirse dos minutos después dentro de un job.
   */
  validateMapRequest(file: Express.Multer.File): Express.Multer.File;


  /**
   * Cuota horaria de IA del usuario y cuota diaria (24hs rolling) de
   * generaciones de mapa del evento (`eventUuid`, opcional). Se comprueba
   * antes de encolar.
   */
  assertMapQuota(userId: string, eventUuid?: string | null): Promise<void>;

  /** Estado de la cuota diaria de mapa por evento, para mostrarlo en el frontend. */
  getMapEventQuotaStatus(eventUuid: string): Promise<{
    used: number;
    max: number;
    remaining: number;
    resetAt: string | null;
  }>;

  /** Estado de la cuota diaria de análisis de flyer por evento, para mostrarlo en el frontend. */
  getFlyerEventQuotaStatus(eventUuid: string): Promise<{
    used: number;
    max: number;
    remaining: number;
    resetAt: string | null;
  }>;

  suggestMapSectors(input: {
    ticketTypes: Array<{ uuid: string; name: string }>;
    flyerUrl?: string | null;
  }): Promise<SuggestMapSectorsResult>;
};
