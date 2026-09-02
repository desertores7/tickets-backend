export interface IEventCreate {
  name: string;
  description?: string | null;
  slug: string;
  bannerUrl?: string | null;
  startDate: Date;
  endDate: Date;
  saleStartDate?: Date | null;
  saleEndDate?: Date | null;
  organizationUuid: string;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueCountry?: string;
  venuePostalCode?: string;
  googleMapsUrl?: string | null;
  maxCapacity: number;
}

export interface IEventUpdate {
  name?: string;
  description?: string | null;
  slug?: string;
  bannerUrl?: string | null;
  startDate?: Date;
  endDate?: Date;
  saleStartDate?: Date | null;
  saleEndDate?: Date | null;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueCountry?: string;
  venuePostalCode?: string;
  googleMapsUrl?: string | null;
  maxCapacity?: number;
  /** Lineup estructurado (`BR-EVENT-016`). Cambiarlo es material. */
  lineup?: string[] | null;
}

export interface ITicketTypeUpdate {
  name?: string;
  description?: string | null;
  price?: number;
  quantity?: number;
  minPerOrder?: number;
  maxPerOrder?: number;
  saleStartDate?: Date | null;
  saleEndDate?: Date | null;
  sortOrder?: number;
}

/** Un item de la actualizacion masiva: el patch mas el uuid al que aplica. */
export interface ITicketTypeBulkUpdate extends ITicketTypeUpdate {
  uuid: string;
}

export interface ITicketTypeCreate {
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  quantity: number;
  minPerOrder?: number;
  maxPerOrder?: number;
  saleStartDate?: Date | null;
  saleEndDate?: Date | null;
  sortOrder?: number;
}
