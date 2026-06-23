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
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueCountry: string;
  maxCapacity: number;
}

export interface IEventUpdate {
  name?: string;
  description?: string | null;
  bannerUrl?: string | null;
  startDate?: Date;
  endDate?: Date;
  saleStartDate?: Date | null;
  saleEndDate?: Date | null;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueCountry?: string;
  maxCapacity?: number;
}

export interface ITicketTypeUpdate {
  name?: string;
  description?: string | null;
  minPerOrder?: number;
  maxPerOrder?: number;
  saleStartDate?: Date | null;
  saleEndDate?: Date | null;
  sortOrder?: number;
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
