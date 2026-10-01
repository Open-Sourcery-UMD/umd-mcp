import { z } from 'zod';
import { isoDate, weekday } from '../../../common.js';
import { guid, priceMax, priceMin } from '../common.js';

export const programId = guid.describe('Program id');

export const semesterId = guid.describe('Semester id');

export const classificationId = guid.describe('Classification id');

export const tagId = guid.describe('Tag id');

export const facilityId = guid.describe('Facility id');

export const calendarId = guid.describe('Calendar id');

export const searchQuery = z.string().trim().min(1).describe('Text to search for, e.g. "yoga"');

export const SCHEDULE_TYPES = ['offerings', 'instances'] as const;

export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const scheduleType = z
  .enum(SCHEDULE_TYPES)
  .describe(
    '"offerings" when the program is registered for by offering, a dated session or series within a semester (see activeterp_list_program_offerings); "instances" when it is booked by time slot (see activeterp_list_program_instances)',
  );

const localDateTime = z
  .string()
  .describe('ISO 8601 in College Park local time, without an offset, e.g. "2026-10-01T14:00:00"');

const spotsAvailable = z
  .number()
  .int()
  .nullable()
  .describe('Open spots; 0 when full, null when the site does not show a count');

export const classificationSchema = z.object({
  id: z.string().describe('Classification id'),
  name: z.string().describe('e.g. "Fitness"'),
});

export const tagSchema = z.object({
  id: z.string().describe('Tag id'),
  name: z.string().describe('e.g. "Adventure Trips"'),
});

export const programFiltersSchema = z.object({
  classifications: z
    .array(classificationSchema)
    .describe('Program classifications in the order the site lists them'),
  tags: z.array(tagSchema).describe('Program tags in the order the site lists them'),
});

export const programSummarySchema = z.object({
  id: z.string().describe('Program id'),
  name: z.string().describe('e.g. "Yoga Flow (ERC Natatorium Studio)"'),
  price_min: priceMin,
  price_max: priceMax,
  url: z.string().describe('Program page'),
});

export const programListSchema = z.object({
  total: z.number().int().describe('Programs matching the query'),
  programs: z.array(programSummarySchema).describe('Programs in the order the site lists them'),
});

export const semesterSchema = z.object({
  id: z.string().describe('Semester id'),
  name: z.string().describe('e.g. "Fall Semester 2026"'),
});

export const programSchema = programSummarySchema.extend({
  classification: classificationSchema,
  description: z
    .string()
    .nullable()
    .describe('Program description as plain text; null when the site has none'),
  waiver_required: z.boolean().describe('true when registering means signing a waiver'),
  schedule_type: scheduleType,
  semesters: z
    .array(semesterSchema)
    .describe('Semesters the program has offerings in; empty for programs booked by instance'),
});

export const meetingPatternSchema = z.object({
  start_date: isoDate.describe('First meeting date as YYYY-MM-DD'),
  end_date: isoDate.describe(
    'Last meeting date as YYYY-MM-DD; equals start_date for a one-time session',
  ),
  recurrence: z.string().describe('e.g. "Every Monday And Wednesday" or "One-Time"'),
  time: z.string().describe('e.g. "5:30 - 6:10 PM"'),
  location: z.string().describe('e.g. "Instructional Pool- Open Space"'),
});

export const offeringSchema = z.object({
  id: z.string().describe('Offering id'),
  name: z.string().describe('e.g. "Level 1 Mon/Wed 5:30pm November 9th - December 9th"'),
  price_min: priceMin,
  price_max: priceMax,
  spots_available: spotsAvailable,
  schedule: z
    .array(meetingPatternSchema)
    .describe('Meeting patterns; empty when the site says the schedule is not set'),
  cancelled_dates: z
    .array(isoDate)
    .describe('Dates within the patterns that are cancelled, as YYYY-MM-DD'),
});

export const offeringsSchema = z.object({
  semester: semesterSchema
    .nullable()
    .describe('The semester the offerings are for; null when the program has none'),
  offerings: z.array(offeringSchema).describe('Offerings in the order the site lists them'),
});

export const instanceSchema = z.object({
  id: z.string().describe('Appointment id'),
  start: localDateTime,
  end: localDateTime,
  location: z.string().describe('e.g. "Cycling Studio"'),
  instructor: z
    .string()
    .nullable()
    .describe('First name and last initial, e.g. "Fitness I"; null when unassigned'),
  class_size: z.number().int().describe('Maximum number of participants'),
  spots_available: spotsAvailable,
});

export const facilitySummarySchema = z.object({
  id: z.string().describe('Facility id'),
  name: z.string().describe('e.g. "Main PC Bay"'),
  parent: z
    .string()
    .nullable()
    .describe(
      'The facility this one is part of, e.g. "Terps Esports Center"; null at the top level',
    ),
  description: z
    .string()
    .nullable()
    .describe(
      'Blurb, truncated by the site; null when none (activeterp_get_facility has the full text)',
    ),
  url: z.string().describe('Facility page'),
});

export const facilityHoursSchema = z.object({
  day: weekday,
  hours: z.string().describe('e.g. "7:00 AM - 11:00 PM", or "Closed"'),
});

export const facilitySchema = z.object({
  id: z.string().describe('Facility id'),
  name: z.string().describe('e.g. "Main PC Bay"'),
  parent: z
    .string()
    .nullable()
    .describe(
      'The facility this one is part of, e.g. "Terps Esports Center"; null at the top level',
    ),
  description: z.string().nullable().describe('Description as plain text; null when none'),
  type: z.string().nullable().describe('Facility type, e.g. "Esports"; null when not set'),
  area: z.string().nullable().describe('Area within the building; null when the site says N/A'),
  max_occupancy: z.number().int().describe('Maximum occupancy; 0 when not set'),
  hours: z.array(facilityHoursSchema).describe('Regular hours, Sunday first'),
  url: z.string().describe('Facility page'),
});

export const appointmentSchema = z.object({
  id: z.string().describe('Appointment id'),
  title: z.string().describe('e.g. "Main PC Bay (Peripherals Provided)"'),
  start: localDateTime,
  end: localDateTime,
  all_day: z.boolean(),
  description: z.string().nullable().describe('null when empty'),
  recurrence_rule: z
    .string()
    .nullable()
    .describe(
      'RFC 5545 RRULE for a repeating booking, e.g. "FREQ=WEEKLY;UNTIL=20261220T230000Z;BYDAY=MO,WE;WKST=SU", with start as its first occurrence; null for a one-off',
    ),
  recurrence_exceptions: z
    .array(z.string())
    .describe('Occurrences removed from the rule, as local timestamps like "20261001T160000"'),
});

export const calendarSchema = z.object({
  id: z.string().describe('Calendar id'),
  name: z.string().describe('e.g. "Group Fitness Classes"'),
});

export const calendarEventSchema = z.object({
  id: z.string().describe('Appointment id'),
  date: isoDate,
  weekday,
  time: z.string().describe('Start time as printed, e.g. "4:00 PM"'),
  title: z.string().describe('e.g. "Rhythm Ride 45"'),
});

export type Classification = z.infer<typeof classificationSchema>;
export type ProgramFilters = z.infer<typeof programFiltersSchema>;
export type ProgramList = z.infer<typeof programListSchema>;
export type Semester = z.infer<typeof semesterSchema>;
export type Program = z.infer<typeof programSchema>;
export type MeetingPattern = z.infer<typeof meetingPatternSchema>;
export type Offering = z.infer<typeof offeringSchema>;
export type Offerings = z.infer<typeof offeringsSchema>;
export type Instance = z.infer<typeof instanceSchema>;
export type FacilitySummary = z.infer<typeof facilitySummarySchema>;
export type FacilityHours = z.infer<typeof facilityHoursSchema>;
export type Facility = z.infer<typeof facilitySchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
export type Calendar = z.infer<typeof calendarSchema>;
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
