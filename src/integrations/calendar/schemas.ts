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
export const categoryGroup = z.enum(['eventType', 'audience', 'eventStatus']);
export const locationType = z.enum(['on_campus', 'online', 'off_campus']);
export const calendarHandle = z.enum(['submission', 'communications', 'athletics']);
export const season = z.enum(['fall', 'winter', 'spring', 'summer']);

const localDateTime = z
  .string()
  .describe('ISO 8601 with the America/New_York offset, e.g. "2026-10-01T14:00:00-04:00"');

export const categorySchema = z.object({
  id: z.number().int().describe('Craft category id'),
  title: z.string().describe('Display name, e.g. "Undergraduate Students"'),
  slug: z.string().describe('Slug to pass as event_type or audience, e.g. "current-students"'),
  group: categoryGroup.describe('Which filter the category belongs to'),
});

export const addressSchema = postalAddressSchema
  .extend({ name: z.string().nullable().describe('Place name, if given') })
  .nullable();

export const eventSchema = z.object({
  id: z.number().int().describe('Event id to pass to calendar_get_event'),
  slug: z.string().describe('URL slug; also accepted by calendar_get_event'),
  title: z.string(),
  url: z.string().describe('Public page on calendar.umd.edu'),
  start: localDateTime,
  end: localDateTime,
  all_day: z.boolean(),
  multi_day: z.boolean(),
  summary: z.string().nullable().describe('Short blurb as plain text'),
  description: z.string().nullable().describe('Full description as plain text'),
  image_url: z.string().nullable().describe('Hero image; append ?w=&h=&fit=crop to resize'),
  event_types: z.array(eventType).describe('Event-type categories (unknown new ones are dropped)'),
  audiences: z.array(audience).describe('Audience categories (unknown new ones are dropped)'),
  featured: z.boolean().describe('true when the site marks the event as featured'),
  tags: z.array(z.string()),
  location: z.object({
    type: locationType.nullable().describe('null when the event does not say'),
    venue: z
      .string()
      .nullable()
      .describe('Free-text on-campus location, e.g. "Stamp Student Union, Room 1101"'),
    off_campus_name: z.string().nullable().describe('Off-campus venue name'),
    off_campus_url: z.string().nullable().describe('Off-campus venue website'),
    address: addressSchema.describe('Postal address for off-campus events; null otherwise'),
  }),
  contact: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  calendar: calendarHandle.describe("Which of the site's calendars the event is in"),
});

export const recurrenceSchema = z
  .object({
    rrule: z.string().nullable().describe('The RFC 5545 RRULE string'),
    frequency: z.string().nullable().describe('e.g. "WEEKLY"'),
    interval: z.number().int().nullable(),
    count: z.number().int().nullable(),
    until: z.string().nullable(),
    by_day: z.string().nullable().describe('e.g. "MO,WE"'),
    by_month: z.string().nullable(),
    by_month_day: z.string().nullable(),
  })
  .nullable()
  .describe('Recurrence rule; null for a one-off event');

export const eventDetailSchema = eventSchema.extend({
  posted: z
    .string()
    .nullable()
    .describe('When the event was published, e.g. "2026-08-27 10:49:00"'),
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
  season,
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
