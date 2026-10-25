import type { Availability, Hours } from './schemas.js';

export type RawHours = {
  status: string;
  hours_from?: string;
  hours_to?: string;
};

export function toHours(raw: RawHours): Hours {
  return {
    status: raw.status,
    hours_from: raw.hours_from ?? null,
    hours_to: raw.hours_to ?? null,
  };
}

type RawAvailabilityGroup = {
  name: string;
  available: number;
  total: number;
  next_available: string | null;
};

export type RawAvailability = {
  [key: string]: RawAvailabilityGroup | number;
  overall_available: number;
  total: number;
};

export function toAvailability(raw: RawAvailability): Availability {
  return {
    groups: Object.entries(raw)
      .filter(
        (entry): entry is [string, RawAvailabilityGroup] =>
          entry[0] !== 'overall_available' && entry[0] !== 'total' && typeof entry[1] !== 'number',
      )
      .map(([key, group]) => ({
        group_id: Number(key),
        name: group.name,
        available: Number(group.available),
        total: Number(group.total),
        next_available: group.next_available,
      })),
    overall_available: raw.overall_available,
    total: raw.total,
  };
}
