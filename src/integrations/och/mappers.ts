import { unescape, uniqBy } from 'lodash-es';
import { decode } from '../../common.js';
import { isoDay } from '../../lib/dates.js';
import { collapse, lines, list, numeric, prose, trimmed } from '../../lib/text.js';
import {
  type Areas,
  AVAILABILITIES,
  type Fee,
  type FloorPlan,
  type Listing,
  type ListingSearch,
  type ListingSummary,
  SITE,
} from './schemas.js';

type RawCoordinates = { latitude: number; longitude: number };

type RawNeighborhood = { id: number; name: string; url: string; coordinates: RawCoordinates };

export type RawCampus = {
  id: number;
  name: string;
  url: string;
  isPrimary: boolean;
  coordinate: RawCoordinates;
  locations: RawNeighborhood[];
};

/** `/application`: the site's configuration, which carries the campuses and neighborhoods. */
export type RawApplication = { configuration: { university: { campuses: RawCampus[] } } };

type RawRange = { low: number | null; high: number | null };

/** What a search result ("placard") and a full listing have in common. */
type RawSummary = {
  siteId: string;
  name: string;
  profileUrl: string;
  leads: { phone?: { formatted: string } };
  geography: RawCoordinates & {
    streetAddress: string;
    cityName: string;
    stateCode: string;
    zipCode: string;
    colleges: { id: string; distance?: number }[];
  };
  hideMapPin: boolean;
  totalMonthlyPrice: string;
  floorPlanSummary: {
    /** The floor plans matching the search's filters; all of them on a full listing. */
    matching: { beds: RawRange; price: RawRange & { callForPrice: boolean } };
    hasPerBedPricing: boolean;
    totalAvailableUnits?: number;
  };
  standardLeaseTerm?: string;
  isSublet: boolean;
  isSharedSpace: boolean;
  ratingStars: { rating?: number };
  lastUpdated: string;
};

export type RawSearch = {
  placards: RawSummary[];
  metadata: { totalExact: number; totalPages: number };
};

type RawAmenity = { name: string };

type RawFloorPlan = {
  name: string | null;
  beds: number;
  baths: number;
  priceRange?: string;
  priceLow?: number;
  priceHigh?: number;
  perBedPricing: boolean;
  squareFeet?: string;
  deposit: number | null;
  maxOccupants: number | null;
  availability: string;
  availableDate?: string;
  unitsAvailable: number;
  specialOffer?: { body: string };
};

type RawFee = { label: string; value: string; tooltipContent?: string | null };

type RawFeeGroup = { heading?: string; list: RawFee[]; subGroups?: RawFeeGroup[] };

type RawPolicy = { heading: string; list: RawFeeGroup[] };

type RawTrip = { distance: number; time: number };

type RawStation = { name: string; walk: RawTrip; drive: RawTrip };

type RawScore = { score: number };

export type RawListing = RawSummary & {
  propertyType: string;
  pmcInfo: { name?: string };
  siteTexts: { propertyWebsiteLink?: string; promoText?: string[]; officeHours?: string[] };
  longDescription: string;
  petTolerance: string;
  totalUnits?: number;
  leaseTerms: { isSubletAllowed: boolean };
  sublet: { start: string | null; end: string | null };
  expenses: { utilities: RawAmenity[] };
  amenityGroups: { categoryName: string; items: RawAmenity[] }[];
  floorPlans: RawFloorPlan[];
  policies: RawPolicy[];
  walkScoreInfo: { walk?: RawScore; bike?: RawScore; transit?: RawScore };
  pointsOfInterest: { transitStations?: RawStation[] };
};

export function toAreas(campuses: RawCampus[]): Areas {
  return {
    campuses: campuses.map((campus) => ({
      id: campus.id,
      name: campus.name,
      is_primary: campus.isPrimary,
      ...campus.coordinate,
    })),
    // Every campus repeats the same neighborhood list.
    neighborhoods: uniqBy(
      campuses.flatMap((campus) => campus.locations),
      'id',
    ).map((neighborhood) => ({
      id: neighborhood.id,
      name: neighborhood.name,
      ...neighborhood.coordinates,
    })),
  };
}

function toListingSummary(raw: RawSummary): ListingSummary {
  const { geography, floorPlanSummary } = raw;
  const { beds, price } = floorPlanSummary.matching;
  return {
    id: raw.siteId,
    name: collapse(unescape(raw.name)),
    url: `${SITE}${raw.profileUrl}`,
    phone: trimmed(raw.leads.phone?.formatted),
    address: {
      street: lines([geography.streetAddress]),
      city: trimmed(geography.cityName),
      state: trimmed(geography.stateCode),
      zip: trimmed(geography.zipCode),
    },
    latitude: raw.hideMapPin ? null : geography.latitude,
    longitude: raw.hideMapPin ? null : geography.longitude,
    rent: raw.totalMonthlyPrice,
    rent_low: price.callForPrice ? null : price.low,
    rent_high: price.callForPrice ? null : price.high,
    per_bedroom: floorPlanSummary.hasPerBedPricing,
    bedrooms_low: beds.low ?? 0,
    bedrooms_high: beds.high ?? 0,
    campuses: geography.colleges.map((college) => ({
      id: Number(college.id),
      miles: college.distance ?? null,
    })),
    lease_term: trimmed(raw.standardLeaseTerm),
    is_sublet: raw.isSublet,
    is_shared_space: raw.isSharedSpace,
    rating: raw.ratingStars.rating ?? null,
    updated: raw.lastUpdated,
  };
}

export function toListingSearch(raw: RawSearch): ListingSearch {
  return {
    total: raw.metadata.totalExact,
    pages: raw.metadata.totalPages,
    listings: raw.placards.map(toListingSummary),
  };
}

function toFloorPlan(raw: RawFloorPlan): FloorPlan {
  return {
    name: trimmed(raw.name),
    bedrooms: raw.beds,
    bathrooms: raw.baths,
    rent: trimmed(raw.priceRange),
    rent_low: raw.priceLow ?? null,
    rent_high: raw.priceHigh ?? null,
    per_bedroom: raw.perBedPricing,
    // Printed as "1,326 sq. ft.".
    square_feet: numeric(raw.squareFeet?.replace(/\D/g, '')),
    deposit: raw.deposit,
    max_occupants: raw.maxOccupants,
    availability: decode(AVAILABILITIES, raw.availability, 'floor plan availability'),
    available: isoDay(raw.availableDate),
    units_available: raw.unitsAvailable,
    special_offer: prose(raw.specialOffer?.body),
  };
}

/** A policy's fee groups as flat rows; "Required Fees" nests its groups one level deeper. */
function toFees(policy: RawPolicy): Fee[] {
  const rows = (group: RawFeeGroup, ...headings: (string | undefined)[]): Fee[] => [
    ...group.list.map((fee) => ({
      category: policy.heading,
      group: trimmed(lines(headings).join(', ')),
      name: fee.label,
      amount: trimmed(fee.value),
      note: trimmed(fee.tooltipContent),
    })),
    ...list<RawFeeGroup>(group.subGroups).flatMap((sub) => rows(sub, ...headings, sub.heading)),
  ];
  return policy.list.flatMap((group) => rows(group, group.heading));
}

export function toListing(raw: RawListing): Listing {
  return {
    ...toListingSummary(raw),
    property_type: raw.propertyType,
    managed_by: trimmed(raw.pmcInfo.name),
    website: trimmed(raw.siteTexts.propertyWebsiteLink),
    description: prose(raw.longDescription),
    specials: lines(list<string>(raw.siteTexts.promoText).map(prose)),
    office_hours: lines(list(raw.siteTexts.officeHours)),
    pets: trimmed(raw.petTolerance),
    total_units: raw.totalUnits ?? null,
    units_available: raw.floorPlanSummary.totalAvailableUnits ?? 0,
    sublet_allowed: raw.leaseTerms.isSubletAllowed,
    sublet_start: isoDay(raw.sublet.start),
    sublet_end: isoDay(raw.sublet.end),
    utilities_included: raw.expenses.utilities.map((utility) => utility.name),
    amenities: raw.amenityGroups.map((group) => ({
      category: group.categoryName,
      items: group.items.map((item) => item.name),
    })),
    floor_plans: raw.floorPlans.map(toFloorPlan),
    fees: raw.policies.flatMap(toFees),
    walk_score: raw.walkScoreInfo.walk?.score ?? null,
    bike_score: raw.walkScoreInfo.bike?.score ?? null,
    transit_score: raw.walkScoreInfo.transit?.score ?? null,
    transit_stations: list<RawStation>(raw.pointsOfInterest.transitStations).map((station) => ({
      name: station.name,
      walk_miles: station.walk.distance,
      walk_minutes: station.walk.time,
      drive_miles: station.drive.distance,
      drive_minutes: station.drive.time,
    })),
  };
}
