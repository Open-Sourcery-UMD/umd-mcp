import { z } from 'zod';
import { postalAddressSchema } from '../../common.js';

/** Event-type categories, keyed by slug, with the Craft category id `relatedTo` takes. */
export const EVENT_TYPES = {
  academics: 10388,
  'athletics-and-recreation': 10413,
  'arts-entertainment-and-culture': 10402,
  'community-engagement': 10408,
  'diversity-inclusion': 10400,
  'health-and-wellness': 10404,
  research: 10398,
  'spiritual-and-religious': 10395,
  'student-life': 10394,
  'family-engagement': 449943,
} as const;

/** Audience categories, keyed by slug, with the Craft category id `relatedTo` takes. */
export const AUDIENCES = {
  'current-students': 10259,
  'graduate-students': 417031,
  'prospective-students': 10260,
  alumni: 10255,
  faculty: 10263,
  staff: 10262,
  parents: 10264,
  friends: 10266,
  'campus-leaders': 10256,
  'external-media': 10268,
} as const;

/** The "featured" status category, the only member of the eventStatus group. */
export const FEATURED_CATEGORY_ID = 416864;

export type EventType = keyof typeof EVENT_TYPES;
export type Audience = keyof typeof AUDIENCES;

export const eventType = z.enum(Object.keys(EVENT_TYPES) as EventType[]);
export const audience = z.enum(Object.keys(AUDIENCES) as Audience[]);

/** The category groups the site files events under, as Craft names them. */
export const CATEGORY_GROUPS = ['eventType', 'audience', 'eventStatus'] as const;

/** Where an event happens, as the site's location-type field stores it. */
export const LOCATION_TYPES = ['on_campus', 'online', 'off_campus'] as const;

/** The site's calendars; nearly everything is filed under "submission". */
export const CALENDAR_HANDLES = ['submission', 'communications', 'athletics'] as const;

export const SEASONS = ['fall', 'winter', 'spring', 'summer'] as const;

export const categoryGroup = z.enum(CATEGORY_GROUPS);
export const locationType = z.enum(LOCATION_TYPES);
export const calendarHandle = z.enum(CALENDAR_HANDLES);
export const season = z.enum(SEASONS);

/** A moment as ISO 8601 with the America/New_York offset, e.g. "2026-10-01T14:00:00-04:00". */
const localDateTime = (what: string) =>
  z
    .string()
    .describe(
      `${what}, as ISO 8601 with the America/New_York offset, e.g. "2026-10-01T14:00:00-04:00"`,
    );

export const categorySchema = z.object({
  id: z.number().int().describe('Craft category id'),
  title: z.string().describe('Display name, e.g. "Undergraduate Students"'),
  slug: z.string().describe('Slug to pass as event_type or audience, e.g. "current-students"'),
  group: categoryGroup.describe('Which filter the category belongs to'),
});

export const addressSchema = postalAddressSchema
  .extend({ name: z.string().nullable().describe('Place name; null when not given') })
  .nullable();

export const eventSchema = z.object({
  id: z.number().int().describe('Event id to pass to calendar_get_event'),
  slug: z.string().describe('URL slug; also accepted by calendar_get_event'),
  title: z.string().describe('Event title as listed'),
  url: z.string().describe('Public page on calendar.umd.edu'),
  start: localDateTime('When this occurrence starts'),
  end: localDateTime('When this occurrence ends'),
  all_day: z.boolean().describe('true when the event has no clock time'),
  multi_day: z.boolean().describe('true when one occurrence spans several days'),
  summary: z.string().nullable().describe('Short blurb as plain text; null when none'),
  description: z.string().nullable().describe('Full description as plain text; null when none'),
  image_url: z
    .string()
    .nullable()
    .describe('Hero image; append ?w=&h=&fit=crop to resize; null when the event has none'),
  event_types: z.array(eventType).describe('Event-type categories (unknown new ones are dropped)'),
  audiences: z.array(audience).describe('Audience categories (unknown new ones are dropped)'),
  featured: z.boolean().describe('true when the site marks the event as featured'),
  tags: z.array(z.string()).describe('Free-form tags, e.g. "Sustainability"'),
  location: z.object({
    types: z
      .array(locationType)
      .describe(
        'Where it happens; several for hybrid events, e.g. ["on_campus","online"]; empty when the event does not say',
      ),
    venue: z
      .string()
      .nullable()
      .describe(
        'Free-text on-campus location, e.g. "Stamp Student Union, Room 1101"; null when not given',
      ),
    off_campus_name: z.string().nullable().describe('Off-campus venue name; null when on campus'),
    off_campus_url: z
      .string()
      .nullable()
      .describe('Off-campus venue website; null when none is given'),
    address: addressSchema.describe('Postal address for off-campus events; null otherwise'),
  }),
  contact: z.object({
    name: z.string().nullable().describe('Contact person or office; null when not given'),
    phone: z.string().nullable().describe('Contact phone as printed; null when not given'),
    email: z.string().nullable().describe('Contact email; null when not given'),
  }),
  calendar: calendarHandle.describe("Which of the site's calendars the event is in"),
});

export const recurrenceSchema = z
  .object({
    rrule: z.string().nullable().describe('The RFC 5545 RRULE string; null when not stored'),
    frequency: z.string().nullable().describe('e.g. "WEEKLY"; null when not stored'),
    interval: z.number().int().nullable().describe('Every N periods; null when not stored'),
    count: z.number().int().nullable().describe('Number of occurrences; null when open-ended'),
    until: z.string().nullable().describe('Last occurrence date; null when open-ended'),
    by_day: z.string().nullable().describe('e.g. "MO,WE"; null when not stored'),
    by_month: z.string().nullable().describe('Month numbers, e.g. "1,9"; null when not stored'),
    by_month_day: z
      .string()
      .nullable()
      .describe('Days of the month, e.g. "1,15"; null when not stored'),
  })
  .nullable()
  .describe('Recurrence rule; null for a one-off event');

export const eventDetailSchema = eventSchema.extend({
  posted: z
    .string()
    .nullable()
    .describe('When the event was published, e.g. "2026-08-27 10:49:00"; null when not stored'),
  recurrence: recurrenceSchema,
});

export const academicEventSchema = z.object({
  event: z.string().describe('e.g. "First Day of Classes", "Thanksgiving Recess"'),
  date: z.string().describe('Start date as printed, e.g. "August 31st (Monday)"; no year'),
  end_date: z
    .string()
    .nullable()
    .describe(
      'End date as printed for multi-day events, e.g. "October 13th (Tuesday)"; null otherwise',
    ),
});

export const academicSeasonSchema = z.object({
  season: season.describe('Which semester or session the table covers'),
  events: z.array(academicEventSchema).describe('Events in the order the calendar lists them'),
});

export const academicYearSchema = z.object({
  name: z.string().describe('e.g. "Fall 2026 - Summer 2027"'),
  current: z.boolean().describe('true for the academic year the provost marks as current'),
  seasons: z.array(academicSeasonSchema).describe('Fall, winter, spring and summer in order'),
});

export type Category = z.infer<typeof categorySchema>;
export type Address = z.infer<typeof addressSchema>;
export type Event = z.infer<typeof eventSchema>;
export type EventDetail = z.infer<typeof eventDetailSchema>;
export type AcademicEvent = z.infer<typeof academicEventSchema>;
export type AcademicYear = z.infer<typeof academicYearSchema>;
