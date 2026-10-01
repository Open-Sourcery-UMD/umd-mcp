import { uniq } from 'lodash-es';
import { z } from 'zod';
import { courseId, departmentCode, term } from '../../common.js';

export const PROFESSOR_TYPES = ['professor', 'ta'] as const;

/**
 * PlanetTerp stores sections as Testudo prints them ("0101") through Spring 2022 and without
 * the leading zero ("101") from Fall 2022 on; the tools query both spellings.
 */
export const sectionNumber = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,4}$/, 'Expected a section number like 0101')
  .describe('Section number, e.g. "0101" or "101"; both spellings find the same section');

/** Both spellings of a section number, "101" and "0101", without repeats. */
export function sectionSpellings(section: string): string[] {
  return uniq([section.replace(/^0+(?=\d)/, ''), section.padStart(4, '0')]);
}

export const professorType = z.enum(PROFESSOR_TYPES);

export const reviewSchema = z.object({
  professor: z.string().describe('Name of the professor the review is about'),
  course: courseId
    .nullable()
    .describe(
      'Course code the review was written for, e.g. "CMSC131"; null when it was not tied to a course',
    ),
  review: z.string().describe('Full text of the student review'),
  rating: z.number().int().min(1).max(5).describe('Star rating the student gave, from 1 to 5'),
  expected_grade: z
    .string()
    .describe('Grade the student expected, e.g. "A", "B+"; empty string when not given'),
  created: z.string().describe('When the review was posted, as an ISO 8601 timestamp'),
});

export const courseSchema = z.object({
  department: departmentCode,
  course_number: z.string().describe('Course number within the department, e.g. "131"'),
  name: courseId.describe('Full course code, e.g. "CMSC131"'),
  title: z
    .string()
    .nullable()
    .describe('Course title, e.g. "Object-Oriented Programming I"; null when unknown'),
  credits: z
    .number()
    .int()
    .nullable()
    .describe('Number of credits the course is worth; null when unknown'),
  description: z
    .string()
    .nullable()
    .describe('Catalog description of the course, which may contain HTML tags; null when none'),
  average_gpa: z
    .number()
    .nullable()
    .describe(
      'Average GPA across all recorded sections, on a 4.0 scale; null when there is no grade data',
    ),
  professors: z
    .array(z.string())
    .describe(
      'Names of professors who have taught this course; a name repeats once per section taught',
    ),
  reviews: z.array(reviewSchema).describe('Student reviews of professors, written for this course'),
});

export const professorSchema = z.object({
  name: z.string().describe('Name of the professor'),
  slug: z
    .string()
    .describe(
      "PlanetTerp's unique identifier for the professor; their page is https://planetterp.com/professor/<slug>",
    ),
  type: professorType.describe(
    '"ta" when this person is a teaching assistant, "professor" otherwise',
  ),
  courses: z
    .array(courseId)
    .describe('Courses this professor has taught; a code repeats once per section taught'),
  average_rating: z
    .number()
    .nullable()
    .describe('Average student rating, on a 1-5 scale; null when the professor has no reviews'),
  reviews: z.array(reviewSchema).describe('Student reviews of this professor'),
});

const gradeCount = (grade: string) =>
  z.number().int().describe(`Number of students in the section who received ${grade}`);

export const gradesSchema = z.object({
  course: courseId,
  professor: z
    .string()
    .nullable()
    .describe(
      'Name of the professor who taught the section; null when PlanetTerp has none on record',
    ),
  semester: term,
  section: sectionNumber.describe(
    'Section number as PlanetTerp recorded it: "0101" through Spring 2022, "101" from Fall 2022',
  ),
  'A+': gradeCount('an A+'),
  A: gradeCount('an A'),
  'A-': gradeCount('an A-'),
  'B+': gradeCount('a B+'),
  B: gradeCount('a B'),
  'B-': gradeCount('a B-'),
  'C+': gradeCount('a C+'),
  C: gradeCount('a C'),
  'C-': gradeCount('a C-'),
  'D+': gradeCount('a D+'),
  D: gradeCount('a D'),
  'D-': gradeCount('a D-'),
  F: gradeCount('an F'),
  W: gradeCount('a W (withdrew)'),
  Other: gradeCount('some other grade, e.g. pass/fail or incomplete'),
});

export const searchResultSchema = z.object({
  name: z.string().describe('Course code (e.g. "CMSC131") or professor name'),
  slug: z
    .string()
    .describe(
      'Identifier to pass to planetterp_get_course or planetterp_get_professor; equals the name for courses',
    ),
  type: z.enum(['professor', 'course']).describe('Whether this result is a professor or a course'),
});

export type ProfessorType = z.infer<typeof professorType>;
export type Course = z.infer<typeof courseSchema>;
export type Professor = z.infer<typeof professorSchema>;
export type Grades = z.infer<typeof gradesSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
