import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { addYears, format, isBefore, isValid, parse, parseISO } from 'date-fns';
import { decode } from '../../../common.js';
import { isoDateTimeFrom } from '../../../lib/dates.js';
import { absoluteUrl, type Selection, text, textOrNull } from '../../../lib/scrape.js';
import { linkedId, SITE } from '../common.js';
import { type League, LEAGUE_STATUSES, type Sport, type Term } from './schemas.js';

/** How the list view prints a date and time in its `sort-value` attributes. */
const SORT_DATE_TIME = 'M/d/yyyy h:mm:ss a';

/** The dates of one league, which only the list view gives in full. */
type LeagueDates = Pick<
  League,
  'registration_opens' | 'registration_closes' | 'join_teams_until' | 'season_start' | 'season_end'
>;

/** A cell's `sort-value` (its date and time, unformatted) as YYYY-MM-DDTHH:mm:ss. */
function sortDateTime(cell: Selection): string | null {
  return isoDateTimeFrom(cell.find('[sort-value]').attr('sort-value'), SORT_DATE_TIME);
}

/**
 * The last day of a season printed as "10/25-11/12", in the year of `start` or the next one
 * when the season runs over New Year.
 */
function seasonEnd(printed: string, start: string | null): string | null {
  const last = printed.split('-')[1]?.trim();
  if (start === null || last === undefined) return null;
  const first = parseISO(start);
  const end = parse(last, 'M/d', first);
  if (!isValid(end)) return null;
  return format(isBefore(end, first) ? addYears(end, 1) : end, 'yyyy-MM-dd');
}

/**
 * The list view of the sport area: one row per league with registration, join and season
 * dates, keyed by league id. A status label stands in for the registration start once it has
 * passed, and its `sort-value` then means nothing.
 */
export function parseLeagueDates(html: string): Map<string, LeagueDates> {
  const $ = cheerio.load(html);
  const dates = new Map<string, LeagueDates>();
  for (const row of $('#gvActiveSports > tbody > tr').toArray()) {
    const cells = $(row).children('td');
    const id = linkedId(cells.eq(1).find('a').attr('href'), 'league');
    if (id === null) continue;
    const opens = cells.eq(2);
    const season = cells.eq(5);
    const seasonStart = sortDateTime(season)?.slice(0, 10) ?? null;
    dates.set(id, {
      registration_opens: opens.find('.label').length > 0 ? null : sortDateTime(opens),
      registration_closes: sortDateTime(cells.eq(3)),
      join_teams_until: sortDateTime(cells.eq(4)),
      season_start: seasonStart,
      season_end: seasonEnd(text(season), seasonStart),
    });
  }
  return dates;
}

/** One sport panel of the card view; null when it does not link to a sport. */
function parseSport(
  $: CheerioAPI,
  panel: Selection,
  dates: Map<string, LeagueDates>,
): Sport | null {
  const link = panel.find('.iml-panel-title a').first();
  const id = linkedId(link.attr('href'), 'sport');
  if (id === null) return null;
  const leagues = panel
    .find('a[href^="/spa/league/"]')
    .toArray()
    .flatMap((anchor): League[] => {
      const leagueId = linkedId($(anchor).attr('href'), 'league');
      if (leagueId === null) return [];
      return [
        {
          id: leagueId,
          name: text($(anchor).find('[id$="_spLeagueName"]')),
          status: decode(
            LEAGUE_STATUSES,
            textOrNull($(anchor).find('[id$="_divLeagueStatus1"]')),
            'league status',
          ),
          registration_opens: null,
          registration_closes: null,
          join_teams_until: null,
          season_start: null,
          season_end: null,
          ...dates.get(leagueId),
        },
      ];
    });
  return {
    id,
    name: text(link),
    logo_url: absoluteUrl(panel.find('img').first().attr('src'), SITE),
    leagues,
  };
}

/**
 * The card view of the sport area: a heading per term, then a panel per sport listing its
 * leagues and their status. `dates` (from `parseLeagueDates`) fills in each league's dates.
 */
export function parseTerms(html: string, dates: Map<string, LeagueDates>): Term[] {
  const $ = cheerio.load(html);
  const terms: Term[] = [];
  for (const element of $('.iml-panel-body > h3, .iml-panel').toArray()) {
    if (element.tagName === 'h3') {
      terms.push({ name: text($(element)), sports: [] });
      continue;
    }
    const sport = parseSport($, $(element), dates);
    if (sport !== null) terms.at(-1)?.sports.push(sport);
  }
  return terms;
}
