/** Redes que el editor de evento puede guardar. Debe coincidir con el frontend. */
export const EVENT_SOCIAL_NETWORKS = [
  'instagram',
  'facebook',
  'youtube',
  'spotify',
  'tiktok',
  'x',
  'website',
  'other'
] as const;

export type EventSocialNetwork = (typeof EVENT_SOCIAL_NETWORKS)[number];

export type EventSocialLink = {
  network: EventSocialNetwork;
  url: string;
  label?: string | null;
};
