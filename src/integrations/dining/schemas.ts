import { z } from 'zod';
import { isoDate, weekday } from '../../common.js';

/** The busy meter's levels 1-3, as the site labels them. */
export const BUSY_LEVELS = {
  1: 'less_busy',
  2: 'moderately_busy',
  3: 'extremely_busy',
} as const;

export type BusyLevel = (typeof BUSY_LEVELS)[keyof typeof BUSY_LEVELS];

export const busyLevel = z.enum(Object.values(BUSY_LEVELS) as BusyLevel[]);

export const busyMeterSchema = z.object({
  available: z.boolean().describe('false when the crowd-level service did not answer'),
  reason: z.string().nullable().describe('Why it is unavailable; null when available'),
  halls: z
    .array(
      z.object({
        name: z.string().describe('"251 North", "South Campus" or "Yahentamitsi"'),
        level: busyLevel,
      }),
    )
    .describe('Crowd level per dining hall; empty when unavailable'),
});

export const diningEventSchema = z.object({
  date: isoDate,
  weekday,
  time: z.string().describe('"ALL DAY" or a clock time as printed, e.g. "10:00AM"'),
  description: z.string(),
});

export const diningCalendarSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe('The calendar heading, e.g. "Fall 2026 - Subject to Change"'),
  events: z.array(diningEventSchema).describe('Events in the order the page lists them'),
});

export const newsItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  published: z.string().nullable().describe('ISO 8601 timestamp'),
  author: z.string().nullable(),
  text: z.string().describe('Body as plain text'),
});

export type BusyMeter = z.infer<typeof busyMeterSchema>;
export type DiningEvent = z.infer<typeof diningEventSchema>;
export type DiningCalendar = z.infer<typeof diningCalendarSchema>;
export type NewsItem = z.infer<typeof newsItemSchema>;
