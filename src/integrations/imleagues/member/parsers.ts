import * as cheerio from 'cheerio';
import { text, textOrNull } from '../../../lib/scrape.js';
import { linkedId } from '../common.js';
import type { MyTeam } from './schemas.js';

/**
 * The "all teams" list on the member's player page: one item per team, its name linking to
 * the team and a line naming its captain.
 */
export function parseMyTeams(html: string): MyTeam[] {
  const $ = cheerio.load(html);
  return $('li')
    .toArray()
    .flatMap((item): MyTeam[] => {
      const link = $(item).find('h5 a[href^="/spa/team/"]').first();
      const id = linkedId(link.attr('href'), 'team');
      if (id === null) return [];
      return [
        {
          id,
          name: text(link),
          captain: textOrNull($(item).find('a[href*="player_card"]').first()),
        },
      ];
    });
}
