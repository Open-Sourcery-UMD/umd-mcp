import { z } from 'zod';
import {
  courseId,
  delivery,
  isoDate,
  meetingType,
  postalAddressSchema,
  sectionId,
  term,
  weekday,
} from '../../../common.js';

/**
 * The per-feature term lists the portal serves, keyed by the `kind` a caller asks for. The
 * schedule and grades lists come back as full `Term` objects; the rest as
 * `{ termId, termName, termDatesMap }`. Registration-related lists (drop/add, waitlist
 * check-in) are deliberately absent.
 */
export const TERM_LISTS = {
  schedule: 'terms/schedule',
  grades: 'terms/grades',
  enrollment_certification: 'terms/enrollmentcert',
  graduation: 'terms/graduationterms',
  graduation_application: 'terms/gradappterms',
  grade_option: 'terms/gradeoptionterms',
} as const;

export type TermListKind = keyof typeof TERM_LISTS;

export const termListKind = z
  .enum(Object.keys(TERM_LISTS) as TermListKind[])
  .describe("Which feature's term list to return");

/** Where today falls relative to one of the portal's registration-calendar windows. */
export const WINDOWS = ['before', 'during', 'after'] as const;

const window = z.enum(WINDOWS);

const clock = z
  .string()
  .nullable()
  .describe('24-hour time as HH:MM; null when the meeting has no fixed time');

const uid = z.string().nullable().describe('University id; null when the portal omits it');

export const calendarDateSchema = z.object({
  date: isoDate,
  weekday: weekday.describe('Weekday the date falls on'),
});

const termDate = (what: string) =>
  calendarDateSchema.nullable().describe(`${what}; null when the portal leaves it unset`);

export const termListEntrySchema = z.object({
  id: term,
  name: z.string().describe('e.g. "Fall 2026"'),
});

export const termSchema = termListEntrySchema.extend({
  status: z
    .object({
      schedule_adjustment: window.describe('The schedule adjustment (drop/add) window'),
      registration: window.describe('The registration window'),
      graduation_application: window.describe('The graduation application window'),
    })
    .nullable()
    .describe(
      'Where today falls relative to the schedule adjustment, registration and graduation application windows; null when the portal omits it',
    ),
  dates: z
    .object({
      term_starts: termDate('First day of the term'),
      classes_start: termDate('First day of classes'),
      advance_registration_starts: termDate('First day of advance registration'),
      last_day_to_adjust: termDate('Last day of schedule adjustment'),
      last_day_to_check_in: termDate('Last day to check in for the term'),
      term_ends: termDate('Last day of the term'),
      today: termDate("Today's date as the portal reports it"),
    })
    .describe('Key dates of the term'),
});

export const meetingSchema = z.object({
  type: meetingType
    .nullable()
    .describe('Kind of meeting; null for an activity type the portal does not document'),
  days: z.array(weekday).describe('Days the meeting is held'),
  start_time: clock,
  end_time: clock,
  building: z
    .object({
      name: z
        .string()
        .nullable()
        .describe('Building name, e.g. "Brendan Iribe Center"; null when not given'),
      code: z
        .string()
        .nullable()
        .describe('Building code, e.g. "IRB" (see testudo_soc_get_building); null when not given'),
      room: z.string().nullable().describe('Room number, e.g. "0324"; null when not given'),
    })
    .nullable()
    .describe('Where the meeting is held; null when online or unassigned'),
  online: z.boolean().describe('true for a web-only meeting'),
  tba: z.boolean().describe('true when the time or place is still to be announced'),
});

export const scheduledCourseSchema = z.object({
  course: courseId,
  section: sectionId.nullable().describe('Section id, e.g. "0101"; null when the portal omits it'),
  title: z.string().nullable().describe('Course title; null when the portal omits it'),
  credits: z.number().nullable().describe('Credits the section is worth; null when not given'),
  delivery: delivery
    .nullable()
    .describe('How the section is taught; null when the portal omits it'),
  instructors: z.array(z.string()).describe('Instructor names'),
  dates: z
    .object({
      start: z.string().describe('First day of the section, as the portal prints it'),
      end: z.string().describe('Last day of the section, as the portal prints it'),
    })
    .nullable()
    .describe('Sub-term dates when the section does not run the full term; null otherwise'),
  drop_add_status: z
    .string()
    .nullable()
    .describe('Drop/add status the portal shows for the section; null when none'),
  waitlist_status: z
    .string()
    .nullable()
    .describe('Waitlist status the portal shows; null when enrolled'),
  meetings: z.array(meetingSchema).describe('Weekly meetings of the section'),
});

export const scheduleSchema = z.object({
  student: z
    .object({
      uid,
      name: z.string().nullable().describe("Student's name; null when the portal omits it"),
    })
    .describe('The signed-in student'),
  term,
  courses: z
    .array(scheduledCourseSchema)
    .describe('Registered sections in the order the portal lists them; empty when not registered'),
});

export const gradedCourseSchema = z.object({
  course: courseId,
  section: sectionId.nullable().describe('Section id, e.g. "0101"; null when the portal omits it'),
  title: z.string().nullable().describe('Course title; null when the portal omits it'),
  credits: z.number().nullable().describe('Credits the course is worth; null when not given'),
  grade: z.string().nullable().describe('Grade as posted, e.g. "A-"; null when not yet posted'),
});

export const gradesSchema = z.object({
  term,
  final_grades: z
    .array(gradedCourseSchema)
    .describe('Courses with final grades; empty until grades are posted'),
  midterm_grades: z
    .array(gradedCourseSchema)
    .describe('Courses with mid-term grades; empty outside the mid-term window'),
  gpa: z
    .object({
      semester: z.number().nullable().describe('GPA for this term; null when not given'),
      cumulative: z
        .number()
        .nullable()
        .describe('Cumulative GPA through this term; null when not given'),
    })
    .nullable()
    .describe('Term and cumulative GPA; null until the term has posted grades'),
  academic_action: z
    .string()
    .nullable()
    .describe(
      "Academic action (probation, dismissal, dean's list, ...) recorded for the term; null when none",
    ),
});

export const transcriptSchema = z.object({
  as_of: z
    .string()
    .nullable()
    .describe('Date the transcript was generated, as printed (MM/DD/YY); null when not printed'),
  text: z.string().describe('The transcript as fixed-width text, section headers included'),
});

export const addressSchema = postalAddressSchema
  .extend({
    county: z.string().nullable().describe('null when not given'),
    country: z.string().nullable().describe('null when not given'),
    on_campus: z.boolean().describe('true for a campus address'),
  })
  .nullable()
  .describe('Postal address; null when none is on file');

export const profileSchema = z.object({
  uid,
  name: z.string().nullable().describe('Name on file; null when not given'),
  email: z.string().nullable().describe('Email address on file; null when not given'),
  gender: z.string().nullable().describe('Gender on file; null when not given'),
  phones: z
    .object({
      day: z.string().nullable().describe('Daytime phone; null when not given'),
      mobile: z.string().nullable().describe('Mobile phone; null when not given'),
      local: z.string().nullable().describe('Local phone; null when not given'),
      permanent: z.string().nullable().describe('Permanent (home) phone; null when not given'),
    })
    .describe('Phone numbers on file'),
  local_address: addressSchema.describe('Local address; null when none is on file'),
  permanent_address: addressSchema.describe('Permanent address; null when none is on file'),
  emergency_contact: z
    .object({
      name: z.string().nullable().describe('Contact name; null when not given'),
      relationship: z
        .string()
        .nullable()
        .describe('Relationship to the student, e.g. "Parent"; null when not given'),
      primary_phone: z.string().nullable().describe('null when not given'),
      alternate_phone: z.string().nullable().describe('null when not given'),
      email: z.string().nullable().describe('null when not given'),
      address: addressSchema,
    })
    .nullable()
    .describe('Emergency contact on file; null when none'),
});

export const blockSchema = z.object({
  code: z
    .string()
    .nullable()
    .describe('Block code as the portal abbreviates it; null when the portal gives only text'),
  description: z.string().nullable().describe('Block in words; null when not given'),
});

export const registrationAppointmentSchema = z.object({
  uid,
  student_type: z.string().nullable().describe('e.g. "Undergraduate"; null when not given'),
  primary_major: z
    .object({
      code: z.string().nullable().describe('Major code; null when not given'),
      name: z.string().nullable().describe('Major name; null when not given'),
    })
    .describe('The primary major on record'),
  majors: z.array(z.string()).describe('Majors on record'),
  minors: z.array(z.string()).describe('Minors on record'),
  certificates: z.array(z.string()).describe('Certificates on record'),
  appointment: z
    .object({
      date: z
        .string()
        .nullable()
        .describe('Appointment date as the portal formats it; null when not given'),
      time: z
        .string()
        .nullable()
        .describe('Appointment time as the portal formats it; null when not given'),
    })
    .nullable()
    .describe('The registration appointment; null when none is assigned yet'),
  next_appointment_available: calendarDateSchema
    .nullable()
    .describe(
      'When the next appointment date will be published; null when the portal does not announce one',
    ),
  blocks: z
    .array(blockSchema)
    .describe('Registration blocks on the account as the portal lists them; empty when none'),
  current_term: termListEntrySchema.nullable().describe('The current term; null when not given'),
  registration_term: termListEntrySchema
    .nullable()
    .describe('Term the appointment registers for; null when not given'),
  previous_registration_term: termListEntrySchema
    .nullable()
    .describe('The registration term before it; null when not given'),
  next_registration_term: termListEntrySchema
    .nullable()
    .describe('The registration term after it; null when not given'),
});

export const documentRequestSchema = z.object({
  confirmation_number: z.string().nullable().describe('Order confirmation number; null when none'),
  requested: z
    .string()
    .nullable()
    .describe('When the request was placed, as the portal shows it; null when not given'),
  printed: z.string().nullable().describe('When it was printed or sent; null while pending'),
  status: z.string().nullable().describe('Status code; null when not given'),
  status_description: z.string().nullable().describe('Status in words; null when not given'),
  destination: z
    .string()
    .nullable()
    .describe('Institution or address it was sent to; null when not given'),
  destination_street: z.array(z.string()).describe('Street lines of the destination'),
  recipient: z
    .string()
    .nullable()
    .describe('Office or person it was addressed to; null when not given'),
});

export const requestStatusSchema = z.object({
  blocks: z
    .object({
      judicial: blockSchema.nullable().describe('Judicial (student conduct) block; null when none'),
      financial: blockSchema
        .nullable()
        .describe('Financial (unpaid balance) block; null when none'),
    })
    .describe('Blocks that prevent transcript and certification requests'),
  transcript_requests: z
    .array(documentRequestSchema)
    .describe('Official transcript orders, as the portal lists them'),
  enrollment_certification_requests: z
    .array(documentRequestSchema)
    .describe('Enrollment certification orders, as the portal lists them'),
});

export const diplomaStatusSchema = z.object({
  degree: z.string().nullable().describe('Degree, e.g. "Bachelor of Science"; null when not given'),
  majors: z.array(z.string()).describe('Majors on the diploma'),
  minors: z.array(z.string()).describe('Minors on the diploma'),
  status: z
    .string()
    .nullable()
    .describe('Diploma status as the portal words it; null when not given'),
  mail_date: z
    .string()
    .nullable()
    .describe('When the diploma was or will be mailed; null when not yet known'),
});

export const graduationApplicationSchema = z.object({
  term: z
    .string()
    .nullable()
    .describe('Term applied to graduate in, e.g. "Spring 2027"; null when not given'),
  submitted: z
    .string()
    .nullable()
    .describe('When the application was submitted; null when not given'),
  diploma_name: z
    .string()
    .nullable()
    .describe('Name as it will appear on the diploma; null when not given'),
  diploma_address: addressSchema.describe('Where the diploma will be mailed'),
  diplomas: z.array(diplomaStatusSchema).describe('One entry per degree applied for'),
});

export const gradeOptionSchema = z.object({
  course: courseId.nullable().describe('Course id, e.g. "CMSC131"; null when not given'),
  section: sectionId.nullable().describe('Section id, e.g. "0101"; null when not given'),
  credits: z.number().nullable().describe('Credits the course is worth; null when not given'),
  option: z
    .string()
    .nullable()
    .describe(
      'Grading option currently elected, e.g. "Regular" or "Pass-Fail"; null when not given',
    ),
  course_end_date: z
    .string()
    .nullable()
    .describe('Last day the option can be changed for this course; null when not given'),
});

export const gradeOptionsSchema = z.object({
  term,
  options: z
    .array(gradeOptionSchema)
    .describe('One entry per course; empty outside the election window'),
  pass_fail_credits: z
    .object({
      elected: z
        .number()
        .nullable()
        .describe('Pass/fail credits elected so far; null when not shown'),
      maximum: z
        .number()
        .nullable()
        .describe('Pass/fail credits the student may elect in total; null when not shown'),
    })
    .describe('Totals the portal shows'),
});

export const parentAccessSchema = z.object({
  id: z.string().describe('Identifier of the parent or guest account'),
  granted: z.string().nullable().describe('When access was granted; null when not given'),
  modified: z
    .string()
    .nullable()
    .describe('When access was last changed or renewed; null when not given'),
});

export type CalendarDate = z.infer<typeof calendarDateSchema>;
export type TermListEntry = z.infer<typeof termListEntrySchema>;
export type Term = z.infer<typeof termSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type ScheduledCourse = z.infer<typeof scheduledCourseSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type GradedCourse = z.infer<typeof gradedCourseSchema>;
export type Grades = z.infer<typeof gradesSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export type Address = z.infer<typeof addressSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type RegistrationAppointment = z.infer<typeof registrationAppointmentSchema>;
export type Block = z.infer<typeof blockSchema>;
export type DocumentRequest = z.infer<typeof documentRequestSchema>;
export type RequestStatus = z.infer<typeof requestStatusSchema>;
export type DiplomaStatus = z.infer<typeof diplomaStatusSchema>;
export type GraduationApplication = z.infer<typeof graduationApplicationSchema>;
export type GradeOption = z.infer<typeof gradeOptionSchema>;
export type GradeOptions = z.infer<typeof gradeOptionsSchema>;
export type ParentAccess = z.infer<typeof parentAccessSchema>;
