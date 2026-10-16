import { mapValues, zip } from 'lodash-es';
import { type GradeBucket, member, weekdaysFrom } from '../../common.js';
import { lines } from '../../lib/text.js';
import {
  type Course,
  type Department,
  type GradeSummary,
  type GradeTerm,
  type Instructor,
  INSTRUCTOR_SOURCES,
  type Meeting,
  type Review,
  REVIEW_SOURCES,
  type Section,
  type SectionGrades,
} from './schemas.js';

/** A row of `deptList`. */
export type RawDepartment = { dept_code: string; name: string };

/** A row of `courses`. */
export type RawCourse = {
  course_code: string;
  name: string;
  min_credits: number;
  max_credits: number | null;
  gen_eds: string[] | null;
  conditions: string[] | null;
  description: string | null;
};

/** A row of `sections`; `instructor_slugs` runs parallel to `instructors`, null for "Instructor: TBA". */
export type RawSection = {
  course_code: string;
  sec_code: string;
  instructors: string[];
  instructor_slugs: (string | null)[];
  meetings: string[];
  open_seats: number;
  total_seats: number;
  waitlist: number;
  holdfile: number | null;
};

/** A row of `instructors`; the `pt_` columns are the PlanetTerp snapshot it was matched to. */
export type RawInstructor = {
  slug: string;
  name: string;
  average_rating: number | null;
  pt_slug: string | null;
  pt_average_rating: number | null;
  pt_review_count: number | null;
  jupiterp_rating: number | null;
  jupiterp_review_count: number;
  first_seen_term: number | null;
  last_seen_term: number | null;
  is_active: boolean;
};

/** A row of `reviews`. */
export type RawReview = {
  id: string;
  instructor_slug: string;
  course_code: string | null;
  term: number | null;
  rating: number;
  expected_grade: string | null;
  title: string | null;
  body: string;
  submitted_at: string;
  edited_at: string | null;
  source: string;
};

/** The fifteen grade buckets every grade row carries. */
export type RawGradeCounts = {
  a_plus: number;
  a: number;
  a_minus: number;
  b_plus: number;
  b: number;
  b_minus: number;
  c_plus: number;
  c: number;
  c_minus: number;
  d_plus: number;
  d: number;
  d_minus: number;
  f: number;
  w: number;
  other: number;
};

/** A row of `grades`. */
export type RawSectionGrades = RawGradeCounts & {
  term: number;
  course_code: string;
  sec_code: string;
  instructor: string | null;
  instructor_name: string | null;
  instructor_source: string | null;
  total: number;
  graded: number;
  gpa: number | null;
};

/** A row of `grades/summary`; which grouping columns are present depends on `groupBy`. */
export type RawGradeSummary = RawGradeCounts & {
  course_code?: string;
  term?: number;
  instructor?: string;
  instructor_slug?: string;
  section_count: number;
  course_count?: number;
  term_count?: number;
  first_term?: number;
  last_term?: number;
  total: number;
  graded: number;
  gpa: number | null;
};

/** A row of `grades/terms`. */
export type RawGradeTerm = {
  term: number;
  section_count: number;
  course_count: number;
  total: number;
  graded: number;
  gpa: number;
};

/** The grade row column holding each bucket's count. */
const GRADE_COLUMNS: Record<GradeBucket, keyof RawGradeCounts> = {
  'A+': 'a_plus',
  A: 'a',
  'A-': 'a_minus',
  'B+': 'b_plus',
  B: 'b',
  'B-': 'b_minus',
  'C+': 'c_plus',
  C: 'c',
  'C-': 'c_minus',
  'D+': 'd_plus',
  D: 'd',
  'D-': 'd_minus',
  F: 'f',
  W: 'w',
  Other: 'other',
};

/**
 * A meeting as the API prints it: `MW-10:00am-10:50am-TWS-0310`, `TuTh-2:00pm-3:15pm-OnlineSync`
 * or `MW-3:30pm-4:45pm-TBA` for a timed meeting; `OnlineAsync`, `TBA` or `Unspecified` otherwise.
 */
const TIMED_MEETING =
  /^((?:M|Tu|W|Th|F|Sa|Su)+)-(\d{1,2}:\d{2}[ap]m)-(\d{1,2}:\d{2}[ap]m)-(?:(OnlineSync|TBA)|([A-Z0-9]+)-([A-Z0-9]+))$/;

const UNTIMED_MEETINGS = ['OnlineAsync', 'TBA', 'Unspecified'];

/** Term codes come as integers (202408); the shared `term` schema spells them as strings. */
function termOf(code: number | null | undefined): string | null {
  return code == null ? null : String(code);
}

function toGradeCounts(raw: RawGradeCounts): Record<GradeBucket, number> {
  return mapValues(GRADE_COLUMNS, (column) => raw[column]);
}

export function toDepartment(raw: RawDepartment): Department {
  return { code: raw.dept_code, name: raw.name };
}

export function toCourse(raw: RawCourse): Course {
  return {
    id: raw.course_code,
    title: raw.name,
    credits: { min: raw.min_credits, max: raw.max_credits ?? raw.min_credits },
    gen_eds: raw.gen_eds ?? [],
    conditions: lines(raw.conditions ?? []),
    description: raw.description,
  };
}

export function toMeeting(text: string): Meeting {
  if (UNTIMED_MEETINGS.includes(text)) {
    return {
      days: [],
      start_time: null,
      end_time: null,
      building: null,
      room: null,
      online: text === 'OnlineAsync',
    };
  }
  const match = TIMED_MEETING.exec(text);
  if (match === null) throw new Error(`jupiterp: unrecognised meeting "${text}"`);
  const [, days = '', start = '', end = '', place, building, room] = match;
  return {
    days: weekdaysFrom(days),
    start_time: start,
    end_time: end,
    building: building ?? null,
    room: room ?? null,
    online: place === 'OnlineSync',
  };
}

export function toSection(raw: RawSection): Section {
  return {
    course: raw.course_code,
    id: raw.sec_code,
    instructors: zip(raw.instructors, raw.instructor_slugs).map(([name, slug]) => ({
      name: name ?? '',
      slug: slug ?? null,
    })),
    meetings: raw.meetings.map(toMeeting),
    seats: {
      total: raw.total_seats,
      open: raw.open_seats,
      waitlist: raw.waitlist,
      holdfile: raw.holdfile,
    },
  };
}

export function toInstructor(raw: RawInstructor): Instructor {
  return {
    slug: raw.slug,
    name: raw.name,
    average_rating: raw.average_rating,
    planetterp_slug: raw.pt_slug,
    planetterp_rating: raw.pt_average_rating,
    planetterp_review_count: raw.pt_review_count ?? 0,
    jupiterp_rating: raw.jupiterp_rating,
    jupiterp_review_count: raw.jupiterp_review_count,
    first_term: termOf(raw.first_seen_term),
    last_term: termOf(raw.last_seen_term),
    active: raw.is_active,
  };
}

export function toReview(raw: RawReview): Review {
  return {
    id: raw.id,
    instructor_slug: raw.instructor_slug,
    course: raw.course_code,
    term: termOf(raw.term),
    rating: raw.rating,
    expected_grade: raw.expected_grade,
    title: raw.title,
    body: raw.body,
    submitted_at: raw.submitted_at,
    edited_at: raw.edited_at,
    source: member(REVIEW_SOURCES, raw.source, 'review source'),
  };
}

export function toSectionGrades(raw: RawSectionGrades): SectionGrades {
  return {
    term: String(raw.term),
    course: raw.course_code,
    section: raw.sec_code,
    instructor: raw.instructor_name,
    instructor_as_printed: raw.instructor,
    instructor_source:
      raw.instructor_source === null
        ? null
        : member(INSTRUCTOR_SOURCES, raw.instructor_source, 'instructor source'),
    total: raw.total,
    graded: raw.graded,
    gpa: raw.gpa,
    ...toGradeCounts(raw),
  };
}

export function toGradeSummary(raw: RawGradeSummary): GradeSummary {
  return {
    course: raw.course_code ?? null,
    term: termOf(raw.term),
    instructor: raw.instructor ?? null,
    instructor_slug: raw.instructor_slug ?? null,
    section_count: raw.section_count,
    course_count: raw.course_count ?? null,
    term_count: raw.term_count ?? null,
    first_term: termOf(raw.first_term),
    last_term: termOf(raw.last_term),
    total: raw.total,
    graded: raw.graded,
    gpa: raw.gpa,
    ...toGradeCounts(raw),
  };
}

export function toGradeTerm(raw: RawGradeTerm): GradeTerm {
  return {
    term: String(raw.term),
    section_count: raw.section_count,
    course_count: raw.course_count,
    total: raw.total,
    graded: raw.graded,
    gpa: raw.gpa,
  };
}
