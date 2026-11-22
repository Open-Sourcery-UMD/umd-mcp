import { compact, invert } from 'lodash-es';
import { cached } from '../../lib/cache.js';
import type { Query } from '../../lib/http.js';
import { Integration, tool } from '../base.js';
import {
  type RawApplication,
  type RawCampus,
  type RawListing,
  type RawSearch,
  toAreas,
  toListing,
  toListingSearch,
} from './mappers.js';
import {
  type Areas,
  areasSchema,
  type Feature,
  type Listing,
  listingId,
  listingSchema,
  type ListingSearch,
  listingSearchSchema,
  type PropertyType,
  listingFilters,
  SITE,
  type Sort,
  type Sublets,
  SUBLETS,
} from './schemas.js';

/** The filter each sublet choice is sent as. */
const SUBLET_FILTERS = invert(SUBLETS);

/** Bedroom counts as the `beds` filter spells them; 4 stands for four or more. */
const BEDROOMS = ['studio', '1', '2', '3', '4 and up'] as const;

/** Bathroom minimums as the `baths` filter spells them. */
const BATHROOMS: Record<number, string> = { 1: '1', 2: '2', 3: '3 and up' };

/** Miles from campus as the `within` filter words them; the site calls one mile walking distance. */
const DISTANCES: Record<number, string> = {
  1: 'Walking distance',
  2: '2 miles',
  3: '3 miles',
  4: '4 miles',
  5: '5 miles',
};

/** The rent range as the `price` filter words it: "under 1500", "900 to 1500", "900 or more". */
function rentRange(min: number | undefined, max: number | undefined): string | undefined {
  if (min !== undefined && max !== undefined) return `${min} to ${max}`;
  if (max !== undefined) return `under ${max}`;
  return min === undefined ? undefined : `${min} or more`;
}

/** One `/name-value` part of a search path */
function segment(name: string, value: string | number | undefined): string | undefined {
  return value === undefined ? undefined : `${name}-${String(value).replaceAll(' ', '+')}`;
}

/**
 * The Off-Campus Housing database
 */
export class OffCampusHousing extends Integration {
  readonly name = 'och';
  readonly baseUrl = `${SITE}/bff`;

  private async data<T>(path: string, query?: Query): Promise<T> {
    const { data } = await this.get<{ data: T }>(path, query);
    return data;
  }

  private readonly campuses = cached(async (): Promise<RawCampus[]> => {
    const application = await this.data<RawApplication>('application');
    return application.configuration.university.campuses;
  });

  private areaSegment(
    areas: readonly { id: number; url: string }[],
    id: number | undefined,
    what: string,
  ): string | undefined {
    if (id === undefined) return undefined;
    const area = areas.find((candidate) => candidate.id === id);
    if (area === undefined) {
      throw new Error(`${this.name}: no ${what} has the id ${id}`);
    }
    return area.url.split('/').at(-1);
  }

  @tool({
    title: 'List housing areas',
    description:
      'The campuses, neighborhoods and nearby cities the UMD Off-Campus Housing database files listings under. Use the ids with och_search_listings. No login needed.',
    input: {},
    output: areasSchema.shape,
  })
  async list_areas(): Promise<Areas> {
    return toAreas(await this.campuses());
  }

  @tool({
    title: 'Search housing listings',
    description:
      'Search the apartments, houses, rooms and sublets in the UMD Off-Campus Housing database by area, rent, bedrooms, distance to campus, move-in date and amenities, optionally near a campus or in a neighborhood from och_list_areas. Returns summaries; call och_get_listing for floor plans, fees and amenities. No login needed.',
    input: listingFilters,
    output: listingSearchSchema.shape,
  })
  async search_listings({
    campus_id,
    neighborhood_id,
    min_rent,
    max_rent,
    bedrooms,
    min_bathrooms,
    miles,
    move_in,
    occupants,
    property_types = [],
    features = [],
    sublets,
    sort,
    page,
  }: {
    campus_id?: number | undefined;
    neighborhood_id?: number | undefined;
    min_rent?: number | undefined;
    max_rent?: number | undefined;
    bedrooms?: number | undefined;
    min_bathrooms?: number | undefined;
    miles?: number | undefined;
    move_in?: string | undefined;
    occupants?: number | undefined;
    property_types?: PropertyType[] | undefined;
    features?: Feature[] | undefined;
    sublets?: Sublets | undefined;
    sort: Sort;
    page: number;
  }): Promise<ListingSearch> {
    if (campus_id !== undefined && neighborhood_id !== undefined) {
      throw new Error(`${this.name}: pass campus_id or neighborhood_id, not both`);
    }
    const campuses =
      campus_id === undefined && neighborhood_id === undefined ? [] : await this.campuses();

    // Sort the queries to avoid server errors
    const extras = [
      ...new Set([
        ...property_types,
        ...features,
        ...compact([sublets && SUBLET_FILTERS[sublets]]),
      ]),
    ].sort();

    const path = compact([
      '/housing',
      this.areaSegment(campuses, campus_id, 'campus'),
      this.areaSegment(
        campuses.flatMap((campus) => campus.locations),
        neighborhood_id,
        'neighborhood',
      ),
      segment('price', rentRange(min_rent, max_rent)),
      segment('beds', bedrooms === undefined ? undefined : BEDROOMS[bedrooms]),
      segment('baths', min_bathrooms === undefined ? undefined : BATHROOMS[min_bathrooms]),
      segment('within', miles === undefined ? undefined : DISTANCES[miles]),
      segment('move-in', move_in),
      segment('occupancy', occupants),
      segment('extras', extras.length > 0 ? extras.join(',') : undefined),
      segment('page', page > 1 ? page : undefined),
    ]).join('/');

    const search = await this.data<RawSearch>('listing/search/combined', {
      url: sort === 'default' ? path : `${path}?sort=${sort}`,
    });

    return toListingSearch(search);
  }

  @tool({
    title: 'Get a housing listing',
    description:
      'Full details of one off-campus housing listing: address, rent, contact phone, description, floor plans with availability, fees, amenities, utilities, pet policy, walk and transit scores and nearby rail stations. No login needed.',
    input: { listing: listingId },
    output: listingSchema.shape,
  })
  async get_listing({ listing }: { listing: string }): Promise<Listing> {
    return toListing(await this.data<RawListing>(`listing/${listing}`));
  }
}
