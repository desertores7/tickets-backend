/**
 * Variantes de imagen de un evento.
 * `desktop` = composición de talento (3:4) para el lado derecho del hero ShowPass.
 * El FE arma el lado izquierdo con difuminado + texto HTML.
 */
export const BANNER_VARIANTS = {
  desktop: { width: 1080, height: 1440, label: 'Hero talento (3:4)' },
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
