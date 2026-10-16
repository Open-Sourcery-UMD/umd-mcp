import { compact } from 'lodash-es';
import { z } from 'zod';
import { courseId, genEdCode, pagination } from '../../common.js';
import { contentRangeTotal, type Query } from '../../lib/http.js';
import { Integration, tool } from '../base.js';
import {
  type RawCourse,
  type RawDepartment,
  type RawGradeSummary,
  type RawGradeTerm,
  type RawInstructor,
  type RawReview,
  type RawSection,
  type RawSectionGrades,
  toCourse,
  toDepartment,
  toGradeSummary,
  toGradeTerm,
  toInstructor,
  toReview,
  toSection,
  toSectionGrades,
} from './mappers.js';
import {
  type Course,
  COURSE_SORTS,
  courseFilters,
  courseSchema,
  type Department,
  departmentSchema,
  GRADE_SORTS,
  type GradeSummary,
  gradeSummarySchema,
  type GradeTerm,
  gradeTermSchema,
  type Grouping,
  grouping,
  GROUPINGS,
  type Instructor,
  INSTRUCTOR_SORTS,
  instructorSchema,
  instructorSlug,
  instructorSource,
  type InstructorSource,
  order,
  type Review,
  reviewSchema,
  type ReviewSort,
  reviewSort,
  type ReviewSource,
  reviewSource,
  type Section,
  type SectionGrades,
  sectionGradesSchema,
  sectionSchema,
  sortBy,
  SUMMARY_SORTS,
  termFilters,
} from './schemas.js';

/** The API's page size cap; its default is 100. */
const MAX_LIMIT = 500;

type SortArgs<T extends Record<string, string>> = {
  sort_by?: (keyof T & string) | undefined;
  order: 'asc' | 'desc';
};

/** A `sortBy=column.direction` value from the tool's sort inputs; undefined when none was given. */
function sortParam<T extends Record<string, string>>(
  sorts: T,
  { sort_by, order }: SortArgs<T>,
): string | undefined {
  return sort_by === undefined ? undefined : `${sorts[sort_by]}.${order}`;
}

/** PostgREST-style conditions for an inclusive range, either end optional, e.g. `["gte.3", "lte.5"]`. */
function between(min: number | string | undefined, max: number | string | undefined): string[] {
  return compact([
    min === undefined ? undefined : `gte.${min}`,
    max === undefined ? undefined : `lte.${max}`,
  ]);
}

type CourseFilterArgs = {
  courses?: string[] | undefined;
  prefix?: string | undefined;
  number?: string | undefined;
};

/** The course-selecting query parameters shared by the course, section and grade endpoints. */
function courseQuery({ courses, prefix, number }: CourseFilterArgs): Query {
  return { courseCodes: courses?.join(','), prefix, number };
}

type TermFilterArgs = {
  term?: string | undefined;
  from_term?: string | undefined;
  to_term?: string | undefined;
};

/** Term conditions for the grade endpoints; an exact term and a range combine. */
function termQuery({ term, from_term, to_term }: TermFilterArgs): string[] {
  return compact([term === undefined ? undefined : `eq.${term}`, ...between(from_term, to_term)]);
}

export class Jupiterp extends Integration {
  readonly name = 'jupiterp';
  readonly baseUrl = 'https://api.jupiterp.com/v1';

  @tool({
    title: 'List departments',
    description:
      'Every four-letter department code on Jupiterp with its name, e.g. "CMSC" Computer Science. No login needed.',
    input: {},
    output: { departments: z.array(departmentSchema).describe('Departments in code order') },
  })
  async list_departments(): Promise<{ departments: Department[] }> {
    const rows = await this.get<RawDepartment[]>('deptList');
    return { departments: rows.map(toDepartment) };
  }

  @tool({
    title: 'List courses',
    description:
      "UMD courses from Jupiterp's scrape of the Schedule of Classes: title, credits, gen-eds, prerequisite and restriction notes and description, selected by course codes, a prefix, a course number, gen-eds or credits. Sections are listed by jupiterp_list_sections. No login needed.",
    input: {
      ...courseFilters,
      gen_eds: z
        .array(genEdCode)
        .min(1)
        .optional()
        .describe(
          'Only courses satisfying every one of these general education codes, e.g. ["DVUP", "DSSP"] (default: all)',
        ),
      min_credits: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Only courses worth at least this many credits, by their minimum'),
      max_credits: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Only courses worth at most this many credits, by their minimum'),
      sort_by: sortBy(COURSE_SORTS),
      order,
      ...pagination(100, MAX_LIMIT),
    },
    output: { courses: z.array(courseSchema).describe('Courses matching the query') },
  })
  async list_courses({
    gen_eds,
    min_credits,
    max_credits,
    limit,
    offset,
    ...args
  }: CourseFilterArgs &
    SortArgs<typeof COURSE_SORTS> & {
      gen_eds?: string[] | undefined;
      min_credits?: number | undefined;
      max_credits?: number | undefined;
      limit: number;
      offset: number;
    }): Promise<{ courses: Course[] }> {
    const rows = await this.get<RawCourse[]>('courses', {
      ...courseQuery(args),
      genEds: gen_eds?.join(','),
      credits: between(min_credits, max_credits),
      sortBy: sortParam(COURSE_SORTS, args),
      limit,
      offset,
    });
    return { courses: rows.map(toCourse) };
  }

  @tool({
    title: 'List sections',
    description:
      'Sections of UMD courses in the current term from Jupiterp: instructors with their Jupiterp slugs, meeting days, times and rooms, and seat, waitlist and holdfile counts, for given courses or a prefix, optionally only sections with open seats, of one instructor or within a class-size range. No login needed.',
    input: {
      courses: courseFilters.courses,
      prefix: courseFilters.prefix,
      instructor: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Only sections taught by this instructor, named exactly as Testudo lists them (case-sensitive), e.g. "Evan Golub"',
        ),
      open_only: z
        .boolean()
        .default(false)
        .describe('Only sections with at least one open seat (default false)'),
      min_seats: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Only sections with at least this many seats in total'),
      max_seats: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Only sections with at most this many seats in total'),
      ...pagination(100, MAX_LIMIT),
    },
    output: { sections: z.array(sectionSchema).describe('Sections matching the query') },
  })
  async list_sections({
    instructor,
    open_only,
    min_seats,
    max_seats,
    limit,
    offset,
    ...args
  }: Omit<CourseFilterArgs, 'number'> & {
    instructor?: string | undefined;
    open_only: boolean;
    min_seats?: number | undefined;
    max_seats?: number | undefined;
    limit: number;
    offset: number;
  }): Promise<{ sections: Section[] }> {
    const rows = await this.get<RawSection[]>('sections', {
      ...courseQuery(args),
      instructor,
      onlyOpen: open_only ? true : undefined,
      totalClassSize: between(min_seats, max_seats),
      limit,
      offset,
    });
    return { sections: rows.map(toSection) };
  }

  @tool({
    title: 'List instructors',
    description:
      'UMD instructors on Jupiterp with their average student rating (PlanetTerp and Jupiterp reviews blended) and the terms they have taught, found by exact names, slugs or a name search, optionally only those currently teaching or within a rating range. Use it to find the slug jupiterp_list_reviews and jupiterp_get_grade_summary take. No login needed.',
    input: {
      names: z
        .array(z.string().trim().min(1))
        .min(1)
        .optional()
        .describe('Only instructors with exactly these names, e.g. ["Evan Golub", "Larry Herman"]'),
      slugs: z
        .array(instructorSlug)
        .min(1)
        .optional()
        .describe(
          'Only instructors with these slugs, e.g. ["evan-golub"]; cannot be combined with names',
        ),
      name_search: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Only instructors whose name contains this text, ignoring case, with apostrophes and hyphens in names read as spaces, e.g. "o brien" for O\'Brien',
        ),
      active_only: z
        .boolean()
        .default(false)
        .describe('Only instructors currently teaching at least one section (default false)'),
      min_rating: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe('Only instructors rated at least this, on the 1-5 scale'),
      max_rating: z
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe('Only instructors rated at most this, on the 1-5 scale'),
      sort_by: sortBy(INSTRUCTOR_SORTS),
      order,
      ...pagination(100, MAX_LIMIT),
    },
    output: {
      total: z.number().int().describe('Instructors matching the query'),
      instructors: z
        .array(instructorSchema)
        .describe('The requested page, in slug order unless sorted'),
    },
  })
  async list_instructors({
    names,
    slugs,
    name_search,
    active_only,
    min_rating,
    max_rating,
    limit,
    offset,
    ...sort
  }: SortArgs<typeof INSTRUCTOR_SORTS> & {
    names?: string[] | undefined;
    slugs?: string[] | undefined;
    name_search?: string | undefined;
    active_only: boolean;
    min_rating?: number | undefined;
    max_rating?: number | undefined;
    limit: number;
    offset: number;
  }): Promise<{ total: number; instructors: Instructor[] }> {
    const { total, records } = await this.getCounted<RawInstructor>('instructors', {
      instructorNames: names?.join(','),
      instructorSlugs: slugs?.join(','),
      nameSearch: name_search,
      activeOnly: active_only ? true : undefined,
      ratings: between(min_rating, max_rating),
      sortBy: sortParam(INSTRUCTOR_SORTS, sort),
      limit,
      offset,
    });
    return { total, instructors: records.map(toInstructor) };
  }

  @tool({
    title: 'List reviews',
    description:
      'Approved student reviews of a UMD instructor on Jupiterp, including those imported from PlanetTerp: rating, expected grade, title and text, optionally for one course, one star rating or one source. No login needed.',
    input: {
      instructor_slug: instructorSlug,
      course: courseId
        .optional()
        .describe('Only reviews written for this course, e.g. "CMSC132" (default: all)'),
      sort: reviewSort,
      rating: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe(
          'Only reviews with this many stars, 1-5; a 4.5 counts as four stars (default: all)',
        ),
      source: reviewSource
        .optional()
        .describe(
          'Only reviews submitted on Jupiterp ("jupiterp") or imported from PlanetTerp ("planetterp") (default: both)',
        ),
      ...pagination(25, MAX_LIMIT),
    },
    output: {
      total: z.number().int().describe('Reviews matching the query'),
      reviews: z.array(reviewSchema).describe('The requested page, in the requested order'),
    },
  })
  async list_reviews({
    instructor_slug,
    course,
    sort,
    rating,
    source,
    limit,
    offset,
  }: {
    instructor_slug: string;
    course?: string | undefined;
    sort: ReviewSort;
    rating?: number | undefined;
    source?: ReviewSource | undefined;
    limit: number;
    offset: number;
  }): Promise<{ total: number; reviews: Review[] }> {
    const { total, records } = await this.getCounted<RawReview>('reviews', {
      instructorSlug: instructor_slug,
      courseCode: course,
      sort,
      rating,
      source,
      limit,
      offset,
    });
    return { total, reviews: records.map(toReview) };
  }

  @tool({
    title: 'Get section grades',
    description:
      "Grade distributions for individual UMD course sections from the Registrar's release on Jupiterp, fall and spring terms since Fall 2010: per-letter counts, withdrawals, GPA and how the instructor was attributed, selected by course, term, instructor and GPA. For totals across sections use jupiterp_get_grade_summary. No login needed.",
    input: {
      ...courseFilters,
      ...termFilters,
      instructor: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Only sections taught by this instructor, in "First Last" order exactly as jupiterp_list_instructors names them (case-sensitive); prefer instructor_slug',
        ),
      instructor_slug: instructorSlug
        .optional()
        .describe('Only sections taught by the instructor with this slug, e.g. "evan-golub"'),
      instructor_sources: z
        .array(instructorSource)
        .min(1)
        .optional()
        .describe(
          'Only sections whose instructor was attributed these ways (default: all, or "reported", "lead" and "testudo" when filtering by instructor, since "course" attributions are carried from elsewhere in the course and sometimes wrong)',
        ),
      min_gpa: z.number().min(0).max(4).optional().describe('Only sections with at least this GPA'),
      max_gpa: z.number().min(0).max(4).optional().describe('Only sections with at most this GPA'),
      min_graded: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Only sections where at least this many students received a letter grade, to skip sections too small to draw conclusions from',
        ),
      sort_by: sortBy(GRADE_SORTS),
      order,
      ...pagination(100, MAX_LIMIT),
    },
    output: {
      grades: z.array(sectionGradesSchema).describe('One entry per section matching the query'),
    },
  })
  async get_grades({
    instructor,
    instructor_slug,
    instructor_sources,
    min_gpa,
    max_gpa,
    min_graded,
    limit,
    offset,
    ...args
  }: CourseFilterArgs &
    TermFilterArgs &
    SortArgs<typeof GRADE_SORTS> & {
      instructor?: string | undefined;
      instructor_slug?: string | undefined;
      instructor_sources?: InstructorSource[] | undefined;
      min_gpa?: number | undefined;
      max_gpa?: number | undefined;
      min_graded?: number | undefined;
      limit: number;
      offset: number;
    }): Promise<{ grades: SectionGrades[] }> {
    const rows = await this.get<RawSectionGrades[]>('grades', {
      ...courseQuery(args),
      term: termQuery(args),
      instructor,
      instructorSlug: instructor_slug,
      instructorSource: instructor_sources?.join(','),
      gpa: between(min_gpa, max_gpa),
      graded: between(min_graded, undefined),
      sortBy: sortParam(GRADE_SORTS, args),
      limit,
      offset,
    });
    return { grades: rows.map(toSectionGrades) };
  }

  @tool({
    title: 'Get grade summary',
    description:
      'Grade distributions on Jupiterp summed across sections: per course over its whole history (how hard is it), per course and term (has it changed), per course and instructor (who to take it with), per instructor across every course (how do they grade), or per instructor and term. The instructor groupings take no course filter, and the per-term groupings are the only ones that take a term filter. No login needed.',
    input: {
      group_by: grouping,
      ...courseFilters,
      ...termFilters,
      instructor_slug: instructorSlug
        .optional()
        .describe(
          'Only this instructor, e.g. "evan-golub"; required for "instructor_term" and with an instructor grouping otherwise optional',
        ),
      include_carried: z
        .boolean()
        .default(false)
        .describe(
          'With "course_instructor", also count sections whose instructor was carried across lecture groups: wider coverage, lower confidence; needs courses, prefix, number or instructor_slug (default false)',
        ),
      min_gpa: z.number().min(0).max(4).optional().describe('Only rows with at least this GPA'),
      max_gpa: z.number().min(0).max(4).optional().describe('Only rows with at most this GPA'),
      min_graded: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Only rows where at least this many students received a letter grade, to skip instructors or terms with too few students to compare',
        ),
      sort_by: sortBy(SUMMARY_SORTS),
      order,
      ...pagination(100, MAX_LIMIT),
    },
    output: {
      total: z.number().int().describe('Rows matching the query'),
      summaries: z.array(gradeSummarySchema).describe('The requested page of summed distributions'),
    },
  })
  async get_grade_summary({
    group_by,
    instructor_slug,
    include_carried,
    min_gpa,
    max_gpa,
    min_graded,
    limit,
    offset,
    ...args
  }: CourseFilterArgs &
    TermFilterArgs &
    SortArgs<typeof SUMMARY_SORTS> & {
      group_by: Grouping;
      instructor_slug?: string | undefined;
      include_carried: boolean;
      min_gpa?: number | undefined;
      max_gpa?: number | undefined;
      min_graded?: number | undefined;
      limit: number;
      offset: number;
    }): Promise<{ total: number; summaries: GradeSummary[] }> {
    const { total, records } = await this.getCounted<RawGradeSummary>('grades/summary', {
      groupBy: GROUPINGS[group_by],
      ...courseQuery(args),
      term: termQuery(args),
      instructorSlug: instructor_slug,
      includeCarried: include_carried ? true : undefined,
      gpa: between(min_gpa, max_gpa),
      minStudents: min_graded,
      sortBy: sortParam(SUMMARY_SORTS, args),
      limit,
      offset,
    });
    return { total, summaries: records.map(toGradeSummary) };
  }

  @tool({
    title: 'List grade terms',
    description:
      'Terms Jupiterp has grade data for, newest first, with section and course counts and the university-wide GPA; fall and spring only, as the Registrar released. No login needed.',
    input: {},
    output: { terms: z.array(gradeTermSchema).describe('Terms with grade data, newest first') },
  })
  async list_grade_terms(): Promise<{ terms: GradeTerm[] }> {
    const rows = await this.get<RawGradeTerm[]>('grades/terms');
    return { terms: rows.map(toGradeTerm) };
  }

  /** GETs a counted list: the page of records plus the total the `Content-Range` header reports. */
  private async getCounted<T>(
    path: string,
    query: Query,
  ): Promise<{ total: number; records: T[] }> {
    const res = await this.request(
      path,
      { ...query, count: true },
      { headers: { accept: 'application/json' } },
    );
    const records = (await res.json()) as T[];
    return { total: contentRangeTotal(res) ?? records.length, records };
  }
}
