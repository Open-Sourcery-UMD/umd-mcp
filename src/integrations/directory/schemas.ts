import { z } from 'zod';

/** Affiliations the advanced search can filter by, with the form key each maps to. */
export const AFFILIATIONS = {
  faculty: 'umFaculty',
  staff: 'umStaff',
  affiliate: 'umAffiliate',
  student: 'umStudent',
} as const;

export type Affiliation = keyof typeof AFFILIATIONS;

export const affiliation = z.enum(Object.keys(AFFILIATIONS) as Affiliation[]);

/** Institutions the directory covers, keyed by the code the form takes. */
export const INSTITUTIONS = {
  UMCP: 'University of Maryland, College Park',
  USMO: 'University System of Maryland Office',
  UMES: 'University of Maryland Eastern Shore',
  UMCES: 'University of Maryland Center for Environmental Science',
} as const;

export type Institution = keyof typeof INSTITUTIONS;

export const institution = z.enum(Object.keys(INSTITUTIONS) as Institution[]).describe(
  `Institution code: ${Object.entries(INSTITUTIONS)
    .map(([code, name]) => `"${code}" ${name}`)
    .join(', ')}`,
);

export const directoryId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]+$/, 'Expected a Directory ID like jsmith')
  .toLowerCase()
  .describe('UMD Directory ID (the part of the email before @umd.edu), e.g. "djpines"');

export const searchText = z.string().trim().min(1).optional();

export const personSchema = z.object({
  name: z.string().describe('Full name as listed, e.g. "Darryll J Pines"'),
  directory_id: z
    .string()
    .nullable()
    .describe('UMD Directory ID (local part of a @umd.edu email); null for other institutions'),
  email: z.string().nullable().describe('Email address; null if not published'),
  institution: z.string().nullable().describe('e.g. "University of Maryland, College Park"'),
  title: z.string().nullable().describe('Job title, e.g. "Research Scientist"; null if none'),
  department: z
    .string()
    .nullable()
    .describe('Department as "DIVISION-Department", e.g. "CMNS-Computer Science"'),
  address: z
    .array(z.string())
    .describe('Office address lines (building, street, city); empty if not published'),
  phone: z.string().nullable().describe('Work phone, e.g. "+1 301 405 5803"; null if none'),
});

export const searchResultsSchema = z.object({
  count: z.number().int().describe('Number of people returned'),
  limit_reached: z
    .boolean()
    .describe(
      'true when the directory capped the results (50 anonymously, 100 signed in); narrow the search to see the rest',
    ),
  message: z
    .string()
    .nullable()
    .describe(
      'Notice the directory showed instead of results, e.g. "No users found"; null otherwise',
    ),
  people: z.array(personSchema).describe('Matching people in the order the directory lists them'),
});

export type Person = z.infer<typeof personSchema>;
export type SearchResults = z.infer<typeof searchResultsSchema>;
