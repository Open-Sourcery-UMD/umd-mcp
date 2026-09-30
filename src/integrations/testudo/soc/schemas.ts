import { z } from 'zod';
import {
  courseId,
  delivery,
  departmentCode,
  meetingType,
  sectionId,
  weekday,
  term,
} from '../../../common.js';

/** Locations and programs the site calls "teaching centers", with the code the query takes. */
export const TEACHING_CENTERS = {
  ALL: 'all locations and programs',
  '*': 'College Park campus',
  DC: 'District of Columbia',
  FS: 'Frostburg State',
  HG: 'Hagerstown',
  HT: 'Heat Center, Harford County',
  RB: 'Reagan Building',
  SG: 'Shady Grove',
  SM: 'Southern Maryland',
  BA: 'University of Maryland, Baltimore',
  FC: 'Freshmen Connection',
  PP: 'Professional Programs, face to face',
  OF: 'Professional Programs, online',
  LS: 'Science in the Evening',
  SE: 'Universities at Shady Grove / EDUC',
} as const;

export type TeachingCenter = keyof typeof TEACHING_CENTERS;

export const teachingCenter = z.enum(Object.keys(TEACHING_CENTERS) as TeachingCenter[]).describe(
  `Only sections taught at this location or in this program: ${Object.entries(TEACHING_CENTERS)
    .map(([code, name]) => `"${code}" ${name}`)
    .join(', ')} (default "ALL")`,
);

export const clockTime = z
  .string()
  .trim()
  .regex(/^(1[0-2]|0?[1-9]):(00|15|30|45)\s?(am|pm)$/i, 'Expected a time like "12:00 PM"');

/** A department prefix, partial course id or full course id, as the search form accepts. */
export const coursePrefix = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{1,4}\d{0,3}[A-Za-z]?$/, 'Expected a course id or prefix like CMSC13')
  .toUpperCase()
  .describe(
    'Department prefix ("CMSC"), partial id ("CMSC13") or full course id ("CMSC131") to match',
  );

export const genEdCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{4}$/, 'Expected a gen-ed code like DSNL')
  .toUpperCase()
  .describe('General education code from testudo_soc_list_gen_ed_categories, e.g. "DSNL"');

export const buildingCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{2,6}$/, 'Expected a building code like IRB')
  .toUpperCase()
  .describe('Building code as shown on a section, e.g. "IRB"');

export const CREDIT_COMPARISONS = ['>=', '=', '<='] as const;

export const COURSE_LEVELS = ['ALL', 'UGRAD', 'GRAD'] as const;

export const TIME_COMPARISONS = ['after', 'at', 'before', 'between'] as const;

const seatsAsOf = z
  .string()
  .nullable()
  .describe(
    'When the seat counts on this page were last refreshed, as YYYY-MM-DDTHH:MM in US Eastern time (roughly hourly); null if the page does not say',
  );

const requirementText = (label: string) =>
  z.string().nullable().describe(`The catalog's "${label}" note; null if there is none`);

export const termSchema = z.object({
  id: term.describe('Term id to pass to the other tools, e.g. "202608"'),
  name: z.string().describe('Term name, e.g. "Fall 2026"'),
  default: z.boolean().describe('true for the term the site currently selects by default'),
});

export const departmentSchema = z.object({
  code: departmentCode,
  name: z.string().describe('Department name, e.g. "African American and Africana Studies"'),
});

export const genEdSchema = z.object({
  code: z.string().describe('General education code, e.g. "FSAW"'),
  name: z
    .string()
    .describe('Category and requirement, e.g. "Fundamental Studies - Academic Writing"'),
});

export const courseSchema = z.object({
  id: courseId,
  title: z.string().describe('Course title, e.g. "Object-Oriented Programming I"'),
  credits: z
    .object({
      min: z.number().describe('Minimum credits'),
      max: z.number().describe('Maximum credits; equals min for a fixed-credit course'),
    })
    .describe('Credits the course is worth'),
  grading_methods: z
    .array(z.string())
    .describe('Grading methods allowed, e.g. "Regular", "Pass-Fail", "Audit", "Sat-Fail"'),
  gen_ed: z.array(genEdSchema).describe('General education requirements the course fulfills'),
  permission_required: z
    .boolean()
    .describe('true when the department must grant permission to register'),
  individual_instruction: z
    .boolean()
    .describe(
      'true for individual-instruction courses (independent study, research) where the department must be contacted to register',
    ),
  description: z.string().nullable().describe('Catalog description; null if none'),
  prerequisite: requirementText('Prerequisite'),
  corequisite: requirementText('Corequisite'),
  recommended: requirementText('Recommended'),
  restriction: requirementText('Restriction'),
  credit_only_granted_for: requirementText('Credit only granted for'),
  formerly: requirementText('Formerly'),
  cross_listed_with: requirementText('Cross-listed with'),
  also_offered_as: requirementText('Also offered as'),
  additional_information: requirementText('Additional information'),
  notes: z
    .array(z.string())
    .describe('Term-specific notes for the course, e.g. special-topics blurbs or placement advice'),
  syllabus_count: z
    .number()
    .int()
    .describe('Number of past syllabi in the syllabus repository (see testudo_soc_list_syllabi)'),
});

export const meetingSchema = z.object({
  type: meetingType.describe('"lecture" for the main meeting, else "discussion" or "lab"'),
  days: z.array(weekday).describe('Days the meeting is held, e.g. ["M", "W", "F"]'),
  start_time: z
    .string()
    .nullable()
    .describe('Start time as printed, e.g. "10:00am"; null if not set'),
  end_time: z.string().nullable().describe('End time as printed, e.g. "10:50am"; null if not set'),
  building: z
    .string()
    .nullable()
    .describe(
      'Building code, e.g. "IRB" (see testudo_soc_get_building); null for online or unassigned meetings',
    ),
  room: z
    .string()
    .nullable()
    .describe('Room number, e.g. "0324"; "ONLINE" for online meetings; null if unassigned'),
  time_on_elms: z
    .boolean()
    .describe(
      'true when the meeting has no fixed time and the section says "Class time/details on ELMS"',
    ),
});

export const sectionSchema = z.object({
  id: sectionId,
  instructors: z.array(z.string()).describe('Instructor names; empty when still to be announced'),
  delivery: delivery.describe('How the section is taught'),
  seats: z
    .object({
      total: z.number().int().describe('Total seats'),
      open: z.number().int().describe('Open seats'),
      waitlist: z.number().int().nullable().describe('Students on the waitlist; null if not shown'),
    })
    .describe('Seat counts as of the last refresh, not real time'),
  meetings: z.array(meetingSchema).describe('Weekly meetings of the section'),
  notes: z
    .array(z.string())
    .describe('Section notes, e.g. "Restricted to students in Freshmen Connection."'),
});

export const courseWithSectionsSchema = courseSchema.extend({
  sections: z.array(sectionSchema).describe('Sections offered this term'),
});

export const searchResultSchema = courseSchema.extend({
  sections: z
    .array(sectionSchema)
    .nullable()
    .describe(
      'Matching sections when the search narrowed by section (instructor, day, time, delivery, open seats, credits or level); null when sections were not loaded, in which case call testudo_soc_get_sections',
    ),
});

export const genEdCategorySchema = z.object({
  name: z.string().describe('Category name, e.g. "Fundamental Studies"'),
  requirements: z.array(genEdSchema).describe('Requirements in the category, with their codes'),
});

export const syllabusSchema = z.object({
  term: z.string().describe('Term the syllabus is from, e.g. "2017 Fall"'),
  instructor: z.string().describe('Instructor who taught that offering'),
  url: z.string().describe('PDF link; downloading it requires a UMD login'),
});

export const buildingSchema = z.object({
  name: z.string().describe('Building name, e.g. "Brendan Iribe Center"'),
  code: z.string().describe('Building code, e.g. "IRB"'),
  number: z.string().nullable().describe('Campus building number, e.g. "432"'),
  room: z.string().nullable().describe('Room number as given, e.g. "0324"'),
  campus_map_url: z.string().nullable().describe('Link to the building on the UMD campus map'),
  google_maps_url: z.string().nullable().describe('Link to the building on Google Maps'),
  room_info_url: z.string().nullable().describe('Link to the room in 25Live'),
  picture_url: z.string().nullable().describe('Photo of the building'),
});

export const departmentCoursesSchema = z.object({
  department: departmentSchema
    .extend({
      name: z.string().nullable().describe('Department name; null if the site lists nothing'),
      website: z.string().nullable().describe("The department's own website, if linked"),
    })
    .describe('The department'),
  seats_as_of: seatsAsOf,
  courses: z
    .array(courseSchema)
    .describe('Courses in catalog order; empty when the department offers none that term'),
});

export const courseOfferingSchema = z.object({
  seats_as_of: seatsAsOf,
  course: courseWithSectionsSchema.describe('The course and its sections'),
});

export const searchResultsSchema = z.object({
  seats_as_of: seatsAsOf,
  message: z
    .string()
    .nullable()
    .describe(
      'Message the site shows instead of results, e.g. that no courses matched or that the search needs more criteria; null when there are results',
    ),
  courses: z
    .array(searchResultSchema)
    .describe('Matching courses grouped by department, in catalog order'),
});

export const genEdCoursesSchema = z.object({
  seats_as_of: seatsAsOf,
  courses: z
    .array(courseSchema)
    .describe('Courses grouped by department, in catalog order; empty for an unknown code'),
});

export const courseSuggestionSchema = z.object({
  id: courseId,
  name: z.string().describe('Course title'),
});

export const instructorSuggestionSchema = z.object({
  id: z.string().describe('Site identifier, e.g. "GONZALEZ,ELIASJONATAN"'),
  name: z
    .string()
    .describe('Display name to pass to testudo_soc_search_courses, e.g. "Gonzalez, Elias"'),
});

export type Term = z.infer<typeof termSchema>;
export type Department = z.infer<typeof departmentSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type GenEdCategory = z.infer<typeof genEdCategorySchema>;
export type Syllabus = z.infer<typeof syllabusSchema>;
export type Building = z.infer<typeof buildingSchema>;
export type DepartmentCourses = z.infer<typeof departmentCoursesSchema>;
export type CourseOffering = z.infer<typeof courseOfferingSchema>;
export type SearchResults = z.infer<typeof searchResultsSchema>;
export type GenEdCourses = z.infer<typeof genEdCoursesSchema>;
export type CourseSuggestion = z.infer<typeof courseSuggestionSchema>;
export type InstructorSuggestion = z.infer<typeof instructorSuggestionSchema>;

/** A parsed course listing page (department, gen-ed, search or single-course). */
export type Listing = {
  seats_as_of: string | null;
  message: string | null;
  departments: {
    code: string;
    name: string;
    website: string | null;
    courses: SearchResult[];
  }[];
};
