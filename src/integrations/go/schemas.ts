import { z } from 'zod';
import { isoDate } from '../../common.js';

export const SITE = 'https://go.umd.edu';

/** What the "My Links" table can be sorted by, keyed to the column's position in the table. */
export const LINK_SORTS = { keyword: 3, collection: 4, clicks: 5, created: 6 } as const;

export type LinkSort = keyof typeof LINK_SORTS;

export const linkSort = z
  .enum(Object.keys(LINK_SORTS) as LinkSort[])
  .default('created')
  .describe('Sort by keyword, collection name, click count or creation date (default "created")');

export const sortOrder = z
  .enum(['asc', 'desc'])
  .default('desc')
  .describe('Sort direction (default "desc")');

export const TRANSFER_OUTCOMES = ['approved', 'pending', 'rejected'] as const;

export type TransferOutcome = (typeof TRANSFER_OUTCOMES)[number];

export const transferOutcome = z.enum(TRANSFER_OUTCOMES);

export const keyword = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]+$/, 'Expected a keyword like cs-advising')
  .describe('Keyword of the short link (the part after go.umd.edu/), e.g. "cs-advising"');

export const collectionId = z.number().int().describe('Collection id, from go_list_collections');

export const userId = z.number().int().describe('User id, from go_list_collection_members');

export const transferRequestId = z
  .number()
  .int()
  .describe('Transfer request id, from go_list_transfer_requests');

export const uid = z
  .string()
  .trim()
  .min(1)
  .describe('UMD Directory ID, from go_lookup_users, e.g. "djpines"');

const destination = z.string().describe('Where the short link redirects to');

const clicks = (when: string) => z.number().int().describe(`Clicks ${when}`);

const clickSeries = (label: string, when: string) =>
  z
    .array(z.object({ label: z.string().describe(label), clicks: clicks('in that period') }))
    .describe(`Clicks ${when}; periods with no clicks are omitted`);

export const linkSchema = z.object({
  id: z.number().int().describe('Link id'),
  keyword,
  short_url: z.string().describe('The short link, e.g. "https://go.umd.edu/cs-advising"'),
  url: destination,
  note: z.string().nullable().describe('Note the owner attached; null if none'),
  collection_id: z
    .number()
    .int()
    .describe('Id of the collection the link is in (the personal space is a collection too)'),
  collection: z
    .string()
    .nullable()
    .describe('Name of the collection the link is in; null when it is in the personal space'),
  total_clicks: clicks('since the link was created'),
  created: isoDate.describe('Date the link was created'),
});

export const linkStatsSchema = linkSchema.extend({
  clicks_by_hour: clickSeries('Hour in campus time, e.g. "03:00PM"', 'in the last 24 hours'),
  clicks_by_day_7: clickSeries('Day as MM/DD', 'in the last 7 days'),
  clicks_by_day_30: clickSeries('Day as MM/DD', 'in the last 30 days'),
  clicks_by_month: clickSeries('Month as MM/YYYY', 'since the link was created'),
  best_day: z
    .object({ date: isoDate, clicks: clicks('that day') })
    .nullable()
    .describe('The day with the most clicks; null if the link has never been clicked'),
  clicks_by_country: z
    .array(
      z.object({
        country: z
          .string()
          .nullable()
          .describe(
            'Two-letter country code, e.g. "US"; null when the visitor could not be placed',
          ),
        clicks: clicks('from that country'),
      }),
    )
    .describe('Where the clicks came from, all time'),
});

export const collectionSchema = z.object({
  id: z.number().int().describe('Collection id'),
  name: z.string().describe('Collection name'),
  description: z.string().nullable().describe('Description; null if none'),
  members: z.number().int().describe('People who can manage its links'),
  links: z.number().int().describe('Links in it'),
  created: isoDate.describe('Date the collection was created'),
});

export const memberSchema = z.object({
  id: z.number().int().describe('User id, for go_remove_collection_member'),
  name: z.string().describe('Full name'),
  email: z.string().nullable().describe('Email address; null if unknown'),
});

export const userSchema = z.object({
  uid: z.string().describe('UMD Directory ID, e.g. "djpines"'),
  name: z.string().describe('Full name'),
});

export const transferRequestSchema = z.object({
  id: z.number().int().describe('Transfer request id'),
  from: z
    .string()
    .nullable()
    .describe('Directory ID of the person giving the links; null when that is you'),
  to: z
    .string()
    .nullable()
    .describe('Directory ID of the person receiving the links; null when that is you'),
  links: z.array(z.object({ keyword, url: destination })).describe('The links being handed over'),
});

export const transferRequestsSchema = {
  incoming: z
    .array(transferRequestSchema)
    .describe(
      'Links others offered you, each awaiting go_accept_transfer_request or go_reject_transfer_request',
    ),
  outgoing: z
    .array(transferRequestSchema)
    .describe('Links you offered others that they have not accepted yet'),
};

export type Link = z.infer<typeof linkSchema>;
export type LinkStats = z.infer<typeof linkStatsSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type Member = z.infer<typeof memberSchema>;
export type User = z.infer<typeof userSchema>;
export type TransferRequest = z.infer<typeof transferRequestSchema>;
export type TransferRequests = z.infer<z.ZodObject<typeof transferRequestsSchema>>;
