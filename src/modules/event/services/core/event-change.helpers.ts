import type { EventChangeFieldSnapshot } from '@config/db/entities/tickets/event_change.entity';
import type { EventChangeType } from '@config/db/entities/tickets/event_change.entity';

/** 72 h corridas desde el aviso (BR-REFUND-010). */
export const REFUND_WINDOW_MS = 72 * 60 * 60 * 1000;

export type EventSnapshotForChange = {
  startDate: Date | string;
  endDate: Date | string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueCountry: string;
  venuePostalCode: string;
  googleMapsUrl: string | null;
  description: string | null;
  lineup: string[] | null;
};

export type EventUpdateForChange = Partial<{
  startDate: Date;
  endDate: Date;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueCountry: string;
  venuePostalCode: string;
  googleMapsUrl: string | null;
  description: string | null;
  lineup: string[] | null;
}>;

export type DetectedChangeGroup = {
  type: EventChangeType;
  isMaterial: boolean;
  changes: EventChangeFieldSnapshot[];
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function normalizeLineup(lineup: string[] | null | undefined): string[] {
  if (!lineup?.length) return [];
  return lineup.map(item => item.trim()).filter(Boolean);
}

export function formatLineup(lineup: string[] | null | undefined): string | null {
  const items = normalizeLineup(lineup);
  return items.length ? items.join(', ') : null;
}

export function lineupEquals(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const left = normalizeLineup(a);
  const right = normalizeLineup(b);
  if (left.length !== right.length) return false;
  return left.every((item, i) => item === right[i]);
}

/**
 * Ventana de reembolso: 72 h desde el aviso, o el nuevo inicio si cae antes
 * (reprogramación). En cancelación sin nueva fecha rigen las 72 h.
 */
export function computeRefundWindowEndsAt(
  notifiedAt: Date,
  newStartDate?: Date | null
): Date {
  const seventyTwoHours = new Date(notifiedAt.getTime() + REFUND_WINDOW_MS);
  if (newStartDate && !Number.isNaN(newStartDate.getTime()) && newStartDate < seventyTwoHours) {
    return newStartDate;
  }
  return seventyTwoHours;
}

/** Fin de la ventana abierta más lejana, o null. */
export function resolveOpenRefundWindowEndsAt(
  windows: Array<Date | string | null | undefined>,
  now: Date = new Date()
): Date | null {
  let farthest: Date | null = null;
  for (const raw of windows) {
    if (!raw) continue;
    const end = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(end.getTime()) || end <= now) continue;
    if (!farthest || end > farthest) farthest = end;
  }
  return farthest;
}

/**
 * Compara el estado actual vs el patch y agrupa por tipo (reschedule / venue /
 * lineup / info). Solo incluye grupos con al menos un campo distinto.
 */
export function detectEventUpdateChanges(
  before: EventSnapshotForChange,
  patch: EventUpdateForChange
): DetectedChangeGroup[] {
  const groups: DetectedChangeGroup[] = [];

  const scheduleChanges: EventChangeFieldSnapshot[] = [];
  if (patch.startDate !== undefined && toIso(patch.startDate) !== toIso(before.startDate)) {
    scheduleChanges.push({
      field: 'startDate',
      label: 'Inicio',
      before: toIso(before.startDate),
      after: toIso(patch.startDate)
    });
  }
  if (patch.endDate !== undefined && toIso(patch.endDate) !== toIso(before.endDate)) {
    scheduleChanges.push({
      field: 'endDate',
      label: 'Fin',
      before: toIso(before.endDate),
      after: toIso(patch.endDate)
    });
  }
  if (scheduleChanges.length) {
    groups.push({ type: 'reschedule', isMaterial: true, changes: scheduleChanges });
  }

  const venueFields: Array<{
    key: keyof EventUpdateForChange & keyof EventSnapshotForChange;
    label: string;
  }> = [
    { key: 'venueName', label: 'Lugar' },
    { key: 'venueAddress', label: 'Dirección' },
    { key: 'venueCity', label: 'Ciudad' },
    { key: 'venueCountry', label: 'País' },
    { key: 'venuePostalCode', label: 'Código postal' },
    { key: 'googleMapsUrl', label: 'Google Maps' }
  ];

  const venueChanges: EventChangeFieldSnapshot[] = [];
  for (const { key, label } of venueFields) {
    if (patch[key] === undefined) continue;
    const prev =
      key === 'googleMapsUrl'
        ? before.googleMapsUrl
        : normalizeText(before[key] as string);
    const next =
      key === 'googleMapsUrl'
        ? (patch.googleMapsUrl ?? null)
        : normalizeText(patch[key] as string | null);
    if (prev === next) continue;
    venueChanges.push({
      field: key,
      label,
      before: prev || null,
      after: next || null
    });
  }
  if (venueChanges.length) {
    groups.push({ type: 'venue', isMaterial: true, changes: venueChanges });
  }

  if (patch.lineup !== undefined && !lineupEquals(before.lineup, patch.lineup)) {
    groups.push({
      type: 'lineup',
      isMaterial: true,
      changes: [
        {
          field: 'lineup',
          label: 'Lineup',
          before: formatLineup(before.lineup),
          after: formatLineup(patch.lineup)
        }
      ]
    });
  }

  if (
    patch.description !== undefined &&
    normalizeText(before.description) !== normalizeText(patch.description)
  ) {
    groups.push({
      type: 'info',
      isMaterial: false,
      changes: [
        {
          field: 'description',
          label: 'Descripción',
          before: before.description?.trim() || null,
          after: patch.description?.trim() || null
        }
      ]
    });
  }

  return groups;
}
