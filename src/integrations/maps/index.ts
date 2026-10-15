import { orderBy, sortBy } from 'lodash-es';
import { z } from 'zod';
import { today } from '../../common.js';
import { matchesQuery } from '../../lib/text.js';
import { getJson, type Query } from '../../lib/http.js';
import { Integration, tool } from '../base.js';
import {
  buildingNumber,
  featuresOf,
  type RawAmenity,
  type RawBuilding,
  type RawDining,
  type RawFeature,
  type RawFeatureSet,
  type RawGarageClosure,
  type RawInventory,
  type RawLotClosure,
  type RawLotPoint,
  type RawResidenceHall,
  type RawRestriction,
  type RawRoadClosure,
  type RawRoom,
  type RawSpaceCount,
  type RawVendor,
  toAmenity,
  toBuilding,
  toBuildingSummary,
  toDiningLocation,
  toGarageClosure,
  toLotClosure,
  toParkingLot,
  toResidenceHall,
  toRoadClosure,
} from './mappers.js';
import {
  type Amenity,
  amenitySchema,
  type AmenityType,
  amenityType,
  type Building,
  type BuildingClass,
  buildingClass,
  buildingRef,
  buildingSchema,
  type BuildingSummary,
  buildingSummarySchema,
  type Closure,
  type ClosureKind,
  closureKind,
  closureSchema,
  type Community,
  community,
  type DiningLocation,
  diningLocationSchema,
  DINING_TYPES,
  type DiningType,
  diningType,
  type LotType,
  lotType,
  type ParkingLot,
  parkingLotSchema,
  paging,
  type ResidenceHall,
  residenceHallSchema,
} from './schemas.js';

/**
 * The feature layers behind the campus map, relative to its ArcGIS Online organisation. The
 * app reads each service's layer list at start-up; the ids here are what those lists give.
 */
const LAYERS = {
  buildings: 'CampusMapDefault_NoInsite/FeatureServer/0',
  residenceHalls: 'CampusMapDefault_NoInsite/FeatureServer/7',
  lotPoints: 'CampusMapDefault_NoInsite/FeatureServer/6',
  spaceCounts: 'CampusMapDefault_NoInsite/FeatureServer/11',
  restrictions: 'CampusMapDefault_NoInsite/FeatureServer/12',
  lotClosures: 'CampusReference/FeatureServer/7',
  garageClosures: 'CampusReference/FeatureServer/8',
  roadClosures: 'CampusReference/FeatureServer/12',
  vendors: 'DiningServices/FeatureServer/6',
} as const;

const AMENITY_LAYERS: Record<AmenityType, string> = {
  all_gender_restroom: 'CampusServices/FeatureServer/0',
  baby_changing_station: 'CampusServices/FeatureServer/1',
  family_restroom: 'CampusServices/FeatureServer/4',
  lactation_room: 'CampusServices/FeatureServer/5',
  shower: 'CampusServices/FeatureServer/14',
  elevator: 'CampusServices/FeatureServer/18',
  adult_changing_table: 'CampusServices/FeatureServer/20',
};

/** Each dining layer, and the filter the app applies to it (the pantry layer repeats rows). */
const DINING_LAYERS: Record<DiningType, { layer: string; where?: string }> = {
  cafe: { layer: 'DiningServices/FeatureServer/0' },
  dining_hall: { layer: 'DiningServices/FeatureServer/1' },
  food_court: { layer: 'DiningServices/FeatureServer/2' },
  food_pantry: { layer: 'DiningServices/FeatureServer/3', where: 'Duplicate IS NULL' },
  restaurant: { layer: 'DiningServices/FeatureServer/4' },
  shop: { layer: 'DiningServices/FeatureServer/5' },
};

/**
 * The facilities inventory the building popup reads addresses, sizes and occupants from: an
 * ArcGIS Server map service published through an ArcGIS Online proxy, on its own host.
 */
const INVENTORY_ORIGIN =
  'https://utility.arcgis.com/usrsvcs/servers/4cceaa2cde2f4b368e114e5586c2fae6/rest/services/InteriorSpace/InsiteReference';
const INVENTORY_LAYERS = { buildings: 'MapServer/2', rooms: 'MapServer/1' } as const;

export class Maps extends Integration {
  readonly name = 'maps';
  readonly baseUrl = 'https://services9.arcgis.com/1rOwFRpAwrxe0rBl/arcgis/rest/services';

  /** Every record of a layer matching `query.where` (default: all), with every field. */
  private async features<T>(
    layer: string,
    query: Query = {},
    origin = this.baseUrl,
  ): Promise<RawFeature<T>[]> {
    const params = { where: '1=1', outFields: '*', returnGeometry: false, f: 'json', ...query };
    const set = await getJson<RawFeatureSet<T>>(origin, `${layer}/query`, params, this.fetcher);
    return featuresOf(set, `${origin}/${layer}`);
  }

  /** The attributes of every record of a layer matching `query.where`. */
  private async records<T>(layer: string, query: Query = {}, origin?: string): Promise<T[]> {
    return (await this.features<T>(layer, query, origin)).map((feature) => feature.attributes);
  }

  /** Building footprints matching `where`, with the centre of each in latitude and longitude. */
  private async buildings(where = '1=1'): Promise<BuildingSummary[]> {
    const features = await this.features<RawBuilding>(LAYERS.buildings, {
      where,
      returnCentroid: true,
      outSR: 4326,
    });
    return features.map(toBuildingSummary);
  }

  @tool({
    title: 'List buildings',
    description:
      'Buildings on the UMD campus map (maps.umd.edu) with the number and code Testudo uses for each, its class, category and location. Filter by words in the name, code or number, or by class. Call maps_get_building for the address, size, age and occupants. No login needed.',
    input: {
      query: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Only buildings whose name, code or number contains this text, e.g. "hall"'),
      class: buildingClass
        .optional()
        .describe('Only buildings of this class, e.g. "residence_hall" (default: all)'),
      ...paging,
    },
    output: {
      total: z.number().int().describe('Buildings matching the query'),
      buildings: z.array(buildingSummarySchema).describe('In alphabetical order by name'),
    },
  })
  async list_buildings({
    query,
    class: wanted,
    limit,
    offset,
  }: {
    query?: string | undefined;
    class?: BuildingClass | undefined;
    limit: number;
    offset: number;
  }): Promise<{ total: number; buildings: BuildingSummary[] }> {
    const buildings = sortBy(await this.buildings(), (building) => building.name).filter(
      (building) =>
        (wanted === undefined || building.class === wanted) &&
        matchesQuery(query, building.name, building.short_name, building.code, building.number),
    );
    return { total: buildings.length, buildings: buildings.slice(offset, offset + limit) };
  }

  @tool({
    title: 'Get a building',
    description:
      'One building on the UMD campus map by number or code, with what its popup shows: street address, gross and assignable square feet, ownership, the years it was built and renovated, and the organizations with space in it. No login needed.',
    input: { building: buildingRef },
    output: buildingSchema.shape,
  })
  async get_building({ building }: { building: string }): Promise<Building> {
    // The reference is letters and digits only (see buildingRef), so it is safe in a where clause.
    const where = /^\d+$/.test(building)
      ? `BUILDINGID = '${buildingNumber(building)}'`
      : `UPPER(BLDG_CODE) = '${building}'`;
    const matches = await this.buildings(where);
    const [summary] = matches;
    if (summary === undefined) {
      throw new Error(`${this.name}: no building has the number or code "${building}"`);
    }
    if (matches.length > 1) {
      const numbers = matches.map((match) => `${match.number} (${match.name})`).join(', ');
      throw new Error(
        `${this.name}: the code "${building}" is shared by ${numbers}; pass a number`,
      );
    }
    const facility = { where: `FACILITY = '${summary.number}'` };
    const [inventory, rooms] = await Promise.all([
      this.records<RawInventory>(INVENTORY_LAYERS.buildings, facility, INVENTORY_ORIGIN),
      this.records<RawRoom>(
        INVENTORY_LAYERS.rooms,
        { ...facility, outFields: 'ORGANIZATION_NAME,AREA' },
        INVENTORY_ORIGIN,
      ),
    ]);
    return toBuilding(summary, inventory[0], rooms);
  }

  @tool({
    title: 'List parking lots',
    description:
      'Parking lots and garages on the UMD campus map with who each is for, when a permit is needed, the posted regulation, space and permit counts, and location. Filter by lot name or type. Current closures are in maps_list_closures. No login needed.',
    input: {
      query: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Only lots whose name or garage name contains this text, e.g. "11"'),
      type: lotType
        .optional()
        .describe('Only lots mainly for "faculty_staff", "student", "visitor" or "other"'),
      ...paging,
    },
    output: {
      total: z.number().int().describe('Lots matching the query'),
      lots: z.array(parkingLotSchema).describe('In order of lot name'),
    },
  })
  async list_parking_lots({
    query,
    type,
    limit,
    offset,
  }: {
    query?: string | undefined;
    type?: LotType | undefined;
    limit: number;
    offset: number;
  }): Promise<{ total: number; lots: ParkingLot[] }> {
    const [counts, rules, points] = await Promise.all([
      // The app lists only the lots flagged for display; the rest are retired names.
      this.records<RawSpaceCount>(LAYERS.spaceCounts, { where: "Display = 'True'" }),
      this.records<RawRestriction>(LAYERS.restrictions),
      this.records<RawLotPoint>(LAYERS.lotPoints),
    ]);
    // Lot names are spelled with differing case across the three tables ("4j", "4J").
    const key = (name: string) => name.trim().toLowerCase();
    const rulesByLot = new Map(rules.map((rule) => [key(rule.ParkingLotName), rule]));
    const pointsByLot = new Map(points.map((point) => [key(point.NAME), point]));
    const lots = sortBy(
      counts.map((count) =>
        toParkingLot(count, rulesByLot.get(key(count.Lot)), pointsByLot.get(key(count.Lot))),
      ),
      (lot) => lot.name.toLowerCase(),
    ).filter(
      (lot) =>
        (type === undefined || lot.type === type) &&
        matchesQuery(query, lot.name, lot.garage?.name),
    );
    return { total: lots.length, lots: lots.slice(offset, offset + limit) };
  }

  @tool({
    title: 'List closures',
    description:
      'Parking lot, parking garage and road closures posted on the UMD campus map, with what is closed, the dates and a link to the notice. By default only closures that have not ended. No login needed.',
    input: {
      kind: closureKind
        .optional()
        .describe('Only "lot", "garage" or "road" closures (default: all three)'),
      include_past: z
        .boolean()
        .default(false)
        .describe('Also list closures that have already ended (default false)'),
    },
    output: { closures: z.array(closureSchema).describe('Latest start first') },
  })
  async list_closures({
    kind,
    include_past,
  }: {
    kind?: ClosureKind | undefined;
    include_past: boolean;
  }): Promise<{ closures: Closure[] }> {
    const wanted = (which: ClosureKind) => kind === undefined || kind === which;
    const lists = await Promise.all([
      wanted('lot')
        ? this.records<RawLotClosure>(LAYERS.lotClosures).then((r) => r.map(toLotClosure))
        : [],
      wanted('garage')
        ? this.records<RawGarageClosure>(LAYERS.garageClosures).then((r) => r.map(toGarageClosure))
        : [],
      wanted('road')
        ? this.records<RawRoadClosure>(LAYERS.roadClosures).then((r) => r.map(toRoadClosure))
        : [],
    ]);
    const now = today();
    const closures = lists
      .flat()
      .filter((closure) => include_past || closure.ends === null || closure.ends >= now);
    return { closures: orderBy(closures, (closure) => closure.starts ?? '', 'desc') };
  }

  @tool({
    title: 'List amenities',
    description:
      'Rooms of one kind across the UMD campus as the campus map lists them: all-gender or family restrooms, lactation rooms, showers, baby or adult changing tables, or buildings with elevators. Each has its building, room and, where given, location notes, access rules and a contact. No login needed.',
    input: {
      type: amenityType.describe('Which kind of amenity to list'),
      building: z
        .string()
        .trim()
        .regex(/^\d{1,3}$/, 'Expected a building number like 035')
        .optional()
        .describe('Only amenities in this building number, e.g. "163" (default: every building)'),
      ...paging,
    },
    output: {
      total: z.number().int().describe('Amenities matching the query'),
      amenities: z.array(amenitySchema).describe('In order of building name, then room'),
    },
  })
  async list_amenities({
    type,
    building,
    limit,
    offset,
  }: {
    type: AmenityType;
    building?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<{ total: number; amenities: Amenity[] }> {
    const number = buildingNumber(building);
    const amenities = sortBy(
      (await this.records<RawAmenity>(AMENITY_LAYERS[type])).map((raw) => toAmenity(type, raw)),
      [(amenity) => amenity.building_name, (amenity) => amenity.room ?? ''],
    ).filter((amenity) => number === null || amenity.building_number === number);
    return { total: amenities.length, amenities: amenities.slice(offset, offset + limit) };
  }

  @tool({
    title: 'List dining locations',
    description:
      'Places to eat on the UMD campus map: dining halls with their stations, cafes, food courts with their vendors, restaurants, convenience shops and the campus food pantry. Each has its building, phone, whether it takes Dining Dollars and a link to its hours and menu. No login needed.',
    input: {
      type: diningType
        .optional()
        .describe('Only this kind of location, e.g. "dining_hall" (default: all)'),
    },
    output: { locations: z.array(diningLocationSchema).describe('Grouped by kind') },
  })
  async list_dining_locations({
    type,
  }: {
    type?: DiningType | undefined;
  }): Promise<{ locations: DiningLocation[] }> {
    const types = type === undefined ? DINING_TYPES : [type];
    const [vendors, lists] = await Promise.all([
      types.includes('food_court') ? this.records<RawVendor>(LAYERS.vendors) : [],
      Promise.all(
        types.map(async (which) => {
          const { layer, where = '1=1' } = DINING_LAYERS[which];
          return { which, records: await this.records<RawDining>(layer, { where }) };
        }),
      ),
    ]);
    return {
      locations: lists.flatMap(({ which, records }) =>
        records.map((raw) => toDiningLocation(which, raw, vendors)),
      ),
    };
  }

  @tool({
    title: 'List residence halls',
    description:
      'UMD residence halls as the campus map describes them: community, year built, layout, room sizes and the kinds of shared bathroom, with each hall page. Optionally one community. No login needed.',
    input: {
      community: community
        .optional()
        .describe('Only halls in this community, e.g. "North Hill Community" (default: all)'),
    },
    output: { halls: z.array(residenceHallSchema).describe('In alphabetical order by name') },
  })
  async list_residence_halls({
    community: wanted,
  }: {
    community?: Community | undefined;
  }): Promise<{ halls: ResidenceHall[] }> {
    const halls = (await this.records<RawResidenceHall>(LAYERS.residenceHalls)).map(
      toResidenceHall,
    );
    return {
      halls: sortBy(halls, (hall) => hall.name).filter(
        (hall) => wanted === undefined || hall.community === wanted,
      ),
    };
  }
}
