import { z } from 'zod';
import { isoDate, pagination } from '../../common.js';
import { getText } from '../../lib/http.js';
import { Integration, tool } from '../base.js';
import {
  parseAcademicCalendar,
  type RawCategory,
  type RawEvent,
  type RawEventDetail,
  toCategory,
  toEvent,
  toEventDetail,
} from './mappers.js';
import { CATEGORIES_QUERY, eventDocument, query, searchDocument, SITE } from './queries.js';
import {
  type AcademicYear,
  academicYearSchema,
  AUDIENCES,
  type Audience,
  audience,
  type Category,
  categorySchema,
  type Event,
  type EventDetail,
  EVENT_TYPES,
  type EventType,
  eventDetailSchema,
  eventSchema,
  eventType,
  FEATURED_CATEGORY_ID,
} from './schemas.js';

/** The provost's academic calendar, whose markdown twin holds the semester date tables. */
const PROVOST_SITE = 'https://provost.umd.edu';

export class Calendar extends Integration {
  readonly name = 'calendar';
  readonly baseUrl = SITE;

  @tool({
    title: 'Search campus events',
    description:
      'Events on the UMD campus calendar (calendar.umd.edu) in a date range, optionally narrowed by full-text query, event type, audience or featured status. Recurring events are expanded into occurrences. Returns the total so the caller can page with offset. No login needed.',
    input: {
      query: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Full-text search over title and body, plain words, e.g. "gis"'),
      start: isoDate.optional().describe('Only events on or after this date (default: today)'),
      end: isoDate.optional().describe('Only events on or before this date (default: no limit)'),
      event_type: eventType.optional().describe('Only events of this type'),
      audience: audience.optional().describe('Only events for this audience'),
      featured: z.boolean().optional().describe('Only featured events when true'),
      ...pagination(10),
    },
    output: {
      total: z.number().int().describe('Events matching the filters, across all pages'),
      events: z.array(eventSchema).describe('Events in start-date order'),
    },
  })
  async search_events({
    query: searchQuery,
    start,
    end,
    event_type,
    audience: audienceSlug,
    featured,
    limit,
    offset,
  }: {
    query?: string | undefined;
    start?: string | undefined;
    end?: string | undefined;
    event_type?: EventType | undefined;
    audience?: Audience | undefined;
    featured?: boolean | undefined;
    limit: number;
    offset: number;
  }): Promise<{ total: number; events: Event[] }> {
    const related = [
      event_type === undefined ? [] : [EVENT_TYPES[event_type]],
      audienceSlug === undefined ? [] : [AUDIENCES[audienceSlug]],
      featured === true ? [FEATURED_CATEGORY_ID] : [],
    ].flat();
    const data = await query<{ solspace_calendar: { eventCount: number; events: RawEvent[] } }>(
      searchDocument(end !== undefined),
      {
        offset,
        limit,
        related,
        startDate: start ?? 'today',
        ...(end !== undefined && { endDate: end }),
        searchQuery: searchQuery ?? null,
      },
    );
    return {
      total: data.solspace_calendar.eventCount,
      events: data.solspace_calendar.events.map(toEvent),
    };
  }

  @tool({
    title: 'Get a campus event',
    description:
      'One event from the UMD campus calendar by id or slug, with its full description, location, contact and recurrence rule. No login needed.',
    input: {
      id: z.number().int().optional().describe('Event id from calendar_search_events'),
      slug: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('URL slug, e.g. "terps-after-dark-3"; used when id is not given'),
    },
    output: eventDetailSchema.shape,
  })
  async get_event({
    id,
    slug,
  }: {
    id?: number | undefined;
    slug?: string | undefined;
  }): Promise<EventDetail> {
    if (id === undefined && slug === undefined) {
      throw new Error(`${this.name}: calendar_get_event needs an id or a slug`);
    }
    const data = await query<{ solspace_calendar: { event: RawEventDetail | null } }>(
      eventDocument(id === undefined ? 'slug' : 'id'),
      id === undefined ? { slug: [slug] } : { id: [id] },
    );
    const event = data.solspace_calendar.event;
    if (event === null) throw new Error(`${this.name}: no event ${id ?? slug}`);
    return toEventDetail(event);
  }

  @tool({
    title: 'List event categories',
    description:
      'The event-type, audience and status categories the UMD campus calendar files events under, with the slugs calendar_search_events accepts. No login needed.',
    input: {},
    output: {
      categories: z.array(categorySchema).describe('Categories in the order the site lists them'),
    },
  })
  async list_categories(): Promise<{ categories: Category[] }> {
    const data = await query<{ categories: RawCategory[] }>(CATEGORIES_QUERY, {});
    return { categories: data.categories.map(toCategory) };
  }

  @tool({
    title: 'Get academic calendar',
    description:
      'The approved UMD semester calendars from the Office of the Provost: first and last day of classes, breaks, reading day, final exams, commencement and summer sessions for each academic year, several years ahead. Dates are as printed (no year; the season and academic year give it). No login needed.',
    input: {
      year: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Only academic years whose name contains this text, e.g. "2027" or "Fall 2026 - Summer 2027" (default: all)',
        ),
    },
    output: {
      years: z
        .array(academicYearSchema)
        .describe('Academic years in the order the provost lists them'),
    },
  })
  async get_academic_calendar({
    year,
  }: {
    year?: string | undefined;
  }): Promise<{ years: AcademicYear[] }> {
    const years = parseAcademicCalendar(await getText(PROVOST_SITE, 'calendar.md'));
    const needle = year?.toLowerCase();
    return {
      years:
        needle === undefined
          ? years
          : years.filter((candidate) => candidate.name.toLowerCase().includes(needle)),
    };
  }
}
