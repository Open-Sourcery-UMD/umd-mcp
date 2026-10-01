import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { links, type Selection, text, textOrNull } from '../../lib/scrape.js';
import { type Alerts, type ServiceCalendar, SITE } from './schemas.js';

/** Loads a DOTS page and returns the node body. */
function loadPage(html: string): { $: CheerioAPI; body: Selection } {
  const $ = cheerio.load(html);
  return { $, body: $('main .field--name-body').first() };
}

/** The first `<h2>` in `body` whose text satisfies `matches`. */
function heading($: CheerioAPI, body: Selection, matches: (title: string) => boolean): Selection {
  return body
    .find('h2')
    .filter((_, h2) => matches(text($(h2))))
    .first();
}

/** Parses the shuttle-um page: the alerts list and the season heading's notice paragraph. */
export function parseAlerts(html: string): Alerts {
  const { $, body } = loadPage(html);
  const alerts = heading($, body, (title) => title.startsWith('SYSTEM UPDATES'));
  const season = heading($, body, (title) => /SCHEDULES$/i.test(title));
  const effective = season.nextAll('p').first();
  return {
    season: textOrNull(season),
    effective: textOrNull(effective.find('strong').first()),
    alerts: alerts
      .nextAll('ul')
      .first()
      .children('li')
      .toArray()
      .map((li) => ({ text: text($(li)), links: links($, $(li), SITE) })),
    notices: links($, effective, SITE),
  };
}

/** Parses the service calendar: one `<h4>` per period, each followed by a `<ul>` of date ranges. */
export function parseServiceCalendar(html: string): ServiceCalendar {
  const { $, body } = loadPage(html);
  return {
    title: textOrNull(body.find('h2').first()),
    periods: body
      .find('h4')
      .toArray()
      .map((h4) => ({
        period: text($(h4)),
        entries: $(h4)
          .nextUntil('h4', 'ul')
          .children('li')
          .toArray()
          .map((li) => {
            const [dates = '', ...status] = text($(li)).split(':');
            return {
              dates: dates.trim(),
              status: status.join(':').trim(),
              url: links($, $(li), SITE)[0]?.url ?? null,
            };
          }),
      })),
  };
}
