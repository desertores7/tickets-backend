import { DataSource } from 'typeorm';

/**
 * Imagen con la que se representa un evento fuera del sitio público: las
 * entradas del comprador y el email con los PDFs.
 *
 * Orden: banner → primera imagen de la galería (el flyer). Casi toda productora
 * sube el flyer y muchas nunca cargan banner: mirando solo el banner, "Mis
 * entradas" y el email salían con el logo genérico aunque el evento tuviera
 * imagen.
 *
 * Devuelve la ruta tal como está guardada; anteponer el host con
 * `StorageService.toPublicUrl` antes de mandarla afuera.
 */
export async function resolveEventCoverPaths(
  dataSource: DataSource,
  eventUuids: string[]
): Promise<Map<string, string | null>> {
  const covers = new Map<string, string | null>();
  const unique = [...new Set(eventUuids.filter(Boolean))];
  if (!unique.length) return covers;

  const rows: { eventUuid: string; url: string }[] = await dataSource
    .createQueryBuilder()
    .select(['m.eventUuid AS eventUuid', 'm.url AS url'])
    .from('event_media', 'm')
    .where('m.eventUuid IN (:...uuids)', { uuids: unique })
    .andWhere('m.kind = :kind', { kind: 'image' })
    .andWhere('m.isDeleted IS NULL')
    // Misma regla que el sitio público: la primera imagen de la galería es el
    // flyer principal.
    .orderBy('m.eventUuid', 'ASC')
    .addOrderBy('m.sortOrder', 'ASC')
    .getRawMany();

  for (const row of rows) {
    if (!covers.has(row.eventUuid) && row.url) covers.set(row.eventUuid, row.url);
  }
  return covers;
}

/**
 * Banner del evento, o su flyer si no tiene banner cargado.
 *
 * Preferimos la variante `mobile` (`eventImages.bannerMobile`): tanto las
 * cards de "Mis entradas" como el email de entradas listas muestran la
 * imagen en un recorte angosto, y la variante `desktop`/`bannerUrl` ahi queda
 * recortada de forma rara (se pierde el centro de la imagen). Si el evento
 * nunca cargo banner mobile, caemos al desktop viejo y despues al flyer.
 */
export function pickEventCover(
  event: {
    uuid: string;
    bannerUrl?: string | null;
    bannerImages?: Record<string, string> | null;
  },
  covers: Map<string, string | null>
): string | null {
  return (
    event.bannerImages?.mobile ??
    event.bannerUrl ??
    event.bannerImages?.desktop ??
    covers.get(event.uuid) ??
    null
  );
}
