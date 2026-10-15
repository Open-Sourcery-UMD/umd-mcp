import { z } from 'zod';
import { linkSchema, localDateTime } from '../../../common.js';

export const SITE = 'https://theclarice.umd.edu';

/** Genres the events list filters by, keyed by slug, with the taxonomy term id the site takes. */
export const GENRES = {
  music: 14176,
  theater: 14191,
  dance: 14141,
  'visual-art': 14121,
  'arts-and-crafts': 14126,
  'chamber-music': 15121,
  choral: 15126,
  comedy: 14131,
  digital: 14171,
  family: 14986,
  film: 14151,
  'global-and-traditions': 15131,
  holiday: 15136,
  jazz: 15141,
  opera: 15146,
  orchestral: 15151,
  other: 14181,
  puppetry: 15156,
  vocal: 15161,
  'winds-and-percussion': 15166,
  'words-and-ideas': 14136,
} as const;

/** Event categories the events list filters by, keyed by slug, with the taxonomy term id. */
export const CATEGORIES = {
  assembly: 1041,
  broadcast: 15211,
  'brown-bag-lunch': 1046,
  'career-activities': 1051,
  colloquium: 1056,
  commencement: 1061,
  'committee-meeting': 14066,
  conference: 1066,
  deadline: 1071,
  dialogue: 1076,
  discussion: 1081,
  dissertation: 1086,
  exhibition: 1091,
  festival: 15216,
  film: 1096,
  forum: 1101,
  free: 15261,
  gathering: 15221,
  holiday: 1106,
  'honors-and-awards': 1111,
  interactive: 15226,
  lab: 1116,
  lecture: 1121,
  livestream: 15231,
  masterclass: 1126,
  other: 1131,
  performance: 1136,
  presentation: 15236,
  'professional-development': 15241,
  'qualifying-defense': 1141,
  recruitment: 1146,
  'research-and-scholarly-work': 1151,
  screening: 15246,
  social: 14071,
  'speaker-series': 1156,
  'student-recital': 15306,
  symposium: 1161,
  workshop: 1166,
} as const;

/** Presenters the events list filters by, keyed by slug, with the taxonomy term id. */
export const PRESENTERS = {
  'clarice-presents': 14196,
  'nextnow-fest': 15251,
  'noi-f': 15256,
  'school-of-music': 14201,
  'school-of-theatre-dance-and-performance-studies': 14206,
  'performing-arts-library': 14211,
  'arts-for-all': 14951,
  'college-of-arts-and-humanities': 14956,
  'm-ncppc': 14216,
  other: 14221,
} as const;

/** Presenter names as the site prints them, mapped to the slugs `PRESENTERS` is keyed by. */
export const PRESENTER_NAMES = {
  'Clarice Presents': 'clarice-presents',
  'NextNOW Fest': 'nextnow-fest',
  'NOI+F': 'noi-f',
  'UMD School of Music': 'school-of-music',
  'UMD School of Theatre, Dance, and Performance Studies':
    'school-of-theatre-dance-and-performance-studies',
  'Michelle Smith Performing Arts Library': 'performing-arts-library',
  'Arts for All': 'arts-for-all',
  'College of Arts and Humanities': 'college-of-arts-and-humanities',
  'The Maryland-National Capital Park and Planning Commission': 'm-ncppc',
  Other: 'other',
} as const satisfies Record<string, keyof typeof PRESENTERS>;

/** How seats are sold, as the event page's venue section prints it. */
export const SEATING = {
  'General Admission': 'general_admission',
  'Reserved Seating': 'reserved',
  'Reserved with Multiple Price Levels': 'reserved_price_levels',
} as const;

export type Genre = keyof typeof GENRES;
export type Category = keyof typeof CATEGORIES;
export type Presenter = keyof typeof PRESENTERS;
export type Seating = (typeof SEATING)[keyof typeof SEATING];

export const genre = z.enum(Object.keys(GENRES) as Genre[]);
export const category = z.enum(Object.keys(CATEGORIES) as Category[]);
export const presenter = z.enum(Object.keys(PRESENTERS) as Presenter[]);
export const seating = z.enum(Object.values(SEATING) as Seating[]);

/** The last segment of an event page URL. */
export const eventSlug = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]+$/, 'Expected an event slug like mr-burns-post-electric-play')
  .describe('Event slug from clarice_search_events, e.g. "mr-burns-post-electric-play"');

export const presentersSchema = z
  .array(presenter)
  .describe('Who presents the event, e.g. ["school-of-music"]');

export const eventSummarySchema = z.object({
  slug: z.string().describe('Event slug to pass to clarice_get_event'),
  title: z.string().describe('Event title as listed'),
  url: z.string().describe('Event page on theclarice.umd.edu'),
  presenters: presentersSchema,
  start: localDateTime('When this performance starts'),
  livestream: z.boolean().describe('true when the performance is also streamed online'),
  accessibility: z
    .array(z.string())
    .describe('Accessibility services offered, e.g. "Open Captioning"; empty when none listed'),
  image_url: z.string().nullable().describe('Card image; null when the event has none'),
});

export const performanceSchema = z.object({
  start: localDateTime('When the performance starts'),
  venue: z
    .string()
    .nullable()
    .describe('Hall, e.g. "Kay Theatre"; null for a performance that has already happened'),
  livestream: z
    .boolean()
    .nullable()
    .describe('true when the performance is streamed online; null when the page does not say'),
  cancelled: z.boolean().describe('true when the performance is cancelled'),
  sold_out: z.boolean().describe('true when the performance is sold out'),
  link: linkSchema
    .nullable()
    .describe('The button the page shows instead of tickets, e.g. a livestream; null when none'),
});

export const eventSchema = z.object({
  slug: z.string().describe('Event slug'),
  title: z.string().describe('Event title'),
  subtitle: z.string().nullable().describe('One-line teaser; null when none'),
  url: z.string().describe('Event page on theclarice.umd.edu'),
  presenters: presentersSchema,
  image_url: z.string().nullable().describe('Hero image; null when the event has none'),
  price: z
    .string()
    .nullable()
    .describe(
      'Prices as printed, e.g. "Regular: $30 + $5 booking fee\\nStudents & Youth: $10"; null when not given',
    ),
  venue: z
    .object({
      name: z.string().describe('e.g. "Kay Theatre, The Clarice Smith Performing Arts Center"'),
      url: z.string().nullable().describe("The venue's page; null when not linked"),
      seating: seating.nullable().describe('How seats are sold; null when not given'),
    })
    .nullable()
    .describe('Where the event happens; null when not given'),
  notice: z
    .string()
    .nullable()
    .describe('Advisory shown above the description, e.g. content warnings; null when none'),
  description: z
    .string()
    .nullable()
    .describe('The about section as plain text, with program and artist notes; null when none'),
  performances: z.array(performanceSchema).describe('Every performance, past ones included'),
  tickets_event_id: z
    .string()
    .nullable()
    .describe(
      'Ticketing event id to pass to the clarice_tickets tools; null for an event not sold online',
    ),
  livestream_tickets_event_id: z
    .string()
    .nullable()
    .describe('Ticketing event id of the paid livestream; null when there is none'),
});

export const eventListSchema = z.object({
  events: z
    .array(eventSummarySchema)
    .describe('Upcoming performances in start order; an event with several performances repeats'),
  page: z.number().int().describe('This page number, starting at 1'),
  pages: z.number().int().describe('Number of pages of results'),
});

export type EventSummary = z.infer<typeof eventSummarySchema>;
export type Performance = z.infer<typeof performanceSchema>;
export type Event = z.infer<typeof eventSchema>;
export type EventList = z.infer<typeof eventListSchema>;
