import { z } from 'zod';

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

export const TODO_KINDS = ['assignment', 'quiz'] as const;

/** Planner item types Canvas documents; it adds new ones, which read as "other". */
export const PLANNABLE_TYPES = [
  'announcement',
  'assignment',
  'sub_assignment',
  'discussion_topic',
  'quiz',
  'wiki_page',
  'planner_note',
  'calendar_event',
  'assessment_request',
  'peer_review_sub_assignment',
] as const;

export const EVENT_TYPES = ['event', 'assignment'] as const;

/** Activity stream item types Canvas documents; it adds new ones, which read as "other". */
export const ACTIVITY_TYPES = [
  'DiscussionTopic',
  'DiscussionEntry',
  'Announcement',
  'Conversation',
  'Message',
  'ContextMessage',
  'Submission',
  'WebConference',
  'Collaboration',
  'AssessmentRequest',
] as const;

export const CONVERSATION_STATES = ['read', 'unread', 'archived'] as const;

export const courseState = z
  .enum(['active', 'completed', 'all'])
  .default('active')
  .describe(
    '"active" for current courses, "completed" for past terms, "all" for both (default "active")',
  );

export const assignmentBucket = z
  .enum(['upcoming', 'past', 'overdue', 'undated', 'ungraded', 'unsubmitted', 'future'])
  .optional()
  .describe('Only assignments in this bucket (default: all)');

export const conversationScope = z
  .enum(['inbox', 'unread', 'starred', 'archived'])
  .default('inbox')
  .describe('Which Inbox folder to list (default "inbox")');

export const canvasId = z.number().int().positive();

export const courseIdInput = canvasId.describe('Canvas course id, from elms_list_courses');

const timestamp = (what: string) =>
  z.string().nullable().describe(`${what}, as an ISO 8601 timestamp (UTC); null when unset`);

const html = (what: string) =>
  z.string().nullable().describe(`${what}, converted from HTML to plain text; null when empty`);

const courseRef = canvasId.nullable().describe('Canvas course id; null for items outside a course');

export const plannableType = z
  .enum([...PLANNABLE_TYPES, 'other'])
  .describe('What the item is about; "other" for a type Canvas added that this tool does not know');

export const activityType = z
  .enum([...ACTIVITY_TYPES, 'other'])
  .describe('Kind of activity; "other" for a type Canvas added that this tool does not know');

export const userSchema = z.object({
  id: canvasId.describe('Canvas user id'),
  name: z.string().describe('Full name'),
  short_name: z.string().nullable().describe('Name Canvas shows in discussions; null when unset'),
  sortable_name: z.string().nullable().describe('Name as "Last, First"; null when unset'),
  login_id: z.string().nullable().describe('UMD Directory ID; null if Canvas hides it'),
  email: z.string().nullable().describe('Primary email address; null when Canvas hides it'),
  avatar_url: z.string().nullable().describe('Profile picture URL; null when unset'),
  time_zone: z.string().nullable().describe('Time zone, e.g. "America/New_York"; null when unset'),
});

export const termSchema = z.object({
  id: canvasId.describe('Canvas term id'),
  name: z.string().describe('Term name, e.g. "Fall 2026"'),
  start_at: timestamp('When the term starts'),
  end_at: timestamp('When the term ends'),
});

export const teacherSchema = z.object({
  id: canvasId.describe('Canvas user id'),
  name: z.string().describe('Display name'),
  pronouns: z.string().nullable().describe('Pronouns, e.g. "she/her"; null when unset'),
});

export const gradesSchema = z.object({
  current_score: z
    .number()
    .nullable()
    .describe('Percentage score on graded work so far; null when unset'),
  current_grade: z
    .string()
    .nullable()
    .describe('Letter grade for current_score; null when the course has no grading scheme'),
  final_score: z
    .number()
    .nullable()
    .describe('Percentage score counting ungraded work as zero; null when unset'),
  final_grade: z
    .string()
    .nullable()
    .describe('Letter grade for final_score; null when the course has no grading scheme'),
});

export const courseSchema = z.object({
  id: canvasId.describe('Canvas course id, used by the other ELMS tools'),
  name: z.string().describe('Course name'),
  course_code: z
    .string()
    .nullable()
    .describe('Course code, e.g. "CMSC131-0101-Fall 2026"; null when unset'),
  state: z.enum(COURSE_STATES).describe('Publication state'),
  term: termSchema.nullable().describe('Term the course runs in; null when Canvas gives none'),
  start_at: timestamp('When the course starts'),
  end_at: timestamp('When the course ends'),
  teachers: z.array(teacherSchema).describe('Instructors of the course'),
  enrollment_type: z
    .enum(ENROLLMENT_TYPES)
    .nullable()
    .describe("The user's role in the course; null when Canvas gives none"),
  grades: gradesSchema.nullable().describe('Current standing; null when Canvas reports no scores'),
  hide_final_grades: z.boolean().describe('Whether the course hides final grades from students'),
  url: z.string().describe('Course home page'),
});

export const tabSchema = z.object({
  id: z.string().describe('Tab id, e.g. "announcements", "assignments", "modules", "zoom"'),
  label: z.string().describe('Tab label as the course navigation shows it'),
  type: z.enum(TAB_TYPES).describe('"external" tabs are LTI tools such as Zoom or Piazza'),
  url: z.string().nullable().describe('Link to the tab in ELMS; null when Canvas gives none'),
});

export const courseDetailSchema = courseSchema.extend({
  syllabus: html('Syllabus body'),
  front_page: z
    .object({
      title: z.string().describe('Page title'),
      body: html('Page body'),
      updated_at: timestamp('When the page was last edited'),
    })
    .nullable()
    .describe('The course front page; null when the course has none'),
  tabs: z.array(tabSchema).describe('Navigation tabs enabled for the course, in order'),
});

export const submissionSchema = z.object({
  state: z.enum(SUBMISSION_STATES).describe('Where the submission is in grading'),
  score: z.number().nullable().describe('Points scored; null until graded'),
  grade: z
    .string()
    .nullable()
    .describe('Grade as the assignment is graded, e.g. "92" or "A-"; null until graded'),
  submitted_at: timestamp('When it was submitted'),
  graded_at: timestamp('When it was graded'),
  late: z.boolean().describe('Whether it was submitted after the due date'),
  missing: z.boolean().describe('Whether Canvas marks it missing'),
  excused: z.boolean().describe('Whether the instructor excused it'),
  attempt: z.number().int().nullable().describe('Attempt number; null before any attempt'),
  url: z.string().nullable().describe('Preview link for the submission; null when none'),
  comments: z
    .array(
      z.object({
        author: z.string().nullable().describe('Who wrote the comment; null when hidden'),
        comment: z.string().describe('Comment text'),
        created_at: timestamp('When the comment was posted'),
      }),
    )
    .describe('Instructor and student comments, when requested'),
});

export const assignmentSchema = z.object({
  id: canvasId.describe('Canvas assignment id'),
  course_id: canvasId.describe('Canvas course id'),
  name: z.string().describe('Assignment name'),
  description: html('Assignment instructions'),
  due_at: timestamp('When it is due'),
  unlock_at: timestamp('When it opens'),
  lock_at: timestamp('When it closes to submissions'),
  points_possible: z.number().nullable().describe('Points it is worth; null when ungraded'),
  grading_type: z
    .enum(GRADING_TYPES)
    .nullable()
    .describe('How it is graded; null when Canvas gives none'),
  submission_types: z
    .array(z.string())
    .describe('How it can be submitted, e.g. "online_upload", "external_tool"'),
  allowed_extensions: z
    .array(z.string())
    .describe('File extensions an upload may have; empty when any is allowed'),
  published: z.boolean().describe('Whether students can see it'),
  is_quiz: z.boolean().describe('Whether it is a quiz'),
  url: z.string().describe('Assignment page in ELMS'),
  submission: submissionSchema.nullable().describe("The user's submission; null when none exists"),
});

export const enrollmentSchema = z.object({
  course_id: canvasId.describe('Canvas course id'),
  type: z.enum(ENROLLMENT_TYPES).describe("The user's role in the course"),
  state: z.enum(ENROLLMENT_STATES).describe('Enrollment state'),
  grades: gradesSchema.nullable().describe('null when Canvas reports no scores'),
  last_activity_at: timestamp('When the user was last active in the course'),
  total_activity_time: z
    .number()
    .int()
    .nullable()
    .describe('Seconds spent in the course; null when not recorded'),
});

export const moduleItemSchema = z.object({
  id: canvasId.describe('Module item id'),
  title: z.string().describe('Item title'),
  type: z.enum(MODULE_ITEM_TYPES).describe('What the item is'),
  indent: z.number().int().describe('Indent level in the module, 0 for none'),
  content_id: canvasId
    .nullable()
    .describe('Id of the assignment, file, page or discussion; null for headers and links'),
  url: z.string().nullable().describe('Link to the item in ELMS; null for headers'),
  external_url: z.string().nullable().describe('Destination of a link item; null otherwise'),
  due_at: timestamp('When it is due'),
  points_possible: z.number().nullable().describe('Points it is worth; null when ungraded'),
  completed: z.boolean().nullable().describe('Completion requirement met; null when there is none'),
  locked: z.boolean().describe('Whether the item is locked for the user'),
});

export const moduleSchema = z.object({
  id: canvasId.describe('Module id'),
  name: z.string().describe('Module name'),
  position: z.number().int().describe('Position in the course, 1 being the first module'),
  state: z
    .enum(MODULE_STATES)
    .nullable()
    .describe("The user's progress through the module; null when Canvas gives none"),
  unlock_at: timestamp('When the module opens'),
  items: z.array(moduleItemSchema).describe('Items in module order'),
});

export const announcementSchema = z.object({
  id: canvasId.describe('Announcement id'),
  course_id: courseRef,
  title: z.string().describe('Announcement title'),
  message: html('Announcement body'),
  posted_at: timestamp('When it was posted'),
  author: z.string().nullable().describe('Who posted it; null when hidden'),
  url: z.string().describe('Announcement page in ELMS'),
  read: z.boolean().describe('Whether the user has read it'),
  reply_count: z.number().int().describe('Number of replies'),
});

export const todoItemSchema = z.object({
  type: z.enum(TODO_TYPES).describe('"submitting" for work the student owes'),
  kind: z
    .enum(TODO_KINDS)
    .describe('"assignment" (including New Quizzes) or "quiz" for a classic quiz'),
  course_id: courseRef,
  course_name: z.string().nullable().describe('Course name; null for items outside a course'),
  item: z
    .object({
      id: canvasId.describe('Assignment id (pass to elms_get_submission) or classic quiz id'),
      name: z.string().describe('Assignment or quiz name'),
      due_at: timestamp('When it is due'),
      points_possible: z.number().nullable().describe('Points it is worth; null when ungraded'),
      url: z.string().nullable().describe('Link to the item in ELMS; null when none'),
    })
    .describe('The assignment or quiz to do'),
});

export const plannerItemSchema = z.object({
  type: plannableType,
  id: canvasId
    .nullable()
    .describe(
      'Id of the assignment, announcement, quiz, ... this item is about; null when Canvas gives none',
    ),
  title: z.string().describe('Item title'),
  date: timestamp('When it is due or happens'),
  course_id: courseRef,
  course_name: z.string().nullable().describe('Course name; null for items outside a course'),
  points_possible: z.number().nullable().describe('Points it is worth; null when ungraded'),
  submitted: z.boolean().nullable().describe('Submission status for assignments; null otherwise'),
  graded: z.boolean().nullable().describe('Whether it has been graded; null for non-assignments'),
  missing: z.boolean().nullable().describe('Whether it is missing; null for non-assignments'),
  late: z.boolean().nullable().describe('Whether it was late; null for non-assignments'),
  completed: z.boolean().describe('Marked complete in the planner'),
  url: z.string().nullable().describe('Link to the item in ELMS; null when none'),
});

export const upcomingEventSchema = z.object({
  type: z.enum(EVENT_TYPES).describe('"event" for a calendar event, "assignment" for a due date'),
  id: canvasId.describe('Calendar event or assignment id'),
  title: z.string().describe('Event or assignment title'),
  start_at: timestamp('When it starts'),
  end_at: timestamp('When it ends'),
  course_id: courseRef,
  location: z.string().nullable().describe('Where it happens; null when not given'),
  description: html('Event description'),
  url: z.string().nullable().describe('Link to it in ELMS; null when none'),
});

export const activityItemSchema = z.object({
  id: canvasId.describe('Activity stream item id'),
  type: activityType,
  title: z.string().nullable().describe('Item title; null when it has none'),
  message: html('Activity text'),
  created_at: timestamp('When it happened'),
  course_id: courseRef,
  read: z.boolean().describe('Whether the user has seen it'),
  url: z.string().nullable().describe('Link to it in ELMS; null when none'),
});

export const conversationSchema = z.object({
  id: canvasId.describe('Conversation id, for elms_get_conversation'),
  subject: z.string().nullable().describe('Subject line; null when empty'),
  state: z.enum(CONVERSATION_STATES).describe('Read state of the conversation'),
  last_message: z.string().nullable().describe('Text of the latest message; null when none'),
  last_message_at: timestamp('When the latest message was sent'),
  message_count: z.number().int().describe('Number of messages'),
  participants: z.array(z.string()).describe('Participant names'),
  context: z.string().nullable().describe('Course the conversation belongs to; null when none'),
  starred: z.boolean().describe('Whether the user starred it'),
});

export const messageSchema = z.object({
  id: canvasId.describe('Message id'),
  author: z.string().nullable().describe('Who sent it; null when not a participant'),
  body: z.string().describe('Message text'),
  created_at: timestamp('When it was sent'),
  attachments: z
    .array(
      z.object({
        name: z.string().describe('File name'),
        url: z.string().nullable().describe('Download link; null when none'),
      }),
    )
    .describe('Files attached to the message'),
});

export const conversationDetailSchema = conversationSchema.extend({
  messages: z.array(messageSchema).describe('Messages, newest first as Canvas orders them'),
});

export type CourseState = z.infer<typeof courseState>;
export type AssignmentBucket = NonNullable<z.infer<typeof assignmentBucket>>;
export type ConversationScope = z.infer<typeof conversationScope>;
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
