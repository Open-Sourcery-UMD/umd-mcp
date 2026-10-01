import { TZDate } from '@date-fns/tz';
import { format, getDay, parseISO } from 'date-fns';
import { z } from 'zod';

/** The time zone every UMD system reports local times in. */
export const CAMPUS_TIME_ZONE = 'America/New_York';

/** Today's date in College Park as YYYY-MM-DD. */
export function today(): string {
  return format(TZDate.tz(CAMPUS_TIME_ZONE), 'yyyy-MM-dd');
}

/** A calendar date as YYYY-MM-DD. Tools that take one should `.describe()` what the date selects. */
export const isoDate = z.iso.date('Expected a date like 2026-09-29').describe('Date as YYYY-MM-DD');

export const term = z
  .string()
  .trim()
  .regex(/^\d{4}(01|05|08|12)$/, 'Expected a term id like 202608')
  .describe(
    'Four-digit year followed by "01" (Spring), "05" (Summer), "08" (Fall) or "12" (Winter), e.g. "202608" for Fall 2026',
  );

export const courseId = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{4}\d{3}[A-Za-z]?$/, 'Expected a course id like CMSC131')
  .toUpperCase()
  .describe('Course id, e.g. "CMSC131" or "ENGL101X"');

export const departmentCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{4}$/, 'Expected a department code like CMSC')
  .toUpperCase()
  .describe('Four-letter department code, e.g. "CMSC"');

export const sectionId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{4}$/, 'Expected a section id like 0101')
  .toUpperCase()
  .describe('Section id, e.g. "0101"');

export const WEEKDAYS = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const weekday = z.enum(WEEKDAYS);

/** Weekdays as `Date#getDay` numbers them. */
const WEEKDAYS_SUNDAY_FIRST: readonly Weekday[] = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];

/** The weekday a calendar date (YYYY-MM-DD, or a Date in local time) falls on. */
export function weekdayOf(date: string | Date): Weekday {
  return WEEKDAYS_SUNDAY_FIRST[getDay(typeof date === 'string' ? parseISO(date) : date)] ?? 'Su';
}

/** Full weekday names as sites print them, mapped to the shared vocabulary. */
const WEEKDAY_NAMES: Record<string, Weekday> = {
  monday: 'M',
  tuesday: 'Tu',
  wednesday: 'W',
  thursday: 'Th',
  friday: 'F',
  saturday: 'Sa',
  sunday: 'Su',
};

/** The weekday a printed name like "Monday" or "MON" stands for; null when unrecognised. */
export function weekdayFromName(name: string): Weekday | null {
  const key = name.trim().toLowerCase();
  return (
    WEEKDAY_NAMES[key] ??
    Object.entries(WEEKDAY_NAMES).find(([full]) => full.startsWith(key) && key.length >= 3)?.[1] ??
    null
  );
}

/** Monday to Friday, the days a class can be searched by. */
export const schoolDay = weekday.exclude(['Sa', 'Su']);

/** How a section is taught, keyed by the code the Schedule of Classes uses. */
export const DELIVERY_METHODS = {
  f2f: 'face_to_face',
  online: 'online',
  blended: 'blended',
} as const;

export type Delivery = (typeof DELIVERY_METHODS)[keyof typeof DELIVERY_METHODS];

export const delivery = z.enum(Object.values(DELIVERY_METHODS) as Delivery[]);

export const MEETING_TYPES = ['lecture', 'discussion', 'lab'] as const;

export type MeetingType = (typeof MEETING_TYPES)[number];

export const meetingType = z.enum(MEETING_TYPES);

/** `limit`/`offset` input fields for a paged tool. */
export function pagination(defaultLimit: number, max = 100) {
  return {
    limit: limit(defaultLimit, max),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Number of records to skip, for pagination (default 0)'),
  };
}

/** A `limit` input field for a tool that returns the newest or nearest N records. */
export function limit(defaultLimit: number, max: number) {
  return z
    .number()
    .int()
    .min(1)
    .max(max)
    .default(defaultLimit)
    .describe(`Maximum number of records to return, 1-${max} (default ${defaultLimit})`);
}

/**
 * The value an upstream code maps to in a `CODE: 'value'` table. Throws when the code is not
 * in the table, so an unexpected upstream value surfaces as a tool error instead of bad data.
 */
export function decode<T extends Record<PropertyKey, string>>(
  table: T,
  code: PropertyKey | null | undefined,
  what: string,
): T[keyof T] {
  const value: T[keyof T] | undefined = code == null ? undefined : table[code as keyof T];
  if (value === undefined) throw new Error(`Unknown ${what} "${String(code)}"`);
  return value;
}

/** Like `decode`, but null for a missing or unknown code. */
export function decodeOrNull<T extends Record<PropertyKey, string>>(
  table: T,
  code: PropertyKey | null | undefined,
): T[keyof T] | null {
  return code == null ? null : (table[code as keyof T] ?? null);
}

/**
 * `value` when it is one of `values`. Throws otherwise, so an unexpected upstream value
 * surfaces as a tool error instead of bad data; the array-shaped twin of `decode`.
 */
export function member<const T extends readonly string[]>(
  values: T,
  value: string | null | undefined,
  what: string,
): T[number] {
  const found = memberOf(values, value);
  if (found === null) throw new Error(`Unknown ${what} "${String(value)}"`);
  return found;
}

/** `value` when it is one of `values`; null otherwise. */
export function memberOf<const T extends readonly string[]>(
  values: T,
  value: string | null | undefined,
): T[number] | null {
  return value != null && values.includes(value) ? value : null;
}

export const linkSchema = z.object({
  text: z.string().describe('Link text'),
  url: z.string().describe('Absolute URL'),
});

export const tableSchema = z.object({
  headers: z.array(z.string()).describe('Header cells; empty when the table has no header row'),
  rows: z.array(z.array(z.string())).describe('Body rows as cell text'),
});

export const postalAddressSchema = z.object({
  street: z.array(z.string()).describe('Street lines, blank lines dropped'),
  city: z.string().nullable().describe('null when not given'),
  state: z.string().nullable().describe('State or province; null when not given'),
  zip: z.string().nullable().describe('Postal code; null when not given'),
});

export type Link = z.infer<typeof linkSchema>;
export type Table = z.infer<typeof tableSchema>;
