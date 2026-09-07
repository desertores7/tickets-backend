import type { EventSocialLink, EventSocialNetwork } from '../../const/event-social-network.const';
import { EVENT_SOCIAL_NETWORKS } from '../../const/event-social-network.const';

type SocialLinkInput = {
  network: string;
  url: string;
  label?: string | null;
};

function isEventSocialNetwork(value: string): value is EventSocialNetwork {
  return (EVENT_SOCIAL_NETWORKS as readonly string[]).includes(value);
}

/** HTML vacío de TipTap (`<p></p>`) o texto en blanco → null. */
export function normalizeEventContent(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '<p></p>' || trimmed === '<p><br></p>') return null;
  return trimmed;
}

export function formatContentPreview(html: string | null | undefined, max = 180): string | null {
  const text = (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function normalizeSocialLinks(links: SocialLinkInput[] | null | undefined): EventSocialLink[] | null {
  if (!links?.length) return null;
  const cleaned = links
    .map(link => ({
      network: isEventSocialNetwork(link.network) ? link.network : ('other' as const),
      url: (link.url ?? '').trim(),
      label: link.label?.trim() || null
    }))
    .filter(link => link.url.length > 0);
  return cleaned.length ? cleaned : null;
}

export function socialLinksEqual(
  a: SocialLinkInput[] | null | undefined,
  b: SocialLinkInput[] | null | undefined
): boolean {
  const left = normalizeSocialLinks(a) ?? [];
  const right = normalizeSocialLinks(b) ?? [];
  if (left.length !== right.length) return false;
  return left.every((item, i) => {
    const other = right[i];
    return item.network === other.network && item.url === other.url && (item.label ?? null) === (other.label ?? null);
  });
}

export function formatSocialLinks(links: SocialLinkInput[] | null | undefined): string | null {
  const cleaned = normalizeSocialLinks(links);
  if (!cleaned?.length) return null;
  return cleaned
    .map(link => (link.label ? `${link.network}: ${link.url} (${link.label})` : `${link.network}: ${link.url}`))
    .join('; ');
}
