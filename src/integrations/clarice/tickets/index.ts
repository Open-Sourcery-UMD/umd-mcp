import { invert } from 'lodash-es';
import { z } from 'zod';
import { isoDate, today } from '../../../common.js';
import { Integration, tool } from '../../base.js';
import {
  type RawEvent,
  type RawInstance,
  type RawPriceList,
  type RawStatus,
  toAvailability,
  toEvent,
  toEventDetail,
  toPerformance,
  toPrices,
} from './mappers.js';
import {
  API,
  type Availability,
  availabilitySchema,
  type Event,
  type EventDetail,
  eventDetailSchema,
  eventId,
  eventSchema,
  GENRES,
  type Genre,
  genre,
  instanceId,
  type Performance,
  performanceSchema,
  type Price,
  priceSchema,
} from './schemas.js';

/** The Spektrix value each genre slug is stored as. */
const GENRE_VALUES = invert(GENRES);

/**
 * The Clarice sells tickets through Spektrix, whose public API v3 the site's own event pages
 * call for performance dates, seat counts and prices. The event pages themselves are in
 * `Clarice`.
 */
export class ClariceTickets extends Integration {
  readonly name = 'clarice-tickets';
  readonly baseUrl = API;

  @tool({
    title: 'List ticketed Clarice events',
    description:
      'Events The Clarice Smith Performing Arts Center sells tickets for (free events included when they take reservations), with any performance in a date range, optionally in one genre. No login needed.',
    input: {
      start: isoDate
        .optional()
        .describe('Only events with a performance on or after this date (default: today)'),
      end: isoDate
        .optional()
        .describe('Only events with a performance on or before this date (default: no limit)'),
      genre: genre.optional().describe('Only events in this primary genre'),
    },
    output: { events: z.array(eventSchema).describe('Events in the order Spektrix lists them') },
  })
  async list_events({
    start,
    end,
    genre: genreSlug,
  }: {
    start?: string | undefined;
    end?: string | undefined;
    genre?: Genre | undefined;
  }): Promise<{ events: Event[] }> {
    const events = await this.get<RawEvent[]>('events', {
      instanceStart_from: start ?? today(),
      instanceStart_to: end === undefined ? undefined : `${end}T23:59:59`,
      attribute_PrimaryGenre: genreSlug === undefined ? undefined : GENRE_VALUES[genreSlug],
    });
    return { events: events.map(toEvent) };
  }

  @tool({
    title: 'Get a ticketed Clarice event',
    description:
      'One event from The Clarice Smith Performing Arts Center ticketing system by id, with its description. No login needed.',
    input: { event_id: eventId },
    output: eventDetailSchema.shape,
  })
  async get_event({ event_id }: { event_id: string }): Promise<EventDetail> {
    return toEventDetail(await this.get<RawEvent>(`events/${event_id}`));
  }

  @tool({
    title: 'List performances',
    description:
      'Every performance of a ticketed Clarice event, past ones included, with whether it is on sale or cancelled and when online sales open and close. No login needed.',
    input: { event_id: eventId },
    output: {
      performances: z.array(performanceSchema).describe('Performances in start order'),
    },
  })
  async list_performances({
    event_id,
  }: {
    event_id: string;
  }): Promise<{ performances: Performance[] }> {
    const instances = await this.get<RawInstance[]>(`events/${event_id}/instances`);
    return { performances: instances.map(toPerformance) };
  }

  @tool({
    title: 'Get seat availability',
    description:
      'How many seats and wheelchair spaces are still for sale for one Clarice performance, out of the house capacity. No login needed.',
    input: { performance_id: instanceId },
    output: availabilitySchema.shape,
  })
  async get_availability({ performance_id }: { performance_id: string }): Promise<Availability> {
    // Without includeChildPlans the counts come back as zero for every seating plan.
    const status = await this.get<RawStatus>(`instances/${performance_id}/status`, {
      includeChildPlans: true,
    });
    return toAvailability(status);
  }

  @tool({
    title: 'Get ticket prices',
    description:
      'Ticket prices for one Clarice performance, by ticket type (e.g. "Regular" or "Student/Youth") and seating section. Not found for a cancelled performance or one no longer on sale. No login needed.',
    input: { performance_id: instanceId },
    output: { prices: z.array(priceSchema).describe('Prices in the order Spektrix lists them') },
  })
  async get_prices({ performance_id }: { performance_id: string }): Promise<{ prices: Price[] }> {
    return {
      prices: toPrices(await this.get<RawPriceList>(`instances/${performance_id}/price-list`)),
    };
  }
}
