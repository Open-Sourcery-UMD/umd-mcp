import { z } from 'zod';
import { isoDate, page, postalAddressSchema } from '../../common.js';

export const SITE = 'https://ochdatabase.umd.edu';

/** Building types the search filters on, as the site spells them in its URLs. */
export const PROPERTY_TYPES = [
  'Apartment',
  'Condo',
  'Cottage',
  'Dorm Style',
  'Duplex',
  'House',
  'Townhouse',
  'Triplex',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const propertyType = z.enum(PROPERTY_TYPES);

/**
 * The amenity, lease, pet, laundry, security and transportation filters of the search, as the
 * site spells them in its URLs (which differs from how a listing prints the same amenity).
 */
export const FEATURES = [
  '12 month lease',
  '2 Year',
  'Academic Year',
  'Air Conditioning',
  'Alcohol Free',
  'Cats Allowed',
  'Courtesy Officer Patrol',
  'Dead Bolt Locks',
  'Disability Access',
  'Dishwasher',
  'Elevator',
  'Faculty Staff',
  'Fall Sublet',
  'Family Friendly',
  'Fireplace',
  'Fitness Center',
  'Flexible Other lease',
  'Furnished',
  'Garages',
  'Gated Community',
  'Graduate Students',
  'Hardwood Floors',
  'High Speed Internet Access',
  'Individual Lease',
  'International Student Friendly',
  'Joint Lease',
  'Laundry Access',
  'Laundry Facilities',
  'Loft',
  'Month to Month',
  'Near Bus Stop',
  'Near Metro or Subway',
  'No Agent Broker Fees',
  'Outdoor Rec Space',
  'Patio Balcony Porch or Deck',
  'Pets Allowed',
  'Pets Not Allowed',
  'Pool',
  'Private Shuttle To Campus',
  'Rent Room',
  'Rent Unit',
  'Roommate Matching',
  'Security System',
  'Semester',
  'Short Term lease',
  'Shuttle To Campus',
  'Small Dogs Allowed',
  'Smoke Free',
  'Specials',
  'Spring Sublet',
  'Storage Space',
  'Study Lounge',
  'Summer Sublet',
  'Undergraduates',
  'Utilities Included',
  'Walk To Campus',
  'Washer Dryer',
  'Washer Dryer Hookup',
  'Wheelchair Accessible',
  'Winter Sublet',
] as const;

export type Feature = (typeof FEATURES)[number];

export const feature = z.enum(FEATURES);

/** Whether the search keeps only sublets or leaves them out, keyed by the filter the site sends. */
export const SUBLETS = { 'Sublets Only': 'only', 'Exclude Sublets': 'exclude' } as const;

export type Sublets = (typeof SUBLETS)[keyof typeof SUBLETS];

export const sublets = z.enum(Object.values(SUBLETS) as Sublets[]);

/**
 * Result orders as the search's `sort` parameter spells them. The site's own "Highest Price"
 * option sends "price_desc" the same way, and its search backend answers that with HTTP 500.
 */
export const SORTS = ['default', 'price_asc', 'distance_asc', 'modified_desc'] as const;

export type Sort = (typeof SORTS)[number];

export const sort = z.enum(SORTS);

/** Whether a floor plan can be rented, keyed by the code the listing API uses. */
export const AVAILABILITIES = {
  AvailableNow: 'available_now',
  AvailableSoon: 'available_soon',
  FutureDate: 'future_date',
  NotAvailable: 'not_available',
  CallForAvailability: 'call_for_availability',
} as const;

type Availability = (typeof AVAILABILITIES)[keyof typeof AVAILABILITIES];

const availability = z
  .enum(Object.values(AVAILABILITIES) as Availability[])
  .describe('Whether the plan can be rented now, soon, from a later date, or not at all');

export const listingId = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+$/, 'Expected a listing id like mc71jck')
  .describe('Listing id from och_search_listings, e.g. "mc71jck"');

const areaId = (where: string, other: string) =>
  z
    .number()
    .int()
    .optional()
    .describe(
      `Only listings ${where} with this id from och_list_areas; cannot be combined with ${other} (default: all)`,
    );

export const listingFilters = {
  campus_id: areaId('near the campus', 'neighborhood_id'),
  neighborhood_id: areaId('in the neighborhood', 'campus_id'),
  min_rent: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Lowest monthly rent in dollars (default: no minimum)'),
  max_rent: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Highest monthly rent in dollars (default: no maximum)'),
  bedrooms: z
    .number()
    .int()
    .min(0)
    .max(4)
    .optional()
    .describe('Number of bedrooms: 0 for a studio, 4 for four or more (default: all)'),
  min_bathrooms: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe('Fewest bathrooms, 1-3 (default: all)'),
  miles: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe(
      'Only listings within this many miles of campus, 1-5; 1 is what the site calls walking distance (default: all)',
    ),
  move_in: isoDate
    .optional()
    .describe('Only listings available to move into on this date, as YYYY-MM-DD (default: all)'),
  occupants: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe('Only listings that allow this many occupants, 1-6 (default: all)'),
  property_types: z
    .array(propertyType)
    .min(1)
    .optional()
    .describe('Only listings of any of these building types (default: all)'),
  features: z
    .array(feature)
    .min(1)
    .optional()
    .describe(
      'Only listings with every one of these amenities, lease terms or policies (default: all)',
    ),
  sublets: sublets
    .optional()
    .describe('"only" for sublets alone, "exclude" to leave them out (default: all)'),
  sort: sort
    .default('default')
    .describe(
      'Result order: the site\'s featured order, lowest rent ("price_asc"), nearest campus ("distance_asc") or most recently updated ("modified_desc") (default "default")',
    ),
  page,
};

const coordinate = (what: string) =>
  z.number().nullable().describe(`${what}; null when the lister hides the map pin`);

const miles = (what: string) => z.number().describe(`${what}, in miles`);

const minutes = (how: string) => z.number().describe(`Minutes to ${how} there`);

const score = (what: string) =>
  z.number().int().nullable().describe(`${what} score, 0-100; null when not rated`);

export const campusSchema = z.object({
  id: z.number().int().describe('Campus id, for och_search_listings'),
  name: z.string().describe('Campus name, e.g. "University of Maryland, College Park"'),
  is_primary: z.boolean().describe('Whether this is the main campus'),
  latitude: z.number().describe('Latitude of the campus'),
  longitude: z.number().describe('Longitude of the campus'),
});

export const neighborhoodSchema = z.object({
  id: z.number().int().describe('Neighborhood id, for och_search_listings'),
  name: z.string().describe('Neighborhood or city name, e.g. "College Park"'),
  latitude: z.number().describe('Latitude of its centre'),
  longitude: z.number().describe('Longitude of its centre'),
});

export const areasSchema = z.object({
  campuses: z.array(campusSchema).describe('Campuses a search can be centred on'),
  neighborhoods: z.array(neighborhoodSchema).describe('Neighborhoods and nearby cities'),
});

export const listingSummarySchema = z.object({
  id: z.string().describe('Listing id, for och_get_listing'),
  name: z.string().describe('Property name, or the headline of an individual listing'),
  url: z.string().describe('Public listing page'),
  phone: z
    .string()
    .nullable()
    .describe('The lister\'s phone number, e.g. "(301) 918-5944"; null when not given'),
  address: postalAddressSchema.describe('Street lines are empty when the lister hides them'),
  latitude: coordinate('Latitude'),
  longitude: coordinate('Longitude'),
  rent: z
    .string()
    .describe('Monthly rent as printed, e.g. "$1,115 - $2,938 /Bedroom" or "Call for Rent"'),
  rent_low: z
    .number()
    .nullable()
    .describe('Lowest monthly rent in dollars; null when the lister asks renters to call'),
  rent_high: z
    .number()
    .nullable()
    .describe('Highest monthly rent in dollars; null when the lister asks renters to call'),
  per_bedroom: z.boolean().describe('Whether rent is charged per bedroom rather than per unit'),
  bedrooms_low: z.number().describe('Fewest bedrooms offered; 0 is a studio'),
  bedrooms_high: z.number().describe('Most bedrooms offered; 0 is a studio'),
  campuses: z
    .array(
      z.object({
        id: z.number().int().describe('Campus id from och_list_areas'),
        miles: z.number().nullable().describe('Distance to the campus; null when not measured'),
      }),
    )
    .describe('Distance to each campus the listing is filed under'),
  lease_term: z
    .string()
    .nullable()
    .describe('Standard lease, e.g. "12 Month Lease"; null when not given'),
  is_sublet: z.boolean().describe('Whether a tenant is subletting this'),
  is_shared_space: z.boolean().describe('Whether this is a room in a home shared with others'),
  rating: z.number().nullable().describe('Star rating, 1-5; null when not rated'),
  updated: z.string().describe('When the listing was last updated, as an ISO 8601 timestamp'),
});

export const listingSearchSchema = z.object({
  total: z.number().int().describe('Listings matching the query'),
  pages: z.number().int().describe('Number of pages of results'),
  listings: z.array(listingSummarySchema).describe('This page of listings'),
});

export const floorPlanSchema = z.object({
  name: z.string().nullable().describe('Floor plan name, e.g. "Geneva"; null when unnamed'),
  bedrooms: z.number().describe('Number of bedrooms; 0 is a studio'),
  bathrooms: z.number().describe('Number of bathrooms, e.g. 1.5'),
  rent: z
    .string()
    .nullable()
    .describe('Monthly rent as printed, e.g. "$1,567 - $1,878"; null when not priced'),
  rent_low: z.number().nullable().describe('Lowest monthly rent in dollars; null when not priced'),
  rent_high: z
    .number()
    .nullable()
    .describe('Highest monthly rent in dollars; null when not priced'),
  per_bedroom: z.boolean().describe('Whether rent is charged per bedroom rather than per unit'),
  square_feet: z.number().nullable().describe('Floor area; null when not given'),
  deposit: z.number().nullable().describe('Security deposit in dollars; null when not given'),
  max_occupants: z.number().int().nullable().describe('Occupancy limit; null when not given'),
  availability,
  available: isoDate
    .nullable()
    .describe('Date it can be moved into, as YYYY-MM-DD; null when not given'),
  units_available: z.number().int().describe('Units of this plan open for rent'),
  special_offer: z.string().nullable().describe('Rent special on this plan; null when none'),
});

export const feeSchema = z.object({
  category: z.string().describe('Fee category, e.g. "Required Fees", "Parking" or "Pets"'),
  group: z
    .string()
    .nullable()
    .describe('What the fee applies to, e.g. "Dogs" or "Surface Lot"; null when ungrouped'),
  name: z.string().describe('Fee name, e.g. "Application Fee Per Applicant"'),
  amount: z
    .string()
    .nullable()
    .describe('Amount as printed, e.g. "$35", "$95 / mo" or "N/A"; null when blank'),
  note: z
    .string()
    .nullable()
    .describe('How it is charged, e.g. "Charged per applicant."; null when none'),
});

export const transitStationSchema = z.object({
  name: z.string().describe('Station name, e.g. "Greenbelt, Green/Yellow Line Center Platform"'),
  walk_miles: miles('Walking distance'),
  walk_minutes: minutes('walk'),
  drive_miles: miles('Driving distance'),
  drive_minutes: minutes('drive'),
});

export const listingSchema = listingSummarySchema.extend({
  // Open value set: the site files listings under apartments.com's property types.
  property_type: z.string().describe('Kind of property, e.g. "Apartment Community"'),
  managed_by: z.string().nullable().describe('Property management company; null when not given'),
  website: z.string().nullable().describe("The property's own website; null when none"),
  description: z.string().nullable().describe("The lister's description; null when none"),
  specials: z.array(z.string()).describe('Rent specials and promotions; empty when none'),
  office_hours: z
    .array(z.string())
    .describe('Leasing office hours, one line per day, e.g. "Monday 9:00 AM - 6:00 PM"'),
  pets: z.string().nullable().describe('Pet policy, e.g. "Pets Allowed"; null when not given'),
  total_units: z.number().int().nullable().describe('Units in the property; null when not given'),
  units_available: z.number().int().describe('Units open for rent across all floor plans'),
  sublet_allowed: z.boolean().describe('Whether the lease allows subletting'),
  sublet_start: isoDate.nullable().describe('First day of the sublet; null when not a sublet'),
  sublet_end: isoDate.nullable().describe('Last day of the sublet; null when not a sublet'),
  utilities_included: z.array(z.string()).describe('Utilities the rent covers, e.g. "Electricity"'),
  amenities: z
    .array(
      z.object({
        category: z.string().describe('Amenity group, e.g. "Unit Features" or "Laundry"'),
        items: z.array(z.string()).describe('Amenities in the group, e.g. "Dishwasher"'),
      }),
    )
    .describe('Amenities and lease information by group'),
  floor_plans: z.array(floorPlanSchema).describe('Floor plans or units offered'),
  fees: z.array(feeSchema).describe('Application, parking, pet and other fees; empty when none'),
  walk_score: score('Walk'),
  bike_score: score('Bike'),
  transit_score: score('Transit'),
  transit_stations: z.array(transitStationSchema).describe('Nearest rail and metro stations'),
});

export type Areas = z.infer<typeof areasSchema>;
export type Fee = z.infer<typeof feeSchema>;
export type FloorPlan = z.infer<typeof floorPlanSchema>;
export type Listing = z.infer<typeof listingSchema>;
export type ListingSearch = z.infer<typeof listingSearchSchema>;
export type ListingSummary = z.infer<typeof listingSummarySchema>;
