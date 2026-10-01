import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { weekdayFromName, weekdayOf } from '../../../common.js';
import { htmlToTextOrNull } from '../../../lib/html.js';
import { absoluteUrl, type Selection, text, textOrNull } from '../../../lib/scrape.js';
import { numeric, trimmed } from '../../../lib/text.js';
import { EMPTY_GUID, SITE, siteDate, urlParam } from '../common.js';
import {
  type Appointment,
  type Calendar,
  type CalendarEvent,
  type Classification,
  type Facility,
  type FacilityHours,
  type FacilitySummary,
  type Instance,
  type MeetingPattern,
  type Offering,
  type ProgramFilters,
  type ScheduleType,
  type Semester,
} from './schemas.js';

/** An entry of the `ApptInfo` JSON the instance list embeds, one per bookable time slot. */
export type RawAppointmentInfo = {
  ID: string;
  StartDate: string;
  EndDate: string;
  Location: string | null;
  ClassSize: number;
  InstructorFirstNameLastInitial: string | null;
};

/** An appointment from the facility scheduler's JSON. */
export type RawSchedulerAppointment = {
  Id: string;
  Text: string;
  StartDate: string;
  EndDate: string;
  AllDay: boolean;
  Description: string | null;
  RecurrenceRule: string | null;
  RecurrenceException: string | null;
};

/** `GetPrices` answers with a price per id, as plain text or a `Range:` span pair. */
export type RawPrices = Record<string, string>;

/** A program card from a list fragment. */
export type ProgramCard = { id: string; name: string; url: string };

/** A program page's fields other than the price, which comes from `GetPrices`. */
export type ProgramPage = {
  name: string;
  classification: Classification;
  description: string | null;
  waiver_required: boolean;
  schedule_type: ScheduleType;
  semesters: Semester[];
};

/** An offering before its price is attached. */
export type OfferingCard = Omit<Offering, 'price_min' | 'price_max'>;

/** A spots tag's text as a count: "6 Spots available" is 6, "Full" and "No spots available" 0. */
function spots(value: string | null): number | null {
  if (value === null) return null;
  if (/^(full|no spots available)$/i.test(value)) return 0;
  return numeric(/^(\d+) spots? available$/i.exec(value)?.[1]);
}

/** The anti-forgery token the program search form carries. */
export function parseSearchToken(html: string): string {
  const $ = cheerio.load(html);
  const token = $('#SearchProgramForm input[name="__RequestVerificationToken"]').attr('value');
  if (token === undefined) throw new Error('activeterp: the programs page has no search token');
  return token;
}

/** The classification and tag filters of the programs page. */
export function parseProgramFilters(html: string): ProgramFilters {
  const $ = cheerio.load(html);
  const filters = (selector: string) =>
    $(selector)
      .toArray()
      .flatMap((input) => {
        const id = trimmed($(input).attr('data-id'))?.toLowerCase();
        const name = trimmed($(input).attr('data-name'));
        return id === undefined || name === null ? [] : [{ id, name }];
      });
  return {
    classifications: filters('input.classificationCheck'),
    tags: filters('input.tagCheck'),
  };
}

/** A program list fragment: the "N Results" heading and one card per program. */
export function parseProgramList(html: string): { total: number; programs: ProgramCard[] } {
  const $ = cheerio.load(html);
  const programs = $('.program-list-item')
    .toArray()
    .flatMap((item) => {
      const id = urlParam($(item).find('a[href]').first().attr('href'), 'courseId');
      const name = textOrNull($(item).find('.program-list-item-title'));
      if (id === null || name === null) return [];
      return [{ id, name, url: `${SITE}/Program/GetProgramDetails?courseId=${id}` }];
    });
  const total = numeric(/\d+/.exec(text($('.program-results')))?.[0]);
  return { total: total ?? programs.length, programs };
}

/** A program details page; throws when the id is unknown (the site shows an error page). */
export function parseProgramPage(html: string, id: string): ProgramPage {
  const $ = cheerio.load(html);
  const name = textOrNull($('h1.progTitle'));
  if (name === null) throw new Error(`activeterp: no program ${id}`);
  const crumb = $('#brdcrmb .breadcrumb-item a[href*="classificationId"]').first();
  return {
    name,
    classification: {
      id: urlParam(crumb.attr('href'), 'classificationId') ?? EMPTY_GUID,
      name: text(crumb),
    },
    description: htmlToTextOrNull($('#progDesc').html()),
    waiver_required: $('#waiverRequired').length > 0,
    schedule_type: $('#IsProgramByOffering').attr('value') === 'True' ? 'offerings' : 'instances',
    semesters: $('#semester-tab [data-semester-id]')
      .toArray()
      .flatMap((tab) => {
        const semesterId = trimmed($(tab).attr('data-semester-id'))?.toLowerCase();
        return semesterId === undefined ? [] : [{ id: semesterId, name: text($(tab)) }];
      }),
  };
}

/** The regular rows of an offering's schedule table. */
function meetingPatterns($: CheerioAPI, card: Selection): MeetingPattern[] {
  return card
    .find('tr.regular-occurrence')
    .toArray()
    .flatMap((row) => {
      const [start = '', end = start] = text($(row).find('.schedule-until')).split(/\s+-\s+/);
      const startDate = siteDate(start);
      const endDate = siteDate(end);
      if (startDate === null || endDate === null) return [];
      return [
        {
          start_date: startDate,
          end_date: endDate,
          recurrence: text($(row).find('.recurring-column, .recurrence')),
          time: text($(row).find('.time-column')),
          location: text($(row).find('.location-column')),
        },
      ];
    });
}

/** An offerings fragment: one accordion card per offering with its schedule table. */
export function parseOfferings(html: string): OfferingCard[] {
  const $ = cheerio.load(html);
  return $('.offering-card')
    .toArray()
    .flatMap((element) => {
      const card = $(element);
      const id = trimmed(card.attr('data-offering-id'))?.toLowerCase();
      const name = textOrNull(card.find('.card-title').first());
      if (id === undefined || name === null) return [];
      return [
        {
          id,
          name,
          spots_available: spots(textOrNull(card.find('.spots-tag .card-text').first())),
          schedule: meetingPatterns($, card),
          cancelled_dates: card
            .find('tr.broken-occurrence')
            .toArray()
            .flatMap((row) => siteDate(text($(row).find('td').first())) ?? []),
        },
      ];
    });
}

/** Open spots per appointment id from the instance cards in a fragment. */
export function parseInstanceSpots(html: string): Map<string, number | null> {
  const $ = cheerio.load(html);
  return new Map(
    $('.program-instance-card .card[data-instance-appointmentid]')
      .toArray()
      .map((card) => [
        $(card).attr('data-instance-appointmentid')?.toLowerCase() ?? '',
        spots(textOrNull($(card).find('.spots-tag .card-text').first())),
      ]),
  );
}

/**
 * The `ApptInfo` JSON an instance list embeds: every upcoming slot. The list only renders cards
 * (with spots) for the first date; `FilterProgramInstances` renders the others.
 */
export function parseAppointmentInfo(html: string): RawAppointmentInfo[] {
  const info = cheerio.load(html)('#ApptInfo').attr('value');
  return info === undefined ? [] : (JSON.parse(info) as RawAppointmentInfo[]);
}

/** A slot from the `ApptInfo` JSON with the open spots its card showed. */
export function toInstance(raw: RawAppointmentInfo, spots: Map<string, number | null>): Instance {
  return {
    id: raw.ID.toLowerCase(),
    start: raw.StartDate,
    end: raw.EndDate,
    location: trimmed(raw.Location) ?? '',
    instructor: trimmed(raw.InstructorFirstNameLastInitial),
    class_size: raw.ClassSize,
    spots_available: spots.get(raw.ID.toLowerCase()) ?? null,
  };
}

/** Splits "Terps Esports Center > Main PC Bay" into the parent facility and the name. */
function facilityPath(value: string): { parent: string | null; name: string } {
  const parts = value.split(/\s+>\s+/);
  const name = parts.pop() ?? value;
  return { parent: parts.length === 0 ? null : parts.join(' > '), name };
}

/** The facility list: one list-group item per facility. */
export function parseFacilities(html: string): FacilitySummary[] {
  const $ = cheerio.load(html);
  return $('a.list-group-item[href]')
    .toArray()
    .flatMap((item) => {
      const href = $(item).attr('href');
      const id = urlParam(href, 'facilityId');
      const url = absoluteUrl(href, SITE);
      if (id === null || url === null) return [];
      return [
        {
          id,
          name: text($(item).find('h3')),
          parent: facilityPath(text($(item).find('p.fi'))).parent,
          description: textOrNull($(item).find('p.DescText-SP.d-md-block')),
          url,
        },
      ];
    });
}

/** The "Regular Facility Hours" card: label and value paragraphs alternating. */
function facilityHours($: CheerioAPI): FacilityHours[] {
  const cells = $('.card-title')
    .filter((_, el) => /regular facility hours/i.test(text($(el))))
    .closest('.card-body')
    .find('p.card-text')
    .toArray();
  const hours: FacilityHours[] = [];
  for (let i = 0; i + 1 < cells.length; i += 2) {
    const day = weekdayFromName(text($(cells[i])).replace(/:$/, ''));
    if (day !== null) hours.push({ day, hours: text($(cells[i + 1])) });
  }
  return hours;
}

/** A facility page; throws when the id is unknown (the site renders a nameless page). */
export function parseFacilityPage(html: string, id: string): Facility {
  const $ = cheerio.load(html);
  const name = text($('h1').first()).replace(/\s*-\s*Facility Details$/i, '');
  if (name === '') throw new Error(`activeterp: no facility ${id}`);
  const info = new Map(
    $('.card-text')
      .has('strong')
      .toArray()
      .map((p) => [
        text($(p).find('strong')).replace(/:$/, '').toLowerCase(),
        text($(p)).replace(/^[^:]*:\s*/, ''),
      ]),
  );
  const area = trimmed(info.get('area'));
  return {
    id,
    name,
    parent: facilityPath(text($('.breadcrumb-item.active'))).parent,
    description: textOrNull($('.card-text.text-justify').first()),
    type: trimmed(info.get('facility type')),
    area: area === null || /^n\/a$/i.test(area) ? null : area,
    max_occupancy: numeric(info.get('max occupancy')) ?? 0,
    hours: facilityHours($),
    url: `${SITE}/Facility/GetFacility?facilityId=${id}`,
  };
}

/** An appointment from the facility scheduler, with the trailing milliseconds dropped. */
export function toAppointment(raw: RawSchedulerAppointment): Appointment {
  return {
    id: raw.Id.toLowerCase(),
    title: raw.Text,
    start: raw.StartDate.replace(/\.\d+$/, ''),
    end: raw.EndDate.replace(/\.\d+$/, ''),
    all_day: raw.AllDay,
    description: trimmed(raw.Description),
    recurrence_rule: trimmed(raw.RecurrenceRule),
    recurrence_exceptions:
      trimmed(raw.RecurrenceException)
        ?.split(',')
        .map((value) => value.trim()) ?? [],
  };
}

/** The calendars the home page's widget can switch between, without its "All" entry. */
export function parseCalendars(html: string): Calendar[] {
  const $ = cheerio.load(html);
  return $('.calendarBtn[data-calendar-id]')
    .toArray()
    .flatMap((button) => {
      const id = trimmed($(button).attr('data-calendar-id'))?.toLowerCase();
      const name = trimmed($(button).attr('data-calendar-name')) ?? text($(button));
      return id === undefined || id === EMPTY_GUID ? [] : [{ id, name }];
    });
}

/** The calendar widget: a dated group per day holding a link per event. */
export function parseCalendarEvents(html: string): CalendarEvent[] {
  const $ = cheerio.load(html);
  return $('.CalendarItem')
    .toArray()
    .flatMap((item) => {
      const date = siteDate(text($(item).find('h3').first()));
      if (date === null) return [];
      return $(item)
        .find('.CalendarEvent a[href]')
        .toArray()
        .flatMap((link) => {
          const id = urlParam($(link).attr('href'), 'appointment');
          if (id === null) return [];
          return [
            {
              id,
              date,
              weekday: weekdayOf(date),
              time: text($(link).find('.EventTime')),
              title: text($(link).find('.EventSubject')),
            },
          ];
        });
    });
}
