import type Parser from 'rss-parser';
import { format, isValid, parse } from 'date-fns';
import { decodeOrNull, weekdayOf } from '../../common.js';
import { htmlToText, htmlToTextOrNull } from '../../lib/html.js';
import { numeric, trimmed } from '../../lib/text.js';
import {
  BUSY_LEVELS,
  type BusyMeter,
  type DiningCalendar,
  type DiningEvent,
  type NewsItem,
} from './schemas.js';

type RawDiningEvent = {
  time?: string;
  month?: string;
  day?: number;
  year?: number;
  desc?: string;
};

/** The busy meter's payload, one field per hall. */
const HALL_LEVELS = {
  '251 North': 'level1',
  'South Campus': 'level2',
  Yahentamitsi: 'level3',
} as const;

/** The busy meter's JSON as hall levels; halls with an unreadable level are dropped. */
export function toBusyMeter(body: unknown): BusyMeter {
  const raw = (Array.isArray(body) ? body[0] : body) as Record<string, unknown> | undefined;
  const halls = Object.entries(HALL_LEVELS).flatMap(([name, field]) => {
    const level = decodeOrNull(BUSY_LEVELS, numeric(raw?.[field]) ?? undefined);
    return level === null ? [] : [{ name, level }];
  });
  return halls.length === 0
    ? { available: false, reason: 'The busy meter service returned no levels', halls: [] }
    : { available: true, reason: null, halls };
}

/** A calendar entry from the page's `events = [...]` literal; null when its date is unreadable. */
function toDiningEvent(raw: RawDiningEvent): DiningEvent | null {
  const date = parse(
    `${raw.month ?? ''} ${raw.day ?? ''} ${raw.year ?? ''}`,
    'MMM d yyyy',
    new Date(0),
  );
  if (!isValid(date)) return null;
  return {
    date: format(date, 'yyyy-MM-dd'),
    weekday: weekdayOf(date),
    time: trimmed(raw.time) ?? 'ALL DAY',
    description: htmlToText(raw.desc ?? ''),
  };
}

/** Parses the dining calendar page: its heading and the `events = [...]` literal in its script. */
export function parseDiningCalendar(html: string): DiningCalendar {
  const literal = /events\s*=\s*(\[[\s\S]*?\])\s*[;\n]/.exec(html)?.[1];
  const raw = literal === undefined ? [] : (JSON.parse(literal) as RawDiningEvent[]);
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
