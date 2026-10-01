import { addDays, format, parseISO } from 'date-fns';
import { uniq } from 'lodash-es';
import { stringify } from 'qs';
import { z } from 'zod';
import { isoDate, today } from '../../../common.js';
import { cookieFetcher, type Fetcher } from '../../../lib/http.js';
import { Integration, tool } from '../../base.js';
import { EMPTY_GUID, type PriceRange, SITE, toPriceRange } from '../common.js';
import {
  parseCalendarEvents,
  parseCalendars,
  parseFacilities,
  parseFacilityPage,
  parseAppointmentInfo,
  parseInstanceSpots,
  parseOfferings,
  parseProgramFilters,
  parseProgramList,
  parseProgramPage,
  parseSearchToken,
  type RawAppointmentInfo,
  type RawPrices,
  type RawSchedulerAppointment,
  toAppointment,
  toInstance,
} from './parsers.js';
import {
  type Appointment,
  appointmentSchema,
  type Calendar,
  type CalendarEvent,
  calendarEventSchema,
  calendarId,
  calendarSchema,
  classificationId,
  type Facility,
  facilityId,
  facilitySchema,
  type FacilitySummary,
  facilitySummarySchema,
  type Instance,
  instanceSchema,
  type Offerings,
  offeringsSchema,
  type Program,
  programFiltersSchema,
  type ProgramFilters,
  programId,
  type ProgramList,
  programListSchema,
  programSchema,
  searchQuery,
  semesterId,
  tagId,
} from './schemas.js';

const TIMESTAMP_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

/** The program search's anti-forgery token is tied to a session cookie, so requests share a jar. */
const anonymousFetch = cookieFetcher();

/**
 * activeterp.umd.edu is RecWell's deployment of InnoSoft Fusion, the recreation portal. The
 * public pages are server-rendered HTML with a few JSON endpoints (prices, the facility
 * scheduler), so the tools drive the same requests the site's own scripts make. Everything
 * behind sign-in (memberships, profile, invoices) lives in `ActiveTerpMember`.
 */
export class ActiveTerp extends Integration {
  readonly name = 'activeterp';
  readonly baseUrl = SITE;

  protected override get fetcher(): Fetcher {
    return anonymousFetch;
  }

  /** Prices for programs, or for offerings when `offeringIds` is given, keyed by id. */
  private async prices(
    programIds: string[],
    offeringIds?: string[],
  ): Promise<Map<string, PriceRange>> {
    const res = await this.postJson('api/Price/GetPrices', {
      ProgramIds: programIds,
      CourseOfferingIds: offeringIds ?? null,
    });
    const raw = (await res.json()) as RawPrices;
    return new Map(
      Object.entries(raw).map(([id, price]) => [id.toLowerCase(), toPriceRange(price)]),
    );
  }

  /** A program list fragment with each program's price attached. */
  private async programList(html: string): Promise<ProgramList> {
    const { total, programs } = parseProgramList(html);
    const prices = await this.prices(programs.map((program) => program.id));
    return {
      total,
      programs: programs.map((program) => ({
        ...program,
        ...(prices.get(program.id) ?? toPriceRange(null)),
      })),
    };
  }

  /**
   * Open spots for the slots on `day`, which the instance list only renders for its first date;
   * the site re-posts the whole `ApptInfo` JSON with the chosen date to get the rest.
   */
  private async instanceSpots(
    programId: string,
    appointments: RawAppointmentInfo[],
    day: string,
  ): Promise<Map<string, number | null>> {
    const [year, month, dayOfMonth] = day.split('-');
    const res = await this.postForm(
      'Program/FilterProgramInstances',
      new URLSearchParams(
        stringify(
          { appointments, programID: programId, year, month, day: dayOfMonth },
          { arrayFormat: 'indices', encodeValuesOnly: true },
        ),
      ),
    );
    return parseInstanceSpots(await res.text());
  }

  /** The program details page, parsed. */
  private async programPage(id: string) {
    return parseProgramPage(await this.getText('Program/GetProgramDetails', { courseId: id }), id);
  }

  @tool({
    title: 'List program filters',
    description:
      'The classifications (e.g. Fitness, Aquatics, Esports) and tags (e.g. Adventure Trips) that activeterp.umd.edu programs are filed under, for filtering activeterp_list_programs. No login needed.',
    input: {},
    output: programFiltersSchema.shape,
  })
  async list_program_filters(): Promise<ProgramFilters> {
    return parseProgramFilters(await this.getText('Program'));
  }

  @tool({
    title: 'List programs',
    description:
      'Programs on activeterp.umd.edu (group fitness classes, swim lessons, adventure trips, clinics, camps, esports bookings) with their price, optionally within classifications or tags from activeterp_list_program_filters. Call activeterp_get_program for details and schedules. No login needed.',
    input: {
      classification_ids: z
        .array(classificationId)
        .min(1)
        .optional()
        .describe('Only programs in any of these classifications'),
      tag_ids: z.array(tagId).min(1).optional().describe('Only programs with any of these tags'),
    },
    output: programListSchema.shape,
  })
  async list_programs({
    classification_ids,
    tag_ids,
  }: {
    classification_ids?: string[] | undefined;
    tag_ids?: string[] | undefined;
  }): Promise<ProgramList> {
    const form = new URLSearchParams();
    for (const id of classification_ids ?? []) form.append('classificationIds[]', id);
    for (const id of tag_ids ?? []) form.append('tagIds[]', id);
    const res = await this.postForm('program/GetFilteredPrograms', form);
    return this.programList(await res.text());
  }

  @tool({
    title: 'Search programs',
    description:
      'Search activeterp.umd.edu programs by name, as the site search bar does. Returns the same summaries as activeterp_list_programs. No login needed.',
    input: { query: searchQuery },
    output: programListSchema.shape,
  })
  async search_programs({ query }: { query: string }): Promise<ProgramList> {
    const res = await this.postForm('Program/Search', {
      __RequestVerificationToken: parseSearchToken(await this.getText('Program')),
      term: query,
    });
    return this.programList(await res.text());
  }

  @tool({
    title: 'Get a program',
    description:
      'One activeterp.umd.edu program: description, classification, price, whether a waiver is required, and how it is scheduled: by offering within a semester (then call activeterp_list_program_offerings) or by bookable time slot (activeterp_list_program_instances). No login needed.',
    input: { program_id: programId },
    output: programSchema.shape,
  })
  async get_program({ program_id }: { program_id: string }): Promise<Program> {
    const [page, prices] = await Promise.all([
      this.programPage(program_id),
      this.prices([program_id]),
    ]);
    return {
      id: program_id,
      ...page,
      ...(prices.get(program_id) ?? toPriceRange(null)),
      url: `${SITE}/Program/GetProgramDetails?courseId=${program_id}`,
    };
  }

  @tool({
    title: 'List program offerings',
    description:
      'An activeterp.umd.edu program\'s offerings in a semester: each dated session or series with its price, open spots, meeting pattern (dates, recurrence, time, location) and cancelled dates. For programs whose schedule_type is "offerings". No login needed.',
    input: {
      program_id: programId,
      semester_id: semesterId
        .optional()
        .describe(
          'Semester to list, from activeterp_get_program (default: the first one the site lists)',
        ),
    },
    output: offeringsSchema.shape,
  })
  async list_program_offerings({
    program_id,
    semester_id,
  }: {
    program_id: string;
    semester_id?: string | undefined;
  }): Promise<Offerings> {
    const { semesters } = await this.programPage(program_id);
    const semester =
      semester_id === undefined ? semesters[0] : semesters.find((s) => s.id === semester_id);
    if (semester === undefined) {
      if (semester_id === undefined) return { semester: null, offerings: [] };
      throw new Error(`activeterp: program ${program_id} has no semester ${semester_id}`);
    }
    const cards = parseOfferings(
      await this.getText('Program/GetOfferingsForSemester', {
        semesterId: semester.id,
        programId: program_id,
      }),
    );
    const prices =
      cards.length === 0
        ? new Map<string, PriceRange>()
        : await this.prices(
            [program_id],
            cards.map((card) => card.id),
          );
    return {
      semester,
      offerings: cards.map((card) => ({ ...card, ...(prices.get(card.id) ?? toPriceRange(null)) })),
    };
  }

  @tool({
    title: 'List program instances',
    description:
      'An activeterp.umd.edu program\'s bookable time slots over the coming days (group fitness classes, bouldering and esports reservations, clinics): start and end, location, instructor, class size and open spots, optionally for one date. Reservations usually open 24 hours ahead. For programs whose schedule_type is "instances". No login needed.',
    input: {
      program_id: programId,
      date: isoDate
        .optional()
        .describe('Only slots on this date (default: every date the site offers)'),
    },
    output: { instances: z.array(instanceSchema).describe('Slots in start order') },
  })
  async list_program_instances({
    program_id,
    date,
  }: {
    program_id: string;
    date?: string | undefined;
  }): Promise<{ instances: Instance[] }> {
    const html = await this.getText('Program/GetProgramInstances', { programID: program_id });
    const appointments = parseAppointmentInfo(html).filter(
      (raw) => date === undefined || raw.StartDate.startsWith(date),
    );
    const dates = uniq(appointments.map((raw) => raw.StartDate.slice(0, 10)));
    const spots = parseInstanceSpots(html);
    for (const day of dates) {
      if (
        !appointments.some(
          (raw) => raw.StartDate.startsWith(day) && spots.has(raw.ID.toLowerCase()),
        )
      ) {
        for (const [id, count] of await this.instanceSpots(program_id, appointments, day)) {
          spots.set(id, count);
        }
      }
    }
    return { instances: appointments.map((raw) => toInstance(raw, spots)) };
  }

  @tool({
    title: 'List facilities',
    description:
      'Bookable facilities on activeterp.umd.edu (currently the Terps Esports Center stations) with their parent facility and blurb, optionally matching a search term. Use activeterp_get_facility for hours and activeterp_get_facility_schedule for bookings. No login needed.',
    input: {
      query: searchQuery.optional().describe('Only facilities whose name contains this text'),
    },
    output: {
      facilities: z
        .array(facilitySummarySchema)
        .describe('Facilities in the order the site lists them'),
    },
  })
  async list_facilities({
    query,
  }: {
    query?: string | undefined;
  }): Promise<{ facilities: FacilitySummary[] }> {
    // The search form always posts "any" for the product type and classification filters.
    const html = await this.getText('Facility/FilterFacilities', {
      productTypeCV: EMPTY_GUID,
      classification: EMPTY_GUID,
      searchTerm: query ?? '',
    });
    return { facilities: parseFacilities(html) };
  }

  @tool({
    title: 'Get a facility',
    description:
      'One activeterp.umd.edu facility: description, type, area, maximum occupancy and regular hours per weekday. No login needed.',
    input: { facility_id: facilityId },
    output: facilitySchema.shape,
  })
  async get_facility({ facility_id }: { facility_id: string }): Promise<Facility> {
    return parseFacilityPage(
      await this.getText('Facility/GetFacility', { facilityId: facility_id }),
      facility_id,
    );
  }

  @tool({
    title: 'Get facility schedule',
    description:
      'Bookings on the activeterp.umd.edu facility calendar in a date window (default: the next 7 days), for one facility or all: title, start, end and, for repeating bookings, the recurrence rule and its exceptions. No login needed.',
    input: {
      facility_id: facilityId.optional().describe('Only this facility (default: all)'),
      start: isoDate.optional().describe('First day of the window (default: today)'),
      end: isoDate
        .optional()
        .describe('Day after the last day of the window (default: start + 7 days)'),
    },
    output: {
      appointments: z
        .array(appointmentSchema)
        .describe('Bookings in the order the site returns them'),
    },
  })
  async get_facility_schedule({
    facility_id,
    start,
    end,
  }: {
    facility_id?: string | undefined;
    start?: string | undefined;
    end?: string | undefined;
  }): Promise<{ appointments: Appointment[] }> {
    const from = start ?? today();
    const to = end ?? format(addDays(parseISO(from), 7), 'yyyy-MM-dd');
    const raw = await this.get<RawSchedulerAppointment[]>(
      'Facility/GetScheduleCustomAppointmentsForDevExtremeScheduler',
      {
        start: format(parseISO(from), TIMESTAMP_FORMAT),
        end: format(parseISO(to), TIMESTAMP_FORMAT),
        selectedFacilityId: facility_id,
      },
    );
    return { appointments: raw.map(toAppointment) };
  }

  @tool({
    title: 'List calendars',
    description:
      'The calendars the activeterp.umd.edu home page can show (e.g. Group Fitness Classes, Adventure Program), for activeterp_list_calendar_events. No login needed.',
    input: {},
    output: {
      calendars: z.array(calendarSchema).describe('Calendars in the order the site lists them'),
    },
  })
  async list_calendars(): Promise<{ calendars: Calendar[] }> {
    return { calendars: parseCalendars(await this.getText('')) };
  }

  @tool({
    title: 'List calendar events',
    description:
      'The activeterp.umd.edu home page calendar: every scheduled class, reservation slot and event over the next several days with its date, start time and title, for one calendar or all. The quickest way to see what group fitness classes are coming up. No login needed.',
    input: { calendar_id: calendarId.optional().describe('Only this calendar (default: all)') },
    output: { events: z.array(calendarEventSchema).describe('Events in date and time order') },
  })
  async list_calendar_events({
    calendar_id,
  }: {
    calendar_id?: string | undefined;
  }): Promise<{ events: CalendarEvent[] }> {
    const res = await this.postForm('Calendar/CalendarEvents', {
      calendarId: calendar_id ?? EMPTY_GUID,
    });
    return { events: parseCalendarEvents(await res.text()) };
  }
}
