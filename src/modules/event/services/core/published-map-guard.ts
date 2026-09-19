/**
 * Mapa de un evento publicado (`BR-EVENT-020`): los sectores se pueden mover y
 * se pueden agregar nuevos, pero no borrar.
 *
 * Borrar un sector publicado se lleva sus vínculos con las tandas (la FK es
 * ON DELETE CASCADE) y deja huérfanas las entradas vendidas y las reservas de
 * esa mesa: las entradas siguen diciendo "Mesa VIP · 8" pero la mesa ya no
 * existe, y la ocupación no se puede recuperar. Mover no rompe nada: la unidad
 * conserva su uuid.
 */

export type MapSectorRow = {
  uuid: string;
  name: string;
  level?: string | null;
  familyLabel?: string | null;
};

/** Sectores guardados que el cambio dejaría afuera. */
export function findRemovedSectors(
  current: readonly MapSectorRow[],
  keptUuids: ReadonlySet<string>,
  isStageRow: (name: string) => boolean
): MapSectorRow[] {
  // Las filas "ESCENARIO" previas a la grilla no son vendibles: el escenario
  // viaja en `stageLayout` y el guardado las descarta a propósito.
  return current.filter(sector => !keptUuids.has(sector.uuid) && !isStageRow(sector.name));
}

/** Mensaje para el productor, con hasta 5 sectores nombrados. */
export function removedSectorsMessage(removed: readonly MapSectorRow[]): string {
  const names = removed.map(sector =>
    [sector.familyLabel, sector.level, sector.name]
      .map(part => (part ?? '').trim())
      .filter(Boolean)
      .join(' · ')
  );
  const shown = names.slice(0, 5).join(', ');
  const more = names.length > 5 ? ` y ${names.length - 5} más` : '';
  return (
    `El evento está publicado: no se pueden borrar sectores del mapa (${shown}${more}). ` +
    'Podés moverlos o agregar sectores nuevos.'
  );
}
