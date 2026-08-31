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

export type AiEventMapVenue = {
  width: number;
  height: number;
};

export type AiEventMapStage = {
  id: 'stage';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  confidence: number;
};

export type AiEventMapCategory = {
  id: string;
  label: string;
  detectedPrice: number | null;
  detectedCapacity: number | null;
  confidence: number;
};

export type AiEventMapElementShape = 'circle' | 'rectangle' | 'polygon';

export type AiEventMapElement = {
  id: string;
  label: string;
  category: string;
  shape: AiEventMapElementShape;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: Array<[number, number]>;
  rotation?: number;
  detectedPrice: number | null;
  detectedCapacity: number | null;
  confidence: number;
};

export type AnalyzeMapResult = {
  venue: AiEventMapVenue;
  stage: AiEventMapStage | null;
  categories: AiEventMapCategory[];
  elements: AiEventMapElement[];
};

export interface IEventAiService {
  analyzeFromFlyers(files: Express.Multer.File[], userId: string): Promise<AnalyzeFlyersResult>;

  analyzeFromMapImage(file: Express.Multer.File, userId: string): Promise<AnalyzeMapResult>;

  suggestMapSectors(input: {
    ticketTypes: Array<{ uuid: string; name: string }>;
    flyerUrl?: string | null;
  }): Promise<SuggestMapSectorsResult>;
}
