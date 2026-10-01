import Parser from 'rss-parser';
import { z } from 'zod';
import { getJson, HttpError } from '../../lib/http.js';
import { Integration, tool } from '../base.js';
import { parseDiningCalendar, toBusyMeter, toNewsItem } from './parsers.js';
import {
  type BusyMeter,
  busyMeterSchema,
  type DiningCalendar,
  diningCalendarSchema,
  type NewsItem,
  newsItemSchema,
} from './schemas.js';

/** The service behind the "Dining Hall Status" page, on a separate host from the dining site. */
const BUSY_METER_ORIGIN = 'https://dsa-ws01.umd.edu';
const BUSY_METER_PATH = 'DiningBusyMeter/get.json';

const rss = new Parser();

export class Dining extends Integration {
  readonly name = 'dining';
  readonly baseUrl = 'https://dining.umd.edu';

  @tool({
    title: 'Get dining hall busy meter',
    description:
      'Current crowd level (less, moderately or extremely busy) of the three UMD dining halls, from the service behind the "Dining Hall Status" page. The service has been returning errors; when it does, `available` is false and the UMD mobile app is the alternative. No login needed.',
    input: {},
    output: busyMeterSchema.shape,
  })
  async get_busy_meter(): Promise<BusyMeter> {
    const unavailable = (reason: string): BusyMeter => ({ available: false, reason, halls: [] });
    try {
      return toBusyMeter(await getJson(BUSY_METER_ORIGIN, BUSY_METER_PATH));
    } catch (error) {
      // A non-2xx answer, an unreachable host or a non-JSON body all mean the service is
      // down, which the tool reports as data rather than as a failure.
      if (error instanceof HttpError) {
        return unavailable(`The busy meter service responded with HTTP ${error.status}`);
      }
      if (error instanceof Error) {
        return unavailable(`The busy meter service could not be read: ${error.message}`);
      }
      throw error;
    }
  }

  @tool({
    title: 'Get dining calendar',
    description:
      'Key dates for the current semester from UMD Dining Services: when dining plans go live, holiday and break hours, closures and Dining Dollar expiry. No login needed.',
    input: {},
    output: diningCalendarSchema.shape,
  })
  async get_calendar(): Promise<DiningCalendar> {
    return parseDiningCalendar(await this.getText('dining-plans/calendar'));
  }

  @tool({
    title: 'Get dining news',
    description:
      'The newest posts on dining.umd.edu, mainly "The Dish" monthly newsletter, from its RSS feed. No login needed.',
    input: {},
    output: { items: z.array(newsItemSchema).describe('Newest first; the feed carries ten') },
  })
  async get_news(): Promise<{ items: NewsItem[] }> {
    const feed = await rss.parseString(await this.getText('rss.xml'));
    return { items: feed.items.map(toNewsItem) };
  }
}
