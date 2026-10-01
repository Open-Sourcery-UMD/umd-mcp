import { sortBy, uniq } from 'lodash-es';
import { z } from 'zod';
import { Integration, tool } from '../base.js';
import {
  committeeFolder,
  groupKey,
  groupUrl,
  type RawBill,
  type RawBillSummary,
  type RawCommitteeBill,
  type RawFile,
  type RawMember,
  type RawPastBills,
  type RawPerson,
  type RawRelatedBill,
  type RawSection,
  type RawSenator,
  type RawStage,
  toActiveBill,
  toBill,
  toBillSummary,
  toCommitteeMeetings,
  toConstituent,
  toGroupSummary,
  toMember,
  toPastBills,
  toGroupPage,
  toSenateMeetings,
  toSenator,
  yearFilter,
} from './mappers.js';
import {
  academicYear,
  type Bill,
  type BillSummary,
  billRef,
  billSchema,
  billSummarySchema,
  type CommitteeLegislation,
  committeeLegislationSchema,
  type CommitteeMeetings,
  committeeMeetingsSchema,
  type Constituent,
  constituentSchema,
  COUNCIL_GROUPS,
  type Group,
  GROUP_PAGES,
  GROUP_SUMMARY_SEQUENCE,
  GROUP_TYPES,
  groupSchema,
  type GroupSummary,
  groupSummarySchema,
  type GroupType,
  groupType,
  paging,
  type Population,
  population,
  type SenateMeetings,
  senateMeetingsSchema,
  type Senator,
  senatorSchema,
  SITE,
} from './schemas.js';

/** Where the S3 file listings for Senate and committee meetings live. */
const MEETING_AREAS = { senate: 'senateMeetings', committee: 'committees' } as const;

export class Senate extends Integration {
  readonly name = 'senate';
  readonly baseUrl = `${SITE}/api`;

  private async legislation(scope: 'current' | 'archived'): Promise<BillSummary[]> {
    const bills = await this.get<RawBillSummary[]>(`public/legislation/${scope}`);
    return bills.map(toBillSummary);
  }

  private async senators(): Promise<Senator[]> {
    const senators = await this.get<RawSenator[]>('public/senators/department-term');
    return senators.map(toSenator);
  }

  /** The sections of a CMS page at one sequence number; empty for an unknown page. */
  private sections(page: string, sequence: number): Promise<RawSection[]> {
    return this.get<RawSection[]>(`public/page/${page}/sequence/${sequence}`);
  }

  /** Every committee, council and past council with its summary blurb. */
  private async groups(): Promise<GroupSummary[]> {
    const lists = await Promise.all(
      GROUP_TYPES.map(async (type) =>
        (await this.sections(GROUP_PAGES[type].page, GROUP_SUMMARY_SEQUENCE))
          .filter((section) => section.sectionName !== GROUP_PAGES[type].intro)
          .map((section) => toGroupSummary(section, type)),
      ),
    );
    return lists.flat();
  }

  /** The academic years an S3 meeting area has folders for, newest first. */
  private async meetingYears(area: string): Promise<string[]> {
    const years = await this.get<string[]>(`s3/storage/${area}/directories`);
    return sortBy(years, (year) => year).reverse();
  }

  /** One academic year's S3 objects in a meeting area, with its folders when asked. */
  private meetingFiles(area: string, year: string, includeDirectories = false): Promise<RawFile[]> {
    return this.get<RawFile[]>(`s3/storage/${area}/files`, {
      filter: yearFilter(year),
      includeDirectories: includeDirectories || undefined,
    });
  }

  @tool({
    title: 'List legislation',
    description:
      "Bills before the University Senate (senate.umd.edu): the current academic year's legislation with where each bill stands and who is reviewing it, or the archive of past bills back to 2001. Filter by words in the title or document number. Call senate_get_bill for a bill's history and documents. No login needed.",
    input: {
      scope: z
        .enum(['current', 'archived'])
        .default('current')
        .describe('"current" for this year\'s bills (default), "archived" for past years'),
      query: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Only bills whose title or document number contains this text'),
      ...paging,
    },
    output: {
      total: z.number().int().describe('Bills matching the query'),
      bills: z.array(billSummarySchema).describe('Newest first'),
    },
  })
  async list_legislation({
    scope,
    query,
    limit,
    offset,
  }: {
    scope: 'current' | 'archived';
    query?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<{ total: number; bills: BillSummary[] }> {
    const needle = query?.toLowerCase();
    const bills = (await this.legislation(scope)).filter(
      (bill) =>
        needle === undefined ||
        bill.title.toLowerCase().includes(needle) ||
        bill.document_number.toLowerCase().includes(needle),
    );
    return { total: bills.length, bills: bills.slice(offset, offset + limit) };
  }

  @tool({
    title: 'Get a bill',
    description:
      'One University Senate bill by id or document number: the proposal, sponsor, policy link, related bills, and every stage of its history (committee reviews, Senate votes, presidential approval) with dates, decisions and the PDFs filed at each stage. No login needed.',
    input: { bill: billRef },
    output: billSchema.shape,
  })
  async get_bill({ bill }: { bill: string }): Promise<Bill> {
    const id = /^\d+$/.test(bill) ? Number(bill) : await this.billId(bill);
    const [details, related, stages] = await Promise.all([
      this.get<RawBill>(`public/legislation/details/bill/${id}`),
      this.get<RawRelatedBill[]>(`public/legislation/details/relatedbills/${id}`),
      this.get<RawStage[]>(`public/legislation/details/billstages/${id}`),
    ]);
    return toBill(details, related, stages);
  }

  /** The id of the bill with a given Senate document number, e.g. "26-27-04". */
  private async billId(documentNumber: string): Promise<number> {
    const number = documentNumber.toLowerCase();
    const lists = await Promise.all([this.legislation('current'), this.legislation('archived')]);
    const bill = lists.flat().find((bill) => bill.document_number.toLowerCase() === number);
    if (bill === undefined) {
      throw new Error(`${this.name}: no bill has the Senate document number "${documentNumber}"`);
    }
    return bill.id;
  }

  @tool({
    title: 'List senators',
    description:
      'Current members of the University Senate with the seat, constituency, college and term end of each. Filter by college or division acronym, population, constituency, or a name search. No login needed.',
    input: {
      college: z
        .string()
        .trim()
        .min(1)
        .toUpperCase()
        .optional()
        .describe(
          'Only senators for this college or division acronym, e.g. "CMNS", "ENGR", "VPSA"',
        ),
      population: population
        .optional()
        .describe('Only senators for this population, e.g. "Faculty" or "Undergraduate Student"'),
      constituency: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Only senators for this constituency, e.g. "Tenured/Tenure-Track Faculty", "Exempt Staff - Divisions"',
        ),
      query: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Only senators whose name, email or seat contains this text'),
    },
    output: { senators: z.array(senatorSchema).describe('In alphabetical order by name') },
  })
  async list_senators({
    college,
    population,
    constituency,
    query,
  }: {
    college?: string | undefined;
    population?: Population | undefined;
    constituency?: string | undefined;
    query?: string | undefined;
  }): Promise<{ senators: Senator[] }> {
    const needle = query?.toLowerCase();
    const wanted = constituency?.toLowerCase();
    const senators = (await this.senators()).filter(
      (senator) =>
        (college === undefined || senator.college === college) &&
        (population === undefined || senator.population === population) &&
        (wanted === undefined || senator.constituency.toLowerCase() === wanted) &&
        (needle === undefined ||
          [senator.name, senator.email ?? '', senator.seat].some((text) =>
            text.toLowerCase().includes(needle),
          )),
    );
    return { senators };
  }

  @tool({
    title: 'Get a constituent',
    description:
      'How the University Senate files a member of the campus community, by UMD Directory ID: their college, department, title, population and constituency. To find who represents them, call senate_list_senators with that constituency, and with the college too when represented_by_college is true, as the site\'s "Find My Senator" tool does. No login needed.',
    input: {
      directory_id: z
        .string()
        .trim()
        .min(1)
        .toLowerCase()
        .describe('UMD Directory ID, the part of a umd.edu email before the @'),
    },
    output: constituentSchema.shape,
  })
  async get_constituent({ directory_id }: { directory_id: string }): Promise<Constituent> {
    const person = await this.get<RawPerson>(
      `public/senators/people-properties/${encodeURIComponent(directory_id)}`,
    );
    return toConstituent(person);
  }

  @tool({
    title: 'List committees and councils',
    description:
      "The University Senate's standing and special committees, the University councils it seats, and past councils and task forces, each with a one-paragraph summary. Pass a name to senate_get_committee for its charge, members and current work. No login needed.",
    input: {
      type: groupType
        .optional()
        .describe(
          'Only "committee" (Senate committees), "council" (University councils) or "past_council" (dissolved councils and task forces); default: all',
        ),
    },
    output: { groups: z.array(groupSummarySchema).describe('Committees, then councils') },
  })
  async list_committees({ type }: { type?: GroupType | undefined }): Promise<{
    groups: GroupSummary[];
  }> {
    const groups = await this.groups();
    return { groups: type === undefined ? groups : groups.filter((g) => g.type === type) };
  }

  @tool({
    title: 'Get a committee or council',
    description:
      'One University Senate committee, University council, or past council or task force by name (from senate_list_committees): its page as text (charge, chair, contact), current members with seats and colleges, and the bills it is reviewing. See senate_list_past_committee_legislation for earlier bills and senate_get_committee_meetings for meeting dates. No login needed.',
    input: {
      name: z
        .string()
        .trim()
        .min(1)
        .describe(
          'Name as senate_list_committees gives it, e.g. "Academic Procedures & Standards"',
        ),
    },
    output: groupSchema.shape,
  })
  async get_committee({ name }: { name: string }): Promise<Group> {
    const key = groupKey(name);
    const summary = (await this.groups()).find((group) => groupKey(group.name) === key);
    if (summary === undefined) {
      throw new Error(`${this.name}: no committee or council is named "${name}"`);
    }
    const section = encodeURIComponent(summary.name);
    const { page } = GROUP_PAGES[summary.type];
    const group = summary.type === 'council' ? COUNCIL_GROUPS[summary.name] : summary.name;
    const [about, members, bills] = await Promise.all([
      this.get<RawSection>(`public/page/${page}/${section}`),
      group === undefined
        ? []
        : this.get<RawMember[]>(`public/committees/members/${encodeURIComponent(group)}`),
      group === undefined
        ? []
        : this.get<RawCommitteeBill[]>(`public/committees/bills/${encodeURIComponent(group)}`),
    ]);
    return {
      ...summary,
      url: groupUrl(summary.type, summary.name),
      ...toGroupPage(about),
      members: members.map(toMember),
      active_bills: bills.map(toActiveBill),
    };
  }

  @tool({
    title: 'List past committee legislation',
    description:
      'Every bill each University Senate standing committee has reviewed, grouped by committee and academic year back to 2001, as the Past Committees page lists them: document number, title, whether the bill is still active and when it completed. Optionally one committee. No login needed.',
    input: {
      committee: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Only this committee, named as senate_list_committees gives it, e.g. "Academic Procedures & Standards" (default: every committee)',
        ),
    },
    output: {
      committees: z
        .array(committeeLegislationSchema)
        .describe('Committees in the order the site lists them'),
    },
  })
  async list_past_committee_legislation({
    committee,
  }: {
    committee?: string | undefined;
  }): Promise<{ committees: CommitteeLegislation[] }> {
    const past = await this.get<RawPastBills>('public/committees/bills/past');
    const wanted = committee === undefined ? undefined : groupKey(committee);
    return {
      committees: toPastBills(past).filter(
        (entry) => wanted === undefined || groupKey(entry.committee) === wanted,
      ),
    };
  }

  @tool({
    title: 'Get committee meetings',
    description:
      "A University Senate standing committee's meeting dates and times for an academic year (default: the current one), with the agendas posted for each; other meeting materials need a committee member login. No login needed.",
    input: {
      committee: z
        .string()
        .trim()
        .min(1)
        .describe(
          'Committee name as senate_list_committees gives it, e.g. "Academic Procedures & Standards"',
        ),
      year: academicYear.optional().describe('Academic year, e.g. "2024-2025" (default: current)'),
    },
    output: committeeMeetingsSchema,
  })
  async get_committee_meetings({
    committee,
    year,
  }: {
    committee: string;
    year?: string | undefined;
  }): Promise<CommitteeMeetings> {
    const years = await this.meetingYears(MEETING_AREAS.committee);
    const wanted = year ?? years[0];
    if (wanted === undefined || !years.includes(wanted)) {
      throw new Error(`${this.name}: no committee meetings are filed for ${wanted ?? 'any year'}`);
    }
    // Folders are listed only for the newest year, so the year's files are read whole. Their
    // committee folders are spelled differently from the CMS names ("Programs, Curricula, &
    // Courses"), sometimes several ways in one year, so every folder with the same words counts.
    const files = await this.meetingFiles(MEETING_AREAS.committee, wanted, true);
    const key = groupKey(committee);
    const folders = uniq(files.flatMap((file) => committeeFolder(file) ?? [])).filter(
      (folder) => groupKey(folder) === key,
    );
    if (folders.length === 0) {
      throw new Error(`${this.name}: no committee "${committee}" has meetings filed for ${wanted}`);
    }
    return { academic_year: wanted, years, meetings: toCommitteeMeetings(files, folders) };
  }

  @tool({
    title: 'Get Senate meetings',
    description:
      'The University Senate meeting schedule for an academic year (default: the current one) with the agenda, materials, slides and minutes posted for each meeting, and the years the archive covers. Meetings run 3:15-5:00 PM unless a document says otherwise. No login needed.',
    input: {
      year: academicYear.optional().describe('Academic year, e.g. "2024-2025" (default: current)'),
    },
    output: senateMeetingsSchema,
  })
  async get_meetings({ year }: { year?: string | undefined }): Promise<SenateMeetings> {
    const years = await this.meetingYears(MEETING_AREAS.senate);
    const wanted = year ?? years[0];
    if (wanted === undefined || !years.includes(wanted)) {
      throw new Error(`${this.name}: no meeting schedule for ${wanted ?? 'any year'}`);
    }
    const files = await this.meetingFiles(MEETING_AREAS.senate, wanted);
    return { academic_year: wanted, years, ...toSenateMeetings(files) };
  }
}
