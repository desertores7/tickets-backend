export type FlyerTicketTypeExtraction = {
  name: string;
  price: number;
  quantity?: number | null;
};

export type FlyerEventExtraction = {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueCountry: string;
  googleMapsQuery: string;
  ticketTypes: FlyerTicketTypeExtraction[];
  artistsLineup?: string | null;
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
  /** Ubicación en grilla de respaldo; null si no aplica. */
  cell: AiEventMapCell | null;
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
 * Layout abstracto del mapa de ventas.
 * El frontend calcula geometría con position/lane/stackOrder/shape/pesos.
 */
export type AnalyzeMapResult = {
  /** Recuadro del plano en el flyer; null si no se aisló. */
  mapArea: AiEventMapArea | null;
  stage: AiEventMapStage;
  categories: AiEventMapCategory[];
  layout: AiEventMapLayout;
};

export interface IEventAiService {
  analyzeFromFlyers(files: Express.Multer.File[], userId: string): Promise<AnalyzeFlyersResult>;

  analyzeFromMapImage(file: Express.Multer.File, userId: string): Promise<AnalyzeMapResult>;

  suggestMapSectors(input: {
    ticketTypes: Array<{ uuid: string; name: string }>;
    flyerUrl?: string | null;
  }): Promise<SuggestMapSectorsResult>;
};
