import { addMinutes, format } from 'date-fns';
import { isPlainObject } from 'lodash-es';
import {
  decode,
  decodeOrNull,
  type Delivery,
  DELIVERY_METHODS,
  type MeetingType,
  type Weekday,
  weekdayOf,
} from '../../../common.js';
import { joinWords, lines, list, numeric, trimmed } from '../../../lib/text.js';
import type {
  Address,
  Block,
  CalendarDate,
  DiplomaStatus,
  DocumentRequest,
  GradedCourse,
  GradeOption,
  GradeOptions,
  Grades,
  GraduationApplication,
  Meeting,
  ParentAccess,
  Profile,
  RegistrationAppointment,
  RequestStatus,
  Schedule,
  ScheduledCourse,
  Term,
  TermListEntry,
} from './schemas.js';

/** A term as the non-schedule/grades lists describe it. */
export type RawTermRef = { termId: string; termName: string };

export type RawDate = { year?: number; month?: number; day?: number };

/** A term as `terms/currentterm` and the schedule and grades lists describe it. */
export type RawTerm = {
  id?: string;
  name?: string;
  status?: Term['status'];
  dates?: Partial<Record<keyof Term['dates'], RawDate | null>>;
};

/** The portal's one-letter day codes. */
type PortalDay = 'M' | 'T' | 'W' | 'H' | 'F' | 'S' | 'U';

/** The portal's meeting type abbreviations. */
type PortalMeetingType = 'Lec' | 'Dis' | 'Lab';

export type RawActivity = {
  type?: PortalMeetingType;
  days?: PortalDay[];
  start?: { minSinceMid?: number };
  end?: { minSinceMid?: number };
  bldg?: { name?: string; room?: string; code?: string } | null;
  hasTBA?: boolean;
  isWebOnline?: boolean;
};

export type RawScheduledCourse = {
  courseCode?: { code?: string; prefix?: string; number?: string; extension?: string };
  sectionId?: string;
  courseTitle?: string;
  credit?: string | number;
  start?: string | null;
  end?: string | null;
  dropAddStatus?: string;
  activityKeys?: string[];
  instructors?: { first?: string; last?: string }[];
  deliveryMethod?: string;
  waitlistStatus?: string | null;
};

export type RawSchedule = {
  student?: { uid?: string; name?: string };
  courseMap?: Record<string, RawScheduledCourse>;
  activityMap?: Record<string, { activities?: RawActivity[] }>;
};

export type RawGradedCourse = {
  coursePrefix?: string;
  courseNumber?: string;
  sectionId?: string;
  grade?: string | null;
  courseTitle?: string;
  credit?: string | number;
};

export type RawGrades = {
  studentHistoricEnrollmentView?: {
    semester?: { gpa?: number | string | null };
    cumulative?: { gpa?: number | string | null };
    academicActionMessage?: string | null;
    academicActionDesc?: string | null;
  } | null;
  studentHistoricCoursesView?: RawGradedCourse[];
  studentMidTermCourses?: RawGradedCourse[];
};

export type RawAddress = {
  country?: string;
  street1?: string;
  street2?: string;
  street3?: string;
  street4?: string;
  city?: string;
  zip?: string;
  state?: string;
  county?: string;
  isOnCampus?: boolean;
};

export type RawProfile = {
  name?: string;
  uid?: string;
  email?: string;
  dayPhone?: string;
  mobilePhone?: string;
  localPhone?: string;
  permanentPhone?: string;
  permanentAddress?: RawAddress | null;
  localAddress?: RawAddress | null;
  emergencyContact?: {
    name?: string;
    contactType?: string;
    primaryPhone?: string;
    altPhone?: string;
    email?: string;
    address?: RawAddress | null;
  } | null;
  demographicInfo?: { gender?: string } | null;
};

export type RawRegistrationAppointment = {
  uid?: string;
  studentType?: string;
  majorMFCode?: string;
  majorMFTran?: string;
  appointment?: { dateFormat?: string; time?: string } | null;
  blocks?: unknown[] | null;
  currentTerm?: RawTermRef | null;
  prevRegApptTerm?: RawTermRef | null;
  regApptTerm?: RawTermRef | null;
  nextRegApptTerm?: RawTermRef | null;
  displayNextRegAptDate?: boolean;
  nextApptAvailable?: RawDate | null;
  majors?: unknown;
  minors?: unknown;
  certificates?: unknown;
};

export type RawBlock = { code?: string; desc?: string } | null;

export type RawDocumentRequest = {
  confirmationNumber?: string | number;
  reqDate?: string;
  reqDateDisp?: string;
  printDate?: string | null;
  requestStatus?: string;
  requestStatusDescription?: string;
  destination?: string;
  destinationStreet1?: string;
  destinationStreet2?: string;
  destinationStreet3?: string;
  recipient?: string;
};

export type RawRequestStatus = {
  blocks?: { hasBlock?: boolean; judicialBlock?: RawBlock; financialBlock?: RawBlock } | null;
  requests?: RawDocumentRequest[];
};

export type RawDiplomaStatus = {
  degree?: string;
  majors?: unknown[];
  minors?: unknown[];
  diplomaStatusTrans?: string;
  mailDate?: string | null;
};

export type RawGraduationApplication = {
  term?: { termName?: string } | null;
  insertDate?: string;
  student?: { name?: string; nameSuffix?: string; diplomaAddress?: RawAddress | null } | null;
  diplomaStatuses?: RawDiplomaStatus[];
};

export type RawGradeOption = {
  course?: string;
  section?: string;
  credits?: string | number;
  option?: string;
  crsEndDate?: string;
};

export type RawGradeOptions =
  | RawGradeOption[]
  | {
      gradeoptions?: RawGradeOption[];
      gradeOptions?: RawGradeOption[];
      totalPFCredits?: string | number;
      maxPFCredits?: string | number;
    };

export type RawParentAccess = { pid?: string | number; insertDT?: string; modDT?: string };

/** The portal's day codes, mapped to the shared weekday vocabulary. */
const PORTAL_DAYS: Record<PortalDay, Weekday> = {
  M: 'M',
  T: 'Tu',
  W: 'W',
  H: 'Th',
  F: 'F',
  S: 'Sa',
  U: 'Su',
};

/** The portal's meeting type abbreviations, mapped to the shared vocabulary. */
const PORTAL_MEETING_TYPES: Record<PortalMeetingType, MeetingType> = {
  Lec: 'lecture',
  Dis: 'discussion',
  Lab: 'lab',
};

/** The portal's delivery codes, mapped to the shared vocabulary. */
const PORTAL_DELIVERY: Record<string, Delivery> = {
  F2F: DELIVERY_METHODS.f2f,
  ONLINE: DELIVERY_METHODS.online,
  BLENDED: DELIVERY_METHODS.blended,
};

/**
 * Names out of a list the portal serves either as strings or as objects whose display text is
 * under `desc` or `name` (the exact shape of majors and minors is undocumented).
 */
function names(value: unknown): string[] {
  return lines(
    list<unknown>(value).map((item) =>
      isPlainObject(item)
        ? ((item as { desc?: unknown; name?: unknown }).desc ??
          (item as { desc?: unknown; name?: unknown }).name)
        : item,
    ),
  );
}

/** Formats minutes since midnight as HH:MM. */
function clockTime(minutes: number | undefined): string | null {
  if (minutes === undefined || !Number.isFinite(minutes)) return null;
  return format(addMinutes(new Date(2000, 0, 1), minutes), 'HH:mm');
}

export function toTermListEntry(entry: RawTerm | RawTermRef): TermListEntry {
  return 'termId' in entry
    ? { id: entry.termId, name: entry.termName }
    : { id: entry.id ?? '', name: entry.name ?? '' };
}

function toOptionalTermListEntry(raw: RawTermRef | null | undefined): TermListEntry | null {
  return raw == null || trimmed(raw.termId) === null ? null : toTermListEntry(raw);
}

function toCalendarDate(raw: RawDate | null | undefined): CalendarDate | null {
  const year = numeric(raw?.year);
  const month = numeric(raw?.month);
  const day = numeric(raw?.day);
  if (year === null || month === null || day === null) return null;
  return { year, month, day, weekday: weekdayOf(new Date(year, month - 1, day)) };
}

export function toTerm(raw: RawTerm): Term {
  const dates = raw.dates ?? {};
  return {
    ...toTermListEntry(raw),
    status: raw.status ?? null,
    dates: {
      lastDayAdjust: toCalendarDate(dates.lastDayAdjust),
      lastDayCheckin: toCalendarDate(dates.lastDayCheckin),
      lastDayTerm: toCalendarDate(dates.lastDayTerm),
      startAdvReg: toCalendarDate(dates.startAdvReg),
      startOfClass: toCalendarDate(dates.startOfClass),
      startTerm: toCalendarDate(dates.startTerm),
      today: toCalendarDate(dates.today),
    },
  };
}

function toMeeting(activity: RawActivity): Meeting {
  const building = activity.bldg ?? null;
  const code = trimmed(building?.code);
  const name = trimmed(building?.name);
  const room = trimmed(building?.room);
  return {
    type: decode(PORTAL_MEETING_TYPES, activity.type, 'meeting type'),
    days: list<PortalDay>(activity.days).map((day) => decode(PORTAL_DAYS, day, 'day code')),
    start_time: clockTime(activity.start?.minSinceMid),
    end_time: clockTime(activity.end?.minSinceMid),
    building: code === null && name === null && room === null ? null : { name, code, room },
    online: activity.isWebOnline === true,
    tba: activity.hasTBA === true,
  };
}

function toScheduledCourse(raw: RawScheduledCourse, schedule: RawSchedule): ScheduledCourse {
  const code = raw.courseCode ?? {};
  const start = trimmed(raw.start);
  const end = trimmed(raw.end);
  return {
    course: trimmed(code.code) ?? `${code.prefix ?? ''}${code.number ?? ''}${code.extension ?? ''}`,
    section: trimmed(raw.sectionId) ?? '',
    title: trimmed(raw.courseTitle),
    credits: numeric(raw.credit),
    delivery: decodeOrNull(PORTAL_DELIVERY, trimmed(raw.deliveryMethod)?.toUpperCase()),
    instructors: lines(
      list<{ first?: string; last?: string }>(raw.instructors).map((instructor) =>
        joinWords(instructor.first, instructor.last),
      ),
    ),
    dates: start === null || end === null ? null : { start, end },
    drop_add_status: trimmed(raw.dropAddStatus),
    waitlist_status: trimmed(raw.waitlistStatus),
    meetings: list<string>(raw.activityKeys).flatMap((key) =>
      list<RawActivity>(schedule.activityMap?.[key]?.activities).map(toMeeting),
    ),
  };
}

function toGradedCourse(raw: RawGradedCourse): GradedCourse {
  return {
    course: `${raw.coursePrefix ?? ''}${raw.courseNumber ?? ''}`,
    section: trimmed(raw.sectionId),
    title: trimmed(raw.courseTitle),
    credits: numeric(raw.credit),
    grade: trimmed(raw.grade),
  };
}

function toAddress(raw: RawAddress | null | undefined): Address {
  if (raw == null) return null;
  const address = {
    street: lines([raw.street1, raw.street2, raw.street3, raw.street4]),
    city: trimmed(raw.city),
    state: trimmed(raw.state),
    zip: trimmed(raw.zip),
    county: trimmed(raw.county),
    country: trimmed(raw.country),
    on_campus: raw.isOnCampus === true,
  };
  const empty =
    address.street.length === 0 &&
    address.city === null &&
    address.state === null &&
    address.zip === null &&
    address.country === null;
  return empty ? null : address;
}

function toBlock(raw: RawBlock | undefined): Block {
  if (raw == null) return null;
  const code = trimmed(raw.code);
  const description = trimmed(raw.desc);
  return code === null && description === null ? null : { code, description };
}

function toDocumentRequest(raw: RawDocumentRequest): DocumentRequest {
  return {
    confirmation_number: trimmed(raw.confirmationNumber),
    requested: trimmed(raw.reqDateDisp) ?? trimmed(raw.reqDate),
    printed: trimmed(raw.printDate),
    status: trimmed(raw.requestStatus),
    status_description: trimmed(raw.requestStatusDescription),
    destination: trimmed(raw.destination),
    destination_street: lines([
      raw.destinationStreet1,
      raw.destinationStreet2,
      raw.destinationStreet3,
    ]),
    recipient: trimmed(raw.recipient),
  };
}

function toDiplomaStatus(raw: RawDiplomaStatus): DiplomaStatus {
  return {
    degree: trimmed(raw.degree),
    majors: names(raw.majors),
    minors: names(raw.minors),
    status: trimmed(raw.diplomaStatusTrans),
    mail_date: trimmed(raw.mailDate),
  };
}

export function toGraduationApplication(raw: RawGraduationApplication): GraduationApplication {
  const student = raw.student ?? null;
  return {
    term: trimmed(raw.term?.termName),
    submitted: trimmed(raw.insertDate),
    diploma_name: joinWords(student?.name, student?.nameSuffix),
    diploma_address: toAddress(student?.diplomaAddress),
    diplomas: list<RawDiplomaStatus>(raw.diplomaStatuses).map(toDiplomaStatus),
  };
}

export function toRegistrationAppointment(
  raw: RawRegistrationAppointment,
): RegistrationAppointment {
  const slot = raw.appointment ?? null;
  return {
    uid: trimmed(raw.uid),
    student_type: trimmed(raw.studentType),
    primary_major: { code: trimmed(raw.majorMFCode), name: trimmed(raw.majorMFTran) },
    majors: names(raw.majors),
    minors: names(raw.minors),
    certificates: names(raw.certificates),
    appointment:
      slot === null ? null : { date: trimmed(slot.dateFormat), time: trimmed(slot.time) },
    next_appointment_available:
      raw.displayNextRegAptDate === false ? null : toCalendarDate(raw.nextApptAvailable),
    blocks: list<unknown>(raw.blocks),
    current_term: toOptionalTermListEntry(raw.currentTerm),
    registration_term: toOptionalTermListEntry(raw.regApptTerm),
    previous_registration_term: toOptionalTermListEntry(raw.prevRegApptTerm),
    next_registration_term: toOptionalTermListEntry(raw.nextRegApptTerm),
  };
}

export function toSchedule(termId: string, raw: RawSchedule): Schedule {
  return {
    student: { uid: trimmed(raw.student?.uid), name: trimmed(raw.student?.name) },
    term: termId,
    courses: Object.values(raw.courseMap ?? {}).map((course) => toScheduledCourse(course, raw)),
  };
}

export function toGrades(termId: string, raw: RawGrades): Grades {
  const enrollment = raw.studentHistoricEnrollmentView ?? null;
  return {
    term: termId,
    final_grades: list<RawGradedCourse>(raw.studentHistoricCoursesView).map(toGradedCourse),
    midterm_grades: list<RawGradedCourse>(raw.studentMidTermCourses).map(toGradedCourse),
    gpa:
      enrollment === null
        ? null
        : {
            semester: numeric(enrollment.semester?.gpa),
            cumulative: numeric(enrollment.cumulative?.gpa),
          },
    academic_action:
      enrollment === null
        ? null
        : (trimmed(enrollment.academicActionDesc) ?? trimmed(enrollment.academicActionMessage)),
  };
}

export function toProfile(raw: RawProfile): Profile {
  const contact = raw.emergencyContact ?? null;
  return {
    uid: trimmed(raw.uid),
    name: trimmed(raw.name),
    email: trimmed(raw.email),
    gender: trimmed(raw.demographicInfo?.gender),
    phones: {
      day: trimmed(raw.dayPhone),
      mobile: trimmed(raw.mobilePhone),
      local: trimmed(raw.localPhone),
      permanent: trimmed(raw.permanentPhone),
    },
    local_address: toAddress(raw.localAddress),
    permanent_address: toAddress(raw.permanentAddress),
    emergency_contact:
      contact === null || trimmed(contact.name) === null
        ? null
        : {
            name: trimmed(contact.name),
            relationship: trimmed(contact.contactType),
            primary_phone: trimmed(contact.primaryPhone),
            alternate_phone: trimmed(contact.altPhone),
            email: trimmed(contact.email),
            address: toAddress(contact.address),
          },
  };
}

export function toRequestStatus(
  transcripts: RawRequestStatus,
  certifications: RawRequestStatus,
): RequestStatus {
  const blocks = transcripts.blocks ?? certifications.blocks ?? null;
  return {
    blocks: {
      judicial: toBlock(blocks?.judicialBlock),
      financial: toBlock(blocks?.financialBlock),
    },
    transcript_requests: list<RawDocumentRequest>(transcripts.requests).map(toDocumentRequest),
    enrollment_certification_requests: list<RawDocumentRequest>(certifications.requests).map(
      toDocumentRequest,
    ),
  };
}

export function toGradeOptions(termId: string, raw: RawGradeOptions | null): GradeOptions {
  const options = Array.isArray(raw) ? raw : (raw?.gradeoptions ?? raw?.gradeOptions ?? []);
  const totals = Array.isArray(raw) || raw === null ? null : raw;
  return {
    term: termId,
    options: list<RawGradeOption>(options).map(toGradeOption),
    pass_fail_credits: {
      elected: numeric(totals?.totalPFCredits),
      maximum: numeric(totals?.maxPFCredits),
    },
  };
}

function toGradeOption(raw: RawGradeOption): GradeOption {
  return {
    course: trimmed(raw.course),
    section: trimmed(raw.section),
    credits: numeric(raw.credits),
    option: trimmed(raw.option),
    course_end_date: trimmed(raw.crsEndDate),
  };
}

export function toParentAccess(raw: RawParentAccess): ParentAccess {
  return {
    id: trimmed(raw.pid) ?? '',
    granted: trimmed(raw.insertDT),
    modified: trimmed(raw.modDT),
  };
}
