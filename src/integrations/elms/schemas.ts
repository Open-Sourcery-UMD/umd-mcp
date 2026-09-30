import { z } from 'zod';

export const courseState = z
  .enum(['active', 'completed', 'all'])
  .default('active')
  .describe('"active" for current courses, "completed" for past terms, "all" for both');

export const assignmentBucket = z
  .enum(['upcoming', 'past', 'overdue', 'undated', 'ungraded', 'unsubmitted', 'future'])
  .optional()
  .describe('Only assignments in this bucket (default: all)');

export const conversationScope = z
  .enum(['inbox', 'unread', 'starred', 'archived'])
  .default('inbox')
  .describe('Which Inbox folder to list (default "inbox")');

export type CourseState = z.infer<typeof courseState>;
export type AssignmentBucket = NonNullable<z.infer<typeof assignmentBucket>>;
export type ConversationScope = z.infer<typeof conversationScope>;

export const canvasId = z.number().int().positive();

export const courseIdInput = canvasId.describe('Canvas course id, from elms_list_courses');

const timestamp = z.string().nullable().describe('ISO 8601 timestamp (UTC); null when unset');

const html = (what: string) =>
  z.string().nullable().describe(`${what}, converted from HTML to plain text; null when empty`);

export const COURSE_STATES = ['available', 'unpublished', 'completed', 'deleted'] as const;

export const ENROLLMENT_TYPES = ['student', 'teacher', 'ta', 'observer', 'designer'] as const;

export const ENROLLMENT_STATES = [
  'active',
  'invited',
  'creation_pending',
  'deleted',
  'rejected',
  'completed',
  'inactive',
] as const;

export const TAB_TYPES = ['internal', 'external'] as const;

export const GRADING_TYPES = [
  'pass_fail',
  'percent',
  'letter_grade',
  'gpa_scale',
  'points',
  'not_graded',
] as const;

export const SUBMISSION_STATES = ['submitted', 'unsubmitted', 'graded', 'pending_review'] as const;

export const MODULE_STATES = ['locked', 'unlocked', 'started', 'completed'] as const;

export const MODULE_ITEM_TYPES = [
  'File',
  'Page',
  'Discussion',
  'Assignment',
  'Quiz',
  'SubHeader',
  'ExternalUrl',
  'ExternalTool',
] as const;

export const TODO_TYPES = ['submitting', 'grading'] as const;

export const PLANNABLE_TYPES = [
  'announcement',
  'assignment',
  'discussion_topic',
  'quiz',
  'wiki_page',
  'planner_note',
  'calendar_event',
  'assessment_request',
] as const;

export const EVENT_TYPES = ['event', 'assignment'] as const;

export const ACTIVITY_TYPES = [
  'DiscussionTopic',
  'DiscussionEntry',
  'Announcement',
  'Conversation',
  'Message',
  'Submission',
  'Conference',
  'Collaboration',
  'AssessmentRequest',
] as const;

export const CONVERSATION_STATES = ['read', 'unread', 'archived'] as const;

export const userSchema = z.object({
  id: canvasId.describe('Canvas user id'),
  name: z.string(),
  short_name: z.string().nullable(),
  sortable_name: z.string().nullable().describe('"Last, First"'),
  login_id: z.string().nullable().describe('UMD Directory ID; null if Canvas hides it'),
  email: z.string().nullable(),
  avatar_url: z.string().nullable(),
  time_zone: z.string().nullable().describe('e.g. "America/New_York"'),
});

export const termSchema = z.object({
  id: canvasId,
  name: z.string().describe('e.g. "Fall 2026"'),
  start_at: timestamp,
  end_at: timestamp,
});

export const teacherSchema = z.object({
  id: canvasId,
  name: z.string(),
  pronouns: z.string().nullable(),
});

export const gradesSchema = z.object({
  current_score: z.number().nullable().describe('Percentage score on graded work so far'),
  current_grade: z
    .string()
    .nullable()
    .describe('Letter grade for current_score, if the course has a grading scheme'),
  final_score: z.number().nullable().describe('Percentage score counting ungraded work as zero'),
  final_grade: z.string().nullable(),
});

export const courseSchema = z.object({
  id: canvasId.describe('Canvas course id, used by the other ELMS tools'),
  name: z.string(),
  course_code: z.string().nullable().describe('e.g. "CMSC131-0101-Fall 2026"'),
  state: z.enum(COURSE_STATES).describe('Publication state'),
  term: termSchema.nullable(),
  start_at: timestamp,
  end_at: timestamp,
  teachers: z.array(teacherSchema),
  enrollment_type: z.enum(ENROLLMENT_TYPES).nullable().describe("The user's role in the course"),
  grades: gradesSchema.nullable().describe('Current standing; null when the course hides grades'),
  hide_final_grades: z.boolean(),
  url: z.string().describe('Course home page'),
});

export const tabSchema = z.object({
  id: z.string().describe('e.g. "announcements", "assignments", "modules", "zoom"'),
  label: z.string(),
  type: z.enum(TAB_TYPES).describe('"external" tabs are LTI tools such as Zoom or Piazza'),
  url: z.string().nullable(),
});

export const courseDetailSchema = courseSchema.extend({
  syllabus: html('Syllabus body'),
  front_page: z
    .object({ title: z.string(), body: html('Page body'), updated_at: timestamp })
    .nullable()
    .describe('The course front page; null when the course has none'),
  tabs: z.array(tabSchema).describe('Navigation tabs enabled for the course, in order'),
});

export const submissionSchema = z.object({
  state: z.enum(SUBMISSION_STATES),
  score: z.number().nullable(),
  grade: z.string().nullable(),
  submitted_at: timestamp,
  graded_at: timestamp,
  late: z.boolean(),
  missing: z.boolean(),
  excused: z.boolean(),
  attempt: z.number().int().nullable(),
  url: z.string().nullable().describe('Preview link for the submission'),
  comments: z
    .array(
      z.object({
        author: z.string().nullable(),
        comment: z.string(),
        created_at: timestamp,
      }),
    )
    .describe('Instructor and student comments, when requested'),
});

export const assignmentSchema = z.object({
  id: canvasId.describe('Canvas assignment id'),
  course_id: canvasId,
  name: z.string(),
  description: html('Assignment instructions'),
  due_at: timestamp,
  unlock_at: timestamp,
  lock_at: timestamp,
  points_possible: z.number().nullable(),
  grading_type: z.enum(GRADING_TYPES).nullable(),
  submission_types: z.array(z.string()).describe('e.g. "online_upload", "external_tool"'),
  allowed_extensions: z.array(z.string()),
  published: z.boolean(),
  is_quiz: z.boolean(),
  url: z.string(),
  submission: submissionSchema.nullable().describe("The user's submission; null when none exists"),
});

export const enrollmentSchema = z.object({
  course_id: canvasId,
  type: z.enum(ENROLLMENT_TYPES),
  state: z.enum(ENROLLMENT_STATES),
  grades: gradesSchema.nullable(),
  last_activity_at: timestamp,
  total_activity_time: z.number().int().nullable().describe('Seconds spent in the course'),
});

export const moduleItemSchema = z.object({
  id: canvasId,
  title: z.string(),
  type: z.enum(MODULE_ITEM_TYPES),
  indent: z.number().int(),
  content_id: canvasId.nullable().describe('Id of the assignment, file, page or discussion'),
  url: z.string().nullable().describe('Link to the item in ELMS'),
  external_url: z.string().nullable(),
  due_at: timestamp,
  points_possible: z.number().nullable(),
  completed: z.boolean().nullable().describe('Completion requirement met; null when there is none'),
  locked: z.boolean(),
});

export const moduleSchema = z.object({
  id: canvasId,
  name: z.string(),
  position: z.number().int(),
  state: z.enum(MODULE_STATES).nullable(),
  unlock_at: timestamp,
  items: z.array(moduleItemSchema),
});

export const announcementSchema = z.object({
  id: canvasId,
  course_id: canvasId.nullable(),
  title: z.string(),
  message: html('Announcement body'),
  posted_at: timestamp,
  author: z.string().nullable(),
  url: z.string(),
  read: z.boolean(),
  reply_count: z.number().int(),
});

export const todoItemSchema = z.object({
  type: z.enum(TODO_TYPES),
  course_id: canvasId.nullable(),
  course_name: z.string().nullable(),
  assignment: z.object({
    id: canvasId,
    name: z.string(),
    due_at: timestamp,
    points_possible: z.number().nullable(),
    url: z.string().nullable(),
  }),
});

export const plannerItemSchema = z.object({
  type: z.enum(PLANNABLE_TYPES),
  id: canvasId.describe('Id of the assignment, announcement, quiz, ... this item is about'),
  title: z.string(),
  date: timestamp.describe('When it is due or happens'),
  course_id: canvasId.nullable(),
  course_name: z.string().nullable(),
  points_possible: z.number().nullable(),
  submitted: z.boolean().nullable().describe('Submission status for assignments; null otherwise'),
  graded: z.boolean().nullable(),
  missing: z.boolean().nullable(),
  late: z.boolean().nullable(),
  completed: z.boolean().describe('Marked complete in the planner'),
  url: z.string().nullable(),
});

export const upcomingEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  id: canvasId,
  title: z.string(),
  start_at: timestamp,
  end_at: timestamp,
  course_id: canvasId.nullable(),
  location: z.string().nullable(),
  description: html('Event description'),
  url: z.string().nullable(),
});

export const activityItemSchema = z.object({
  id: canvasId,
  type: z.enum(ACTIVITY_TYPES),
  title: z.string().nullable(),
  message: html('Activity text'),
  created_at: timestamp,
  course_id: canvasId.nullable(),
  read: z.boolean(),
  url: z.string().nullable(),
});

export const conversationSchema = z.object({
  id: canvasId.describe('Conversation id, for elms_get_conversation'),
  subject: z.string().nullable(),
  state: z.enum(CONVERSATION_STATES),
  last_message: z.string().nullable(),
  last_message_at: timestamp,
  message_count: z.number().int(),
  participants: z.array(z.string()).describe('Participant names'),
  context: z.string().nullable().describe('Course the conversation belongs to, if any'),
  starred: z.boolean(),
});

export const messageSchema = z.object({
  id: canvasId,
  author: z.string().nullable(),
  body: z.string(),
  created_at: timestamp,
  attachments: z.array(z.object({ name: z.string(), url: z.string().nullable() })),
});

export const conversationDetailSchema = conversationSchema.extend({
  messages: z.array(messageSchema).describe('Messages, newest first as Canvas orders them'),
});

export type User = z.infer<typeof userSchema>;
export type Grades = z.infer<typeof gradesSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Tab = z.infer<typeof tabSchema>;
export type CourseDetail = z.infer<typeof courseDetailSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type Enrollment = z.infer<typeof enrollmentSchema>;
export type Module = z.infer<typeof moduleSchema>;
export type Announcement = z.infer<typeof announcementSchema>;
export type TodoItem = z.infer<typeof todoItemSchema>;
export type PlannerItem = z.infer<typeof plannerItemSchema>;
export type UpcomingEvent = z.infer<typeof upcomingEventSchema>;
export type ActivityItem = z.infer<typeof activityItemSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
