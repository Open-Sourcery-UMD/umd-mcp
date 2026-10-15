import { trimmed } from '../../../lib/text.js';
import type { Appointment, Instance } from './schemas.js';

/** An entry of the `ApptInfo` JSON the instance list embeds, one per bookable time slot. */
export type RawAppointmentInfo = {
  ID: string;
  StartDate: string;
  EndDate: string;
  Location: string | null;
  ClassSize: number;
  InstructorFirstNameLastInitial: string | null;
};

/** An appointment from the facility scheduler's JSON. */
export type RawSchedulerAppointment = {
  Id: string;
  Text: string;
  StartDate: string;
  EndDate: string;
  AllDay: boolean;
  Description: string | null;
  RecurrenceRule: string | null;
  RecurrenceException: string | null;
};

/** `GetPrices` answers with a price per id, as plain text or a `Range:` span pair. */
export type RawPrices = Record<string, string>;

/** A slot from the `ApptInfo` JSON with the open spots its card showed. */
export function toInstance(raw: RawAppointmentInfo, spots: Map<string, number | null>): Instance {
  return {
    id: raw.ID.toLowerCase(),
    start: raw.StartDate,
    end: raw.EndDate,
    location: trimmed(raw.Location) ?? '',
    instructor: trimmed(raw.InstructorFirstNameLastInitial),
    class_size: raw.ClassSize,
    spots_available: spots.get(raw.ID.toLowerCase()) ?? null,
  };
}

/** An appointment from the facility scheduler, with the trailing milliseconds dropped. */
export function toAppointment(raw: RawSchedulerAppointment): Appointment {
  return {
    id: raw.Id.toLowerCase(),
    title: raw.Text,
    start: raw.StartDate.replace(/\.\d+$/, ''),
    end: raw.EndDate.replace(/\.\d+$/, ''),
    all_day: raw.AllDay,
    description: trimmed(raw.Description),
    recurrence_rule: trimmed(raw.RecurrenceRule),
    recurrence_exceptions:
      trimmed(raw.RecurrenceException)
        ?.split(',')
        .map((value) => value.trim()) ?? [],
  };
}
