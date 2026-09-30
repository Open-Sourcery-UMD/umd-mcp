import { z } from 'zod';
import { courseId, departmentCode, pagination, term } from '../../common.js';
import { Integration, tool } from '../base.js';
import {
  type Course,
  courseSchema,
  type Grades,
  gradesSchema,
  type Professor,
  professorSchema,
  type ProfessorType,
  professorType,
  type SearchResult,
  searchResultSchema,
  sectionNumber,
} from './schemas.js';

export class PlanetTerp extends Integration {
  readonly name = 'planetterp';
  readonly baseUrl = 'https://planetterp.com/api/v1';

  @tool({
    title: 'Get a course',
    description:
      'Look up a UMD course by its code on PlanetTerp. Returns catalog information, the average GPA, professors who have taught it, and student reviews written for it. No login needed.',
    input: { course: courseId },
    output: courseSchema.shape,
  })
  async get_course({ course }: { course: string }): Promise<Course> {
    return this.get<Course>('course', { name: course, reviews: true });
  }

  @tool({
    title: 'List courses',
    description:
      'List UMD courses on PlanetTerp in alphabetical order, optionally within one department. No login needed.',
    input: {
      department: departmentCode
        .optional()
        .describe(
          'Only list courses in this four-letter department, e.g. "CMSC" (default: all departments)',
        ),
      ...pagination(100),
    },
    output: { courses: z.array(courseSchema).describe('Courses matching the query') },
  })
  async list_courses({
    department,
    limit,
    offset,
  }: {
    department?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<{ courses: Course[] }> {
    const courses = await this.get<Course[]>('courses', {
      department,
      limit,
      offset,
      reviews: true,
    });
    return { courses };
  }

  @tool({
    title: 'Get a professor',
    description:
      'Look up a UMD professor or teaching assistant by name on PlanetTerp. Returns the courses they have taught, their average rating, and student reviews. No login needed.',
    input: {
      name: z.string().trim().min(1).describe('Name of the professor, e.g. "Jon Snow"'),
    },
    output: professorSchema.shape,
  })
  async get_professor({ name }: { name: string }): Promise<Professor> {
    return this.get<Professor>('professor', { name, reviews: true });
  }

  @tool({
    title: 'List professors',
    description:
      'List UMD professors and teaching assistants on PlanetTerp in alphabetical order. No login needed.',
    input: {
      type: professorType
        .optional()
        .describe(
          'Only list professors ("professor") or teaching assistants ("ta"); default: both',
        ),
      ...pagination(100),
    },
    output: {
      professors: z.array(professorSchema).describe('Professors matching the query'),
    },
  })
  async list_professors({
    type,
    limit,
    offset,
  }: {
    type?: ProfessorType | undefined;
    limit: number;
    offset: number;
  }): Promise<{ professors: Professor[] }> {
    const professors = await this.get<Professor[]>('professors', {
      type,
      limit,
      offset,
      reviews: true,
    });
    return { professors };
  }

  @tool({
    title: 'Get grades',
    description:
      'Grade distributions from PlanetTerp for a course, a professor, or both, broken down by section. At least one of course or professor is required; semester and section narrow the result. No login needed.',
    input: {
      course: courseId.optional().describe('Only include grades for this course, e.g. "MATH140"'),
      professor: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Only include grades for sections taught by this professor, e.g. "Jon Snow"'),
      semester: term.optional(),
      section: sectionNumber
        .optional()
        .describe('Only include this section, e.g. "101" or "0101" (default: all sections)'),
    },
    output: {
      grades: z.array(gradesSchema).describe('One entry per section matching the query'),
    },
  })
  async get_grades({
    course,
    professor,
    semester,
    section,
  }: {
    course?: string | undefined;
    professor?: string | undefined;
    semester?: string | undefined;
    section?: string | undefined;
  }): Promise<{ grades: Grades[] }> {
    if (course === undefined && professor === undefined) {
      throw new Error(
        `${this.name}: planetterp_get_grades needs at least one of course or professor`,
      );
    }
    const grades = await this.get<Grades[]>('grades', {
      course,
      professor,
      semester,
      section: section?.replace(/^0+(?=\d)/, ''),
    });
    return { grades };
  }

  @tool({
    title: 'Search',
    description:
      'Search PlanetTerp for courses and professors whose code or name contains the query, as the site search bar does. Use this to find the exact course code or professor name before calling planetterp_get_course or planetterp_get_professor. No login needed.',
    input: {
      query: z.string().trim().min(1).describe('Text to search for, e.g. "CMSC13" or "Snow"'),
      ...pagination(30),
    },
    output: {
      results: z.array(searchResultSchema).describe('Courses and professors matching the query'),
    },
  })
  async search({
    query,
    limit,
    offset,
  }: {
    query: string;
    limit: number;
    offset: number;
  }): Promise<{ results: SearchResult[] }> {
    const results = await this.get<SearchResult[]>('search', { query, limit, offset });
    return { results };
  }
}
