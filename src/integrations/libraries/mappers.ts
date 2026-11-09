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

export function toAvailability({
  overall_available,
  total,
  ...groups
}: RawAvailability): Availability {
  return {
    groups: Object.entries(groups as Record<string, RawAvailabilityGroup>).map(([id, group]) => ({
      group_id: Number(id),
      name: group.name,
      available: Number(group.available),
      total: Number(group.total),
      next_available: group.next_available ?? null,
    })),
    overall_available,
    total,
  };
}
