import * as cheerio from 'cheerio';
import { weekdayOf } from '../../common.js';
import { isoDateFrom } from '../../lib/dates.js';
import { htmlToText } from '../../lib/html.js';
import { textOrNull } from '../../lib/scrape.js';
import { trimmed } from '../../lib/text.js';
import type { DiningCalendar, DiningEvent } from './schemas.js';

type RawDiningEvent = {
  time?: string;
  month?: string;
  day?: number;
  year?: number;
  desc?: string;
};

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
  const $ = cheerio.load(html);
  return {
    title: textOrNull(
      $('h2')
        .filter((_, h2) => /subject to change/i.test($(h2).text()))
        .first(),
    ),
    events: raw.map(toDiningEvent).filter((event) => event !== null),
  };
}
