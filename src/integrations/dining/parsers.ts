import type Parser from 'rss-parser';
import { decodeOrNull, weekdayOf } from '../../common.js';
import { isoDateFrom } from '../../lib/dates.js';
import { htmlToText, htmlToTextOrNull } from '../../lib/html.js';
import { numeric, trimmed } from '../../lib/text.js';
import {
  BUSY_LEVELS,
  type BusyMeter,
  type DiningCalendar,
  type DiningEvent,
  HALL_LEVELS,
  type HallName,
  type NewsItem,
} from './schemas.js';

type RawDiningEvent = {
  time?: string;
  month?: string;
  day?: number;
  year?: number;
  desc?: string;
};

/** The busy meter's JSON as hall levels; halls with an unreadable level are dropped. */
export function toBusyMeter(body: unknown): BusyMeter {
  const raw = (Array.isArray(body) ? body[0] : body) as Record<string, unknown> | undefined;
  const halls = (Object.keys(HALL_LEVELS) as HallName[]).flatMap((name) => {
    const level = decodeOrNull(BUSY_LEVELS, numeric(raw?.[HALL_LEVELS[name]]) ?? undefined);
    return level === null ? [] : [{ name, level }];
  });
  return halls.length === 0
    ? { available: false, reason: 'The busy meter service returned no levels', halls: [] }
    : { available: true, reason: null, halls };
}

/** A calendar entry from the page's `events = [...]` literal; null when its date is unreadable. */
function toDiningEvent(raw: RawDiningEvent): DiningEvent | null {
  const date = isoDateFrom(`${raw.month ?? ''} ${raw.day ?? ''} ${raw.year ?? ''}`, 'MMM d yyyy');
  if (date === null) return null;
  return {
    date,
    weekday: weekdayOf(date),
    time: trimmed(raw.time) ?? 'ALL DAY',
    description: htmlToText(raw.desc ?? ''),
  };
}

/** The page's `events = [...]` literal as entries; throws when the script no longer carries it. */
function eventsLiteral(html: string): RawDiningEvent[] {
  const literal = /events\s*=\s*(\[[\s\S]*?\])\s*[;\n]/.exec(html)?.[1];
  if (literal === undefined) throw new Error('dining: calendar script changed');
  try {
    return JSON.parse(literal) as RawDiningEvent[];
  } catch (error) {
    throw new Error('dining: calendar script changed', { cause: error });
  }
}

/** Parses the dining calendar page: its heading and the `events = [...]` literal in its script. */
export function parseDiningCalendar(html: string): DiningCalendar {
  const raw = eventsLiteral(html);
  return {
    title: htmlToTextOrNull(/<h2[^>]*>([^<]*Subject to Change[^<]*)<\/h2>/i.exec(html)?.[1]),
    events: raw.map(toDiningEvent).filter((event) => event !== null),
  };
}

export function toNewsItem(item: Parser.Item): NewsItem {
  return {
    title: trimmed(item.title) ?? '',
    url: item.link ?? '',
    published: item.isoDate ?? null,
    author: trimmed(item.creator),
    text: htmlToText(item.content ?? ''),
  };
}
