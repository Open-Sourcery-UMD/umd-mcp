import { z } from 'zod';
import { term } from '../../../common.js';
import { preformattedText } from '../../../lib/html.js';
import { list } from '../../../lib/text.js';
import { Integration, tool } from '../../base.js';
import {
  type RawGradeOptions,
  type RawGrades,
  type RawGraduationApplication,
  type RawParentAccess,
  type RawProfile,
  type RawRegistrationAppointment,
  type RawRequestStatus,
  type RawSchedule,
  type RawTerm,
  type RawTermRef,
  toGradeOptions,
  toGrades,
  toGraduationApplication,
  toParentAccess,
  toProfile,
  toRegistrationAppointment,
  toRequestStatus,
  toSchedule,
  toTerm,
  toTermListEntry,
} from './mappers.js';
import {
  type GradeOptions,
  gradeOptionsSchema,
  type Grades,
  gradesSchema,
  type GraduationApplication,
  graduationApplicationSchema,
  type ParentAccess,
  parentAccessSchema,
  type Profile,
  profileSchema,
  type RegistrationAppointment,
  registrationAppointmentSchema,
  type RequestStatus,
  requestStatusSchema,
  type Schedule,
  scheduleSchema,
  TERM_LISTS,
  type Term,
  type TermListEntry,
  termListEntrySchema,
  type TermListKind,
  termListKind,
  termSchema,
  type Transcript,
  transcriptSchema,
} from './schemas.js';

const PORTAL_URL = 'https://app.testudo.umd.edu';

export class StudentPortal extends Integration {
  readonly name = 'testudo';
  readonly baseUrl = `${PORTAL_URL}/services`;
  override readonly service = {
    name: 'testudo',
    loginUrl: `${PORTAL_URL}/main/`,
    signedIn: (url: URL) => url.hash.startsWith('#/main'),
  };

  @tool({
    title: 'Get current term',
    description:
      'The current academic term at UMD with its registration status and key dates, from the Testudo student portal. Requires login.',
    input: {},
    output: termSchema.shape,
  })
  async get_current_term(): Promise<Term> {
    return toTerm(await this.get<RawTerm>('terms/currentterm'));
  }

  @tool({
    title: 'List terms',
    description:
      'Terms the signed-in student can use with a given Testudo feature: "schedule" lists terms with a class schedule (use with testudo_get_schedule), "grades" terms with posted grades, "enrollment_certification" terms an enrollment certification can be ordered for, "graduation" every term a graduation date can fall in, "graduation_application" terms open for a graduation application, and "grade_option" terms with an open pass/fail election window. Requires login.',
    input: { kind: termListKind },
    output: {
      terms: z.array(termListEntrySchema).describe('Terms in the order the portal lists them'),
    },
  })
  async list_terms({ kind }: { kind: TermListKind }): Promise<{ terms: TermListEntry[] }> {
    const entries = await this.get<(RawTerm | RawTermRef)[]>(TERM_LISTS[kind]);
    return { terms: entries.map(toTermListEntry) };
  }

  @tool({
    title: 'Get schedule',
    description:
      'The signed-in student\'s class schedule for a term from the Testudo student portal: each registered section with its instructors, credits, delivery method and weekly meetings (days, times, building and room). Use testudo_list_terms with kind "schedule" for the terms available. Requires login.',
    input: { term_id: term },
    output: scheduleSchema.shape,
  })
  async get_schedule({ term_id }: { term_id: string }): Promise<Schedule> {
    return toSchedule(term_id, await this.get<RawSchedule>(`schedule/${term_id}`));
  }

  @tool({
    title: 'Get grades',
    description:
      'The signed-in student\'s grades for a term from the Testudo student portal: final grades once posted, mid-term grades while the term runs, and the semester and cumulative GPA. Use testudo_list_terms with kind "grades" for the terms available. Requires login.',
    input: { term_id: term },
    output: gradesSchema.shape,
  })
  async get_grades({ term_id }: { term_id: string }): Promise<Grades> {
    return toGrades(term_id, await this.get<RawGrades>(`grades/${term_id}`));
  }

  @tool({
    title: 'Get unofficial transcript',
    description:
      "The signed-in student's unofficial transcript from the Testudo student portal, as plain text: transfer credit, every past course with its grade, and current courses. For advising purposes only. Requires login.",
    input: {},
    output: transcriptSchema.shape,
  })
  async get_unofficial_transcript(): Promise<Transcript> {
    const { content } = await this.get<{ content?: string }>('uotrans-ws');
    const text = preformattedText(content ?? '');
    return { as_of: /As of:\s*(\d{2}\/\d{2}\/\d{2,4})/.exec(text)?.[1] ?? null, text };
  }

  @tool({
    title: 'Get profile',
    description:
      "The signed-in student's contact information on file with the university, from the Testudo student portal: name, email, phone numbers, local and permanent addresses and emergency contact. Requires login.",
    input: {},
    output: profileSchema.shape,
  })
  async get_profile(): Promise<Profile> {
    return toProfile(await this.get<RawProfile>('profile'));
  }

  @tool({
    title: 'Get registration appointment',
    description:
      'When the signed-in student may register for classes, from the Testudo student portal: the registration appointment for the upcoming term, any blocks on the account, and the majors, minors and certificates on record. Read-only; this does not register for anything. Requires login.',
    input: {},
    output: registrationAppointmentSchema.shape,
  })
  async get_registration_appointment(): Promise<RegistrationAppointment> {
    return toRegistrationAppointment(await this.get<RawRegistrationAppointment>('regapp'));
  }

  @tool({
    title: 'Get document request status',
    description:
      'Status of the official transcript and enrollment certification orders the signed-in student has placed through the Testudo student portal, and any judicial or financial block that would stop new orders. Read-only; ordering is not supported. Requires login.',
    input: {},
    output: requestStatusSchema.shape,
  })
  async get_request_status(): Promise<RequestStatus> {
    const [transcripts, certifications] = await Promise.all([
      this.get<RawRequestStatus>('transreq/status'),
      this.get<RawRequestStatus>('enrlcert/status'),
    ]);
    return toRequestStatus(transcripts, certifications);
  }

  @tool({
    title: 'Get graduation application status',
    description:
      "The signed-in student's graduation applications from the Testudo student portal: the term applied for, the diploma name and mailing address, and the status of each degree. Read-only; applying is not supported. Requires login.",
    input: {},
    output: {
      applications: z
        .array(graduationApplicationSchema)
        .describe('Applications on file; empty when the student has not applied'),
    },
  })
  async get_graduation_application_status(): Promise<{ applications: GraduationApplication[] }> {
    const applications = await this.get<RawGraduationApplication[] | null>('gradapp/applstatus');
    return {
      applications: list<RawGraduationApplication>(applications).map(toGraduationApplication),
    };
  }

  @tool({
    title: 'Get grade options',
    description:
      'The grading option (regular or pass/fail) the signed-in student has elected for each course in a term, from the Testudo student portal, with the pass/fail credit totals. Only populated while the term\'s election window is open; use testudo_list_terms with kind "grade_option" to find such terms. Read-only; changing an option is not supported. Requires login.',
    input: { term_id: term },
    output: gradeOptionsSchema.shape,
  })
  async get_grade_options({ term_id }: { term_id: string }): Promise<GradeOptions> {
    return toGradeOptions(
      term_id,
      await this.get<RawGradeOptions | null>(`gradeoption/${term_id}`),
    );
  }

  @tool({
    title: 'List parent access',
    description:
      'Parent or guest accounts the signed-in student has granted access to their Testudo records. Read-only; granting or revoking access is not supported. Requires login.',
    input: {},
    output: {
      accounts: z.array(parentAccessSchema).describe('Accounts with access; empty when none'),
    },
  })
  async get_parent_access(): Promise<{ accounts: ParentAccess[] }> {
    const accounts = await this.get<RawParentAccess[] | null>('grantedAccess');
    return { accounts: list<RawParentAccess>(accounts).map(toParentAccess) };
  }
}
