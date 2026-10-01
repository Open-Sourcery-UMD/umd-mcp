import { omit } from 'lodash-es';
import { z } from 'zod';
import { courseId, delivery, departmentCode, schoolDay, sectionId, term } from '../../../common.js';
import { Integration, tool } from '../../base.js';
import {
  parseBuilding,
  parseDepartments,
  parseGenEdCategories,
  parseListing,
  parseSections,
  parseSyllabi,
  parseTerms,
  searchQuery,
  SOC_URL,
} from './parsers.js';
import {
  type Building,
  buildingCode,
  buildingSchema,
  clockTime,
  courseLevel,
  type CourseOffering,
  courseOfferingSchema,
  coursePrefix,
  type CourseSuggestion,
  courseSuggestionSchema,
  creditComparison,
  type Department,
  type DepartmentCourses,
  departmentCoursesSchema,
  departmentSchema,
  type GenEdCategory,
  genEdCategorySchema,
  genEdCode,
  type GenEdCourses,
  genEdCoursesSchema,
  type InstructorSuggestion,
  instructorSuggestionSchema,
  type Listing,
  type SearchArgs,
  type SearchResults,
  searchResultsSchema,
  type Section,
  sectionSchema,
  type Syllabus,
  syllabusSchema,
  type TeachingCenter,
  teachingCenter,
  teachingCenterOrAll,
  type Term,
  termSchema,
  timeComparison,
} from './schemas.js';

/** Every course of a listing, department grouping flattened. */
function coursesOf(listing: Listing) {
  return listing.departments.flatMap((department) => department.courses);
}

/** The site path of one course's page in a term. */
function coursePath(termId: string, courseCode: string): string {
  return `${termId}/${courseCode.slice(0, 4)}/${courseCode}`;
}

export class ScheduleOfClasses extends Integration {
  readonly name = 'testudo-soc';
  readonly baseUrl = SOC_URL;

  @tool({
    title: 'List Schedule of Classes terms',
    description:
      'Terms the UMD Schedule of Classes currently lists (about four: the current term plus the next few). Returns the term ids the other Schedule of Classes tools take. No login needed.',
    input: {},
    output: { terms: z.array(termSchema).describe('Terms in the order the site lists them') },
  })
  async list_terms(): Promise<{ terms: Term[] }> {
    return { terms: parseTerms(await this.getText('')) };
  }

  @tool({
    title: 'List departments',
    description:
      'Departments (four-letter course prefixes) offering courses in a term, from the UMD Schedule of Classes. No login needed.',
    input: { term_id: term },
    output: {
      departments: z
        .array(departmentSchema)
        .describe('Departments in alphabetical order; empty for a term the site does not list'),
    },
  })
  async list_departments({ term_id }: { term_id: string }): Promise<{ departments: Department[] }> {
    return { departments: parseDepartments(await this.getText(term_id)) };
  }

  @tool({
    title: 'List courses in a department',
    description:
      'Every course a department offers in a term, from the UMD Schedule of Classes: title, credits, grading methods, gen-ed codes, prerequisites and description. Sections are not included; call testudo_soc_get_sections or testudo_soc_get_course for those. No login needed.',
    input: { term_id: term, department: departmentCode },
    output: departmentCoursesSchema.shape,
  })
  async list_courses({
    term_id,
    department,
  }: {
    term_id: string;
    department: string;
  }): Promise<DepartmentCourses> {
    const listing = parseListing(await this.getText(`${term_id}/${department}`));
    const block = listing.departments[0];
    return {
      department: {
        code: department,
        name: block?.name ?? null,
        website: block?.website ?? null,
      },
      seats_as_of: listing.seats_as_of,
      courses: coursesOf(listing).map((course) => omit(course, 'sections')),
    };
  }

  @tool({
    title: 'Get a course with its sections',
    description:
      'One course in a term from the UMD Schedule of Classes, with every section: instructors, seat counts, meeting days, times, rooms and delivery method. No login needed.',
    input: { term_id: term, course_id: courseId },
    output: courseOfferingSchema.shape,
  })
  async get_course({
    term_id,
    course_id,
  }: {
    term_id: string;
    course_id: string;
  }): Promise<CourseOffering> {
    const listing = parseListing(await this.getText(coursePath(term_id, course_id)));
    const course = coursesOf(listing).find((candidate) => candidate.id === course_id);
    if (course === undefined) {
      throw new Error(`${this.name}: ${course_id} is not offered in term ${term_id}`);
    }
    return {
      seats_as_of: listing.seats_as_of,
      course: { ...course, sections: course.sections ?? [] },
    };
  }

  @tool({
    title: 'Get sections',
    description:
      'Sections of one or more courses in a term, from the UMD Schedule of Classes: instructors, seat counts, meeting days, times, rooms and delivery method. Seat counts are a snapshot refreshed roughly hourly, not real time. No login needed.',
    input: {
      term_id: term,
      course_ids: z
        .array(courseId)
        .min(1)
        .max(10)
        .describe('Course ids to get sections for, up to 10 per call, e.g. ["CMSC131", "CMSC132"]'),
      teaching_center: teachingCenter.optional(),
    },
    output: {
      sections: z
        .record(z.string(), z.array(sectionSchema))
        .describe(
          'Sections keyed by course id, in the order the site lists them; a course the site does not offer that term is absent',
        ),
    },
  })
  async get_sections({
    term_id,
    course_ids,
    teaching_center,
  }: {
    term_id: string;
    course_ids: string[];
    teaching_center?: TeachingCenter | undefined;
  }): Promise<{ sections: Record<string, Section[]> }> {
    const html = await this.getText(`${term_id}/sections`, {
      courseIds: [...new Set(course_ids)].join(','),
      teachingCenter: teaching_center,
    });
    return { sections: parseSections(html) };
  }

  @tool({
    title: 'Search courses',
    description:
      'Search the UMD Schedule of Classes for a term the way its search form does. Needs at least one of course_id (a department prefix, partial id or full id), instructor, or delivery; the other fields narrow the results. When the search narrows by section (instructor, days, time, delivery, open seats, credits or level) the matching sections come back inline; otherwise sections are null and testudo_soc_get_sections fetches them. No login needed.',
    input: {
      term_id: term,
      course_id: coursePrefix.optional(),
      section_id: sectionId
        .optional()
        .describe('Only this section, e.g. "0101"; use together with a full course_id'),
      instructor: z
        .string()
        .trim()
        .min(2)
        .optional()
        .describe(
          'Instructor name as testudo_soc_autocomplete_instructors returns it in `name`, e.g. "Gonzalez, Elias"',
        ),
      open_sections_only: z
        .boolean()
        .optional()
        .describe('Only sections with open seats (default false)'),
      credits: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe('Only courses whose credits satisfy credits_compare against this value, 0-4'),
      credits_compare: creditComparison,
      level: courseLevel,
      delivery: z
        .array(delivery)
        .min(1)
        .optional()
        .describe('Only sections taught in these ways (default: any)'),
      time_compare: timeComparison,
      start_time: clockTime
        .optional()
        .describe('Time for time_compare, on the quarter hour, e.g. "12:00 PM" or "9:30 AM"'),
      end_time: clockTime
        .optional()
        .describe('End of the range when time_compare is "between", e.g. "3:00 PM"'),
      days: z
        .array(schoolDay)
        .min(1)
        .optional()
        .describe('Only sections that meet on these weekdays'),
      teaching_center: teachingCenterOrAll,
    },
    output: searchResultsSchema.shape,
  })
  async search_courses(args: SearchArgs): Promise<SearchResults> {
    if (
      args.course_id === undefined &&
      args.instructor === undefined &&
      args.delivery === undefined
    ) {
      throw new Error(
        `${this.name}: testudo_soc_search_courses needs at least one of course_id, instructor or delivery`,
      );
    }
    if (args.time_compare !== undefined && args.start_time === undefined) {
      throw new Error(`${this.name}: time_compare needs start_time`);
    }
    if (args.time_compare === 'between' && args.end_time === undefined) {
      throw new Error(`${this.name}: time_compare "between" needs end_time`);
    }
    const listing = parseListing(await this.getText('search', searchQuery(args)));
    return {
      seats_as_of: listing.seats_as_of,
      message: listing.message,
      courses: coursesOf(listing),
    };
  }

  @tool({
    title: 'Autocomplete course ids',
    description:
      'Course ids and titles in a term whose id starts with the given text, from the UMD Schedule of Classes autocomplete. The cheapest way to find what a department offers or to resolve a partial course id. No login needed.',
    input: {
      term_id: term,
      query: z
        .string()
        .trim()
        .min(1)
        .describe('Start of a course id, e.g. "CMSC" (all CMSC courses) or "CMSC13"'),
    },
    output: {
      courses: z
        .array(courseSuggestionSchema)
        .describe('Courses offered that term whose id starts with the query'),
    },
  })
  async autocomplete_courses({
    term_id,
    query,
  }: {
    term_id: string;
    query: string;
  }): Promise<{ courses: CourseSuggestion[] }> {
    const { results } = await this.get<{ results: CourseSuggestion[] }>('autocomplete/course', {
      termId: term_id,
      searchString: query,
    });
    return { courses: results };
  }

  @tool({
    title: 'Autocomplete instructors',
    description:
      'Instructors teaching in a term whose last or first name contains the given text, from the UMD Schedule of Classes autocomplete. Pass the returned `name` as the instructor to testudo_soc_search_courses. No login needed.',
    input: {
      term_id: term,
      query: z
        .string()
        .trim()
        .min(2)
        .describe('Part of a last or first name, at least two characters, e.g. "gonz"'),
    },
    output: {
      instructors: z.array(instructorSuggestionSchema).describe('Matching instructors'),
    },
  })
  async autocomplete_instructors({
    term_id,
    query,
  }: {
    term_id: string;
    query: string;
  }): Promise<{ instructors: InstructorSuggestion[] }> {
    const { results } = await this.get<{ results: InstructorSuggestion[] }>(
      'autocomplete/instructor',
      { termId: term_id, searchString: query },
    );
    return { instructors: results };
  }

  @tool({
    title: 'List gen-ed categories',
    description:
      'The general education categories and requirement codes (FSAW, DSHS, DVUP, ...) the UMD Schedule of Classes lists for a term. No login needed.',
    input: {
      term_id: term.optional().describe('Term to list for (default: the newest term)'),
    },
    output: {
      categories: z
        .array(genEdCategorySchema)
        .describe('Categories in the order the site lists them'),
    },
  })
  async list_gen_ed_categories({
    term_id,
  }: {
    term_id?: string | undefined;
  }): Promise<{ categories: GenEdCategory[] }> {
    return { categories: parseGenEdCategories(await this.getText(`gen-ed/${term_id ?? ''}`)) };
  }

  @tool({
    title: 'List gen-ed courses',
    description:
      'Courses fulfilling one general education requirement in a term, from the UMD Schedule of Classes. Sections are not included; call testudo_soc_get_sections for those. No login needed.',
    input: { term_id: term, code: genEdCode },
    output: genEdCoursesSchema.shape,
  })
  async list_gen_ed_courses({
    term_id,
    code,
  }: {
    term_id: string;
    code: string;
  }): Promise<GenEdCourses> {
    const listing = parseListing(await this.getText(`gen-ed/${term_id}/${code}`));
    return {
      seats_as_of: listing.seats_as_of,
      courses: coursesOf(listing).map((course) => omit(course, 'sections')),
    };
  }

  @tool({
    title: 'List syllabi',
    description:
      'Past syllabi on file for a course in the UMD Schedule of Classes syllabus repository: the term and instructor of each. The PDFs themselves need a UMD login. No login needed for the list.',
    input: { term_id: term, course_id: courseId },
    output: {
      syllabi: z
        .array(syllabusSchema)
        .describe('Syllabi on file, newest first as the site lists them'),
    },
  })
  async list_syllabi({
    term_id,
    course_id,
  }: {
    term_id: string;
    course_id: string;
  }): Promise<{ syllabi: Syllabus[] }> {
    return {
      syllabi: parseSyllabi(await this.getText(`${coursePath(term_id, course_id)}/syllabus`)),
    };
  }

  @tool({
    title: 'Get a building',
    description:
      'Look up a classroom building by the building code and room number a section lists (e.g. "IRB" "0324"): full name, campus building number and map links. No login needed.',
    input: {
      building: buildingCode,
      room: z
        .string()
        .trim()
        .min(1)
        .describe('Room number as shown on the section, e.g. "0324"; the lookup needs one'),
    },
    output: buildingSchema.shape,
  })
  async get_building({ building, room }: { building: string; room: string }): Promise<Building> {
    const html = await this.getText(`buildings/${encodeURIComponent(`${building} ${room}`)}`);
    const parsed = parseBuilding(html);
    if (parsed === undefined) {
      throw new Error(`${this.name}: no building "${building}" room "${room}"`);
    }
    return parsed;
  }
}
