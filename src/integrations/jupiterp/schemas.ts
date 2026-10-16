import { z } from 'zod';
import {
  courseId,
  coursePrefix,
  departmentCode,
  genEdCode,
  gradeCountsShape,
  sectionId,
  term,
  weekday,
} from '../../common.js';

/** How the Registrar's grade release named a section's instructor, most reliable first. */
export const INSTRUCTOR_SOURCES = ['reported', 'lead', 'testudo', 'course'] as const;

export const instructorSource = z.enum(INSTRUCTOR_SOURCES);

export const REVIEW_SOURCES = ['jupiterp', 'planetterp'] as const;

export const reviewSource = z.enum(REVIEW_SOURCES);

export const REVIEW_SORTS = ['newest', 'oldest', 'highest', 'lowest'] as const;

export const reviewSort = z
  .enum(REVIEW_SORTS)
  .default('newest')
  .describe(
    'Order of the reviews: "newest" or "oldest" first, or "highest" or "lowest" rated first (default "newest")',
  );

/** What one grade summary row sums over, keyed by the value the tool takes, with the API's `groupBy`. */
export const GROUPINGS = {
  course: 'course',
  course_term: 'term',
  course_instructor: 'instructor',
  instructor: 'instructorOverall',
  instructor_term: 'instructorTerm',
} as const;

export type Grouping = keyof typeof GROUPINGS;

export const grouping = z
  .enum(Object.keys(GROUPINGS) as Grouping[])
  .default('course')
  .describe(
    'One row per "course" over every term on file, per "course_term", per "course_instructor", per "instructor" across every course they have taught, or per "instructor_term" (default "course")',
  );

/** Sort keys a tool offers, with the API column each orders by. */
export const COURSE_SORTS = {
  course: 'course_code',
  title: 'name',
  credits: 'min_credits',
} as const;

export const INSTRUCTOR_SORTS = { name: 'name', average_rating: 'average_rating' } as const;

export const GRADE_SORTS = {
  term: 'term',
  course: 'course_code',
  section: 'sec_code',
  gpa: 'gpa',
  graded: 'graded',
} as const;

export const SUMMARY_SORTS = {
  course: 'course_code',
  term: 'term',
  instructor: 'instructor',
  gpa: 'gpa',
  graded: 'graded',
  section_count: 'section_count',
} as const;

/** A `sort_by` input offering the keys of `sorts`. */
export function sortBy<T extends Record<string, string>>(sorts: T) {
  return z
    .enum(Object.keys(sorts) as (keyof T & string)[])
    .optional()
    .describe("Field to order the results by (default: the site's own order)");
}

export const order = z
  .enum(['asc', 'desc'])
  .default('asc')
  .describe('Direction to order the results in when sort_by is given (default "asc")');

export const instructorSlug = z
  .string()
  .trim()
  .min(1)
  .describe(
    'Instructor slug from jupiterp_list_instructors or jupiterp_list_sections, e.g. "evan-golub"',
  );

export const courseNumber = z
  .string()
  .trim()
  .regex(/^\d{3}$/, 'Expected a course number like 433')
  .describe(
    'Three-digit course number to match across departments, e.g. "433" for AOSC433, AREC433 and so on',
  );

/** Inputs selecting which courses an endpoint covers; the API refuses `courses` with `prefix`. */
export const courseFilters = {
  courses: z
    .array(courseId)
    .min(1)
    .optional()
    .describe('Only these courses, e.g. ["CMSC132", "MATH141"]; cannot be combined with prefix'),
  prefix: coursePrefix.optional(),
  number: courseNumber.optional(),
};

/** Inputs narrowing grade data to a span of terms; all three combine. */
export const termFilters = {
  term: term.optional().describe('Only this term, e.g. "202408" for Fall 2024'),
  from_term: term.optional().describe('Only this term and later ones, e.g. "202008"'),
  to_term: term.optional().describe('Only this term and earlier ones, e.g. "202501"'),
};

const gpa = z
  .number()
  .nullable()
  .describe(
    'Mean GPA on the 4.0 scale over the graded students, withdrawals and non-letter grades excluded; null when nobody received a letter grade',
  );

const graded = z
  .number()
  .int()
  .describe('Students who received a letter grade, the denominator of gpa');

const enrolled = z
  .number()
  .int()
  .describe(
    'Students enrolled as reported; before Fall 2017 this can exceed the sum of the grade counts by a few students the report did not categorize',
  );

export const departmentSchema = z.object({
  code: departmentCode,
  name: z.string().describe('Department name, e.g. "Computer Science"'),
});

export const courseSchema = z.object({
  id: courseId,
  title: z.string().describe('Course title, e.g. "Object-Oriented Programming II"'),
  credits: z
    .object({
      min: z.number().int().describe('Minimum credits'),
      max: z.number().int().describe('Maximum credits; equals min for a fixed-credit course'),
    })
    .describe('Credits the course is worth'),
  gen_eds: z
    .array(genEdCode)
    .describe('General education codes the course satisfies, e.g. "DSSP"; empty when none'),
  conditions: z
    .array(z.string())
    .describe(
      'Prerequisite, corequisite, restriction and credit notes, e.g. "Prerequisite: Minimum grade of C- in CMSC131."; empty when none',
    ),
  description: z.string().nullable().describe('Catalog description; null when none'),
});

export const meetingSchema = z.object({
  days: z
    .array(weekday)
    .describe('Days the meeting is held, e.g. ["M", "W", "F"]; empty when it has no fixed time'),
  start_time: z
    .string()
    .nullable()
    .describe('Start time as printed, e.g. "10:00am"; null when the meeting has no fixed time'),
  end_time: z
    .string()
    .nullable()
    .describe('End time as printed, e.g. "10:50am"; null when the meeting has no fixed time'),
  building: z
    .string()
    .nullable()
    .describe(
      'Building code, e.g. "IRB" (see testudo_soc_get_building); null for online meetings or when the room is still to be announced',
    ),
  room: z
    .string()
    .nullable()
    .describe(
      'Room number, e.g. "0324"; null for online meetings or when the room is still to be announced',
    ),
  online: z
    .boolean()
    .describe(
      'true for an online meeting, synchronous (with days and times) or asynchronous (without)',
    ),
});

export const sectionInstructorSchema = z.object({
  name: z
    .string()
    .describe('Instructor name as Testudo lists it; "Instructor: TBA" when not yet assigned'),
  slug: z
    .string()
    .nullable()
    .describe(
      'Instructor slug to pass to jupiterp_list_reviews or jupiterp_get_grade_summary; null when the instructor is not yet assigned or not matched',
    ),
});

export const sectionSchema = z.object({
  course: courseId,
  id: sectionId,
  instructors: z.array(sectionInstructorSchema).describe('Who teaches the section'),
  meetings: z.array(meetingSchema).describe('Weekly meetings of the section'),
  seats: z
    .object({
      total: z.number().int().describe('Total seats'),
      open: z.number().int().describe('Open seats'),
      waitlist: z.number().int().describe('Students on the waitlist'),
      holdfile: z
        .number()
        .int()
        .nullable()
        .describe('Students on the holdfile; null when the section has no holdfile'),
    })
    .describe('Seat counts as of the last scrape, not real time'),
});

export const instructorSchema = z.object({
  slug: z.string().describe("Jupiterp's unique identifier for the instructor"),
  name: z.string().describe('Name of the instructor'),
  average_rating: z
    .number()
    .nullable()
    .describe(
      'Average student rating on a 1-5 scale, blending PlanetTerp and Jupiterp reviews; null when there are no reviews',
    ),
  planetterp_slug: z
    .string()
    .nullable()
    .describe(
      'The same person on PlanetTerp; their page is https://planetterp.com/professor/<slug>; null when not matched',
    ),
  planetterp_rating: z
    .number()
    .nullable()
    .describe('Average rating of their PlanetTerp reviews; null when they have none'),
  planetterp_review_count: z
    .number()
    .int()
    .describe('Number of PlanetTerp reviews; 0 when not matched to PlanetTerp'),
  jupiterp_rating: z
    .number()
    .nullable()
    .describe('Average rating of reviews submitted on Jupiterp; null when there are none'),
  jupiterp_review_count: z.number().int().describe('Number of reviews submitted on Jupiterp'),
  first_term: term
    .nullable()
    .describe('First term the instructor appeared on Testudo; null when never seen there'),
  last_term: term
    .nullable()
    .describe('Latest term the instructor appeared on Testudo; null when never seen there'),
  active: z.boolean().describe('true when currently teaching at least one section'),
});

export const reviewSchema = z.object({
  id: z.string().describe('Review id'),
  instructor_slug: z.string().describe('Slug of the instructor the review is about'),
  course: courseId
    .nullable()
    .describe('Course the review was written for, e.g. "CMSC132"; null when not tied to a course'),
  term: term.nullable().describe('Term the student took the course; null when not given'),
  rating: z
    .number()
    .min(1)
    .max(5)
    .describe('Star rating the student gave, from 1 to 5 in half steps'),
  expected_grade: z
    .string()
    .nullable()
    .describe('Grade the student expected, e.g. "A", "B+"; null when not given'),
  title: z
    .string()
    .nullable()
    .describe('Review title; null for PlanetTerp reviews and untitled ones'),
  body: z.string().describe('Full text of the student review'),
  submitted_at: z.string().describe('When the review was posted, as an ISO 8601 timestamp'),
  edited_at: z
    .string()
    .nullable()
    .describe('When the review was last edited, as an ISO 8601 timestamp; null when never'),
  source: reviewSource.describe(
    '"jupiterp" for a review submitted on Jupiterp, "planetterp" for one imported from PlanetTerp',
  ),
});

export const sectionGradesSchema = z.object({
  term,
  course: courseId.describe(
    'Course id, e.g. "CMSC132"; a retired course has grades but no entry in jupiterp_list_courses',
  ),
  section: sectionId,
  instructor: z
    .string()
    .nullable()
    .describe(
      'Instructor in "First Last" order, matching jupiterp_list_instructors names; null when no section of the course named one',
    ),
  instructor_as_printed: z
    .string()
    .nullable()
    .describe(
      'Instructor exactly as the Registrar printed them, in "Last, First Middle" order; null where the release left the field blank',
    ),
  instructor_source: instructorSource
    .nullable()
    .describe(
      'How instructor was determined: "reported" on this row by the Registrar, "lead" carried from the lead section of the same lecture, "testudo" from the Schedule of Classes, or "course" carried from another offering of the course and less reliable; null when no section of the course was named',
    ),
  total: enrolled,
  graded,
  gpa,
  ...gradeCountsShape,
});

export const gradeSummarySchema = z.object({
  course: courseId
    .nullable()
    .describe('The course summed; null for the "instructor" and "instructor_term" groupings'),
  term: term
    .nullable()
    .describe('The term summed; null except for the "course_term" and "instructor_term" groupings'),
  instructor: z
    .string()
    .nullable()
    .describe("The instructor's display name; null for the course groupings"),
  instructor_slug: z
    .string()
    .nullable()
    .describe(
      'Slug to pass to jupiterp_list_reviews or jupiterp_list_instructors; null for the course groupings',
    ),
  section_count: z.number().int().describe('Sections summed'),
  course_count: z
    .number()
    .int()
    .nullable()
    .describe(
      'Distinct courses summed; null except for the "instructor" and "instructor_term" groupings',
    ),
  term_count: z
    .number()
    .int()
    .nullable()
    .describe('Distinct terms summed; null for the per-term groupings'),
  first_term: term.nullable().describe('Earliest term summed; null for the per-term groupings'),
  last_term: term.nullable().describe('Latest term summed; null for the per-term groupings'),
  total: enrolled,
  graded,
  gpa,
  ...gradeCountsShape,
});

export const gradeTermSchema = z.object({
  term,
  section_count: z.number().int().describe('Sections with grade data in the term'),
  course_count: z.number().int().describe('Distinct courses with grade data in the term'),
  total: z.number().int().describe('Students enrolled across every section'),
  graded,
  gpa: z.number().describe('Mean GPA across the whole university for the term'),
});

export type InstructorSource = z.infer<typeof instructorSource>;
export type ReviewSource = z.infer<typeof reviewSource>;
export type ReviewSort = z.infer<typeof reviewSort>;
export type Department = z.infer<typeof departmentSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Instructor = z.infer<typeof instructorSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type SectionGrades = z.infer<typeof sectionGradesSchema>;
export type GradeSummary = z.infer<typeof gradeSummarySchema>;
export type GradeTerm = z.infer<typeof gradeTermSchema>;
