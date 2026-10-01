import Database from 'better-sqlite3';
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
import { decode, decodeOrNull, weekdayOf } from '../../common.js';
import { isoDateFrom } from '../../lib/dates.js';
import { trimmed } from '../../lib/text.js';
import {
  DIRECTIONS,
  type Feed,
  type Route,
  type RouteDetail,
  type Schedule,
  SITE,
  type Stop,
  WHEELCHAIR_BOARDING,
} from './schemas.js';

const GTFS_URL = 'https://feed.actionfigure.ai/university-of-maryland-shuttle-um.zip';

/** How long an imported feed is reused before it is downloaded again. */
const FEED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Most shape points returned for one route; longer polylines are thinned evenly. */
const MAX_SHAPE_POINTS = 500;

const ROUTE_FIELDS = [
  'route_id',
  'route_short_name',
  'route_long_name',
  'route_color',
  'route_url',
] as const;

const STOP_FIELDS = [
  'stop_id',
  'stop_name',
  'stop_lat',
  'stop_lon',
  'wheelchair_boarding',
] as const;

type RawRoute = Pick<ReturnType<typeof getRoutes>[number], (typeof ROUTE_FIELDS)[number]>;

type RawStop = Pick<ReturnType<typeof getStops>[number], (typeof STOP_FIELDS)[number]>;

/** The in-memory database holding the newest feed that imported successfully; null until one has. */
let current: Database.Database | null = null;

/**
 * Imports the feed into a fresh in-memory database and, only once that has succeeded, makes
 * it the one queries read from. node-gtfs drops every table before it downloads, so importing
 * into the live database would leave it empty whenever the download failed.
 */
async function refresh(): Promise<void> {
  const fresh = new Database(':memory:');
  try {
    await importGtfs({ agencies: [{ url: GTFS_URL }], db: fresh, logLevel: 'silent' });
  } catch (error) {
    fresh.close();
    throw error;
  }
  current?.close();
  current = fresh;
}

/** `refresh`, run once a day; a rejected run is not remembered, so the next call tries again. */
const refreshDaily: () => Promise<void> = pMemoize(refresh, {
  cache: new ExpiryMap(FEED_MAX_AGE_MS),
  cacheKey: () => 'feed',
});

/**
 * The loaded feed, downloading it first when none is loaded or the last download is a day
 * old. A failed refresh keeps serving the previous feed; it only throws when none has ever loaded.
 */
async function feed(): Promise<Database.Database> {
  try {
    await refreshDaily();
  } catch (error) {
    if (current === null) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`transportation: GTFS feed could not be loaded: ${reason}`, { cause: error });
    }
  }
  if (current === null) throw new Error('transportation: GTFS feed is not loaded');
  return current;
}

/** YYYY-MM-DD as the YYYYMMDD number GTFS uses. */
function gtfsDate(date: string): number {
  return Number(date.replaceAll('-', ''));
}

export async function feedInfo(): Promise<Feed> {
  const db = await feed();
  const info = getFeedInfo({}, ['feed_start_date', 'feed_end_date', 'feed_version'], [], { db })[0];
  return {
    valid_from: isoDateFrom(info?.feed_start_date, 'yyyyMMdd'),
    valid_to: isoDateFrom(info?.feed_end_date, 'yyyyMMdd'),
    version: trimmed(info?.feed_version),
  };
}

function toStop(raw: RawStop): Stop {
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

/**
 * The DOTS page for a route. The feed links regular routes to a page with a season suffix
 * that no longer resolves (e.g. "/104-spring"); the page without the suffix does. Other links
 * (e.g. the charter page of the BWI route) are kept as they are.
 */
function routeUrl(raw: RawRoute): string | null {
  const url = trimmed(raw.route_url);
  if (url === null) return null;
  return url.startsWith(`${SITE}/${raw.route_id}-`)
    ? `${SITE}/${encodeURIComponent(raw.route_id)}`
    : url;
}

function toRoute(raw: RawRoute, scheduled: ReadonlySet<string>): Route {
  return {
    id: raw.route_id,
    short_name: raw.route_short_name,
    long_name: raw.route_long_name,
    color: raw.route_color,
    url: routeUrl(raw),
    scheduled: scheduled.has(raw.route_id),
  };
}

/** Ids of the routes with a trip on `date`. */
function routesOnDate(db: Database.Database, date: string): Set<string> {
  const serviceIds = getServiceIdsByDate(gtfsDate(date), { db });
  if (serviceIds.length === 0) return new Set();
  return new Set(
    getRoutes({ service_id: serviceIds }, ['route_id'], [], { db }).map((r) => r.route_id),
  );
}

/** Every route in id order, flagged with whether it runs on `date`. */
export async function routes(date: string): Promise<Route[]> {
  const db = await feed();
  const scheduled = routesOnDate(db, date);
  return getRoutes({}, ROUTE_FIELDS, [['route_id', 'ASC']], { db }).map((raw) =>
    toRoute(raw, scheduled),
  );
}

/** One route, or undefined when the feed has no such id. */
export async function route(routeId: string, date: string): Promise<Route | undefined> {
  const db = await feed();
  const raw = getRoutes({ route_id: routeId }, ROUTE_FIELDS, [], { db })[0];
  return raw === undefined ? undefined : toRoute(raw, routesOnDate(db, date));
}

/** Every point of a shape, thinned evenly so at most `MAX_SHAPE_POINTS` remain. */
function shapePoints(db: Database.Database, shapeId: string): [number, number][] {
  const points = getShapes(
    { shape_id: shapeId },
    ['shape_pt_lon', 'shape_pt_lat'],
    [['shape_pt_sequence', 'ASC']],
    { db },
  );
  const stride = Math.max(1, Math.ceil(points.length / MAX_SHAPE_POINTS));
  return points
    .filter((_, index) => index % stride === 0 || index === points.length - 1)
    .map((point) => [point.shape_pt_lon, point.shape_pt_lat]);
}

/**
 * The stops and polyline of the route's most common trip pattern on `date`. When nothing runs
 * that day (`Route.scheduled` is false) the most common pattern over the whole timetable is
 * used instead, so the route can still be described.
 */
export async function routePattern(
  routeId: string,
  date: string,
): Promise<Pick<RouteDetail, 'headsign' | 'stops' | 'shape'>> {
  const db = await feed();
  const fields = ['trip_id', 'shape_id'] as const;
  let trips = getTrips({ route_id: routeId, date: gtfsDate(date) }, fields, [], { db });
  if (trips.length === 0) trips = getTrips({ route_id: routeId }, fields, [], { db });
  const shapeId = maxBy(toPairs(countBy(trips, 'shape_id')), ([, count]) => count)?.[0];
  const pattern = trips.find((trip) => trip.shape_id === shapeId);
  const stopTimes =
    pattern === undefined
      ? []
      : getStoptimes(
          { trip_id: pattern.trip_id },
          ['stop_id', 'stop_sequence', 'stop_headsign', 'timepoint'],
          [['stop_sequence', 'ASC']],
          { db },
        );
  const stops = new Map(
    getStops({ stop_id: stopTimes.map((stopTime) => stopTime.stop_id) }, STOP_FIELDS, [], {
      db,
    }).map((stop) => [stop.stop_id, stop]),
  );
  return {
    headsign: stopTimes.find((stopTime) => stopTime.stop_headsign !== null)?.stop_headsign ?? null,
    stops: stopTimes.flatMap((stopTime, index) => {
      const stop = stopTime.stop_id === null ? undefined : stops.get(stopTime.stop_id);
      return stop === undefined
        ? []
        : [{ ...toStop(stop), sequence: index, timepoint: stopTime.timepoint === 1 }];
    }),
    shape: shapeId === undefined || shapeId === 'null' ? [] : shapePoints(db, shapeId),
  };
}

/** What `stops` filters by: a name fragment and/or a point with a radius in metres. */
export type StopFilter = {
  query?: string | undefined;
  lat?: number | undefined;
  lon?: number | undefined;
  radius_m: number;
};

/** Stops matching `filter`: nearest first for a point search, otherwise in id order. */
export async function stops({ query, lat, lon, radius_m }: StopFilter): Promise<Stop[]> {
  const db = await feed();
  const found =
    lat !== undefined && lon !== undefined
      ? getStops({ stop_lat: lat, stop_lon: lon }, STOP_FIELDS, [], {
          db,
          bounding_box_side_m: radius_m * 2,
        })
      : getStops({}, STOP_FIELDS, [['stop_id', 'ASC']], { db });
  const needle = query?.toLowerCase();
  return found
    .filter((stop) => needle === undefined || (stop.stop_name ?? '').toLowerCase().includes(needle))
    .map(toStop);
}

/** One stop, or undefined when the feed has no such id. */
export async function stop(stopId: string): Promise<Stop | undefined> {
  const db = await feed();
  const raw = getStops({ stop_id: stopId }, STOP_FIELDS, [], { db })[0];
  return raw === undefined ? undefined : toStop(raw);
}

/** Ids of every route with a trip that serves `stopId`, in id order. */
export async function stopRoutes(stopId: string): Promise<string[]> {
  const db = await feed();
  return getRoutes({ stop_id: stopId }, ['route_id'], [['route_id', 'ASC']], { db }).map(
    (found) => found.route_id,
  );
}

/** The direction code of a trip as the shared vocabulary. */
function directionOf(directionId: number | null | undefined) {
  return decodeOrNull(DIRECTIONS, directionId);
}

/**
 * Scheduled departures of a route on `date`: at `stopId` when given, else at timepoint stops
 * only; from `after` (HH:MM) on when given.
 */
export async function departures(
  routeId: string,
  date: string,
  stopId?: string,
  after?: string,
): Promise<Schedule> {
  const db = await feed();
  const trips = getTrips(
    { route_id: routeId, date: gtfsDate(date) },
    ['trip_id', 'direction_id'],
    [],
    { db },
  );
  const directions = new Map(trips.map((trip) => [trip.trip_id, trip.direction_id]));
  const stopTimes =
    trips.length === 0
      ? []
      : getStoptimes(
          {
            trip_id: trips.map((trip) => trip.trip_id),
            ...(stopId === undefined ? { timepoint: 1 } : { stop_id: stopId }),
          },
          ['trip_id', 'stop_id', 'departure_time', 'stop_headsign', 'timepoint'],
          [['departure_time', 'ASC']],
          { db },
        );
  const names = new Map(
    getStops({ stop_id: stopTimes.map((stopTime) => stopTime.stop_id) }, STOP_FIELDS, [], {
      db,
    }).map((found) => [found.stop_id, found.stop_name]),
  );
  const cutoff = after === undefined ? '' : `${after}:00`;
  return {
    route: routeId,
    date,
    weekday: weekdayOf(date),
    service_ids: getServiceIdsByDate(gtfsDate(date), { db }),
    departures: stopTimes.flatMap((stopTime) =>
      stopTime.stop_id === null ||
      stopTime.departure_time === null ||
      stopTime.departure_time < cutoff
        ? []
        : [
            {
              time: stopTime.departure_time,
              stop_id: stopTime.stop_id,
              stop_name: names.get(stopTime.stop_id) ?? null,
              headsign: stopTime.stop_headsign,
              direction: directionOf(directions.get(stopTime.trip_id)),
              trip_id: stopTime.trip_id,
              timepoint: stopTime.timepoint === 1,
            },
          ],
    ),
  };
}
