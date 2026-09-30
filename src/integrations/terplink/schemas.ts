import { z } from 'zod';
import { pagination, postalAddressSchema } from '../../common.js';

export const SITE = 'https://terplink.umd.edu';

export const IMAGE_ROOT = 'https://se-images.campuslabs.com/clink/images/';

/** Event themes as the API spells them; "Unknown" appears on old events only. */
export const EVENT_THEMES = [
  'Arts',
  'Athletics',
  'CommunityService',
  'Cultural',
  'Fundraising',
  'GroupBusiness',
  'Social',
  'Spirituality',
  'ThoughtfulLearning',
  'Unknown',
] as const;

export type EventTheme = (typeof EVENT_THEMES)[number];

export const eventTheme = z.enum(EVENT_THEMES);

/** Perks keyed by the code the search filter and event detail use, valued as results spell them. */
export const EVENT_BENEFITS = {
  Credit: 'Credit',
  FreeFood: 'Free Food',
  Merchandise: 'Free Stuff',
} as const;

export type BenefitCode = keyof typeof EVENT_BENEFITS;

export type EventBenefit = (typeof EVENT_BENEFITS)[BenefitCode];

export const eventBenefit = z.enum(Object.values(EVENT_BENEFITS) as EventBenefit[]);

export const paging = pagination(20, 50);

export const ids = (what: string) =>
  z.array(z.number().int()).min(1).optional().describe(`Only ${what} with any of these ids`);

export const searchQuery = (where: string) =>
  z.string().trim().min(1).optional().describe(`Words to match in the ${where}`);

export const websiteKey = z
  .string()
  .trim()
  .min(1)
  .describe('Organization website key, the last part of its TerpLink URL, e.g. "kedma"');

const total = (what: string) => z.number().int().describe(`${what} matching the query`);

const publicPage = z.string().describe('Public TerpLink page');

const isoTimestamp = z.string().describe('ISO 8601 timestamp');

export const categorySchema = z.object({
  id: z.number().int().describe('Category id, usable as a filter'),
  name: z.string().describe('Category name, e.g. "Cultural/Ethnic"'),
});

export const organizationSummarySchema = z.object({
  id: z.number().int().describe('Organization id'),
  name: z.string().describe('Organization name'),
  short_name: z.string().nullable().describe('Abbreviation or nickname'),
  website_key: z
    .string()
    .describe('Pass to terplink_get_organization; the last part of the public URL'),
  url: publicPage,
  summary: z.string().nullable().describe('One-paragraph summary'),
  description: z.string().nullable().describe('Full description as plain text'),
  category_ids: z.array(z.number().int()).describe('Ids of the categories the organization is in'),
  categories: z.array(z.string()).describe('Category names, e.g. "SGA Recognized"'),
  // Open value set: only "Active" was observed, but the API does not document the others.
  status: z.string().describe('Registration status, e.g. "Active"'),
  image_url: z.string().nullable().describe('Profile picture'),
});

export const organizationSchema = organizationSummarySchema.extend({
  email: z.string().nullable().describe('Contact email'),
  type: z.string().nullable().describe('e.g. "Registered Student Organization - Spring"'),
  started: isoTimestamp.nullable().describe('When the organization was registered'),
  primary_contact: z.string().nullable().describe('Name of the primary contact'),
  social_media: z
    .object({
      website: z.string().nullable(),
      facebook: z.string().nullable(),
      instagram: z.string().nullable(),
      twitter: z.string().nullable(),
      linkedin: z.string().nullable(),
      youtube: z.string().nullable(),
    })
    .describe('Links the organization lists; null where none'),
  phone: z.string().nullable().describe('Contact phone'),
  address: z.string().nullable().describe('Mailing address on one line'),
});

const eventHost = z
  .object({
    id: z.number().int().describe('Organization id'),
    name: z.string().describe('Organization name'),
  })
  .describe('The hosting organization');

export const eventSummarySchema = z.object({
  id: z.number().int().describe('Event id, for terplink_get_event'),
  name: z.string().describe('Event name'),
  description: z.string().nullable().describe('Description as plain text'),
  location: z.string().nullable().describe('Location as entered, e.g. "Stamp 1234" or "Online"'),
  starts_on: isoTimestamp.describe('Start, ISO 8601'),
  ends_on: isoTimestamp.describe('End, ISO 8601'),
  organization: eventHost,
  theme: eventTheme.describe('Theme the host picked'),
  categories: z.array(z.string()).describe('Category names'),
  benefits: z.array(eventBenefit).describe('Perks advertised, e.g. "Free Food"'),
  rsvp_total: z.number().int().describe('RSVPs so far'),
  image_url: z.string().nullable().describe('Event image'),
  url: publicPage,
});

export const eventAddressSchema = postalAddressSchema
  .extend({
    name: z.string().nullable().describe('Venue name, e.g. "Online" or a building'),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    online_location: z.string().nullable().describe('Meeting link for online events'),
    instructions: z.string().nullable().describe('Directions or joining instructions'),
    provider: z.string().nullable().describe('Online meeting provider, e.g. "Zoom"'),
  })
  .describe('Where the event is held');

export const eventSchema = eventSummarySchema.omit({ location: true }).extend({
  address: eventAddressSchema,
  co_hosts: z.array(z.number().int()).describe('Ids of every hosting organization'),
  rsvp: z
    .object({
      total: z.number().int().describe('RSVPs so far'),
      total_allowed: z.number().int().nullable().describe('Capacity; null when unlimited'),
      spots_available: z.number().int().nullable().describe('Spots left; null when unlimited'),
      invite_only: z.boolean().describe('true when RSVPs need an invitation'),
    })
    .describe('RSVP settings and counts'),
  // Open value set: only "Public" is reachable anonymously; other values exist behind login.
  visibility: z.string().describe('Who can see the event, e.g. "Public"'),
});

export const articleSummarySchema = z.object({
  id: z.number().int().describe('Article id, for terplink_get_article'),
  title: z.string().describe('Headline'),
  summary: z.string().nullable().describe('Teaser text'),
  published: isoTimestamp.describe('When the article was posted'),
  updated: isoTimestamp.describe('When the article was last edited'),
  organization: z
    .object({
      id: z.number().int().describe('Organization id'),
      name: z.string().describe('Organization name'),
      website_key: z.string().nullable().describe('Pass to terplink_get_organization'),
    })
    .describe('The organization that posted the article'),
  author: z.string().nullable().describe('Author name'),
  image_url: z.string().nullable().describe('Cover image'),
  url: publicPage,
});

export const articleSchema = articleSummarySchema.extend({
  body: z.string().nullable().describe('Article body as plain text'),
});

export const serviceOpportunitySchema = z.object({
  id: z.number().int().describe('Opportunity id'),
  title: z.string().describe('Listing title'),
  description: z.string().nullable().describe('Teaser text'),
  sponsor: z.string().nullable().describe('Organization offering the opportunity'),
  starts_on: isoTimestamp.nullable().describe('Start, when scheduled'),
  ends_on: isoTimestamp.nullable().describe('End, when scheduled'),
  type: z.string().nullable().describe('e.g. "Volunteer"'),
  causes: z.array(z.string()).describe('Causes the listing is tagged with'),
  skills: z.array(z.string()).describe('Skills the listing asks for'),
  image_url: z.string().nullable().describe('Listing image'),
  url: z.string().nullable().describe('Listing on GivePulse'),
});

export const organizationSearchSchema = {
  total: total('Organizations'),
  organizations: z.array(organizationSummarySchema).describe('Matches in name order'),
};

export const eventSearchSchema = {
  total: total('Events'),
  events: z.array(eventSummarySchema).describe('Soonest-ending first'),
};

export const articleSearchSchema = {
  total: total('Articles'),
  articles: z.array(articleSummarySchema).describe('Newest first'),
};

export const serviceOpportunitySearchSchema = {
  total: total('Opportunities'),
  opportunities: z.array(serviceOpportunitySchema).describe('Matches as GivePulse orders them'),
};

export type Category = z.infer<typeof categorySchema>;
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type EventSummary = z.infer<typeof eventSummarySchema>;
export type Event = z.infer<typeof eventSchema>;
export type ArticleSummary = z.infer<typeof articleSummarySchema>;
export type Article = z.infer<typeof articleSchema>;
export type ServiceOpportunity = z.infer<typeof serviceOpportunitySchema>;
export type OrganizationSearch = z.infer<z.ZodObject<typeof organizationSearchSchema>>;
export type EventSearch = z.infer<z.ZodObject<typeof eventSearchSchema>>;
export type ArticleSearch = z.infer<z.ZodObject<typeof articleSearchSchema>>;
export type ServiceOpportunitySearch = z.infer<z.ZodObject<typeof serviceOpportunitySearchSchema>>;
