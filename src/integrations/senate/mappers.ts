import * as cheerio from 'cheerio';
import { format, isValid, parse } from 'date-fns';
import { escapeRegExp, sortBy, startCase, unescape } from 'lodash-es';
import { decode, decodeOrNull, type Link } from '../../common.js';
import { htmlToTextOrNull } from '../../lib/html.js';
import { absoluteUrl, links } from '../../lib/scrape.js';
import { collapse, numeric, trimmed } from '../../lib/text.js';
import {
  type ActiveBill,
  type Bill,
  BILL_STATUSES,
  type BillSummary,
  type CommitteeLegislation,
  type CommitteeMeeting,
  type Constituent,
  type GroupSummary,
  type GroupType,
  type Member,
  type RelatedBill,
  type SenateMeeting,
  type Senator,
  SITE,
  STAGE_TYPES,
  type Stage,
} from './schemas.js';

/** A row of `/legislation/current`; `/legislation/archived` adds `isActive`. */
export type RawBillSummary = {
  billId: string;
  senateDocumentNumber: string;
  title: string;
  isActive?: 'Yes' | 'No';
  status: string;
  underReviewBy: string;
  billYears: string;
};

export type RawBill = {
  billId: string;
  officialId: string;
  pccId: string | null;
  name: string;
  proposedDate: string | null;
  sponsor: string | null;
  description: string | null;
  policyLink: string | null;
  isPublic: 'Yes' | 'No';
  isComplete: 'Yes' | 'No';
  completionDate: string | null;
  isActive: 'Yes' | 'No';
  startYear: string | null;
  keyWords: string | null;
};

export type RawRelatedBill = { billId: string | number; officialId: string; name: string };

export type RawStage = {
  stageId: string;
  billId: string;
  stageTypeId: string;
  status: string | null;
  stageGroup: string | null;
  receivedDate: string | null;
  deadlineDate: string | null;
  stageDecision: string | null;
  decisionDate: string | null;
  actions: string | null;
  nextGroup: string | null;
  stageOrderNumber: string;
  finalSenateAction: 'Yes' | 'No' | null;
  attachments: { attachmentURL: string; fileId: string }[];
  approvals: { approvalId: number; approver: string; approvalDate: string | null }[];
};

export type RawSenator = {
  name: string;
  email: string | null;
  senateSeat: string;
  population: string;
  college: string | null;
  term: string | null;
  constituency: string;
};

/** `/senators/people-properties/{directoryId}`; only the fields the tools surface are typed. */
export type RawPerson = {
  directoryId: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  collegeAcronym: string | null;
  department: string | null;
  major: string | null;
  title: string | null;
  constituency: string | null;
  population: string | null;
};

/** One section of a CMS page, from `/page/{page}/sequence/{n}`. */
export type RawSection = { sectionName: string; content: string };

export type RawCommitteeBill = {
  billId: string;
  officialId: string;
  name: string;
  stageGroup: string;
};

export type RawMember = {
  name: string;
  seat: string;
  college: string | null;
  email: string | null;
  term: string | null;
};

export type RawPastBill = {
  billId: number;
  officialId: string;
  billName: string;
  isActive: boolean;
  isComplete: boolean;
  completionDate: string | null;
};

/** `/committees/bills/past`: group name, then academic year, then the bills. */
export type RawPastBills = Record<string, Record<string, RawPastBill[]>>;

/** An S3 object from `/s3/storage/{area}/files`; directories end in "/" and have size 0. */
export type RawFile = {
  fileId: string;
  name: string;
  url: string;
  updatedAt: number;
  size: number;
  contentType: string;
};

/** "MM/DD/YYYY" as the legislation API prints dates, to YYYY-MM-DD; null when blank or odd. */
function usDate(value: string | null | undefined): string | null {
  const text = trimmed(value);
  if (text === null) return null;
  const date = parse(text, 'MM/dd/yyyy', new Date());
  return isValid(date) ? format(date, 'yyyy-MM-dd') : null;
}

/** The date part of "YYYY-MM-DD" or an ISO timestamp; null when blank. */
function isoDay(value: string | null | undefined): string | null {
  const text = trimmed(value);
  return text === null ? null : text.slice(0, 10);
}

/** Free text the legislation API stores with HTML entities ("&amp;"), trimmed and decoded. */
function prose(value: string | null | undefined): string | null {
  const text = trimmed(value);
  return text === null ? null : unescape(text);
}

function yesNo(value: string | null | undefined): boolean | null {
  return value === 'Yes' ? true : value === 'No' ? false : null;
}

/** "2024, 2025" to [2024, 2025]. */
function years(value: string): number[] {
  return value
    .split(',')
    .map(numeric)
    .filter((year): year is number => year !== null);
}

function billUrl(id: number): string {
  return `${SITE}/governance/legislation/legislation-details/${id}`;
}

/** The public page of a committee, council or past council. */
export function groupUrl(type: GroupType, name: string): string {
  const base =
    type === 'committee'
      ? 'committees'
      : type === 'council'
        ? 'councils'
        : 'councils/past-councils-and-task-forces';
  return `${SITE}/${base}/${encodeURIComponent(name)}`;
}

/** Links inside a CMS fragment, hrefs resolved against the site. */
function fragmentLinks(html: string): Link[] {
  const $ = cheerio.load(html);
  return links($, $('body'), SITE);
}

/** Constituencies whose senators are elected per college; the rest are campus-wide. */
const COLLEGE_CONSTITUENCIES: readonly string[] = [
  'Full-Time Professional Track Faculty',
  'Tenured/Tenure-Track Faculty',
  'Undergraduate Student',
];

/**
 * A group name reduced to its words, so the differently spelled names the site uses for one
 * committee ("Elections, Representation & Governance", "Elections, Representation, & Governance
 * (ERG) Committee") compare equal.
 */
export function groupKey(name: string): string {
  return collapse(
    name
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\bcommittee\b/g, ' '),
  );
}

export function toBillSummary(raw: RawBillSummary): BillSummary {
  return {
    id: Number(raw.billId),
    document_number: raw.senateDocumentNumber,
    title: collapse(unescape(raw.title)),
    status: decode(BILL_STATUSES, raw.status, 'bill status'),
    under_review_by: trimmed(raw.underReviewBy),
    years: years(raw.billYears),
    // The current list omits the flag: everything on it is active.
    is_active: yesNo(raw.isActive) ?? true,
    url: billUrl(Number(raw.billId)),
  };
}

export function toRelatedBill(raw: RawRelatedBill): RelatedBill {
  return {
    id: Number(raw.billId),
    document_number: raw.officialId,
    title: collapse(unescape(raw.name)),
    url: billUrl(Number(raw.billId)),
  };
}

/** The file name of a stage attachment, as the site labels it. */
function attachmentName(fileId: string): string {
  return collapse((fileId.split('/').pop() ?? fileId).replaceAll('_', ' '));
}

export function toStage(raw: RawStage): Stage {
  return {
    id: Number(raw.stageId),
    number: Number(raw.stageOrderNumber),
    type: decode(STAGE_TYPES, raw.stageTypeId, 'stage type'),
    status: decodeOrNull(BILL_STATUSES, trimmed(raw.status)),
    reviewer: trimmed(raw.stageGroup),
    received: usDate(raw.receivedDate),
    deadline: usDate(raw.deadlineDate),
    decided: usDate(raw.decisionDate),
    decision: prose(raw.stageDecision),
    actions: prose(raw.actions),
    next_step: prose(raw.nextGroup),
    final_senate_action: yesNo(raw.finalSenateAction),
    attachments: raw.attachments.flatMap(({ attachmentURL, fileId }) => {
      const url = absoluteUrl(attachmentURL, SITE);
      return url === null ? [] : [{ text: attachmentName(fileId), url }];
    }),
    approvals: raw.approvals.map(({ approver, approvalDate }) => ({
      approver,
      date: usDate(approvalDate),
    })),
  };
}

export function toBill(raw: RawBill, related: RawRelatedBill[], stages: RawStage[]): Bill {
  const id = Number(raw.billId);
  return {
    id,
    document_number: raw.officialId,
    pcc_id: trimmed(raw.pccId),
    title: collapse(unescape(raw.name)),
    proposed: usDate(raw.proposedDate),
    sponsor: prose(raw.sponsor),
    description: prose(raw.description),
    policy_url: trimmed(raw.policyLink),
    start_year: numeric(raw.startYear),
    keywords: trimmed(raw.keyWords),
    is_active: raw.isActive === 'Yes',
    is_complete: raw.isComplete === 'Yes',
    completed: usDate(raw.completionDate),
    url: billUrl(id),
    related_bills: related.map(toRelatedBill),
    stages: sortBy(stages.map(toStage), (stage) => -stage.number),
  };
}

export function toSenator(raw: RawSenator): Senator {
  return {
    name: collapse(raw.name),
    email: trimmed(raw.email),
    seat: collapse(raw.senateSeat),
    population: raw.population,
    college: trimmed(raw.college),
    term_ends: numeric(raw.term) || null,
    constituency: raw.constituency,
  };
}

export function toConstituent(raw: RawPerson): Constituent {
  return {
    directory_id: raw.directoryId,
    name: collapse([raw.firstName, raw.middleName, raw.lastName].filter(Boolean).join(' ')),
    title: trimmed(raw.title),
    college: trimmed(raw.collegeAcronym),
    department: trimmed(raw.department),
    major: trimmed(raw.major),
    population: raw.population ?? 'Uncertain',
    constituency: raw.constituency ?? 'Uncertain',
    represented_by_college: COLLEGE_CONSTITUENCIES.includes(raw.constituency ?? ''),
  };
}

export function toGroupSummary(raw: RawSection, type: GroupType): GroupSummary {
  return {
    name: collapse(raw.sectionName),
    type,
    summary: htmlToTextOrNull(raw.content),
    url: groupUrl(type, raw.sectionName),
  };
}

/** A group's own CMS page as plain text plus the links in it. */
export function toGroupPage(raw: RawSection): { about: string | null; links: Link[] } {
  return { about: htmlToTextOrNull(raw.content), links: fragmentLinks(raw.content) };
}

export function toMember(raw: RawMember): Member {
  return {
    name: collapse(raw.name),
    seat: collapse(raw.seat),
    college: trimmed(raw.college),
    email: trimmed(raw.email),
    term_ends: numeric(raw.term) || null,
  };
}

export function toActiveBill(raw: RawCommitteeBill): ActiveBill {
  return {
    id: Number(raw.billId),
    document_number: raw.officialId,
    title: collapse(unescape(raw.name)),
    under_review_by: collapse(raw.stageGroup),
    url: billUrl(Number(raw.billId)),
  };
}

/** Every committee's past bills by academic year, in the order the site lists committees. */
export function toPastBills(all: RawPastBills): CommitteeLegislation[] {
  return Object.entries(all).map(([committee, byYear]) => ({
    committee,
    years: sortBy(Object.entries(byYear), ([year]) => year).map(([year, bills]) => ({
      academic_year: year,
      bills: bills.map((bill) => ({
        id: bill.billId,
        document_number: bill.officialId,
        title: collapse(unescape(bill.billName)),
        is_active: bill.isActive,
        is_complete: bill.isComplete,
        completed: isoDay(bill.completionDate),
        url: billUrl(bill.billId),
      })),
    })),
  }));
}

/** The regular expression the site filters a committee's file listing with (agendas only). */
export function committeeFilter(year: string, name: string): string {
  return `(?i)^${escapeRegExp(year)}/${escapeRegExp(name)}/(?:[^/]+/)*(?:$|[^/]*agenda[^/]*$)`;
}

/** Meeting folders are named "YYYY-MM-DD-HHMM-HHMM" under "{year}/{committee}/". */
const MEETING_FOLDER = /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})-(\d{2})(\d{2})$/;

export function toCommitteeMeetings(files: RawFile[]): CommitteeMeeting[] {
  const meetings = new Map<string, CommitteeMeeting>();
  for (const file of files) {
    const [, , folder = '', ...rest] = file.name.split('/');
    const match = MEETING_FOLDER.exec(folder);
    if (match === null) continue;
    const [, date = '', startHour, startMinute, endHour, endMinute] = match;
    const meeting = meetings.get(folder) ?? {
      date,
      start_time: `${startHour}:${startMinute}`,
      end_time: `${endHour}:${endMinute}`,
      documents: [],
    };
    meetings.set(folder, meeting);
    const fileName = rest.join('/');
    const url = absoluteUrl(file.url, SITE);
    if (fileName !== '' && file.size > 0 && url !== null) {
      meeting.documents.push({ text: fileName, url });
    }
  }
  return sortBy([...meetings.values()], (meeting) => meeting.date);
}

/** Senate meeting files are named "{year}/YYYY-MM-DD-{Type}.pdf"; a ".txt" only marks the date. */
const MEETING_FILE = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

/** "PresidentSlides.pdf" to "President's Slides", as the site labels meeting documents. */
function documentName(fileName: string): string {
  return startCase(fileName.replace(/\.[^/.]+$/, ''))
    .replace(/\bPresident\b/, "President's")
    .replace(/\bProvost\b/, "Provost's");
}

/** What the site prints beside a meeting date when a President's or Provost's deck is filed. */
function meetingLabel(fileNames: string[]): string | null {
  if (fileNames.some((name) => name.includes('President'))) {
    return "President's State of Campus Address";
  }
  if (fileNames.some((name) => name.includes('Provost'))) {
    return "Provost's Strategic Plan Update";
  }
  return null;
}

/** The meetings and loose documents filed under one academic year. */
export function toSenateMeetings(
  files: RawFile[],
  year: string,
): { meetings: SenateMeeting[]; other_documents: Link[] } {
  const byDate = new Map<string, { names: string[]; documents: Link[] }>();
  const other: Link[] = [];
  for (const file of files) {
    const [fileYear, rest = ''] = file.name.split('/');
    if (fileYear !== year || rest === '') continue;
    const url = absoluteUrl(file.url, SITE);
    if (url === null) continue;
    const match = MEETING_FILE.exec(rest);
    if (match === null) {
      other.push({ text: rest, url });
      continue;
    }
    const [, date = '', fileName = ''] = match;
    const meeting = byDate.get(date) ?? { names: [], documents: [] };
    byDate.set(date, meeting);
    meeting.names.push(fileName);
    if (fileName.toLowerCase().endsWith('.pdf')) {
      meeting.documents.push({ text: documentName(fileName), url });
    }
  }
  const meetings = sortBy(
    [...byDate.entries()].map(([date, { names, documents }]) => ({
      date,
      label: meetingLabel(names),
      documents,
    })),
    (meeting) => meeting.date,
  );
  return { meetings, other_documents: other };
}
