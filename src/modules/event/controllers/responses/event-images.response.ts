import { ApiProperty } from '@nestjs/swagger';
import { BannerImages } from '../const/banner-variant.const';

/** URLs de imagen del evento expuestas en listado y detalle. */
export type TEventImages = {
  flyer: string | null;
  bannerDesktop: string | null;
  bannerMobile: string | null;
  mapEvent: string | null;
};

export class EventImagesResponse implements TEventImages {
  @ApiProperty({ nullable: true, description: 'Flyer principal (primera imagen de galería)' })
  flyer: string | null;

  @ApiProperty({ nullable: true, description: 'Banner / hero desktop' })
  bannerDesktop: string | null;

  @ApiProperty({ nullable: true, description: 'Banner móvil' })
  bannerMobile: string | null;

  @ApiProperty({ nullable: true, description: 'Imagen base del mapa de sala' })
  mapEvent: string | null;

  constructor(data: TEventImages) {
    this.flyer = data.flyer;
    this.bannerDesktop = data.bannerDesktop;
    this.bannerMobile = data.bannerMobile;
    this.mapEvent = data.mapEvent;
  }
}

/** Arma `eventImages` desde columnas persistidas + flyer/mapa resueltos aparte. */
export function buildEventImages(
  event: { bannerUrl?: string | null; bannerImages?: Record<string, string> | null },
  flyer: string | null,
  mapEvent: string | null
): TEventImages {
  const banners = (event.bannerImages ?? {}) as BannerImages;
  return {
    flyer,
    bannerDesktop: banners.desktop ?? event.bannerUrl ?? null,
    bannerMobile: banners.mobile ?? null,
    mapEvent
  };
}
