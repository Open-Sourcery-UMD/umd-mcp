import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { format, isValid, parse } from 'date-fns';
import { decode, DELIVERY_METHODS, type MeetingType, type Weekday } from '../../../common.js';
import { isoDateTimeFrom } from '../../../lib/dates.js';
import type { Query } from '../../../lib/http.js';
import { absoluteUrl, type Selection, text, textOrNull, texts } from '../../../lib/scrape.js';
import type {
  Building,
  Course,
  Department,
  GenEdCategory,
  Listing,
  Meeting,
  SearchArgs,
  Section,
  Syllabus,
  Term,
} from './schemas.js';

/** Root of the Schedule of Classes site; relative links resolve against it. */
export const SOC_URL = 'https://app.testudo.umd.edu/soc';

/** Catalog note labels, mapped to the course field they fill. */
const REQUIREMENT_FIELDS = {
  'Prerequisite:': 'prerequisite',
  'Corequisite:': 'corequisite',
  'Recommended:': 'recommended',
  'Restriction:': 'restriction',
  'Credit only granted for:': 'credit_only_granted_for',
  'Formerly:': 'formerly',
  'Cross-listed with:': 'cross_listed_with',
  'Also offered as:': 'also_offered_as',
  'Additional information:': 'additional_information',
} as const satisfies Record<string, keyof Course>;

type RequirementField = (typeof REQUIREMENT_FIELDS)[keyof typeof REQUIREMENT_FIELDS];

type Requirements = Pick<Course, 'description' | RequirementField>;

/** The class types the site prints on non-lecture meetings, mapped to the shared vocabulary. */
const CLASS_TYPES: Record<string, MeetingType> = {
  Discussion: 'discussion',
  Lab: 'lab',
};

/** Converts "09/29/2026 at 04:30 PM" into "2026-09-29T16:30:00". */
function parseSeatsAsOf(value: string): string | null {
  const match = /\d{2}\/\d{2}\/\d{4} at \d{1,2}:\d{2} (?:AM|PM)/.exec(value);
  return match === null ? null : isoDateTimeFrom(match[0], "MM/dd/yyyy 'at' h:mm a");
}

/** Parses the term dropdown of the landing page. */
export function parseTerms(html: string): Term[] {
  const $ = cheerio.load(html);
  return $('select#term-id-input option')
    .map((_, option) => ({
      id: $(option).attr('value') ?? '',
      name: text($(option)),
      default: $(option).attr('selected') !== undefined,
    }))
    .get()
    .filter((term) => /^\d{6}$/.test(term.id));
}

/** Parses the department list of a term page. */
export function parseDepartments(html: string): Department[] {
  const $ = cheerio.load(html);
  return $('#course-prefixes-page .course-prefix a')
    .map((_, link) => ({
      code: text($(link).find('.prefix-abbrev')),
      name: text($(link).find('.prefix-name')),
    }))
    .get();
}

/** Parses the gen-ed category page into categories and their requirement codes. */
export function parseGenEdCategories(html: string): GenEdCategory[] {
  const $ = cheerio.load(html);
  return $('.category')
    .map((_, category) => ({
      name: text($(category).find('.category-name')),
      requirements: $(category)
        .find('.subcategory a')
        .map((__, link) => {
          const label = text($(link));
          const match = /^(.*?)\s*\(([A-Z]{4})\)$/.exec(label);
          return { code: match?.[2] ?? label, name: match?.[1] ?? label };
        })
        .get(),
    }))
    .get();
}

/**
 * Parses the approved course text blocks. Structured blocks hold `<div>`s that start with a
 * `<strong>Label:</strong>` (sometimes wrapped in several empty `<div>`/`<strong>` layers);
 * a block without any label is the catalog description. Notes under a label this module does
 * not know are kept, with their label, under additional information.
 */
function parseRequirements($: CheerioAPI, course: Selection): Requirements {
  const fields: Record<string, string | null> = {
    description: null,
    ...Object.fromEntries(Object.values(REQUIREMENT_FIELDS).map((field) => [field, null])),
  };
  const append = (field: string, value: string): void => {
    fields[field] = fields[field] === null ? value : `${fields[field]} ${value}`;
  };

  for (const block of course
    .find('.approved-course-texts-container .approved-course-text')
    .toArray()) {
    if ($(block).find('strong').length === 0) {
      const description = textOrNull($(block));
      if (description !== null) append('description', description);
      continue;
    }
    for (const div of $(block).find('div').toArray()) {
      const first = $(div).children().first();
      if (!first.is('strong')) continue;
      const label = text(first);
      if (label === '') continue;
      const own = $(div).clone();
      own.children('div').remove();
      const value = text(own).slice(label.length).trim();
      const field = (REQUIREMENT_FIELDS as Record<string, RequirementField | undefined>)[label];
      if (field !== undefined) append(field, value);
      else append('additional_information', `${label} ${value}`);
    }
  }
  return fields as Requirements;
}

/** Parses one `.course` block, without its sections. */
function parseCourse($: CheerioAPI, course: Selection): Course {
  const min = Number(text(course.find('.course-min-credits').first()));
  const max = course.find('.course-max-credits').first();
  const grading = course.find('.grading-method abbr').first().attr('title') ?? '';
  const syllabi = /\((\d+)\)/.exec(text(course.find('.syllabus-fieldset legend')))?.[1];

  return {
    id: text(course.find('.course-id').first()),
    title: text(course.find('.course-title').first()),
    credits: { min, max: max.length === 0 ? min : Number(text(max)) },
    grading_methods: grading
      .split(',')
      .map((method) => method.trim())
      .filter((method) => method !== ''),
    gen_ed: course
      .find('.gen-ed-codes-group .course-subcategory a')
      .map((_, link) => ({ code: text($(link)), name: $(link).attr('title')?.trim() ?? '' }))
      .get(),
    permission_required: course.find('.perm-req-message').length > 0,
    individual_instruction: course.find('.individual-instruction-message').length > 0,
    ...parseRequirements($, course),
    notes: texts($, course, '.course-texts-container .course-text'),
    syllabus_count: syllabi === undefined ? 0 : Number(syllabi),
  };
}

/** Parses one meeting row of a section: days and times, or an "on ELMS" placeholder, plus a room. */
function parseMeeting($: CheerioAPI, row: Selection): Meeting {
  const classType = textOrNull(row.find('.class-type'));
  return {
    type: classType === null ? 'lecture' : decode(CLASS_TYPES, classType, 'class type'),
    days: (text(row.find('.section-days')).match(/Tu|Th|Sa|Su|M|W|F/g) ?? []) as Weekday[],
    start_time: textOrNull(row.find('.class-start-time')),
    end_time: textOrNull(row.find('.class-end-time')),
    building: textOrNull(row.find('.building-code')),
    room: textOrNull(row.find('.class-room')),
    time_on_elms: row.find('.elms-class-message').length > 0,
  };
}

/** Parses one `.section` block. */
function parseSection($: CheerioAPI, section: Selection): Section {
  const deliveryCode = /delivery-(f2f|online|blended)/.exec(section.attr('class') ?? '')?.[1];
  const waitlist = textOrNull(section.find('.waitlist-count'));
  return {
    id: text(section.find('.section-id').first()),
    instructors: texts($, section, '.section-instructor').filter((name) => name !== 'TBA'),
    delivery: decode(DELIVERY_METHODS, deliveryCode ?? 'f2f', 'delivery method'),
    seats: {
      total: Number(text(section.find('.total-seats-count'))),
      open: Number(text(section.find('.open-seats-count'))),
      waitlist: waitlist === null ? null : Number(waitlist),
    },
    meetings: section
      .find('.class-days-container > .row')
      .filter((_, row) => $(row).find('.section-day-time-group, .class-building').length > 0)
      .map((_, row) => parseMeeting($, $(row)))
      .get(),
    notes: texts($, section, '.section-text'),
  };
}

/** Parses every `.section` inside a container, in page order. */
function parseSectionList($: CheerioAPI, container: Selection): Section[] {
  return container
    .find('.section')
    .map((_, section) => parseSection($, $(section)))
    .get();
}

/**
 * Parses the "Show Sections" fragment, which holds one `.course-sections` block per course.
 * Courses the site does not know are simply absent.
 */
export function parseSections(html: string): Record<string, Section[]> {
  const $ = cheerio.load(html);
  return Object.fromEntries(
    $('.course-sections')
      .toArray()
      .map((block) => [$(block).attr('id') ?? '', parseSectionList($, $(block))]),
  );
}

/**
 * Parses any page that lists courses (department, gen-ed, search or single course). Courses
 * come grouped by department; each carries its sections when the page rendered them inline
 * and null when they are lazy-loaded.
 */
export function parseListing(html: string): Listing {
  const $ = cheerio.load(html);
  return {
    seats_as_of: parseSeatsAsOf(text($('#seats-update-time').first())),
    message: textOrNull($('.no-courses-message, .no-course-prefixes-message').first()),
    departments: $('.course-prefix-container')
      .map((_, container) => ({
        code: text($(container).find('.course-prefix-abbr').first()),
        name: text($(container).find('.course-prefix-name').first()),
        website: absoluteUrl(
          $(container).find('.course-prefix-link a').first().attr('href'),
          SOC_URL,
        ),
        courses: $(container)
          .find('.courses-container .course')
          .map((__, element) => {
            const course = $(element);
            const loaded = course.find('.sections-fieldset').hasClass('sections-displayed');
            return {
              ...parseCourse($, course),
              sections: loaded ? parseSectionList($, course.find('.sections-container')) : null,
            };
          })
          .get(),
      }))
      .get(),
  };
}

/** Parses the syllabus repository table of a course. */
export function parseSyllabi(html: string): Syllabus[] {
  const $ = cheerio.load(html);
  return $('tr.section')
    .map((_, row) => {
      const cells = $(row).find('td');
      return {
        term: text(cells.eq(0)),
        instructor: text(cells.eq(1)),
        url: absoluteUrl(cells.eq(0).find('a').attr('href'), SOC_URL) ?? '',
      };
    })
    .get();
}

/** Parses the building tooltip fragment; undefined when it carries no building. */
export function parseBuilding(html: string): Building | undefined {
  const $ = cheerio.load(html);
  const info = $('.building-info-container');
  if (info.length === 0) return undefined;

  const codes = Object.fromEntries(
    info
      .find('.building-codes > div')
      .toArray()
      .map((row) => [text($(row).find('.building-info-label')), text($(row).find('.code'))]),
  ) as Record<string, string | undefined>;
  const link = (label: string): string | null =>
    absoluteUrl(info.find(`.map-links a:contains("${label}")`).first().attr('href'), SOC_URL);

  return {
    name: text(info.find('.building-name')),
    code: codes['Bldg Code:'] ?? '',
    number: codes['Bldg Number:'] ?? null,
    room: codes['Room Number:'] ?? null,
    campus_map_url: link('UMD Campus Map'),
    google_maps_url: link('Google Maps'),
    room_info_url: link('Room Info'),
    picture_url: absoluteUrl(info.find('.building-picture img').first().attr('src'), SOC_URL),
  };
}

/** Splits "12:00 PM" into the hour, minute and AM/PM fields the search form posts. */
function splitClockTime(value: string | undefined): [string, string, string] {
  if (value === undefined) return ['', '', ''];
  const time = parse(value.trim().replace(/(am|pm)$/i, ' $1'), 'h:mm a', new Date(0));
  if (!isValid(time)) return ['', '', ''];
  return [format(time, 'hh'), format(time, 'mm'), format(time, 'a')];
}

/** The query string the site's search form submits for `args`; empty fields are always sent. */
export function searchQuery(args: SearchArgs): Query {
  const [startHour, startMin, startAM] = splitClockTime(args.start_time);
  const [endHour, endMin, endAM] = splitClockTime(args.end_time);
  const flag = (on: boolean | undefined): true | undefined => (on === true ? true : undefined);
  return {
    termId: args.term_id,
    courseId: args.course_id ?? '',
    sectionId: args.section_id ?? '',
    instructor: args.instructor ?? '',
    openSectionsOnly: flag(args.open_sections_only),
    creditCompare: args.credits === undefined ? '' : args.credits_compare,
    credits: args.credits === undefined ? '' : args.credits.toFixed(1),
    courseLevelFilter: args.level,
    facetoface: flag(args.delivery?.includes('face_to_face')),
    blended: flag(args.delivery?.includes('blended')),
    online: flag(args.delivery?.includes('online')),
    courseStartCompare: args.time_compare ?? '',
    courseStartHour: startHour,
    courseStartMin: startMin,
    courseStartAM: startAM,
    courseEndHour: endHour,
    courseEndMin: endMin,
    courseEndAM: endAM,
    teachingCenter: args.teaching_center,
    classDay1: flag(args.days?.includes('M')),
    classDay2: flag(args.days?.includes('Tu')),
    classDay3: flag(args.days?.includes('W')),
    classDay4: flag(args.days?.includes('Th')),
    classDay5: flag(args.days?.includes('F')),
  };
}
