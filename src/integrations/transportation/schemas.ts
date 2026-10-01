import { z } from 'zod';
import { isoDate, linkSchema, weekday } from '../../common.js';

/** The DOTS site; route pages and the pages the tools scrape live under it. */
export const SITE = 'https://transportation.umd.edu';

export const routeId = z
  .string()
  .trim()
  .min(1)
  .describe('Route id as in transportation_list_routes, e.g. "104" (event routes have longer ids)');

export const stopId = z
  .string()
  .trim()
  .regex(/^\d{4,5}$/, 'Expected a stop id like 1001')
  .describe('Stop id, as transportation_list_stops returns it, e.g. "1001"');

export const serviceDate = isoDate
  .optional()
  .describe('Service date as YYYY-MM-DD (default: today in College Park)');

/** GTFS `wheelchair_boarding` codes. */
export const WHEELCHAIR_BOARDING = {
  0: 'unknown',
  1: 'accessible',
  2: 'not_accessible',
} as const;

type WheelchairBoarding = (typeof WHEELCHAIR_BOARDING)[keyof typeof WHEELCHAIR_BOARDING];

const wheelchairBoarding = z.enum(Object.values(WHEELCHAIR_BOARDING) as WheelchairBoarding[]);

/** GTFS `direction_id` codes. */
export const DIRECTIONS = { 0: 'outbound', 1: 'inbound' } as const;

type Direction = (typeof DIRECTIONS)[keyof typeof DIRECTIONS];

const direction = z.enum(Object.values(DIRECTIONS) as Direction[]);

export const feedSchema = z.object({
  valid_from: isoDate
    .nullable()
    .describe('First date the timetable covers; null when the feed does not say'),
  valid_to: isoDate
    .nullable()
    .describe('Last date the timetable covers; null when the feed does not say'),
  version: z.string().nullable().describe('Feed version as the publisher labels it'),
});

export const routeSchema = z.object({
  id: z.string().describe('Route id, e.g. "104"'),
  short_name: z.string().nullable().describe('Number or code shown on the bus, e.g. "104"'),
  long_name: z.string().nullable().describe('Route name, e.g. "College Park Metro Station"'),
  color: z.string().nullable().describe('Route colour as a six-digit hex string, e.g. "93c47d"'),
  url: z
    .string()
    .nullable()
    .describe(
      'DOTS page with the stop list and printed timetable; null for event and charter routes without a page',
    ),
  scheduled: z
    .boolean()
    .describe(
      'true when at least one trip runs on the requested date (today for transportation_list_routes)',
    ),
});

export const stopSchema = z.object({
  id: z.string().describe('Stop id, e.g. "1001"'),
  name: z.string().nullable().describe('Stop name, e.g. "Regents Drive Garage"'),
  lat: z.number().nullable().describe('Latitude'),
  lon: z.number().nullable().describe('Longitude'),
  wheelchair_boarding: wheelchairBoarding.describe('Wheelchair access as the feed records it'),
});

export const stopWithRoutesSchema = stopSchema.extend({
  routes: z.array(z.string()).describe('Ids of every route with a trip that serves this stop'),
});

export const routeStopSchema = stopSchema.extend({
  sequence: z.number().int().describe('Position along the route, starting at 0'),
  timepoint: z.boolean().describe('true for stops the timetable prints times for'),
});

export const routeDetailSchema = routeSchema.extend({
  headsign: z.string().nullable().describe('Destination shown on the bus for this pattern'),
  stops: z
    .array(routeStopSchema)
    .describe(
      'Stops of the most common trip pattern on the requested date, in order; when `scheduled` is false, of the most common pattern over the whole timetable instead',
    ),
  shape: z
    .array(z.tuple([z.number(), z.number()]))
    .describe('Route polyline as [longitude, latitude] pairs, thinned to at most 500 points'),
});

export const departureSchema = z.object({
  time: z
    .string()
    .describe(
      'Local time as HH:MM:SS; hours run past 24 for trips after midnight, e.g. "25:10:00"',
    ),
  stop_id: z.string().describe('Stop id'),
  stop_name: z.string().nullable().describe('Stop name'),
  headsign: z.string().nullable().describe('Destination shown on the bus from this stop'),
  direction: direction.nullable().describe('Direction of travel; null when the feed does not say'),
  trip_id: z.string().describe('GTFS trip id'),
  timepoint: z.boolean().describe('true when the time is a scheduled timepoint, not an estimate'),
});

export const scheduleSchema = z.object({
  route: z.string().describe('Route id'),
  date: isoDate,
  weekday,
  service_ids: z
    .array(z.string())
    .describe(
      'GTFS service patterns active that day, e.g. "FA26RS Weekday"; empty means no service',
    ),
  departures: z
    .array(departureSchema)
    .describe('Departures in time order; stops without a scheduled time are estimates'),
});

export const alertSchema = z.object({
  text: z.string().describe('Alert as DOTS words it'),
  links: z.array(linkSchema).describe('Pages the alert points to'),
});

export const alertsSchema = z.object({
  season: z.string().nullable().describe('Schedule season heading, e.g. "FALL 2026 SCHEDULES"'),
  effective: z.string().nullable().describe('Effective-date note under the heading'),
  alerts: z.array(alertSchema).describe('System updates and alerts, top first'),
  notices: z.array(linkSchema).describe('Modified-service notices linked under the season heading'),
});

export const servicePeriodEntrySchema = z.object({
  dates: z.string().describe('Date range as printed, e.g. "Saturday, Oct. 11–Tuesday, Oct.14"'),
  status: z.string().describe('Service level as printed, e.g. "Modified Service"'),
  url: z.string().nullable().describe('Notice page with the route-by-route detail'),
});

export const servicePeriodSchema = z.object({
  period: z.string().describe('Period heading, e.g. "FALL BREAK"'),
  entries: z.array(servicePeriodEntrySchema).describe('Date ranges within the period'),
});

export const serviceCalendarSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe('Page heading, e.g. "SHUTTLE-UM SERVICE CALENDAR: 2025-2026"'),
  periods: z.array(servicePeriodSchema).describe('Periods in the order the page lists them'),
});

export type Feed = z.infer<typeof feedSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Stop = z.infer<typeof stopSchema>;
export type StopWithRoutes = z.infer<typeof stopWithRoutesSchema>;
export type RouteDetail = z.infer<typeof routeDetailSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type Alerts = z.infer<typeof alertsSchema>;
export type ServiceCalendar = z.infer<typeof serviceCalendarSchema>;
