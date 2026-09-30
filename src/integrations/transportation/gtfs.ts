import { format, parse, parseISO } from 'date-fns';
import ExpiryMap from 'expiry-map';
import {
  getFeedInfo,
  getRoutes,
  getServiceIdsByDate,
  getShapes,
  getStops,
  getStoptimes,
  getTrips,
  importGtfs,
} from 'gtfs';
import { countBy, maxBy, toPairs } from 'lodash-es';
import pMemoize from 'p-memoize';
import { decode, decodeOrNull } from '../../common.js';
import {
  DIRECTIONS,
  type Feed,
  type Route,
  type RouteDetail,
  type Stop,
  WHEELCHAIR_BOARDING,
} from './schemas.js';

const GTFS_URL = 'https://feed.actionfigure.ai/university-of-maryland-shuttle-um.zip';

/** How long an imported feed is reused before it is downloaded again. */
const FEED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Most shape points returned for one route; longer polylines are thinned evenly. */
const MAX_SHAPE_POINTS = 500;

const ROUTE_FIELDS = ['route_id', 'route_short_name', 'route_long_name', 'route_color'] as const;

export const STOP_FIELDS = [
  'stop_id',
  'stop_name',
  'stop_lat',
  'stop_lon',
  'wheelchair_boarding',
] as const;

type RawRoute = Pick<
  ReturnType<typeof getRoutes>[number],
  'route_id' | 'route_short_name' | 'route_long_name' | 'route_color'
>;

type RawStop = Pick<ReturnType<typeof getStops>[number], (typeof STOP_FIELDS)[number]>;

/** Imports the feed into node-gtfs's default database on first use and again once a day. */
export const openFeed: () => Promise<void> = pMemoize(
  async () => {
    await importGtfs({ agencies: [{ url: GTFS_URL }], sqlitePath: ':memory:', logLevel: 'silent' });
  },
  { cache: new ExpiryMap(FEED_MAX_AGE_MS), cacheKey: () => 'feed' },
);

/** YYYY-MM-DD as the YYYYMMDD number GTFS uses. */
export function gtfsDate(date: string): number {
  return Number(format(parseISO(date), 'yyyyMMdd'));
}

/** YYYYMMDD number as YYYY-MM-DD. */
function fromGtfsDate(date: number): string {
  return format(parse(String(date), 'yyyyMMdd', new Date(0)), 'yyyy-MM-dd');
}

export function feedInfo(): Feed {
  const info = getFeedInfo({}, ['feed_start_date', 'feed_end_date', 'feed_version'], [])[0];
  return {
    valid_from: fromGtfsDate(info?.feed_start_date ?? 0),
    valid_to: fromGtfsDate(info?.feed_end_date ?? 0),
    version: info?.feed_version ?? null,
  };
}

export function toStop(raw: RawStop): Stop {
  return {
    id: raw.stop_id,
    name: raw.stop_name,
    lat: raw.stop_lat,
    lon: raw.stop_lon,
    wheelchair_boarding: decode(
      WHEELCHAIR_BOARDING,
      raw.wheelchair_boarding ?? 0,
      'wheelchair boarding code',
    ),
  };
}

function toRoute(raw: RawRoute, scheduledToday: ReadonlySet<string>): Route {
  return {
    id: raw.route_id,
    short_name: raw.route_short_name,
    long_name: raw.route_long_name,
    color: raw.route_color,
    url: `https://transportation.umd.edu/${encodeURIComponent(raw.route_id)}`,
    scheduled_today: scheduledToday.has(raw.route_id),
  };
}

/** Ids of the routes with a trip on `date`. */
function routesOnDate(date: string): Set<string> {
  const serviceIds = getServiceIdsByDate(gtfsDate(date));
  if (serviceIds.length === 0) return new Set();
  return new Set(getRoutes({ service_id: serviceIds }, ['route_id'], []).map((r) => r.route_id));
}

/** Every route in id order, flagged with whether it runs on `date`. */
export function routes(date: string): Route[] {
  const scheduled = routesOnDate(date);
  return getRoutes({}, ROUTE_FIELDS, [['route_id', 'ASC']]).map((raw) => toRoute(raw, scheduled));
}

/** One route, or undefined when the feed has no such id. */
export function route(routeId: string, date: string): Route | undefined {
  const raw = getRoutes({ route_id: routeId }, ROUTE_FIELDS, [])[0];
  return raw === undefined ? undefined : toRoute(raw, routesOnDate(date));
}

/** Every point of a shape, thinned evenly so at most `MAX_SHAPE_POINTS` remain. */
function shapePoints(shapeId: string): [number, number][] {
  const points = getShapes(
    { shape_id: shapeId },
    ['shape_pt_lon', 'shape_pt_lat'],
    [['shape_pt_sequence', 'ASC']],
  );
  const stride = Math.max(1, Math.ceil(points.length / MAX_SHAPE_POINTS));
  return points
    .filter((_, index) => index % stride === 0 || index === points.length - 1)
    .map((point) => [point.shape_pt_lon, point.shape_pt_lat]);
}

/** The stops and polyline of the route's most common trip pattern on `date` (any date as a fallback). */
export function routePattern(
  routeId: string,
  date: string,
): Pick<RouteDetail, 'headsign' | 'stops' | 'shape'> {
  const fields = ['trip_id', 'shape_id'] as const;
  let trips = getTrips({ route_id: routeId, date: gtfsDate(date) }, fields, []);
  if (trips.length === 0) trips = getTrips({ route_id: routeId }, fields, []);
  const shapeId = maxBy(toPairs(countBy(trips, 'shape_id')), ([, count]) => count)?.[0];
  const pattern = trips.find((trip) => trip.shape_id === shapeId);
  const stopTimes =
    pattern === undefined
      ? []
      : getStoptimes(
          { trip_id: pattern.trip_id },
          ['stop_id', 'stop_sequence', 'stop_headsign', 'timepoint'],
          [['stop_sequence', 'ASC']],
        );
  const stops = new Map(
    getStops({ stop_id: stopTimes.map((stopTime) => stopTime.stop_id) }, STOP_FIELDS, []).map(
      (stop) => [stop.stop_id, stop],
    ),
  );
  return {
    headsign: stopTimes.find((stopTime) => stopTime.stop_headsign !== null)?.stop_headsign ?? null,
    stops: stopTimes.flatMap((stopTime, index) => {
      const stop = stopTime.stop_id === null ? undefined : stops.get(stopTime.stop_id);
      return stop === undefined
        ? []
        : [{ ...toStop(stop), sequence: index, timepoint: stopTime.timepoint === 1 }];
    }),
    shape: shapeId === undefined || shapeId === 'null' ? [] : shapePoints(shapeId),
  };
}

/** The direction code of a trip as the shared vocabulary. */
export function directionOf(directionId: number | null | undefined) {
  return decodeOrNull(DIRECTIONS, directionId);
}
