import { z } from 'zod';
import { isoDate, weekday } from '../../common.js';

/** The busy meter's levels 1-3, as the site labels them. */
export const BUSY_LEVELS = {
  1: 'less_busy',
  2: 'moderately_busy',
  3: 'extremely_busy',
} as const;

/** The three dining halls, with the field each one's level sits in on the busy meter's JSON. */
export const HALL_LEVELS = {
  '251 North': 'level1',
  'South Campus': 'level2',
  Yahentamitsi: 'level3',
} as const;

export const busyLevel = z.enum(Object.values(BUSY_LEVELS));

export const hallName = z.enum(Object.keys(HALL_LEVELS) as (keyof typeof HALL_LEVELS)[]);

export const busyMeterSchema = z.object({
  available: z.boolean().describe('false when the crowd-level service did not answer'),
  reason: z.string().nullable().describe('Why it is unavailable; null when available'),
  halls: z
    .array(
      z.object({
        name: hallName.describe('Dining hall'),
        level: busyLevel.describe('Crowd level as the site labels it'),
      }),
    )
    .describe('Crowd level per dining hall; empty when unavailable'),
});

export const diningEventSchema = z.object({
  date: isoDate,
  weekday: weekday.describe('Weekday the date falls on'),
  time: z.string().describe('"ALL DAY" or a clock time as printed, e.g. "10:00AM"'),
  description: z.string().describe('What happens that day, as plain text'),
});

export const diningCalendarSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe('The calendar heading, e.g. "Fall 2026 - Subject to Change"; null when missing'),
  events: z.array(diningEventSchema).describe('Events in the order the page lists them'),
});

export const newsItemSchema = z.object({
  title: z.string().describe('Post title'),
  url: z.string().describe('Post page'),
  published: z.string().nullable().describe('ISO 8601 timestamp; null when not given'),
  author: z.string().nullable().describe('null when not given'),
  text: z.string().describe('Body as plain text'),
});

export type HallName = z.infer<typeof hallName>;
export type BusyMeter = z.infer<typeof busyMeterSchema>;
export type DiningEvent = z.infer<typeof diningEventSchema>;
export type DiningCalendar = z.infer<typeof diningCalendarSchema>;
export type NewsItem = z.infer<typeof newsItemSchema>;
