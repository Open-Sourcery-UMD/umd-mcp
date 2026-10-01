import { z } from 'zod';
import { today } from '../../common.js';
import { Integration, tool } from '../base.js';
import {
  departures,
  feedInfo,
  route,
  routePattern,
  routes,
  stop,
  type StopFilter,
  stopRoutes,
  stops,
} from './gtfs.js';
import { parseAlerts, parseServiceCalendar } from './parsers.js';
import {
  type Alerts,
  alertsSchema,
  type Feed,
  feedSchema,
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
  SITE,
  type Stop,
  stopId,
  stopSchema,
  type StopWithRoutes,
  stopWithRoutesSchema,
} from './schemas.js';

export class Transportation extends Integration {
  readonly name = 'transportation';
  readonly baseUrl = SITE;

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
    return { feed: await feedInfo(), routes: await routes(today()) };
  }

  @tool({
    title: 'Get a Shuttle-UM route',
    description:
      'One Shuttle-UM route with its stops in order (for the most common trip pattern on the given day, or over the whole timetable when the route does not run that day) and the route polyline, from the published GTFS feed. No login needed.',
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
    const day = date ?? today();
    const found = await route(id, day);
    if (found === undefined) throw new Error(`${this.name}: no route "${id}"`);
    return { ...found, ...(await routePattern(id, day)) };
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
  async list_stops(filter: StopFilter): Promise<{ stops: Stop[] }> {
    if ((filter.lat === undefined) !== (filter.lon === undefined)) {
      throw new Error(`${this.name}: lat and lon must be given together`);
    }
    return { stops: await stops(filter) };
  }

  @tool({
    title: 'Get a Shuttle-UM stop',
    description:
      'One Shuttle-UM bus stop with its location and every route that serves it, from the published GTFS feed. No login needed.',
    input: { stop: stopId },
    output: stopWithRoutesSchema.shape,
  })
  async get_stop({ stop: id }: { stop: string }): Promise<StopWithRoutes> {
    const found = await stop(id);
    if (found === undefined) throw new Error(`${this.name}: no stop "${id}"`);
    return { ...found, routes: await stopRoutes(id) };
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
    stop: stopAt,
    after,
  }: {
    route: string;
    date?: string | undefined;
    stop?: string | undefined;
    after?: string | undefined;
  }): Promise<Schedule> {
    const day = date ?? today();
    if ((await route(id, day)) === undefined) throw new Error(`${this.name}: no route "${id}"`);
    return departures(id, day, stopAt, after);
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
}
