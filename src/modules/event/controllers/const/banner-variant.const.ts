/**
 * Variantes de imagen de un evento. Cada plataforma recibe una imagen propia
 * (dirección de arte): un banner apaisado recortado a vertical se ve mal, por eso
 * se sube una imagen distinta por variante en vez de derivarlas todas de una sola.
 */
export const BANNER_VARIANTS = {
  desktop: { width: 1920, height: 640, label: 'Escritorio (3:1)' },
  mobile: { width: 1080, height: 1350, label: 'Móvil (4:5)' },
  thumbnail: { width: 800, height: 450, label: 'Miniatura (16:9)' }
} as const;

export type BannerVariant = keyof typeof BANNER_VARIANTS;

export const BANNER_VARIANT_NAMES = Object.keys(BANNER_VARIANTS) as BannerVariant[];

export function isBannerVariant(value: string): value is BannerVariant {
  return (BANNER_VARIANT_NAMES as string[]).includes(value);
}

/** URLs públicas por variante. Se persiste como json en `event.bannerImages`. */
export type BannerImages = Partial<Record<BannerVariant, string>>;
