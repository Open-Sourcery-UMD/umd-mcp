import { z } from 'zod';
import { isoDate, pagination } from '../../common.js';

/** The campus map app, whose share links the tools return. */
export const SITE = 'https://maps.umd.edu/map/index.html';

/** What a building is used for, keyed by the `BLDG_CLASS` the map files it under. */
export const BUILDING_CLASSES = {
  'University Building': 'university',
  'Residence Halls and Apartments': 'residence_hall',
  'Fraternities/Sororities': 'fraternity_sorority',
  'Athletic and Recreational Facilities': 'athletic',
  'Parking Garage': 'parking_garage',
  'UMGC Inn & Conference Center': 'umgc_conference_center',
} as const;

export type BuildingClass = (typeof BUILDING_CLASSES)[keyof typeof BUILDING_CLASSES];

export const buildingClass = z.enum(Object.values(BUILDING_CLASSES) as BuildingClass[]);

/** The category the building popup prints, keyed by the map's `FACILITY_USE` code. */
export const BUILDING_CATEGORIES = {
  1: 'academic',
  2: 'academic',
  3: 'academic',
  4: 'administrative',
  5: 'library',
  6: 'auxiliary',
  7: 'non_academic',
} as const;

type BuildingCategory = (typeof BUILDING_CATEGORIES)[keyof typeof BUILDING_CATEGORIES];

const buildingCategory = z.enum([
  ...new Set(Object.values(BUILDING_CATEGORIES)),
] as BuildingCategory[]);

/** Who owns a building, keyed by the facilities inventory's `OWN` code. */
export const OWNERSHIPS = {
  UM: 'university',
  OWN: 'university',
  'NOT UM': 'not_university',
  PPP: 'public_private_partnership',
  LEASE: 'leased',
  LEASEOUT: 'leased_out',
} as const;

type Ownership = (typeof OWNERSHIPS)[keyof typeof OWNERSHIPS];

const ownership = z.enum([...new Set(Object.values(OWNERSHIPS))] as Ownership[]);

/** Who may park in a lot, keyed by the `ParkingLotType` the parking table files it under. */
export const LOT_TYPES = {
  'Faculty/Staff': 'faculty_staff',
  Student: 'student',
  Visitor: 'visitor',
  Other: 'other',
} as const;

export type LotType = (typeof LOT_TYPES)[keyof typeof LOT_TYPES];

export const lotType = z.enum(Object.values(LOT_TYPES) as LotType[]);

/** When a lot is restricted, keyed by its `Restriction` text. */
export const RESTRICTIONS = {
  '24-Hour Restricted': 'restricted_24_hours',
  '24 Hour Restricted': 'restricted_24_hours',
  'Restricted After 4PM': 'restricted_after_4pm',
  'Unrestricted After 4PM': 'unrestricted_after_4pm',
  'Modified Restricted': 'modified_restricted',
  'Special Restrictions': 'special',
  'Miscellaneous Permissions': 'miscellaneous_permissions',
  Visitor: 'visitor',
} as const;

type Restriction = (typeof RESTRICTIONS)[keyof typeof RESTRICTIONS];

const restriction = z.enum([...new Set(Object.values(RESTRICTIONS))] as Restriction[]);

const CLOSURE_KINDS = ['lot', 'garage', 'road'] as const;

export type ClosureKind = (typeof CLOSURE_KINDS)[number];

export const closureKind = z.enum(CLOSURE_KINDS);

/** Building amenities the map has a layer for. */
const AMENITY_TYPES = [
  'all_gender_restroom',
  'family_restroom',
  'lactation_room',
  'shower',
  'baby_changing_station',
  'adult_changing_table',
  'elevator',
] as const;

export type AmenityType = (typeof AMENITY_TYPES)[number];

export const amenityType = z.enum(AMENITY_TYPES);

/** Kinds of place the map's Dining Services layers list. */
export const DINING_TYPES = [
  'dining_hall',
  'cafe',
  'food_court',
  'restaurant',
  'shop',
  'food_pantry',
] as const;

export type DiningType = (typeof DINING_TYPES)[number];

export const diningType = z.enum(DINING_TYPES);

/** Residence hall communities, as the Department of Resident Facilities names them. */
export const COMMUNITIES = [
  'Cambridge Community',
  'Denton Community',
  'Ellicott Community',
  'Heritage Community',
  'Leonardtown Community',
  'North Hill Community',
  'Oakland Community',
  'South Hill Community',
  'Houses on Fraternity Row',
] as const;

export type Community = (typeof COMMUNITIES)[number];

export const community = z.enum(COMMUNITIES);

/** Shared bathroom kinds in a residence hall, keyed by how the hall listing prints them. */
export const BATHROOM_TYPES = {
  'Community bathrooms': 'community_bathroom',
  'Community restroom': 'community_restroom',
  'Single, all-gender bathrooms': 'single_all_gender_bathroom',
  'Single, all-gender restrooms': 'single_all_gender_restroom',
} as const;

type BathroomType = (typeof BATHROOM_TYPES)[keyof typeof BATHROOM_TYPES];

const bathroomType = z.enum(Object.values(BATHROOM_TYPES) as BathroomType[]);

export const buildingRef = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,5}$/, 'Expected a building number like 035 or a code like MCK')
  .toUpperCase()
  .describe(
    'Building number (e.g. "035" or "35") or the code Testudo prints for it (e.g. "MCK"), from maps_list_buildings',
  );

export const paging = pagination(50, 400);

const buildingNumber = z
  .string()
  .describe('Three-digit facilities building number, e.g. "035"; pass to maps_get_building');

const latitude = z.number().describe('Latitude (WGS 84)');
const longitude = z.number().describe('Longitude (WGS 84)');
const mapUrl = z.string().describe('The place on the campus map, maps.umd.edu');

export const buildingSummarySchema = z.object({
  number: buildingNumber,
  code: z
    .string()
    .nullable()
    .describe('Code Testudo prints in room locations, e.g. "MCK"; null when it has none'),
  name: z.string().describe('Building name, e.g. "McKeldin Library"'),
  short_name: z
    .string()
    .nullable()
    .describe('Short name printed on the map, e.g. "McKeldin Library"; null when it has none'),
  class: buildingClass
    .nullable()
    .describe(
      'What the building is: "university", "residence_hall", "fraternity_sorority", "athletic", "parking_garage" or "umgc_conference_center"; null when not recorded',
    ),
  category: buildingCategory
    .nullable()
    .describe('Category the map prints for the building; null when not recorded'),
  latitude: latitude.nullable().describe('Latitude of the footprint centre; null when unknown'),
  longitude: longitude.nullable().describe('Longitude of the footprint centre; null when unknown'),
  url: mapUrl,
});

const organizationSchema = z.object({
  name: z
    .string()
    .describe('Organization as the facilities inventory names it, e.g. "LIBR-LIBRARIES"'),
  square_feet: z.number().int().describe('Floor area assigned to it in this building'),
});

export const buildingSchema = buildingSummarySchema.extend({
  address: z.string().nullable().describe('Street address; null when not recorded'),
  gross_square_feet: z
    .number()
    .int()
    .nullable()
    .describe('Gross square feet (GSF); null when not recorded'),
  net_assignable_square_feet: z
    .number()
    .int()
    .nullable()
    .describe('Net assignable square feet (NASF); null when not recorded'),
  ownership: ownership.nullable().describe('Who owns the building; null when not recorded'),
  year_built: z.number().int().nullable().describe('Year constructed; null when not recorded'),
  year_renovated: z
    .number()
    .int()
    .nullable()
    .describe('Year of the last major renovation; null when never renovated or not recorded'),
  organizations: z
    .array(organizationSchema)
    .describe('Organizations with space in the building, largest first'),
});

export const parkingLotSchema = z.object({
  name: z.string().describe('Lot name as signs and permits print it, e.g. "11b"'),
  type: lotType.nullable().describe('Who the lot is mainly for; null when the map does not say'),
  restriction: restriction
    .nullable()
    .describe(
      'When a permit is needed: "restricted_24_hours", "restricted_after_4pm", "unrestricted_after_4pm" and so on; null when the map does not say',
    ),
  regulation: z
    .string()
    .nullable()
    .describe('The regulation as posted, e.g. hours a permit is needed; null when none'),
  additional: z.string().nullable().describe('Further notes on the lot; null when none'),
  total_spaces: z
    .number()
    .int()
    .nullable()
    .describe('Parking spaces in the lot; null when unknown'),
  permits: z
    .number()
    .int()
    .nullable()
    .describe(
      'Permits issued for the lot (the map\'s "Permitted Spaces"); can exceed total_spaces; null when unknown',
    ),
  garage: z
    .object({
      name: z.string().describe('Garage name, e.g. "Mowatt Lane Parking Garage"'),
      building_number: buildingNumber,
    })
    .nullable()
    .describe('The garage the lot is in; null for a surface lot'),
  latitude: latitude.nullable().describe('null when the map has no point for the lot'),
  longitude: longitude.nullable().describe('null when the map has no point for the lot'),
  url: mapUrl,
});

export const closureSchema = z.object({
  kind: closureKind.describe('"lot" for a parking lot, "garage" for a garage, "road" for a road'),
  name: z.string().describe('Lot name, garage name, or the project closing the road, e.g. "J1"'),
  building_number: buildingNumber.nullable().describe('The garage building number; null otherwise'),
  description: z.string().nullable().describe('What is closed and why; null when not given'),
  starts: isoDate.nullable().describe('First day of the closure; null when not given'),
  ends: isoDate.nullable().describe('Last day of the closure; null when open-ended'),
  url: z.string().nullable().describe('Notice with more detail; null when none'),
});

export const amenitySchema = z.object({
  type: amenityType.describe('Kind of amenity'),
  building_number: buildingNumber,
  building_name: z.string().describe('Building name'),
  room: z.string().nullable().describe('Room number, e.g. "212B"; null when not given'),
  description: z
    .string()
    .nullable()
    .describe('Where in the building it is, or what a lactation room has; null when not given'),
  access: z.string().nullable().describe('Who may use it and how to get in; null when not given'),
  contact: z.string().nullable().describe('Who to contact for access; null when not given'),
});

const vendorSchema = z.object({
  name: z.string().describe('Vendor name, e.g. "Chick-fil-A"'),
  phone: z.string().nullable().describe('Phone number; null when not listed'),
  takes_dining_dollars: z
    .boolean()
    .nullable()
    .describe('Whether it accepts Dining Dollars; null when not recorded'),
  url: z.string().nullable().describe('Hours and menu page; null when none'),
});

export const diningLocationSchema = z.object({
  type: diningType.describe('Kind of location'),
  name: z.string().describe('Location name, e.g. "Yahentamitsi"'),
  building_number: buildingNumber.nullable().describe('null when it is off the building map'),
  building_name: z.string().nullable().describe('Building it is in; null when not recorded'),
  phone: z.string().nullable().describe('Phone number; null when not listed'),
  takes_dining_dollars: z
    .boolean()
    .nullable()
    .describe('Whether it accepts Dining Dollars; null when not recorded'),
  url: z.string().nullable().describe('Hours and menu page; null when none'),
  stations: z.array(z.string()).describe('Serving stations of a dining hall; empty otherwise'),
  vendors: z.array(vendorSchema).describe('Vendors in a food court; empty otherwise'),
  hours: z
    .string()
    .nullable()
    .describe('When a food pantry is open, e.g. "Friday 12:00 PM"; null otherwise'),
  notice: z.string().nullable().describe('Eligibility and sign-up notice; null when none'),
});

export const residenceHallSchema = z.object({
  name: z.string().describe('Hall name, e.g. "Caroline Hall"'),
  building_number: buildingNumber.nullable().describe('null when not recorded'),
  community: community.nullable().describe('Community the hall belongs to; null when not given'),
  built: z
    .string()
    .nullable()
    .describe('When it was built, as printed, e.g. "1959 (1992 renovated)"; null when not given'),
  building_type: z
    .string()
    .nullable()
    .describe('Layout, e.g. "Traditional" or "Suites and apartments"; null when not given'),
  room_types: z
    .string()
    .nullable()
    .describe('Room sizes, e.g. "Singles, doubles, and triples"; null when not given'),
  bathroom_types: z.array(bathroomType).describe('Kinds of shared bathroom in the hall'),
  url: z.string().nullable().describe('Hall page on drf.umd.edu; null when none'),
});

export type BuildingSummary = z.infer<typeof buildingSummarySchema>;
export type Building = z.infer<typeof buildingSchema>;
export type ParkingLot = z.infer<typeof parkingLotSchema>;
export type Closure = z.infer<typeof closureSchema>;
export type Amenity = z.infer<typeof amenitySchema>;
export type DiningLocation = z.infer<typeof diningLocationSchema>;
export type ResidenceHall = z.infer<typeof residenceHallSchema>;
