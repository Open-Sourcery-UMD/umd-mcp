import { getRoutes, getServiceIdsByDate, getStops, getStoptimes, getTrips } from 'gtfs';
import { z } from 'zod';
import { today, weekdayOf } from '../../common.js';
import { Integration, tool } from '../base.js';
import {
  directionOf,
  feedInfo,
  gtfsDate,
  openFeed,
  route,
  routePattern,
  routes,
  STOP_FIELDS,
  toStop,
} from './gtfs.js';
import { parseAlerts, parsePage, parseServiceCalendar } from './parsers.js';
import {
  type Alerts,
  alertsSchema,
  type Feed,
  feedSchema,
  type Page,
  type PageKey,
  pageKey,
  PAGES,
  pageSchema,
  type Route,
  type RouteDetail,
  routeDetailSchema,
  routeId,
  routeSchema,
  type Schedule,
  scheduleSchema,
  type ServiceCalendar,
  serviceCalendarSchema,
  serviceDate,
  type Stop,
  stopId,
  stopSchema,
  type StopWithRoutes,
  stopWithRoutesSchema,
} from './schemas.js';

export class Transportation extends Integration {
  readonly name = 'transportation';
  readonly baseUrl = 'https://transportation.umd.edu';

  @tool({
    title: 'List Shuttle-UM routes',
    description:
      'Every Shuttle-UM bus route in the current timetable (regular routes such as 104 College Park Metro plus event routes), with whether each runs today, from the published GTFS feed. No login needed.',
    input: {},
    output: {
      feed: feedSchema.describe('The timetable the answers come from'),
      routes: z.array(routeSchema).describe('Routes in id order'),
    },
  })
  async list_routes(): Promise<{ feed: Feed; routes: Route[] }> {
    await openFeed();
    return { feed: feedInfo(), routes: routes(today()) };
  }

  @tool({
    title: 'Get a Shuttle-UM route',
    description:
      'One Shuttle-UM route with its stops in order (for the most common trip pattern on the given day) and the route polyline, from the published GTFS feed. No login needed.',
    input: { route: routeId, date: serviceDate },
    output: routeDetailSchema.shape,
  })
  async get_route({
    route: id,
    date,
  }: {
    route: string;
    date?: string | undefined;
  }): Promise<RouteDetail> {
    await openFeed();
    const day = date ?? today();
    const found = route(id, day);
    if (found === undefined) throw new Error(`${this.name}: no route "${id}"`);
    return { ...found, ...routePattern(id, day) };
  }

  @tool({
    title: 'List Shuttle-UM stops',
    description:
      'Shuttle-UM bus stops from the published GTFS feed, filtered by a name fragment or by distance from a point. Without a filter, every stop. No login needed.',
    input: {
      query: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Only stops whose name contains this text, e.g. "Stamp"'),
      lat: z.number().min(-90).max(90).optional().describe('Latitude to search around'),
      lon: z.number().min(-180).max(180).optional().describe('Longitude to search around'),
      radius_m: z
        .number()
        .int()
        .min(50)
        .max(5000)
        .default(500)
        .describe('Search radius in metres around lat/lon (default 500)'),
    },
    output: {
      stops: z
        .array(stopSchema)
        .describe('Matching stops: nearest first for a point search, otherwise by id'),
    },
  })
  async list_stops({
    query,
    lat,
    lon,
    radius_m,
  }: {
    query?: string | undefined;
    lat?: number | undefined;
    lon?: number | undefined;
    radius_m: number;
  }): Promise<{ stops: Stop[] }> {
    await openFeed();
    if ((lat === undefined) !== (lon === undefined)) {
      throw new Error(`${this.name}: lat and lon must be given together`);
    }
    const stops =
      lat !== undefined && lon !== undefined
        ? getStops({ stop_lat: lat, stop_lon: lon }, STOP_FIELDS, [], {
            bounding_box_side_m: radius_m * 2,
          })
        : getStops({}, STOP_FIELDS, [['stop_id', 'ASC']]);
    const needle = query?.toLowerCase();
    return {
      stops: stops
        .filter(
          (stop) => needle === undefined || (stop.stop_name ?? '').toLowerCase().includes(needle),
        )
        .map(toStop),
    };
  }

  @tool({
    title: 'Get a Shuttle-UM stop',
    description:
      'One Shuttle-UM bus stop with its location and every route that serves it, from the published GTFS feed. No login needed.',
    input: { stop: stopId },
    output: stopWithRoutesSchema.shape,
  })
  async get_stop({ stop }: { stop: string }): Promise<StopWithRoutes> {
    await openFeed();
    const raw = getStops({ stop_id: stop }, STOP_FIELDS, [])[0];
    if (raw === undefined) throw new Error(`${this.name}: no stop "${stop}"`);
    return {
      ...toStop(raw),
      routes: getRoutes({ stop_id: stop }, ['route_id'], [['route_id', 'ASC']]).map(
        (found) => found.route_id,
      ),
    };
  }

  @tool({
    title: 'Get Shuttle-UM departures',
    description:
      'Scheduled departures of a Shuttle-UM route on a date, optionally at one stop, from the published GTFS feed. Times are scheduled, not live; real-time arrivals are only in the Transit app. Without a stop only timepoint stops are listed, to keep the answer short. No login needed.',
    input: {
      route: routeId,
      date: serviceDate,
      stop: stopId.optional().describe('Only departures from this stop, e.g. "1001"'),
      after: z
        .string()
        .regex(/^\d{2}:\d{2}$/, 'Expected a time like 14:30')
        .optional()
        .describe('Only departures at or after this local time, as HH:MM'),
    },
    output: scheduleSchema.shape,
  })
  async get_schedule({
    route: id,
    date,
    stop,
    after,
  }: {
    route: string;
    date?: string | undefined;
    stop?: string | undefined;
    after?: string | undefined;
  }): Promise<Schedule> {
    await openFeed();
    const day = date ?? today();
    if (route(id, day) === undefined) throw new Error(`${this.name}: no route "${id}"`);
    const trips = getTrips({ route_id: id, date: gtfsDate(day) }, ['trip_id', 'direction_id'], []);
    const directions = new Map(trips.map((trip) => [trip.trip_id, trip.direction_id]));
    const stopTimes =
      trips.length === 0
        ? []
        : getStoptimes(
            {
              trip_id: trips.map((trip) => trip.trip_id),
              ...(stop === undefined ? { timepoint: 1 } : { stop_id: stop }),
            },
            ['trip_id', 'stop_id', 'departure_time', 'stop_headsign', 'timepoint'],
            [['departure_time', 'ASC']],
          );
    const names = new Map(
      getStops({ stop_id: stopTimes.map((stopTime) => stopTime.stop_id) }, STOP_FIELDS, []).map(
        (found) => [found.stop_id, found.stop_name],
      ),
    );
    const cutoff = after === undefined ? '' : `${after}:00`;
    return {
      route: id,
      date: day,
      weekday: weekdayOf(day),
      service_ids: getServiceIdsByDate(gtfsDate(day)),
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

  @tool({
    title: 'Get Shuttle-UM service alerts',
    description:
      'Current Shuttle-UM system updates and alerts (detours, schedule changes) and the modified-service notices linked from the DOTS schedules page. Delays are not posted here, only in the Transit app. No login needed.',
    input: {},
    output: alertsSchema.shape,
  })
  async get_service_alerts(): Promise<Alerts> {
    return parseAlerts(await this.getText('shuttle-um'));
  }

  @tool({
    title: 'Get Shuttle-UM service calendar',
    description:
      'The Shuttle-UM service calendar for the academic year: for each break, exam week and intersemester period, the dates and whether service is regular or modified, with the notice page for the detail. No login needed.',
    input: {},
    output: serviceCalendarSchema.shape,
  })
  async get_service_calendar(): Promise<ServiceCalendar> {
    return parseServiceCalendar(await this.getText('shuttle-um/service-calendar'));
  }

  @tool({
    title: 'Read a DOTS information page',
    description:
      'The text and tables of one informational page on the UMD Department of Transportation Services site: NITE Ride, paratransit, charter and break shuttles, parking rules, permits and fees, citations, micromobility, regional transit, contact details. No login needed.',
    input: { key: pageKey },
    output: pageSchema.shape,
  })
  async get_page({ key }: { key: PageKey }): Promise<Page> {
    const path = PAGES[key];
    return parsePage(await this.getText(path), key, `${this.baseUrl}${path}`);
  }
}
