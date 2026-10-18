import type { Hours } from './schemas.js';

type RawHours = {
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
