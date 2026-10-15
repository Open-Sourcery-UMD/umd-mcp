import { z } from 'zod';
import { localDateTime } from '../../../common.js';

/** The Clarice's Spektrix ticketing API. */
export const API = 'https://system.spektrix.com/theclarice/api/v3';

/** An event's primary genre, keyed by the value Spektrix stores. */
export const GENRES = {
  Music: 'music',
  Theater: 'theater',
  Dance: 'dance',
  Other: 'other',
} as const;

export type Genre = (typeof GENRES)[keyof typeof GENRES];

export const genre = z.enum(Object.values(GENRES) as Genre[]);

/** Every Spektrix id is digits followed by capital letters. */
const spektrixId = z
  .string()
  .trim()
  .regex(/^\d+[A-Z]+$/, 'Expected a ticketing id like 214803AHDGBDJLCLRPCQLNKHHQCMQRBGQ');

export const eventId = spektrixId.describe(
  'Ticketing event id from clarice_tickets_list_events or clarice_get_event, e.g. "214803AHDGBDJLCLRPCQLNKHHQCMQRBGQ"',
);

export const instanceId = spektrixId.describe(
  'Performance id from clarice_tickets_list_performances, e.g. "324402ASCLQQVQDPDNMQMKCPSJLBPPLVB"',
);

export const eventSchema = z.object({
  id: z.string().describe('Ticketing event id to pass to the other clarice_tickets tools'),
  name: z.string().describe('Event name'),
  ticket_lines: z
    .array(z.string())
    .describe('Lines printed on the ticket, usually the presenter then a short title'),
  genre: genre.nullable().describe('Primary genre; null when not set'),
  season: z.string().nullable().describe('Season, e.g. "2026-2027"; null when not set'),
  dates: z.string().describe('Date range as printed, e.g. "October 9-October 18"'),
  first_performance: localDateTime('When the first performance starts'),
  last_performance: localDateTime('When the last performance starts'),
  duration_minutes: z.number().int().nullable().describe('Running time; null when not set'),
  on_sale: z.boolean().describe('true when tickets are on sale online'),
  image_url: z.string().nullable().describe('Event image; null when none'),
});

export const eventDetailSchema = eventSchema.extend({
  description: z.string().nullable().describe('Description as plain text; null when none'),
});

export const performanceSchema = z.object({
  id: z
    .string()
    .describe(
      'Performance id to pass to clarice_tickets_get_availability and clarice_tickets_get_prices',
    ),
  event_id: z.string().describe('Ticketing event id'),
  start: localDateTime('When the performance starts'),
  on_sale: z.boolean().describe('true when tickets for this performance are on sale online'),
  cancelled: z.boolean().describe('true when the performance is cancelled'),
  sales_open: localDateTime('When online sales open'),
  sales_close: localDateTime('When online sales close'),
  venue: z
    .string()
    .nullable()
    .describe(
      'Where it happens, e.g. "Clarice Smith Performing Arts Center - 8270 Alumni Dr", or the stream URL for a livestream; null when not set',
    ),
});

export const availabilitySchema = z.object({
  area: z.string().describe('Hall or seating area, e.g. "Gildenhorn Recital Hall"'),
  capacity: z.number().int().describe('Seats in the house'),
  available: z.number().int().describe('Seats still for sale'),
  wheelchair_available: z.number().int().describe('Wheelchair spaces still for sale'),
  unavailable: z.number().int().describe('Seats sold, held or otherwise off sale'),
});

export const priceSchema = z.object({
  ticket_type: z.string().describe('Who the price is for, e.g. "Regular" or "Student/Youth"'),
  price_band: z.string().describe('Seating section the price applies to, e.g. "Main"'),
  amount: z.number().describe('Ticket price in dollars, before the booking fee'),
  default: z.boolean().describe('true for the price shown first in its seating section'),
});

export type Event = z.infer<typeof eventSchema>;
export type EventDetail = z.infer<typeof eventDetailSchema>;
export type Performance = z.infer<typeof performanceSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type Price = z.infer<typeof priceSchema>;
