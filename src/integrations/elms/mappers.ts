import { memberOf } from '../../common.js';
import { htmlToTextOrNull } from '../../lib/html.js';
import { trimmed } from '../../lib/text.js';
import {
  ACTIVITY_TYPES,
  type ActivityItem,
  type Announcement,
  type Assignment,
  type Conversation,
  CONVERSATION_STATES,
  type Course,
  COURSE_STATES,
  type Enrollment,
  ENROLLMENT_STATES,
  ENROLLMENT_TYPES,
  EVENT_TYPES,
  type Grades,
  GRADING_TYPES,
  type Message,
  type Module,
  MODULE_ITEM_TYPES,
  MODULE_STATES,
  PLANNABLE_TYPES,
  type PlannerItem,
  type Submission,
  SUBMISSION_STATES,
  type Tab,
  TAB_TYPES,
  TODO_TYPES,
  type TodoItem,
  type UpcomingEvent,
  type User,
} from './schemas.js';

export const SITE = 'https://umd.instructure.com';

export type RawUser = {
  id: number;
  name?: string;
  short_name?: string | null;
  sortable_name?: string | null;
  login_id?: string | null;
  primary_email?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  time_zone?: string | null;
};

export type RawEnrollment = {
  type?: string;
  enrollment_state?: string;
  course_id?: number;
  computed_current_score?: number | null;
  computed_current_grade?: string | null;
  computed_final_score?: number | null;
  computed_final_grade?: string | null;
  grades?: {
    current_score?: number | null;
    current_grade?: string | null;
    final_score?: number | null;
    final_grade?: string | null;
  } | null;
  last_activity_at?: string | null;
  total_activity_time?: number | null;
};

export type RawCourse = {
  id: number;
  name?: string;
  course_code?: string | null;
  workflow_state?: string;
  term?: { id: number; name?: string; start_at?: string | null; end_at?: string | null } | null;
  start_at?: string | null;
  end_at?: string | null;
  teachers?: { id: number; display_name?: string; pronouns?: string | null }[];
  enrollments?: RawEnrollment[];
  hide_final_grades?: boolean;
  syllabus_body?: string | null;
};

export type RawPage = { title?: string; body?: string | null; updated_at?: string | null };

export type RawTab = { id: string; label?: string; type?: string; html_url?: string | null };

export type RawSubmission = {
  workflow_state?: string;
  score?: number | null;
  grade?: string | null;
  submitted_at?: string | null;
  graded_at?: string | null;
  late?: boolean;
  missing?: boolean;
  excused?: boolean | null;
  attempt?: number | null;
  preview_url?: string | null;
  submission_comments?: {
    author_name?: string | null;
    comment?: string;
    created_at?: string | null;
  }[];
};

export type RawAssignment = {
  id: number;
  course_id?: number;
  name?: string;
  description?: string | null;
  due_at?: string | null;
  unlock_at?: string | null;
  lock_at?: string | null;
  points_possible?: number | null;
  grading_type?: string | null;
  submission_types?: string[];
  allowed_extensions?: string[];
  published?: boolean;
  is_quiz_assignment?: boolean;
  html_url?: string;
  submission?: RawSubmission | null;
};

export type RawModule = {
  id: number;
  name?: string;
  position?: number;
  state?: string | null;
  unlock_at?: string | null;
  items?: {
    id: number;
    title?: string;
    type?: string;
    indent?: number;
    content_id?: number | null;
    html_url?: string | null;
    external_url?: string | null;
    completion_requirement?: { completed?: boolean } | null;
    content_details?: {
      due_at?: string | null;
      points_possible?: number | null;
      locked_for_user?: boolean;
    } | null;
  }[];
};

export type RawAnnouncement = {
  id: number;
  title?: string;
  message?: string | null;
  posted_at?: string | null;
  author?: { display_name?: string | null } | null;
  html_url?: string;
  read_state?: string;
  discussion_subentry_count?: number;
  context_code?: string;
};

export type RawTodo = {
  type?: string;
  course_id?: number | null;
  context_name?: string | null;
  assignment?: {
    id: number;
    name?: string;
    due_at?: string | null;
    points_possible?: number | null;
    html_url?: string | null;
  };
};

export type RawPlannerItem = {
  plannable_type?: string;
  plannable_id?: number;
  plannable_date?: string | null;
  course_id?: number | null;
  context_name?: string | null;
  plannable?: { title?: string; points_possible?: number | null } | null;
  planner_override?: { marked_complete?: boolean } | null;
  submissions?:
    { submitted?: boolean; graded?: boolean; missing?: boolean; late?: boolean } | false | null;
  html_url?: string | null;
};

export type RawEvent = {
  type?: string;
  id: number;
  title?: string;
  start_at?: string | null;
  end_at?: string | null;
  context_code?: string;
  location_name?: string | null;
  description?: string | null;
  html_url?: string | null;
  assignment?: { course_id?: number } | null;
};

export type RawActivity = {
  id: number;
  type?: string;
  title?: string | null;
  message?: string | null;
  created_at?: string | null;
  course_id?: number | null;
  read_state?: boolean;
  html_url?: string | null;
};

export type RawConversation = {
  id: number;
  subject?: string | null;
  workflow_state?: string;
  last_message?: string | null;
  last_message_at?: string | null;
  message_count?: number;
  participants?: { id: number; name?: string }[];
  context_name?: string | null;
  starred?: boolean;
  messages?: {
    id: number;
    author_id?: number;
    body?: string;
    created_at?: string | null;
    attachments?: { display_name?: string; filename?: string; url?: string | null }[];
  }[];
};

/** `value` as one of `values`; throws so an unexpected Canvas value surfaces as a tool error. */
function known<const T extends readonly string[]>(
  values: T,
  value: string | null | undefined,
  what: string,
): T[number] {
  const found = memberOf(values, value);
  if (found === null) throw new Error(`Unknown ${what} "${value ?? ''}"`);
  return found;
}

/** The numeric course id out of a context code like "course_12345". */
function courseIdOf(contextCode: string | undefined): number | null {
  const match = /^course_(\d+)$/.exec(contextCode ?? '');
  return match === null ? null : Number(match[1]);
}

export function toUser(raw: RawUser, profile: RawUser | null): User {
  return {
    id: raw.id,
    name: raw.name ?? '',
    short_name: trimmed(raw.short_name),
    sortable_name: trimmed(raw.sortable_name),
    login_id: trimmed(profile?.login_id ?? raw.login_id),
    email: trimmed(profile?.primary_email ?? raw.email ?? raw.primary_email),
    avatar_url: trimmed(raw.avatar_url),
    time_zone: trimmed(profile?.time_zone),
  };
}

function toGrades(raw: RawEnrollment): Grades | null {
  const grades = raw.grades ?? {
    current_score: raw.computed_current_score,
    current_grade: raw.computed_current_grade,
    final_score: raw.computed_final_score,
    final_grade: raw.computed_final_grade,
  };
  const result = {
    current_score: grades.current_score ?? null,
    current_grade: trimmed(grades.current_grade),
    final_score: grades.final_score ?? null,
    final_grade: trimmed(grades.final_grade),
  };
  return Object.values(result).every((value) => value === null) ? null : result;
}

export function toCourse(raw: RawCourse): Course {
  const enrollment = raw.enrollments?.[0];
  return {
    id: raw.id,
    name: raw.name ?? '',
    course_code: trimmed(raw.course_code),
    state: known(COURSE_STATES, raw.workflow_state, 'course state'),
    term:
      raw.term == null
        ? null
        : {
            id: raw.term.id,
            name: raw.term.name ?? '',
            start_at: raw.term.start_at ?? null,
            end_at: raw.term.end_at ?? null,
          },
    start_at: raw.start_at ?? null,
    end_at: raw.end_at ?? null,
    teachers: (raw.teachers ?? []).map((teacher) => ({
      id: teacher.id,
      name: teacher.display_name ?? '',
      pronouns: trimmed(teacher.pronouns),
    })),
    enrollment_type: memberOf(ENROLLMENT_TYPES, enrollment?.type),
    grades: enrollment === undefined ? null : toGrades(enrollment),
    hide_final_grades: raw.hide_final_grades === true,
    url: `${SITE}/courses/${raw.id}`,
  };
}

export function toTab(raw: RawTab): Tab {
  return {
    id: raw.id,
    label: raw.label ?? raw.id,
    type: known(TAB_TYPES, raw.type, 'tab type'),
    url: trimmed(raw.html_url),
  };
}

export function toSubmission(raw: RawSubmission): Submission {
  return {
    state: known(SUBMISSION_STATES, raw.workflow_state, 'submission state'),
    score: raw.score ?? null,
    grade: trimmed(raw.grade),
    submitted_at: raw.submitted_at ?? null,
    graded_at: raw.graded_at ?? null,
    late: raw.late === true,
    missing: raw.missing === true,
    excused: raw.excused === true,
    attempt: raw.attempt ?? null,
    url: trimmed(raw.preview_url),
    comments: (raw.submission_comments ?? []).map((comment) => ({
      author: trimmed(comment.author_name),
      comment: comment.comment ?? '',
      created_at: comment.created_at ?? null,
    })),
  };
}

export function toAssignment(raw: RawAssignment, courseId: number): Assignment {
  return {
    id: raw.id,
    course_id: raw.course_id ?? courseId,
    name: raw.name ?? '',
    description: htmlToTextOrNull(raw.description),
    due_at: raw.due_at ?? null,
    unlock_at: raw.unlock_at ?? null,
    lock_at: raw.lock_at ?? null,
    points_possible: raw.points_possible ?? null,
    grading_type: memberOf(GRADING_TYPES, raw.grading_type),
    submission_types: raw.submission_types ?? [],
    allowed_extensions: raw.allowed_extensions ?? [],
    published: raw.published !== false,
    is_quiz: raw.is_quiz_assignment === true,
    url: raw.html_url ?? `${SITE}/courses/${courseId}/assignments/${raw.id}`,
    submission: raw.submission == null ? null : toSubmission(raw.submission),
  };
}

export function toEnrollment(raw: RawEnrollment & { course_id: number }): Enrollment {
  return {
    course_id: raw.course_id,
    type: known(
      ENROLLMENT_TYPES,
      raw.type?.replace(/Enrollment$/, '').toLowerCase(),
      'enrollment type',
    ),
    state: known(ENROLLMENT_STATES, raw.enrollment_state, 'enrollment state'),
    grades: toGrades(raw),
    last_activity_at: raw.last_activity_at ?? null,
    total_activity_time: raw.total_activity_time ?? null,
  };
}

export function toModule(raw: RawModule): Module {
  return {
    id: raw.id,
    name: raw.name ?? '',
    position: raw.position ?? 0,
    state: memberOf(MODULE_STATES, raw.state),
    unlock_at: raw.unlock_at ?? null,
    items: (raw.items ?? []).map((item) => ({
      id: item.id,
      title: item.title ?? '',
      type: known(MODULE_ITEM_TYPES, item.type, 'module item type'),
      indent: item.indent ?? 0,
      content_id: item.content_id ?? null,
      url: trimmed(item.html_url),
      external_url: trimmed(item.external_url),
      due_at: item.content_details?.due_at ?? null,
      points_possible: item.content_details?.points_possible ?? null,
      completed: item.completion_requirement?.completed ?? null,
      locked: item.content_details?.locked_for_user === true,
    })),
  };
}

export function toAnnouncement(raw: RawAnnouncement): Announcement {
  return {
    id: raw.id,
    course_id: courseIdOf(raw.context_code),
    title: raw.title ?? '',
    message: htmlToTextOrNull(raw.message),
    posted_at: raw.posted_at ?? null,
    author: trimmed(raw.author?.display_name),
    url: raw.html_url ?? '',
    read: raw.read_state === 'read',
    reply_count: raw.discussion_subentry_count ?? 0,
  };
}

export function toTodoItem(
  raw: RawTodo & { assignment: NonNullable<RawTodo['assignment']> },
): TodoItem {
  return {
    type: known(TODO_TYPES, raw.type, 'to-do type'),
    course_id: raw.course_id ?? null,
    course_name: trimmed(raw.context_name),
    assignment: {
      id: raw.assignment.id,
      name: raw.assignment.name ?? '',
      due_at: raw.assignment.due_at ?? null,
      points_possible: raw.assignment.points_possible ?? null,
      url: trimmed(raw.assignment.html_url),
    },
  };
}

export function toPlannerItem(raw: RawPlannerItem): PlannerItem {
  const submissions = raw.submissions === false || raw.submissions == null ? null : raw.submissions;
  return {
    type: known(PLANNABLE_TYPES, raw.plannable_type, 'planner item type'),
    id: raw.plannable_id ?? 0,
    title: raw.plannable?.title ?? '',
    date: raw.plannable_date ?? null,
    course_id: raw.course_id ?? null,
    course_name: trimmed(raw.context_name),
    points_possible: raw.plannable?.points_possible ?? null,
    submitted: submissions === null ? null : submissions.submitted === true,
    graded: submissions === null ? null : submissions.graded === true,
    missing: submissions === null ? null : submissions.missing === true,
    late: submissions === null ? null : submissions.late === true,
    completed: raw.planner_override?.marked_complete === true,
    url: trimmed(raw.html_url),
  };
}

export function toUpcomingEvent(raw: RawEvent): UpcomingEvent {
  return {
    type: known(EVENT_TYPES, raw.type, 'event type'),
    id: raw.id,
    title: raw.title ?? '',
    start_at: raw.start_at ?? null,
    end_at: raw.end_at ?? null,
    course_id: courseIdOf(raw.context_code) ?? raw.assignment?.course_id ?? null,
    location: trimmed(raw.location_name),
    description: htmlToTextOrNull(raw.description),
    url: trimmed(raw.html_url),
  };
}

export function toActivityItem(raw: RawActivity): ActivityItem {
  return {
    id: raw.id,
    type: known(ACTIVITY_TYPES, raw.type, 'activity type'),
    title: trimmed(raw.title),
    message: htmlToTextOrNull(raw.message),
    created_at: raw.created_at ?? null,
    course_id: raw.course_id ?? null,
    read: raw.read_state === true,
    url: trimmed(raw.html_url),
  };
}

export function toConversation(raw: RawConversation): Conversation {
  return {
    id: raw.id,
    subject: trimmed(raw.subject),
    state: known(CONVERSATION_STATES, raw.workflow_state, 'conversation state'),
    last_message: trimmed(raw.last_message),
    last_message_at: raw.last_message_at ?? null,
    message_count: raw.message_count ?? 0,
    participants: (raw.participants ?? []).map((participant) => participant.name ?? ''),
    context: trimmed(raw.context_name),
    starred: raw.starred === true,
  };
}

export function toMessages(raw: RawConversation): Message[] {
  const names = new Map((raw.participants ?? []).map((p) => [p.id, p.name ?? '']));
  return (raw.messages ?? []).map((message) => ({
    id: message.id,
    author: message.author_id === undefined ? null : (names.get(message.author_id) ?? null),
    body: message.body ?? '',
    created_at: message.created_at ?? null,
    attachments: (message.attachments ?? []).map((attachment) => ({
      name: attachment.display_name ?? attachment.filename ?? '',
      url: trimmed(attachment.url),
    })),
  }));
}
