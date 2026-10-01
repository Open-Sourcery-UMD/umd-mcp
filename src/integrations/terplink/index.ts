import { TZDate } from '@date-fns/tz';
import { addDays, format } from 'date-fns';
import { invert } from 'lodash-es';
import { z } from 'zod';
import { CAMPUS_TIME_ZONE, decode, isoDate } from '../../common.js';
import type { Query } from '../../lib/http.js';
import { Integration, tool } from '../base.js';
import {
  type Page,
  type RawArticle,
  type RawCategory,
  type RawEvent,
  type RawEventSearch,
  type RawOrganization,
  type RawOrganizationSearch,
  type RawServiceOpportunity,
  type SearchPage,
  toArticle,
  toArticleSummary,
  toCategory,
  toEvent,
  toEventSummary,
  toOrganization,
  toOrganizationSummary,
  toServiceOpportunity,
} from './mappers.js';
import {
  type Article,
  type ArticleSearch,
  type BenefitCode,
  articleSchema,
  articleSearchSchema,
  type Category,
  categorySchema,
  type Event,
  EVENT_BENEFITS,
  type EventBenefit,
  type EventSearch,
  type EventTheme,
  eventBenefit,
  eventSchema,
  eventSearchSchema,
  eventTheme,
  ids,
  type Organization,
  type OrganizationSearch,
  organizationSchema,
  organizationSearchSchema,
  PAGE_SIZE,
  paging,
  searchQuery,
  type ServiceOpportunitySearch,
  serviceOpportunitySearchSchema,
  websiteKey,
} from './schemas.js';

/** Perk names as results spell them, back to the code the search filter takes. */
const BENEFIT_CODES = invert(EVENT_BENEFITS) as Record<EventBenefit, BenefitCode>;

const TIMESTAMP_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX";

/** Midnight at the start of `date` in College Park, formatted the way the site sends it. */
function localStart(date: string): string {
  return format(new TZDate(`${date}T00:00:00`, CAMPUS_TIME_ZONE), TIMESTAMP_FORMAT);
}

/** Midnight at the end of `date` in College Park, i.e. the start of the following day. */
function localEnd(date: string): string {
  return format(addDays(new TZDate(`${date}T00:00:00`, CAMPUS_TIME_ZONE), 1), TIMESTAMP_FORMAT);
}

export class TerpLink extends Integration {
  readonly name = 'terplink';
  readonly baseUrl = 'https://terplink.umd.edu/api/discovery';

  /** Every item of a plain REST list, paged through `take`/`skip` until `totalItems` are in hand. */
  private async allItems<T>(path: string, query: Query): Promise<T[]> {
    const items: T[] = [];
    let total = 0;
    do {
      const page = await this.get<Page<T>>(path, { ...query, take: PAGE_SIZE, skip: items.length });
      if (page.items.length === 0) break;
      items.push(...page.items);
      total = page.totalItems;
    } while (items.length < total);
    if (items.length < total) {
      throw new Error(`${this.name}: ${path} returned ${items.length} of ${total} items`);
    }
    return items;
  }

  @tool({
    title: 'Search organizations',
    description:
      'Search the roughly 1,000 active student organizations on TerpLink by name or keyword, optionally within categories from terplink_list_organization_categories. Returns summaries; call terplink_get_organization for contact details. No login needed.',
    input: {
      query: searchQuery('name or description'),
      category_ids: ids('organizations'),
      ...paging,
    },
    output: organizationSearchSchema,
  })
  async search_organizations({
    query,
    category_ids,
    limit,
    offset,
  }: {
    query?: string | undefined;
    category_ids?: number[] | undefined;
    limit: number;
    offset: number;
  }): Promise<OrganizationSearch> {
    const page = await this.get<SearchPage<RawOrganizationSearch>>('search/organizations', {
      top: limit,
      skip: offset,
      query,
      filter: category_ids?.map((id) => `CategoryIds/any(c: c eq '${id}')`).join(' or '),
      'orderBy[0]': 'UpperName asc',
    });
    return { total: page['@odata.count'], organizations: page.value.map(toOrganizationSummary) };
  }

  @tool({
    title: 'Get an organization',
    description:
      'Full profile of one TerpLink student organization: description, email, type, primary contact, social links and mailing address. No login needed.',
    input: {
      organization: websiteKey.describe(
        'Website key (e.g. "kedma", from terplink_search_organizations or the public URL) or numeric organization id',
      ),
    },
    output: organizationSchema.shape,
  })
  async get_organization({ organization }: { organization: string }): Promise<Organization> {
    const path = /^\d+$/.test(organization)
      ? `organization/${organization}`
      : `organization/bykey/${encodeURIComponent(organization)}`;
    const raw = await this.get<RawOrganization>(path);
    // The detail endpoint leaves `categories` empty; the search index has them.
    const page = await this.get<SearchPage<RawOrganizationSearch>>('search/organizations', {
      top: 1,
      filter: `Id eq '${raw.id}'`,
    });
    return toOrganization(raw, page.value[0]);
  }

  @tool({
    title: 'List organization categories',
    description:
      'The categories TerpLink files student organizations under (Academic, Cultural/Ethnic, Honor Society, ...). Use the ids with terplink_search_organizations. No login needed.',
    input: {},
    output: { categories: z.array(categorySchema).describe('Categories in name order') },
  })
  async list_organization_categories(): Promise<{ categories: Category[] }> {
    const items = await this.allItems<RawCategory>('organization/category', {
      orderByField: 'name',
    });
    return { categories: items.map(toCategory) };
  }

  @tool({
    title: 'Search events',
    description:
      'Search TerpLink events by keyword, date range, hosting organization, category, theme or perk. Upcoming and ongoing events only unless include_past is set. Times are ISO 8601. No login needed.',
    input: {
      query: searchQuery('name or description'),
      starts_after: isoDate.optional().describe('Only events starting on or after this date'),
      ends_before: isoDate.optional().describe('Only events ending on or before this date'),
      include_past: z
        .boolean()
        .default(false)
        .describe('Also return events that have already ended (default false)'),
      organization_ids: ids('events hosted by organizations'),
      category_ids: ids('events in categories (see terplink_list_event_categories)'),
      themes: z
        .array(eventTheme)
        .min(1)
        .optional()
        .describe('Only events with any of these themes'),
      benefits: z
        .array(eventBenefit)
        .min(1)
        .optional()
        .describe('Only events offering these perks'),
      ...paging,
    },
    output: eventSearchSchema,
  })
  async search_events({
    query,
    starts_after,
    ends_before,
    include_past,
    organization_ids,
    category_ids,
    themes,
    benefits,
    limit,
    offset,
  }: {
    query?: string | undefined;
    starts_after?: string | undefined;
    ends_before?: string | undefined;
    include_past: boolean;
    organization_ids?: number[] | undefined;
    category_ids?: number[] | undefined;
    themes?: EventTheme[] | undefined;
    benefits?: EventBenefit[] | undefined;
    limit: number;
    offset: number;
  }): Promise<EventSearch> {
    // Multi-valued filters go as repeated keys, which an array query value produces.
    const page = await this.get<SearchPage<RawEventSearch>>('event/search', {
      take: limit,
      skip: offset,
      query,
      endsAfter: include_past ? undefined : format(TZDate.tz(CAMPUS_TIME_ZONE), TIMESTAMP_FORMAT),
      startsAfter: starts_after === undefined ? undefined : localStart(starts_after),
      endsBefore: ends_before === undefined ? undefined : localEnd(ends_before),
      orderByField: 'endsOn',
      orderByDirection: 'ascending',
      status: 'Approved',
      organizationIds: organization_ids,
      categoryIds: category_ids,
      themes,
      benefitNames: benefits?.map((benefit) => decode(BENEFIT_CODES, benefit, 'event benefit')),
    });
    return { total: page['@odata.count'], events: page.value.map(toEventSummary) };
  }

  @tool({
    title: 'Get an event',
    description:
      'Full details of one TerpLink event: description, venue or meeting link, hosts, categories, perks and RSVP capacity. No login needed.',
    input: { event_id: z.number().int().describe('Event id from terplink_search_events') },
    output: eventSchema.shape,
  })
  async get_event({ event_id }: { event_id: number }): Promise<Event> {
    const raw = await this.get<RawEvent>(`event/${event_id}`);
    const host = await this.get<RawOrganization>(`organization/${raw.organizationId}`);
    return toEvent(raw, host.name);
  }

  @tool({
    title: 'List event categories',
    description:
      'The categories TerpLink events are tagged with (Academic, Service, Sports and Recreation, ...). Use the ids with terplink_search_events. No login needed.',
    input: {},
    output: { categories: z.array(categorySchema).describe('Categories as the site orders them') },
  })
  async list_event_categories(): Promise<{ categories: Category[] }> {
    return { categories: (await this.allItems<RawCategory>('category', {})).map(toCategory) };
  }

  @tool({
    title: 'Get news',
    description:
      'News articles student organizations and departments post on TerpLink, newest first, optionally filtered by keyword or organization. Call terplink_get_article for the body. No login needed.',
    input: {
      query: searchQuery('title or body'),
      organization_id: z.number().int().optional().describe('Only articles from this organization'),
      ...paging,
    },
    output: articleSearchSchema,
  })
  async get_news({
    query,
    organization_id,
    limit,
    offset,
  }: {
    query?: string | undefined;
    organization_id?: number | undefined;
    limit: number;
    offset: number;
  }): Promise<ArticleSearch> {
    const page = await this.get<Page<RawArticle>>('article/search', {
      take: limit,
      skip: offset,
      search: query,
      organizationIds: organization_id,
      orderByField: 'LastUpdatedOn',
      orderByDirection: 'descending',
    });
    return { total: page.totalItems, articles: page.items.map(toArticleSummary) };
  }

  @tool({
    title: 'Get an article',
    description: 'One TerpLink news article with its full body as plain text. No login needed.',
    input: { article_id: z.number().int().describe('Article id from terplink_get_news') },
    output: articleSchema.shape,
  })
  async get_article({ article_id }: { article_id: number }): Promise<Article> {
    return toArticle(await this.get<RawArticle>(`article/${article_id}`));
  }

  @tool({
    title: 'Search service opportunities',
    description:
      'Volunteer and community service opportunities listed for UMD students (mirrored from GivePulse), searchable by keyword. Includes past listings. No login needed.',
    input: { query: searchQuery('title or description'), ...paging },
    output: serviceOpportunitySearchSchema,
  })
  async search_service_opportunities({
    query,
    limit,
    offset,
  }: {
    query?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<ServiceOpportunitySearch> {
    const page = await this.get<SearchPage<RawServiceOpportunity>>('search/serviceopportunities', {
      top: limit,
      skip: offset,
      query,
    });
    return { total: page['@odata.count'], opportunities: page.value.map(toServiceOpportunity) };
  }
}
