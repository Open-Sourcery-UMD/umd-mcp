import Parser from 'rss-parser';
import { z } from 'zod';
import { limit } from '../../common.js';
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

const BUSY_METER_URL = 'https://dsa-ws01.umd.edu/DiningBusyMeter/get.json';

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
      const res = await fetch(BUSY_METER_URL, { headers: { accept: 'application/json' } });
      if (!res.ok) return unavailable(`The busy meter service responded with HTTP ${res.status}`);
      return toBusyMeter(await res.json());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return unavailable(`The busy meter service could not be read: ${message}`);
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
    input: { limit: limit(10, 10) },
    output: { items: z.array(newsItemSchema).describe('Newest first') },
  })
  async get_news({ limit: max }: { limit: number }): Promise<{ items: NewsItem[] }> {
    const feed = await rss.parseString(await this.getText('rss.xml'));
    return { items: feed.items.slice(0, max).map(toNewsItem) };
  }
}
