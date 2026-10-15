import { decode } from '../../../common.js';
import { htmlToTextOrNull } from '../../../lib/html.js';
import { lines, trimmed } from '../../../lib/text.js';
import {
  type Availability,
  type Event,
  type EventDetail,
  GENRES,
  type Performance,
  type Price,
} from './schemas.js';

export type RawEvent = {
  id: string;
  name: string;
  description: string;
  htmlDescription: string;
  /** Minutes; 0 when not set. */
  duration: number;
  imageUrl: string;
  isOnSale: boolean;
  instanceDates: string;
  firstInstanceDateTime: string;
  lastInstanceDateTime: string;
  attribute_PrimaryGenre: string;
  attribute_TicketLine1: string;
  attribute_TicketLine2: string;
  attribute_Season: string;
};

export type RawInstance = {
  id: string;
  event: { id: string };
  start: string;
  isOnSale: boolean;
  cancelled: boolean;
  startSellingAtWeb: string;
  stopSellingAtWeb: string;
  attribute_Venue: string;
};

export type RawStatus = {
  name: string;
  capacity: number;
  available: number;
  wheelchairAvailable: number;
  unavailable: number;
};

export type RawPriceList = {
  prices: {
    isBandDefault: boolean;
    amount: number;
    ticketType: { name: string };
    priceBand: { name: string };
  }[];
};

export function toEvent(raw: RawEvent): Event {
  const genre = trimmed(raw.attribute_PrimaryGenre);
  return {
    id: raw.id,
    name: raw.name,
    ticket_lines: lines([raw.attribute_TicketLine1, raw.attribute_TicketLine2]),
    genre: genre === null ? null : decode(GENRES, genre, 'genre'),
    season: trimmed(raw.attribute_Season),
    dates: raw.instanceDates,
    first_performance: raw.firstInstanceDateTime,
    last_performance: raw.lastInstanceDateTime,
    duration_minutes: raw.duration > 0 ? raw.duration : null,
    on_sale: raw.isOnSale,
    image_url: trimmed(raw.imageUrl),
  };
}

export function toEventDetail(raw: RawEvent): EventDetail {
  return {
    ...toEvent(raw),
    description: htmlToTextOrNull(raw.htmlDescription) ?? trimmed(raw.description),
  };
}

export function toPerformance(raw: RawInstance): Performance {
  return {
    id: raw.id,
    event_id: raw.event.id,
    start: raw.start,
    on_sale: raw.isOnSale,
    cancelled: raw.cancelled,
    sales_open: raw.startSellingAtWeb,
    sales_close: raw.stopSellingAtWeb,
    venue: trimmed(raw.attribute_Venue),
  };
}

export function toAvailability(raw: RawStatus): Availability {
  return {
    area: raw.name,
    capacity: raw.capacity,
    available: raw.available,
    wheelchair_available: raw.wheelchairAvailable,
    unavailable: raw.unavailable,
  };
}

export function toPrices(raw: RawPriceList): Price[] {
  return raw.prices.map((price) => ({
    ticket_type: price.ticketType.name,
    price_band: price.priceBand.name,
    amount: price.amount,
    default: price.isBandDefault,
  }));
}
