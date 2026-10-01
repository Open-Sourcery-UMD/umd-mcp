import { z } from 'zod';
import { isoDate, linkSchema, pagination } from '../../common.js';

export const SITE = 'https://senate.umd.edu';

/** Where a bill is in its life, keyed by the status text the legislation lists print. */
export const BILL_STATUSES = {
  'Under Review': 'under_review',
  'Pending Approval': 'pending_approval',
  Complete: 'complete',
  Completed: 'complete',
  Approved: 'approved',
  Rejected: 'rejected',
} as const;

type BillStatus = (typeof BILL_STATUSES)[keyof typeof BILL_STATUSES];

export const billStatus = z
  .enum([...new Set(Object.values(BILL_STATUSES))] as BillStatus[])
  .describe('Where the bill is in its life');

/** What a bill stage records, keyed by the site's stage type id. */
export const STAGE_TYPES = { 1: 'review', 2: 'approval' } as const;

type StageType = (typeof STAGE_TYPES)[keyof typeof STAGE_TYPES];

const stageType = z
  .enum(Object.values(STAGE_TYPES) as StageType[])
  .describe(
    '"review" when a committee, council or the Senate considered the bill; "approval" when it went to the President, Chancellor, Board of Regents or MHEC',
  );

/** Every kind of Senate group with a page on the site. */
export const GROUP_TYPES = ['committee', 'council', 'past_council'] as const;

export type GroupType = (typeof GROUP_TYPES)[number];

export const groupType = z.enum(GROUP_TYPES);

/** Constituent populations as the site files senators. */
export const POPULATIONS = [
  'Faculty',
  'Exempt Staff',
  'Non-Exempt Staff',
  'Undergraduate Student',
  'Graduate Student',
  'Ineligible',
  'Uncertain',
] as const;

export type Population = (typeof POPULATIONS)[number];

export const population = z.enum(POPULATIONS);

/**
 * The group name the bills and members endpoints file each council under, keyed by the
 * council's page name.
 */
export const COUNCIL_GROUPS: Record<string, string> = {
  'Council of University System Faculty': 'CUSF',
  'University Library Council': 'Library Council',
  'Athletic Council': 'Athletic Council',
  'Campus Transportation Advisory Council': 'CTAC',
  'Council of University System Staff': 'CUSS',
  'Research Council': 'Research Council',
  'Information Technology Council': 'IT Council',
  'Plan of Organization Review Committee': 'Plan of Organization Review Committee (PORC)',
};

/**
 * The CMS page each kind of group has one section per member group on, and the name of the
 * section holding the listing page's own introduction.
 */
export const GROUP_PAGES: Record<GroupType, { page: string; intro: string }> = {
  committee: { page: 'committees', intro: 'Committees' },
  council: { page: 'councils', intro: 'Councils' },
  past_council: { page: 'pastCouncilsAndTaskForces', intro: 'Past Councils and Task Forces' },
};

/** The sequence number of the one-paragraph summary section on a group listing page. */
export const GROUP_SUMMARY_SEQUENCE = 2;

export const billRef = z
  .string()
  .trim()
  .min(1)
  .describe(
    'Bill id (e.g. "987") or Senate document number (e.g. "26-27-04"), from senate_list_legislation or senate_get_committee',
  );

export const academicYear = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, 'Expected an academic year like 2025-2026')
  .describe('Academic year as "YYYY-YYYY", e.g. "2025-2026"');

export const paging = pagination(50, 200);

const billId = z.number().int().describe('Bill id, for senate_get_bill');

const documentNumber = z
  .string()
  .describe('Senate document number, e.g. "26-27-04": the academic year and a sequence number');

const billUrl = z.string().describe('Bill page on senate.umd.edu');

export const billSummarySchema = z.object({
  id: billId,
  document_number: documentNumber,
  title: z.string().describe('Bill title'),
  status: billStatus,
  under_review_by: z
    .string()
    .nullable()
    .describe(
      'Committee, council or office currently reviewing the bill; null once it has moved on',
    ),
  years: z.array(z.number().int()).describe('Calendar years the bill was active in'),
  is_active: z.boolean().describe('Whether the bill is still moving through the process'),
  url: billUrl,
});

export const relatedBillSchema = z.object({
  id: billId,
  document_number: documentNumber,
  title: z.string().describe('Bill title'),
  url: billUrl,
});

export const approvalSchema = z.object({
  approver: z
    .string()
    .describe(
      'Who approved, e.g. "Presidential Approval", "Chancellor\'s Approval", "BOR Approval"',
    ),
  date: isoDate.nullable().describe('When they approved'),
});

export const stageSchema = z.object({
  id: z.number().int().describe('Stage id'),
  number: z.number().int().describe("Position in the bill's history, 1 being the first stage"),
  type: stageType,
  status: billStatus.nullable().describe('Status of this stage; null when not recorded'),
  reviewer: z
    .string()
    .nullable()
    .describe(
      'Group that handled the stage, e.g. "Senate Executive Committee"; null for approval stages',
    ),
  received: isoDate.nullable().describe('When the reviewer received the bill'),
  deadline: isoDate.nullable().describe('When the reviewer was asked to report back'),
  decided: isoDate.nullable().describe('When the reviewer decided'),
  decision: z.string().nullable().describe('What the reviewer decided'),
  actions: z.string().nullable().describe('What happened during the stage'),
  next_step: z.string().nullable().describe('Where the bill went next, e.g. "Senate Review"'),
  final_senate_action: z
    .boolean()
    .nullable()
    .describe("Whether this stage was the Senate's final vote; null for approval stages"),
  attachments: z.array(linkSchema).describe('Documents filed at this stage (PDFs)'),
  approvals: z.array(approvalSchema).describe('Sign-offs recorded at an approval stage'),
});

export const billSchema = z.object({
  id: billId,
  document_number: documentNumber,
  pcc_id: z
    .string()
    .nullable()
    .describe('Programs, Curricula & Courses (PCC) proposal id, for curriculum bills'),
  title: z.string().describe('Bill title'),
  proposed: isoDate.nullable().describe('When the proposal was submitted'),
  sponsor: z.string().nullable().describe('Who proposed it'),
  description: z.string().nullable().describe('The proposal as submitted'),
  policy_url: z.string().nullable().describe('The policy the bill concerns, when there is one'),
  start_year: z.number().int().nullable().describe('Calendar year the bill started in'),
  keywords: z.string().nullable().describe('Keywords the Senate Office tagged the bill with'),
  is_active: z.boolean().describe('Whether the bill is still moving through the process'),
  is_complete: z.boolean().describe('Whether the process has finished'),
  completed: isoDate.nullable().describe('When the process finished'),
  url: billUrl,
  related_bills: z.array(relatedBillSchema).describe('Bills the Senate Office linked to this one'),
  stages: z.array(stageSchema).describe("The bill's history, most recent stage first"),
});

const termEnds = z
  .number()
  .int()
  .nullable()
  .describe('Calendar year the term ends in; null when not recorded');

export const senatorSchema = z.object({
  name: z.string().describe('Full name'),
  email: z.string().nullable(),
  seat: z.string().describe('Seat held, e.g. "Tenured Faculty - CMNS"'),
  population: z.string().describe('Population the seat represents, e.g. "Faculty"'),
  college: z
    .string()
    .nullable()
    .describe('College or division acronym, e.g. "CMNS", "ENGR", "VPSA"'),
  term_ends: termEnds,
  constituency: z
    .string()
    .describe('Constituency the seat represents, e.g. "Undergraduate Student"'),
});

export const constituentSchema = z.object({
  directory_id: z.string().describe('UMD Directory ID'),
  name: z.string().describe('Full name'),
  title: z.string().nullable().describe('Job title, or null for students'),
  college: z.string().nullable().describe('College or division acronym'),
  department: z.string().nullable().describe('Department, e.g. "CMNS-Computer Science"'),
  major: z.string().nullable().describe('Major, for students'),
  population: z.string().describe('Population the Senate files them under, e.g. "Faculty"'),
  constituency: z
    .string()
    .describe('Constituency they vote in, e.g. "Tenured/Tenure-Track Faculty"'),
  represented_by_college: z
    .boolean()
    .describe(
      'Whether their constituency elects senators per college, so their senators are those with both this constituency and this college; otherwise the constituency alone',
    ),
});

export const groupSummarySchema = z.object({
  name: z.string().describe('Name, to pass to senate_get_committee'),
  type: groupType.describe(
    '"committee" for a Senate standing or special committee, "council" for a University council, "past_council" for a dissolved council or task force',
  ),
  summary: z.string().nullable().describe('One-paragraph description from the listing page'),
  url: z.string().describe('Page on senate.umd.edu'),
});

export const memberSchema = z.object({
  name: z.string().describe('Name as "Last, First"'),
  seat: z.string().describe('Seat held, e.g. "Faculty", "Ex-Officio - Provost\'s Rep"'),
  college: z.string().nullable().describe('College or division acronym'),
  email: z.string().nullable(),
  term_ends: termEnds,
});

export const activeBillSchema = z.object({
  id: billId,
  document_number: documentNumber,
  title: z.string().describe('Bill title'),
  under_review_by: z.string().describe('Group reviewing the bill, as the current stage names it'),
  url: billUrl,
});

export const pastBillSchema = z.object({
  id: billId,
  document_number: documentNumber,
  title: z.string().describe('Bill title'),
  is_active: z.boolean().describe('Whether the bill is still moving through the process'),
  is_complete: z.boolean().describe('Whether the process has finished'),
  completed: isoDate.nullable().describe('When the process finished'),
  url: billUrl,
});

export const pastBillsByYearSchema = z.object({
  academic_year: z
    .string()
    .describe('Academic year the committee handled the bills, e.g. "2009-2010"'),
  bills: z.array(pastBillSchema),
});

export const committeeLegislationSchema = z.object({
  committee: z
    .string()
    .describe(
      'Committee as the Past Committees page names it, e.g. "Academic Procedures & Standards (APAS) Committee"',
    ),
  years: z.array(pastBillsByYearSchema).describe('Oldest academic year first'),
});

export const committeeMeetingSchema = z.object({
  date: isoDate,
  start_time: z.string().describe('Start as HH:MM, 24-hour'),
  end_time: z.string().describe('End as HH:MM, 24-hour'),
  documents: z
    .array(linkSchema)
    .describe('Agendas posted for the meeting; other materials need a committee member login'),
});

export const groupSchema = groupSummarySchema.extend({
  about: z.string().nullable().describe("The group's page as plain text: charge, chair, contact"),
  links: z.array(linkSchema).describe('Links on the page (documents, forms, email addresses)'),
  members: z.array(memberSchema).describe('Current members; empty for past councils'),
  active_bills: z.array(activeBillSchema).describe('Bills the group is reviewing now'),
});

export const committeeMeetingsSchema = {
  academic_year: academicYear,
  years: z.array(academicYear).describe('Every academic year with committee folders, newest first'),
  meetings: z.array(committeeMeetingSchema).describe('Meetings in date order'),
};

export const senateMeetingSchema = z.object({
  date: isoDate,
  label: z
    .string()
    .nullable()
    .describe(
      'What makes the meeting special, e.g. "President\'s State of the Campus Address"; null for a regular meeting',
    ),
  documents: z
    .array(linkSchema)
    .describe('Agenda, materials, slides and minutes posted for the meeting'),
});

export const senateMeetingsSchema = {
  academic_year: academicYear,
  years: z.array(academicYear).describe('Every academic year with a schedule, newest first'),
  meetings: z.array(senateMeetingSchema).describe('Meetings in date order'),
  other_documents: z
    .array(linkSchema)
    .describe('Documents filed under the year but not a meeting, e.g. committee reports'),
};

export type BillSummary = z.infer<typeof billSummarySchema>;
export type RelatedBill = z.infer<typeof relatedBillSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Bill = z.infer<typeof billSchema>;
export type Senator = z.infer<typeof senatorSchema>;
export type Constituent = z.infer<typeof constituentSchema>;
export type GroupSummary = z.infer<typeof groupSummarySchema>;
export type Member = z.infer<typeof memberSchema>;
export type ActiveBill = z.infer<typeof activeBillSchema>;
export type CommitteeLegislation = z.infer<typeof committeeLegislationSchema>;
export type CommitteeMeeting = z.infer<typeof committeeMeetingSchema>;
export type Group = z.infer<typeof groupSchema>;
export type CommitteeMeetings = z.infer<z.ZodObject<typeof committeeMeetingsSchema>>;
export type SenateMeeting = z.infer<typeof senateMeetingSchema>;
export type SenateMeetings = z.infer<z.ZodObject<typeof senateMeetingsSchema>>;
