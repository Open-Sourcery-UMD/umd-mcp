import { marked, type Token, type Tokens } from 'marked';
import { htmlToTextOrNull } from '../../lib/html.js';
import { collapse, lines } from '../../lib/text.js';
import {
  type AcademicEvent,
  type AcademicYear,
  type Address,
  AUDIENCES,
  type Audience,
  calendarHandle,
  type Category,
  categoryGroup,
  type Event,
  type EventDetail,
  EVENT_TYPES,
  type EventType,
  locationType,
  season,
} from './schemas.js';

type RawCategoryRef = { slug: string };

type RawAddress = {
  title: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
};

export type RawEvent = {
  id: number;
  slug: string;
  title: string;
  url: string;
  startDateLocalized: string;
  endDateLocalized: string;
  allDay: boolean;
  multiDay: boolean;
  summary: string | null;
  description: string | null;
  image: { url: string }[];
  eventType: RawCategoryRef[];
  audience: RawCategoryRef[];
  featured: RawCategoryRef[];
  locationType: string[] | null;
  venue: string | null;
  offCampusTitle: string | null;
  offCampusLink: string | null;
  address: RawAddress[];
  tags: { title: string }[];
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  calendar: { handle: string };
};

export type RawEventDetail = RawEvent & {
  rrule: string | null;
  freq: string | null;
  interval: number | null;
  count: number | null;
  until: string | null;
  byDay: string | null;
  byMonth: string | null;
  byMonthDay: string | null;
  postDate: string | null;
};

export type RawCategory = { id: string; title: string; slug: string; groupHandle: string };

function toAddress(entries: RawAddress[]): Address {
  const raw = entries[0];
  if (raw === undefined) return null;
  return {
    name: raw.title,
    street: lines([raw.street1, raw.street2]),
    city: raw.city,
    state: raw.state,
    zip: raw.zipCode,
  };
}

/** The declared location type, else off-campus when the event carries off-campus details. */
function toLocationType(raw: RawEvent): Event['location']['type'] {
  const declared = raw.locationType?.[0];
  if (declared !== undefined) return locationType.parse(declared);
  return raw.offCampusTitle !== null || raw.address.length > 0 ? 'off_campus' : null;
}

function isEventType(slug: string): slug is EventType {
  return slug in EVENT_TYPES;
}

function isAudience(slug: string): slug is Audience {
  return slug in AUDIENCES;
}

export function toEvent(raw: RawEvent): Event {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    url: raw.url,
    start: raw.startDateLocalized,
    end: raw.endDateLocalized,
    all_day: raw.allDay,
    multi_day: raw.multiDay,
    summary: htmlToTextOrNull(raw.summary),
    description: htmlToTextOrNull(raw.description),
    image_url: raw.image[0]?.url ?? null,
    event_types: raw.eventType.map((category) => category.slug).filter(isEventType),
    audiences: raw.audience.map((category) => category.slug).filter(isAudience),
    featured: raw.featured.some((status) => status.slug === 'featured'),
    tags: raw.tags.map((tag) => tag.title),
    location: {
      type: toLocationType(raw),
      venue: htmlToTextOrNull(raw.venue),
      off_campus_name: raw.offCampusTitle,
      off_campus_url: raw.offCampusLink,
      address: toAddress(raw.address),
    },
    contact: { name: raw.contactName, phone: raw.contactPhone, email: raw.contactEmail },
    calendar: calendarHandle.parse(raw.calendar.handle),
  };
}

export function toEventDetail(raw: RawEventDetail): EventDetail {
  const recurring =
    raw.rrule !== null || raw.freq !== null || raw.interval !== null || raw.until !== null;
  return {
    ...toEvent(raw),
    posted: raw.postDate,
    recurrence: recurring
      ? {
          rrule: raw.rrule,
          frequency: raw.freq,
          interval: raw.interval,
          count: raw.count,
          until: raw.until,
          by_day: raw.byDay,
          by_month: raw.byMonth,
          by_month_day: raw.byMonthDay,
        }
      : null,
  };
}

export function toCategory(raw: RawCategory): Category {
  return {
    id: Number(raw.id),
    title: raw.title,
    slug: raw.slug,
    group: categoryGroup.parse(raw.groupHandle),
  };
}

/** The text of a heading, paragraph or code token, whitespace collapsed; undefined otherwise. */
function cellText(token: Token): string | undefined {
  if (token.type !== 'heading' && token.type !== 'paragraph' && token.type !== 'code') {
    return undefined;
  }
  return collapse((token as Tokens.Heading | Tokens.Paragraph | Tokens.Code).text);
}

/**
 * Parses the provost calendar's markdown twin. Each table is flattened to one cell per
 * paragraph: a "<year> Events for the <Season> Season" caption, then repeating "<event>",
 * "Date", "<date>", "Event" cells. A date range reads "<start>  To to  <end>". Only the
 * current year's heading reads "### <year> (current)".
 */
export function parseAcademicCalendar(markdown: string): AcademicYear[] {
  const years: AcademicYear[] = [];
  let currentYear: string | undefined;
  let events: AcademicEvent[] | undefined;
  let expect: 'event' | 'date' | undefined;
  let event: string | undefined;

  for (const token of marked.lexer(markdown)) {
    const text = cellText(token);
    if (text === undefined || text === '') continue;

    if (token.type === 'heading') {
      currentYear = /^(.+?)\s*\(current\)$/.exec(text)?.[1] ?? currentYear;
      continue;
    }

    const caption = /^(.+?) Events for the (Fall|Winter|Spring|Summer) Season/.exec(text);
    if (caption !== null) {
      const name = caption[1] ?? '';
      let year = years.find((candidate) => candidate.name === name);
      if (year === undefined) {
        year = { name, current: name === currentYear, seasons: [] };
        years.push(year);
      }
      events = [];
      year.seasons.push({ season: season.parse(caption[2]?.toLowerCase()), events });
      expect = 'event';
      continue;
    }
    if (events === undefined) continue;

    if (text === 'Event') expect = 'event';
    else if (text === 'Date') expect = 'date';
    else if (expect === 'event') {
      event = text;
      expect = undefined;
    } else if (expect === 'date' && event !== undefined) {
      const [date = '', end] = text.split(/\s+To to\s+/);
      events.push({ event, date, end_date: end ?? null });
      event = undefined;
      expect = undefined;
    }
  }
  return years;
}
