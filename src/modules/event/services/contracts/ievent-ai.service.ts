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

export type AnalyzeFlyersResult = {
  extraction: FlyerEventExtraction;
  /** null si la generación del hero falló/timeout; la extracción igual se aplica */
  heroImageBase64: string | null;
  heroMimeType: 'image/png';
  heroWarning?: string | null;
};

export interface IEventAiService {
  analyzeFromFlyers(files: Express.Multer.File[], userId: string): Promise<AnalyzeFlyersResult>;
}
