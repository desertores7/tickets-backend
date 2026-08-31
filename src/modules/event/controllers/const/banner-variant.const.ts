/**
 * Variantes de imagen de un evento.
 * Se guarda el archivo original sin crop ni resize (el FE adapta con CSS).
 * `desktop` = hero ShowPass (típicamente 16:9 de la IA).
 */
export const BANNER_VARIANTS = {
  desktop: { label: 'Hero (original)' },
  mobile: { label: 'Móvil (original)' },
  thumbnail: { label: 'Miniatura (original)' }
} as const;

export type BannerVariant = keyof typeof BANNER_VARIANTS;

export const BANNER_VARIANT_NAMES = Object.keys(BANNER_VARIANTS) as BannerVariant[];

export function isBannerVariant(value: string): value is BannerVariant {
  return (BANNER_VARIANT_NAMES as string[]).includes(value);
}

/** URLs públicas por variante. Se persiste como json en `event.bannerImages`. */
export type BannerImages = Partial<Record<BannerVariant, string>>;
