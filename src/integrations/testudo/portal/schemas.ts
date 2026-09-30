import { z } from 'zod';
import {
  courseId,
  delivery,
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

const window = z.enum(['before', 'during', 'after']);

const clock = z
  .string()
  .nullable()
  .describe('24-hour time as HH:MM; null when the meeting has no fixed time');

const uid = z.string().nullable().describe('University id');

export const calendarDateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().describe('1-12'),
  day: z.number().int(),
  weekday,
});

export const termListEntrySchema = z.object({
  id: term,
  name: z.string().describe('e.g. "Fall 2026"'),
});

export const termSchema = termListEntrySchema.extend({
  status: z
    .object({ schedAdjust: window, registration: window, gradApp: window })
    .nullable()
    .describe(
      'Where today falls relative to the schedule adjustment, registration and graduation application windows; null when the portal omits it',
    ),
  dates: z
    .object({
      lastDayAdjust: calendarDateSchema.nullable(),
      lastDayCheckin: calendarDateSchema.nullable(),
      lastDayTerm: calendarDateSchema.nullable(),
      startAdvReg: calendarDateSchema.nullable(),
      startOfClass: calendarDateSchema.nullable(),
      startTerm: calendarDateSchema.nullable(),
      today: calendarDateSchema.nullable(),
    })
    .describe('Key dates of the term; a date is null when the portal leaves it unset'),
});

export const meetingSchema = z.object({
  type: meetingType,
  days: z.array(weekday).describe('Days the meeting is held'),
  start_time: clock,
  end_time: clock,
  building: z
    .object({
      name: z.string().nullable().describe('Building name, e.g. "Brendan Iribe Center"'),
      code: z
        .string()
        .nullable()
        .describe('Building code, e.g. "IRB" (see testudo_soc_get_building)'),
      room: z.string().nullable().describe('Room number, e.g. "0324"'),
    })
    .nullable()
    .describe('Where the meeting is held; null when online or unassigned'),
  online: z.boolean().describe('true for a web-only meeting'),
  tba: z.boolean().describe('true when the time or place is still to be announced'),
});

export const scheduledCourseSchema = z.object({
  course: courseId,
  section: sectionId,
  title: z.string().nullable().describe('Course title'),
  credits: z.number().nullable().describe('Credits the section is worth'),
  delivery: delivery
    .nullable()
    .describe('How the section is taught; null when the portal omits it'),
  instructors: z.array(z.string()).describe('Instructor names'),
  dates: z
    .object({ start: z.string(), end: z.string() })
    .nullable()
    .describe('Sub-term dates when the section does not run the full term; null otherwise'),
  drop_add_status: z
    .string()
    .nullable()
    .describe('Drop/add status the portal shows for the section'),
  waitlist_status: z
    .string()
    .nullable()
    .describe('Waitlist status the portal shows; null when enrolled'),
  meetings: z.array(meetingSchema).describe('Weekly meetings of the section'),
});

export const scheduleSchema = z.object({
  student: z.object({ uid, name: z.string().nullable() }),
  term,
  courses: z
    .array(scheduledCourseSchema)
    .describe('Registered sections in the order the portal lists them; empty when not registered'),
});

export const gradedCourseSchema = z.object({
  course: courseId,
  section: sectionId.nullable(),
  title: z.string().nullable().describe('Course title'),
  credits: z.number().nullable().describe('Credits the course is worth'),
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
      semester: z.number().nullable().describe('GPA for this term'),
      cumulative: z.number().nullable().describe('Cumulative GPA through this term'),
    })
    .nullable()
    .describe('null until the term has posted grades'),
  academic_action: z
    .string()
    .nullable()
    .describe(
      "Academic action (probation, dismissal, dean's list, ...) recorded for the term; null if none",
    ),
});

export const transcriptSchema = z.object({
  as_of: z.string().nullable().describe('Date the transcript was generated, as printed (MM/DD/YY)'),
  text: z.string().describe('The transcript as fixed-width text, section headers included'),
});

export const addressSchema = postalAddressSchema
  .extend({
    county: z.string().nullable(),
    country: z.string().nullable(),
    on_campus: z.boolean().describe('true for a campus address'),
  })
  .nullable();

export const profileSchema = z.object({
  uid,
  name: z.string().nullable(),
  email: z.string().nullable(),
  gender: z.string().nullable(),
  phones: z.object({
    day: z.string().nullable(),
    mobile: z.string().nullable(),
    local: z.string().nullable(),
    permanent: z.string().nullable(),
  }),
  local_address: addressSchema,
  permanent_address: addressSchema,
  emergency_contact: z
    .object({
      name: z.string().nullable(),
      relationship: z.string().nullable().describe('e.g. "Parent"'),
      primary_phone: z.string().nullable(),
      alternate_phone: z.string().nullable(),
      email: z.string().nullable(),
      address: addressSchema,
    })
    .nullable(),
});

export const registrationAppointmentSchema = z.object({
  uid,
  student_type: z.string().nullable().describe('e.g. "Undergraduate"'),
  primary_major: z
    .object({ code: z.string().nullable(), name: z.string().nullable() })
    .describe('The primary major on record'),
  majors: z.array(z.string()),
  minors: z.array(z.string()),
  certificates: z.array(z.string()),
  appointment: z
    .object({
      date: z.string().nullable().describe('Appointment date as the portal formats it'),
      time: z.string().nullable(),
    })
    .nullable()
    .describe('The registration appointment; null when none is assigned yet'),
  next_appointment_available: calendarDateSchema
    .nullable()
    .describe('When the next appointment date will be published, if the portal announces one'),
  blocks: z
    .array(z.unknown())
    .describe('Registration blocks on the account as the portal lists them; empty when none'),
  current_term: termListEntrySchema.nullable(),
  registration_term: termListEntrySchema.nullable().describe('Term the appointment registers for'),
  previous_registration_term: termListEntrySchema.nullable(),
  next_registration_term: termListEntrySchema.nullable(),
});

export const blockSchema = z
  .object({ code: z.string().nullable(), description: z.string().nullable() })
  .nullable();

export const documentRequestSchema = z.object({
  confirmation_number: z.string().nullable(),
  requested: z.string().nullable().describe('When the request was placed, as the portal shows it'),
  printed: z.string().nullable().describe('When it was printed or sent; null while pending'),
  status: z.string().nullable().describe('Status code'),
  status_description: z.string().nullable().describe('Status in words'),
  destination: z.string().nullable().describe('Institution or address it was sent to'),
  destination_street: z.array(z.string()).describe('Street lines of the destination'),
  recipient: z.string().nullable().describe('Office or person it was addressed to'),
});

export const requestStatusSchema = z.object({
  blocks: z
    .object({
      judicial: blockSchema.describe('Judicial (student conduct) block; null when none'),
      financial: blockSchema.describe('Financial (unpaid balance) block; null when none'),
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
  degree: z.string().nullable().describe('Degree, e.g. "Bachelor of Science"'),
  majors: z.array(z.string()),
  minors: z.array(z.string()),
  status: z.string().nullable().describe('Diploma status as the portal words it'),
  mail_date: z.string().nullable().describe('When the diploma was or will be mailed'),
});

export const graduationApplicationSchema = z.object({
  term: z.string().nullable().describe('Term applied to graduate in, e.g. "Spring 2027"'),
  submitted: z.string().nullable().describe('When the application was submitted'),
  diploma_name: z.string().nullable().describe('Name as it will appear on the diploma'),
  diploma_address: addressSchema.describe('Where the diploma will be mailed'),
  diplomas: z.array(diplomaStatusSchema).describe('One entry per degree applied for'),
});

export const gradeOptionSchema = z.object({
  course: courseId.nullable(),
  section: sectionId.nullable(),
  credits: z.number().nullable(),
  option: z
    .string()
    .nullable()
    .describe('Grading option currently elected, e.g. "Regular" or "Pass-Fail"'),
  course_end_date: z
    .string()
    .nullable()
    .describe('Last day the option can be changed for this course'),
});

export const gradeOptionsSchema = z.object({
  term,
  options: z
    .array(gradeOptionSchema)
    .describe('One entry per course; empty outside the election window'),
  pass_fail_credits: z
    .object({
      elected: z.number().nullable().describe('Pass/fail credits elected so far'),
      maximum: z.number().nullable().describe('Pass/fail credits the student may elect in total'),
    })
    .describe('Totals the portal shows; both null when it shows none'),
});

export const parentAccessSchema = z.object({
  id: z.string().describe('Identifier of the parent or guest account'),
  granted: z.string().nullable().describe('When access was granted'),
  modified: z.string().nullable().describe('When access was last changed or renewed'),
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
