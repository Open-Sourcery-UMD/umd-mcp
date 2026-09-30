import * as cheerio from 'cheerio';
import { ClientError, gql, GraphQLClient } from 'graphql-request';
import { getText } from '../../lib/http.js';

export const SITE = 'https://calendar.umd.edu';

/** The public read-only token the search page ships; refreshed from the bundle if it rotates. */
const DEFAULT_TOKEN = 'ty5hts_R6EWaNT8zBYqVT8edynE0f9cK';

/** Fields selected for every event; the interface needs the selection repeated per type. */
const EVENT_FIELDS = `
  id slug title url startDateLocalized endDateLocalized allDay multiDay
  summary: commonRichTextTwo
  description: commonRichText
  image: commonAssetHeroImageSingle { url }
  eventType: categoriesEventTypeMultiple { title slug }
  audience: categoryAudienceMultiple { title slug }
  featured: categoriesEventStatus { slug }
  locationType: calendarLocationType
  venue: calendarVenueDescription
  offCampusTitle: calendarOffCampusTitle
  offCampusLink: calendarOffCampusLink
  address: commonAddress { ... on address_Entry { title street1 street2 city state zipCode } }
  tags: categoryTagsMultiple { title }
  contactName: commonPlainTextThree
  contactPhone: commonPlainTextFour
  contactEmail: commonEmailAddress
  calendar { id name handle }
`;

const RECURRENCE_FIELDS = 'rrule freq interval count until byDay byMonth byMonthDay postDate';

/** Selects `fields` on both concrete event types the `events`/`event` interface can return. */
function onEventTypes(fields: string): string {
  return `... on submission_Event { ${fields} } ... on communications_Event { ${fields} }`;
}

/**
 * The search document. `rangeEnd` is only declared when an end date is given: the API fails
 * with "Something went wrong" when it is passed explicitly as null.
 */
export function searchDocument(withEnd: boolean): string {
  const rangeEnd = withEnd ? 'rangeEnd: $endDate' : '';
  const filters = `rangeStart: $startDate ${rangeEnd} search: $searchQuery relatedTo: $related loadOccurrences: true`;
  return gql`
    query EventSearch(
      $offset: Int!
      $limit: Int!
      $related: [QueryArgument]!
      $startDate: String!
      ${withEnd ? '$endDate: String!' : ''}
      $searchQuery: String
    ) {
      solspace_calendar {
        eventCount(${filters})
        events(limit: $limit, offset: $offset, ${filters}) { ${onEventTypes(EVENT_FIELDS)} }
      }
    }
  `;
}

/** The single-event document, looked up by id (`[Int]`) or by slug (`[String]`). */
export function eventDocument(by: 'id' | 'slug'): string {
  return gql`
    query Event($${by}: ${by === 'id' ? '[Int]' : '[String]'}) {
      solspace_calendar {
        event(${by}: $${by}) { ${onEventTypes(`${EVENT_FIELDS} ${RECURRENCE_FIELDS}`)} }
      }
    }
  `;
}

export const CATEGORIES_QUERY = gql`
  query Categories {
    categories(limit: 100) {
      id
      title
      slug
      groupHandle
    }
  }
`;

function newClient(token: string): GraphQLClient {
  return new GraphQLClient(`${SITE}/graphql`, { headers: { authorization: `Bearer ${token}` } });
}

let client = newClient(DEFAULT_TOKEN);

/** The bearer token the public search page currently ships. */
async function currentToken(): Promise<string> {
  const $ = cheerio.load(await getText(SITE, 'search'));
  const src = $('script[src*="/search."]').first().attr('src');
  if (src === undefined) throw new Error('calendar: search page has no script bundle');
  const token = /Bearer ([A-Za-z0-9_]+)/.exec(await getText(SITE, src))?.[1];
  if (token === undefined) throw new Error('calendar: search bundle has no bearer token');
  return token;
}

/**
 * Runs a query; if the site rejects the token (it rotates on redeploy), reads the current one
 * out of the search page's bundle and retries once.
 */
export async function query<T>(document: string, variables: Record<string, unknown>): Promise<T> {
  try {
    return await client.request<T>(document, variables);
  } catch (error) {
    if (!(error instanceof ClientError) || ![400, 401].includes(error.response.status)) {
      throw error;
    }
    client = newClient(await currentToken());
    return client.request<T>(document, variables);
  }
}
