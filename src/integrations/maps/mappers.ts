import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { orderBy, uniq } from 'lodash-es';
import { decode, member } from '../../common.js';
import { htmlToTextOrNull } from '../../lib/html.js';
import { HttpError } from '../../lib/http.js';
import { collapse, joinWords, lines, numeric, trimmed, yesNo } from '../../lib/text.js';
import {
  type Amenity,
  type AmenityType,
  BATHROOM_TYPES,
  type Building,
  BUILDING_CATEGORIES,
  BUILDING_CLASSES,
  type BuildingSummary,
  type Closure,
  COMMUNITIES,
  type DiningLocation,
  type DiningType,
  LOT_TYPES,
  OWNERSHIPS,
  type ParkingLot,
  type ResidenceHall,
  RESTRICTIONS,
  SITE,
} from './schemas.js';

/** One record of an ArcGIS `query` answer; `centroid` only when `returnCentroid` was asked. */
export type RawFeature<T> = { attributes: T; centroid?: { x: number; y: number } };

/** An ArcGIS `query` answer. A failed query still answers HTTP 200, with `error` set. */
export type RawFeatureSet<T> = {
  features?: RawFeature<T>[];
  error?: { code: number; message: string; details?: string[] };
};

/** `BuildingPublic`: one building footprint. */
export type RawBuilding = {
  BUILDINGID: string;
  NAME: string | null;
  SHORTNAME: string | null;
  BLDG_CODE: string | null;
  BLDG_CLASS: string | null;
  FACILITY_USE: string | null;
};

/** The facilities inventory's `Buildings` table. */
export type RawInventory = {
  FACILITY: string;
  TOTAL_GSF: number | null;
  BLDG_NASF: number | null;
  YEAR_CONST: string | null;
  YEAR_REN: string | null;
  ADDRESS: string | null;
  OWN: string | null;
};

/** The facilities inventory's `Rooms` table: one room and the organization assigned it. */
export type RawRoom = { ORGANIZATION_NAME: string | null; AREA: number | null };

/** `ParkingSpaceCount`: one lot's space and permit counts. */
export type RawSpaceCount = {
  Lot: string;
  Total_Spaces: number | null;
  Permits: number | null;
  GarageName: string | null;
  GarageBldgNum: string | null;
  Display: string | null;
};

/** `ParkingRestriction`: one lot's posted rules. */
export type RawRestriction = {
  ParkingLotName: string;
  ParkingLotType: string | null;
  Restriction: string | null;
  Regulation: string | null;
  Additional: string | null;
};

/** `ParkingLotPoint`: where a surface lot's label sits, in WGS 84. */
export type RawLotPoint = { NAME: string; POINT_X: number | null; POINT_Y: number | null };

/** `ParkingLotClosures`. Dates are epoch milliseconds at UTC midnight. */
export type RawLotClosure = {
  NAME: string;
  STARTDATE: number | null;
  ENDDATE: number | null;
  DESCRIPTION: string | null;
  URL: string | null;
};

/** `ParkingGarageClosures`. */
export type RawGarageClosure = RawLotClosure & { BUILDINGID: string | null; LONGNAME: string };

/** `RoadClosures`. */
export type RawRoadClosure = {
  ProjectName: string | null;
  Description: string | null;
  StartDate: number | null;
  EndDate: number | null;
  URL: string | null;
};

/**
 * A record of one of the Campus Services amenity layers. Each layer spells its fields its own
 * way, so every spelling is optional here.
 */
export type RawAmenity = {
  BUILDINGID?: string | number | null;
  BuildingID?: string | null;
  FACILITY?: string | number | null;
  BUILDINGNAME?: string | null;
  BuildingName?: string | null;
  ROOM?: string | null;
  Room?: string | null;
  ROOM_STR?: string | null;
  ROOM_NUM?: string | null;
  DESCRIPTION?: string | null;
  Description?: string | null;
  AMENITIES?: string | null;
  ACCESS?: string | null;
  ACCESSMETHOD?: string | null;
  CONTACT_NAME?: string | null;
  CONTACT_PHONE?: string | null;
  CONTACT_EMAIL?: string | null;
};

/** A record of one of the Dining Services layers; `NAME` or `Name` depending on the layer. */
export type RawDining = {
  NAME?: string | null;
  Name?: string | null;
  BUILDINGID: string | null;
  BUILDINGNAME: string | null;
  DININGDOLLARS?: string | null;
  Contact: string | null;
  WEBSITE: string | null;
  STATIONS?: string | null;
  DAY?: string | null;
  TIME?: string | null;
  NOTICE?: string | null;
};

/** `FoodCourtInformation`: one vendor in a food court; `Hours` holds its page. */
export type RawVendor = {
  Name: string;
  BUILDINGID: string | null;
  Hours: string | null;
  Contact_Information: string | null;
  DININGDOLLARS: string | null;
};

/** `ResidentialHallsDRF`. */
export type RawResidenceHall = {
  NAME: string;
  Location: string | null;
  BuiltYear: string | null;
  BuildingType: string | null;
  RoomType: string | null;
  BathroomType: string | null;
  BuildingID: string | null;
  Url: string | null;
};

/** The records of a query answer; throws the error ArcGIS reports inside a 200 instead. */
export function featuresOf<T>(set: RawFeatureSet<T>, url: string): RawFeature<T>[] {
  if (set.error !== undefined) {
    throw new HttpError(set.error.code, url, JSON.stringify(set.error));
  }
  return set.features ?? [];
}

/** A building number as the map files it, zero-padded to three digits: 35 to "035". */
export function buildingNumber(value: unknown): string | null {
  const text = trimmed(value);
  return text === null ? null : text.padStart(3, '0');
}

/** The campus map zoomed to one building, lot or place, as its share links read. */
function mapUrl(feature: 'building' | 'parking', name: string): string {
  return `${SITE}?&feature=${feature}&name=${encodeURIComponent(name)}`;
}

/** An ArcGIS date field (epoch milliseconds at UTC midnight) as YYYY-MM-DD. */
function day(value: number | null): string | null {
  return value === null ? null : format(new TZDate(value, 'UTC'), 'yyyy-MM-dd');
}

/** A room number without the inventory's zero padding: "0108A" to "108A". */
function room(value: unknown): string | null {
  return trimmed(value)?.replace(/^0+(?=.)/, '') ?? null;
}

/** A free-text field; the dining layers write "<Null>" for a blank one. */
function text(value: string | null | undefined): string | null {
  const content = trimmed(value);
  return content === null || content === '<Null>' ? null : collapse(content);
}

export function toBuildingSummary({
  attributes: raw,
  centroid,
}: RawFeature<RawBuilding>): BuildingSummary {
  const number = buildingNumber(raw.BUILDINGID) ?? raw.BUILDINGID;
  return {
    number,
    code: trimmed(raw.BLDG_CODE),
    name: text(raw.NAME) ?? number,
    short_name: text(raw.SHORTNAME),
    class:
      raw.BLDG_CLASS === null ? null : decode(BUILDING_CLASSES, raw.BLDG_CLASS, 'building class'),
    category:
      raw.FACILITY_USE === null
        ? null
        : decode(BUILDING_CATEGORIES, raw.FACILITY_USE, 'building category'),
    latitude: centroid?.y ?? null,
    longitude: centroid?.x ?? null,
    url: mapUrl('building', number),
  };
}

/** Square feet as a whole number; null when blank or zero, which the inventory uses for unknown. */
function squareFeet(value: number | null): number | null {
  return value === null || value === 0 ? null : Math.round(value);
}

export function toBuilding(
  summary: BuildingSummary,
  inventory: RawInventory | undefined,
  rooms: RawRoom[],
): Building {
  const areas = new Map<string, number>();
  for (const { ORGANIZATION_NAME, AREA } of rooms) {
    const name = trimmed(ORGANIZATION_NAME);
    if (name !== null) areas.set(name, (areas.get(name) ?? 0) + (AREA ?? 0));
  }
  return {
    ...summary,
    address: text(inventory?.ADDRESS),
    gross_square_feet: squareFeet(inventory?.TOTAL_GSF ?? null),
    net_assignable_square_feet: squareFeet(inventory?.BLDG_NASF ?? null),
    ownership: inventory?.OWN == null ? null : decode(OWNERSHIPS, inventory.OWN, 'ownership'),
    year_built: numeric(inventory?.YEAR_CONST),
    year_renovated: numeric(inventory?.YEAR_REN),
    organizations: orderBy(
      [...areas].map(([name, area]) => ({ name, square_feet: Math.round(area) })),
      (organization) => organization.square_feet,
      'desc',
    ),
  };
}

export function toParkingLot(
  count: RawSpaceCount,
  rules: RawRestriction | undefined,
  point: RawLotPoint | undefined,
): ParkingLot {
  const garage = text(count.GarageName);
  const garageNumber = buildingNumber(count.GarageBldgNum);
  return {
    name: count.Lot,
    type:
      rules?.ParkingLotType == null
        ? null
        : decode(LOT_TYPES, rules.ParkingLotType, 'parking lot type'),
    restriction:
      rules?.Restriction == null
        ? null
        : decode(RESTRICTIONS, rules.Restriction, 'parking restriction'),
    regulation: text(rules?.Regulation),
    additional: text(rules?.Additional),
    total_spaces: count.Total_Spaces,
    permits: count.Permits,
    garage:
      garage === null || garageNumber === null
        ? null
        : { name: garage, building_number: garageNumber },
    latitude: point?.POINT_Y ?? null,
    longitude: point?.POINT_X ?? null,
    url: mapUrl('parking', count.Lot),
  };
}

export function toLotClosure(raw: RawLotClosure): Closure {
  return {
    kind: 'lot',
    name: raw.NAME,
    building_number: null,
    description: text(raw.DESCRIPTION),
    starts: day(raw.STARTDATE),
    ends: day(raw.ENDDATE),
    url: trimmed(raw.URL),
  };
}

export function toGarageClosure(raw: RawGarageClosure): Closure {
  return {
    ...toLotClosure({ ...raw, NAME: collapse(raw.LONGNAME) }),
    kind: 'garage',
    building_number: buildingNumber(raw.BUILDINGID),
  };
}

export function toRoadClosure(raw: RawRoadClosure): Closure {
  return {
    kind: 'road',
    name: text(raw.ProjectName) ?? 'Road closure',
    building_number: null,
    description: text(raw.Description),
    starts: day(raw.StartDate),
    ends: day(raw.EndDate),
    url: trimmed(raw.URL),
  };
}

export function toAmenity(type: AmenityType, raw: RawAmenity): Amenity {
  const number = buildingNumber(raw.BUILDINGID ?? raw.BuildingID ?? raw.FACILITY) ?? '';
  const contact = lines([raw.CONTACT_NAME, raw.CONTACT_PHONE, raw.CONTACT_EMAIL]).join(', ');
  return {
    type,
    building_number: number,
    building_name: text(raw.BUILDINGNAME ?? raw.BuildingName) ?? number,
    room: room(raw.ROOM_STR ?? raw.ROOM ?? raw.Room ?? raw.ROOM_NUM),
    description: text(raw.DESCRIPTION ?? raw.Description ?? raw.AMENITIES),
    access: text(raw.ACCESS ?? raw.ACCESSMETHOD),
    contact: contact === '' ? null : contact,
  };
}

function toVendor(raw: RawVendor): DiningLocation['vendors'][number] {
  return {
    name: collapse(raw.Name),
    phone: text(raw.Contact_Information),
    takes_dining_dollars: yesNo(raw.DININGDOLLARS),
    url: trimmed(raw.Hours),
  };
}

export function toDiningLocation(
  type: DiningType,
  raw: RawDining,
  vendors: RawVendor[],
): DiningLocation {
  const number = buildingNumber(raw.BUILDINGID);
  return {
    type,
    name: text(raw.NAME ?? raw.Name) ?? text(raw.BUILDINGNAME) ?? type,
    building_number: number,
    building_name: text(raw.BUILDINGNAME),
    phone: text(raw.Contact),
    takes_dining_dollars: yesNo(raw.DININGDOLLARS),
    url: trimmed(raw.WEBSITE),
    stations: lines((raw.STATIONS ?? '').split(',')),
    vendors:
      type === 'food_court'
        ? vendors.filter((vendor) => buildingNumber(vendor.BUILDINGID) === number).map(toVendor)
        : [],
    hours: joinWords(raw.DAY, raw.TIME),
    notice: htmlToTextOrNull(raw.NOTICE),
  };
}

/** "Community bathrooms \nSingle, all-gender restrooms" or comma-joined, to the listed kinds. */
function bathroomTypes(value: string | null): ResidenceHall['bathroom_types'] {
  const names = lines((value ?? '').split(/\s*\n\s*|,\s*(?=[A-Z])/));
  return uniq(names.map((name) => decode(BATHROOM_TYPES, name, 'bathroom type')));
}

export function toResidenceHall(raw: RawResidenceHall): ResidenceHall {
  const location = text(raw.Location);
  return {
    name: collapse(raw.NAME),
    building_number: buildingNumber(raw.BuildingID),
    community: location === null ? null : member(COMMUNITIES, location, 'residence hall community'),
    built: text(raw.BuiltYear),
    building_type: text(raw.BuildingType),
    room_types: text(raw.RoomType),
    bathroom_types: bathroomTypes(raw.BathroomType),
    url: trimmed(raw.Url),
  };
}
