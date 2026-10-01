import { addDays, format, parseISO } from 'date-fns';
import parseLinkHeader from 'parse-link-header';
import { z } from 'zod';
import { isoDate, limit, today } from '../../common.js';
import { type Fetcher, HttpError, type Query } from '../../lib/http.js';
import { htmlToTextOrNull } from '../../lib/html.js';
import { trimmed } from '../../lib/text.js';
import { Integration, tool } from '../base.js';
import {
  type RawActivity,
  type RawAnnouncement,
  type RawAssignment,
  type RawConversation,
  type RawCourse,
  type RawEnrollment,
  type RawEvent,
  type RawModule,
  type RawPage,
  type RawPlannerItem,
  type RawSubmission,
  type RawTab,
  type RawTodo,
  type RawUser,
  hasTodoItem,
  SITE,
  toActivityItem,
  toAnnouncement,
  toAssignment,
  toConversation,
  toCourse,
  toEnrollment,
  toMessages,
  toModule,
  toPlannerItem,
  toSubmission,
  toTab,
  toTodoItem,
  toUpcomingEvent,
  toUser,
} from './mappers.js';
import {
  type ActivityItem,
  activityItemSchema,
  type Announcement,
  announcementSchema,
  type Assignment,
  type AssignmentBucket,
  assignmentBucket,
  assignmentSchema,
  canvasId,
  type Conversation,
  type ConversationDetail,
  conversationDetailSchema,
  conversationSchema,
  type ConversationScope,
  conversationScope,
  type Course,
  type CourseDetail,
  courseDetailSchema,
  courseIdInput,
  courseSchema,
  type CourseState,
  courseState,
  type Enrollment,
  enrollmentSchema,
  type Module,
  moduleSchema,
  type PlannerItem,
  plannerItemSchema,
  type Submission,
  submissionSchema,
  type TodoItem,
  todoItemSchema,
  type UpcomingEvent,
  upcomingEventSchema,
  type User,
  userSchema,
} from './schemas.js';

/** Pages of `PAGE_SIZE` items fetched at most per listing call. */
const MAX_PAGES = 10;

const PAGE_SIZE = 50;

/** How far elms_list_announcements looks back and elms_get_planner looks ahead by default. */
const DEFAULT_WINDOW_DAYS = 14;

/** `date` plus `days` (negative for earlier), as YYYY-MM-DD. */
function plusDays(date: string, days: number): string {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd');
}

/** `days` from today in College Park, as YYYY-MM-DD. */
function fromToday(days: number): string {
  return plusDays(today(), days);
}

/** Strips the `while(1);` prefix Canvas puts on cookie-session JSON responses. */
async function canvasJson<T>(res: Response): Promise<T> {
  return JSON.parse((await res.text()).replace(/^while\(1\);/, '')) as T;
}

export class Elms extends Integration {
  readonly name = 'elms';
  readonly baseUrl = `${SITE}/api/v1`;
  override readonly service = {
    name: 'elms',
    loginUrl: `${SITE}/login/saml`,
  };

  /**
   * Requests carry `CANVAS_TOKEN` as a bearer token when it is set (no browser sign-in needed);
   * otherwise they go through the SAML session's cookies.
   */
  protected override get fetcher(): Fetcher {
    const token = trimmed(process.env['CANVAS_TOKEN']);
    if (token === null) return super.fetcher;
    return (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    };
  }

  /**
   * Fetches a Canvas resource. Array parameters are spelled the way Canvas wants them,
   * `include[]=a&include[]=b`, by keying them `'include[]'`.
   */
  private canvasRequest(path: string, query: Query): Promise<Response> {
    return this.request(path, query, { headers: { accept: 'application/json' } });
  }

  /** GET one JSON resource. */
  private async json<T>(path: string, query: Query = {}): Promise<T> {
    return canvasJson<T>(await this.canvasRequest(path, query));
  }

  /** GET every page of a list resource, following `Link: rel="next"` up to `pages`. */
  private async list<T>(path: string, query: Query = {}, pages = MAX_PAGES): Promise<T[]> {
    const items: T[] = [];
    let res = await this.canvasRequest(path, { per_page: PAGE_SIZE, ...query });
    for (let page = 1; ; page++) {
      items.push(...(await canvasJson<T[]>(res)));
      const next = parseLinkHeader(res.headers.get('link'))?.['next']?.url;
      if (next === undefined || page >= pages) return items;
      res = await this.fetcher(next, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new HttpError(res.status, next);
    }
  }

  /** Like `json`, but null when the resource is disabled for the course (403/404). */
  private async optional<T>(path: string, query: Query = {}): Promise<T | null> {
    try {
      return await this.json<T>(path, query);
    } catch (error) {
      if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
        return null;
      }
      throw error;
    }
  }

  @tool({
    title: 'Who am I on ELMS',
    description:
      'The signed-in user as ELMS (Canvas) knows them: name, login id, email and time zone. Requires login.',
    input: {},
    output: userSchema.shape,
  })
  async whoami(): Promise<User> {
    const [user, profile] = await Promise.all([
      this.json<RawUser>('users/self'),
      this.optional<RawUser>('users/self/profile'),
    ]);
    return toUser(user, profile);
  }

  @tool({
    title: 'List ELMS courses',
    description:
      "The signed-in student's courses on ELMS (Canvas) with term, instructors and current grade standing. Course ids are what the other ELMS tools take. Requires login.",
    input: { state: courseState },
    output: { courses: z.array(courseSchema).describe('Courses as Canvas orders them') },
  })
  async list_courses({ state }: { state: CourseState }): Promise<{ courses: Course[] }> {
    const courses = await this.list<RawCourse>('users/self/courses', {
      'include[]': ['term', 'total_scores', 'teachers'],
      ...(state === 'all' ? {} : { enrollment_state: state }),
    });
    return { courses: courses.map(toCourse) };
  }

  @tool({
    title: 'Get an ELMS course',
    description:
      'One ELMS (Canvas) course with its syllabus, front page and the navigation tabs enabled for it, so you know which of assignments, modules, announcements, files or external tools (Zoom, Piazza, Gradescope) exist. Requires login.',
    input: { course_id: courseIdInput },
    output: courseDetailSchema.shape,
  })
  async get_course({ course_id }: { course_id: number }): Promise<CourseDetail> {
    const [course, frontPage, tabs] = await Promise.all([
      this.json<RawCourse>(`courses/${course_id}`, {
        'include[]': ['syllabus_body', 'term', 'teachers', 'total_scores'],
      }),
      this.optional<RawPage>(`courses/${course_id}/front_page`),
      this.optional<RawTab[]>(`courses/${course_id}/tabs`),
    ]);
    return {
      ...toCourse(course),
      syllabus: htmlToTextOrNull(course.syllabus_body),
      front_page:
        frontPage === null
          ? null
          : {
              title: frontPage.title ?? '',
              body: htmlToTextOrNull(frontPage.body),
              updated_at: frontPage.updated_at ?? null,
            },
      tabs: (tabs ?? []).map(toTab),
    };
  }

  @tool({
    title: 'List ELMS assignments',
    description:
      'Assignments in an ELMS (Canvas) course, ordered by due date, each with the signed-in student\'s submission status and score. Narrow with a bucket such as "upcoming" or "unsubmitted". Requires login.',
    input: { course_id: courseIdInput, bucket: assignmentBucket },
    output: { assignments: z.array(assignmentSchema) },
  })
  async list_assignments({
    course_id,
    bucket,
  }: {
    course_id: number;
    bucket?: AssignmentBucket | undefined;
  }): Promise<{ assignments: Assignment[] }> {
    const assignments = await this.list<RawAssignment>(`courses/${course_id}/assignments`, {
      'include[]': ['submission'],
      order_by: 'due_at',
      ...(bucket === undefined ? {} : { bucket }),
    });
    return { assignments: assignments.map((raw) => toAssignment(raw, course_id)) };
  }

  @tool({
    title: 'Get an ELMS submission',
    description:
      "The signed-in student's submission for one ELMS (Canvas) assignment: status, score, grade and any instructor comments. Requires login.",
    input: {
      course_id: courseIdInput,
      assignment_id: canvasId.describe('Canvas assignment id, from elms_list_assignments'),
    },
    output: submissionSchema.shape,
  })
  async get_submission({
    course_id,
    assignment_id,
  }: {
    course_id: number;
    assignment_id: number;
  }): Promise<Submission> {
    const submission = await this.json<RawSubmission>(
      `courses/${course_id}/assignments/${assignment_id}/submissions/self`,
      { 'include[]': ['submission_comments'] },
    );
    return toSubmission(submission);
  }

  @tool({
    title: 'Get ELMS grades',
    description:
      "The signed-in student's current and final scores in every ELMS (Canvas) course they are enrolled in, or in one course. Requires login.",
    input: {
      course_id: courseIdInput.optional().describe('Only this course (default: all enrollments)'),
    },
    output: { enrollments: z.array(enrollmentSchema) },
  })
  async get_grades({
    course_id,
  }: {
    course_id?: number | undefined;
  }): Promise<{ enrollments: Enrollment[] }> {
    // `users/self/enrollments` ignores a `course_id` parameter, so the course is picked here.
    const enrollments = await this.list<RawEnrollment>('users/self/enrollments');
    return {
      enrollments: enrollments
        .filter(
          (raw): raw is RawEnrollment & { course_id: number } =>
            raw.course_id !== undefined && (course_id === undefined || raw.course_id === course_id),
        )
        .map(toEnrollment),
    };
  }

  @tool({
    title: 'List ELMS modules',
    description:
      'The modules of an ELMS (Canvas) course with their items (assignments, files, pages, links) and completion state. File items carry the link to lecture slides even when the Files tab is hidden. Requires login.',
    input: { course_id: courseIdInput },
    output: { modules: z.array(moduleSchema).describe('Modules in course order') },
  })
  async list_modules({ course_id }: { course_id: number }): Promise<{ modules: Module[] }> {
    const modules = await this.list<RawModule>(`courses/${course_id}/modules`, {
      'include[]': ['items', 'content_details'],
    });
    return { modules: modules.map(toModule) };
  }

  @tool({
    title: 'List ELMS announcements',
    description:
      'Announcements posted in one or more ELMS (Canvas) courses within a date window (default: the last 14 days). Requires login.',
    input: {
      course_ids: z
        .array(courseIdInput)
        .min(1)
        .max(20)
        .describe('Courses to read announcements from, up to 20'),
      start_date: isoDate.optional().describe('Earliest post date (default: 14 days ago)'),
      end_date: isoDate.optional().describe('Latest post date (default: today)'),
    },
    output: { announcements: z.array(announcementSchema).describe('Newest first') },
  })
  async list_announcements({
    course_ids,
    start_date,
    end_date,
  }: {
    course_ids: number[];
    start_date?: string | undefined;
    end_date?: string | undefined;
  }): Promise<{ announcements: Announcement[] }> {
    const announcements = await this.list<RawAnnouncement>('announcements', {
      'context_codes[]': course_ids.map((id) => `course_${id}`),
      start_date: start_date ?? fromToday(-DEFAULT_WINDOW_DAYS),
      end_date: end_date ?? today(),
    });
    return { announcements: announcements.map(toAnnouncement) };
  }

  @tool({
    title: 'Get ELMS to-do list',
    description:
      'Assignments and classic quizzes the signed-in student still needs to submit, as ELMS (Canvas) lists them in the to-do sidebar. Requires login.',
    input: {},
    output: { items: z.array(todoItemSchema) },
  })
  async get_todo(): Promise<{ items: TodoItem[] }> {
    const items = await this.list<RawTodo>('users/self/todo');
    return { items: items.filter(hasTodoItem).map(toTodoItem) };
  }

  @tool({
    title: 'Get ELMS planner',
    description:
      'Everything due or happening for the signed-in student across all ELMS (Canvas) courses in a date range (default: the next 14 days): assignments, quizzes, announcements, events and notes, with submission status. The best single "what\'s due" feed. Requires login.',
    input: {
      start_date: isoDate.optional().describe('First day to include (default: today)'),
      end_date: isoDate.optional().describe('Last day to include (default: 14 days from today)'),
    },
    output: { items: z.array(plannerItemSchema).describe('In date order') },
  })
  async get_planner({
    start_date,
    end_date,
  }: {
    start_date?: string | undefined;
    end_date?: string | undefined;
  }): Promise<{ items: PlannerItem[] }> {
    // Canvas reads `end_date` as the start of that day, so the day after keeps it inclusive.
    const items = await this.list<RawPlannerItem>('planner/items', {
      start_date: start_date ?? today(),
      end_date: plusDays(end_date ?? fromToday(DEFAULT_WINDOW_DAYS), 1),
    });
    return { items: items.map(toPlannerItem) };
  }

  @tool({
    title: 'Get ELMS upcoming events',
    description:
      'Upcoming calendar events and assignment due dates across all ELMS (Canvas) courses, as the Canvas dashboard shows them. Requires login.',
    input: {},
    output: { events: z.array(upcomingEventSchema) },
  })
  async get_upcoming_events(): Promise<{ events: UpcomingEvent[] }> {
    const events = await this.json<RawEvent[]>('users/self/upcoming_events');
    return { events: events.map(toUpcomingEvent) };
  }

  @tool({
    title: 'Get ELMS activity stream',
    description:
      "Recent activity across the signed-in student's active ELMS (Canvas) courses: new announcements, discussion posts, grades and messages. Requires login.",
    input: { limit: limit(20, 50) },
    output: { items: z.array(activityItemSchema).describe('Newest first') },
  })
  async get_activity_stream({ limit }: { limit: number }): Promise<{ items: ActivityItem[] }> {
    const items = await this.list<RawActivity>(
      'users/self/activity_stream',
      { only_active_courses: 'true' },
      Math.ceil(limit / PAGE_SIZE),
    );
    return { items: items.slice(0, limit).map(toActivityItem) };
  }

  @tool({
    title: 'List ELMS conversations',
    description:
      "The signed-in student's ELMS (Canvas) Inbox: conversations with their subject, participants and last message. Requires login.",
    input: { scope: conversationScope, limit: limit(20, 100) },
    output: { conversations: z.array(conversationSchema).describe('Most recent first') },
  })
  async list_conversations({
    scope,
    limit,
  }: {
    scope: ConversationScope;
    limit: number;
  }): Promise<{ conversations: Conversation[] }> {
    const conversations = await this.list<RawConversation>(
      'conversations',
      scope === 'inbox' ? {} : { scope },
      Math.ceil(limit / PAGE_SIZE),
    );
    return { conversations: conversations.slice(0, limit).map(toConversation) };
  }

  @tool({
    title: 'Get an ELMS conversation',
    description: 'One ELMS (Canvas) Inbox conversation with every message in it. Requires login.',
    input: { conversation_id: canvasId.describe('Conversation id, from elms_list_conversations') },
    output: conversationDetailSchema.shape,
  })
  async get_conversation({
    conversation_id,
  }: {
    conversation_id: number;
  }): Promise<ConversationDetail> {
    // Reading through the API marks the conversation read unless told otherwise.
    const raw = await this.json<RawConversation>(`conversations/${conversation_id}`, {
      auto_mark_as_read: 'false',
    });
    return { ...toConversation(raw), messages: toMessages(raw) };
  }
}
