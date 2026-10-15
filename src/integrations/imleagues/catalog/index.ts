import { z } from 'zod';
import { Integration, tool } from '../../base.js';
import { call, leagueId, SCHOOL_ID, SITE } from '../common.js';
import {
  type RawHandbook,
  type RawHandbooks,
  type RawStandings,
  toHandbook,
  toStandings,
} from './mappers.js';
import { parseLeagueDates, parseTerms } from './parsers.js';
import {
  type Handbook,
  handbookSchema,
  sportId,
  type Standings,
  standingsSchema,
  type Term,
  termSchema,
} from './schemas.js';

/** Layouts the intramural home page can render its sport area in, by the site's option code. */
const SPORT_AREA_VIEWS = { card: -1, list: 1 } as const;

export class IMLeagues extends Integration {
  readonly name = 'imleagues';
  readonly baseUrl = SITE;

  /** The intramural home page's sport area (rendered HTML) in one of its views. */
  private async sportArea(view: keyof typeof SPORT_AREA_VIEWS): Promise<string> {
    return call<string>(this.fetcher, 'Intramural.HomeBO', 'GetSportArea', 'Common.SportViewInVO', {
      schoolId: SCHOOL_ID,
      option: SPORT_AREA_VIEWS[view],
    });
  }

  @tool({
    title: 'List intramural leagues',
    description:
      "UMD intramural sports this term on IMLeagues (RecWell's intramural program), with every league each offers: registration status, when team registration opens and closes, how long players can join teams, and the season's dates. No login needed.",
    input: {},
    output: { terms: z.array(termSchema).describe('Terms with active sports, in site order') },
  })
  async list_leagues(): Promise<{ terms: Term[] }> {
    const [cards, list] = await Promise.all([this.sportArea('card'), this.sportArea('list')]);
    return { terms: parseTerms(cards, parseLeagueDates(list)) };
  }

  @tool({
    title: 'Get league standings',
    description:
      'Standings for a UMD intramural league on IMLeagues: every team with wins, losses, ties, forfeits, sportsmanship rating, winning percentage, points for and against and streak, for the whole league and within each division, plus the tiebreaker order. No login needed.',
    input: { league_id: leagueId },
    output: standingsSchema.shape,
  })
  async get_standings({ league_id }: { league_id: string }): Promise<Standings> {
    const raw = await call<RawStandings>(
      this.fetcher,
      'League.StandingsBO',
      'Initialize',
      'ViewInVO',
      {
        entityType: 'league',
        entityId: league_id,
        pageType: 'League',
      },
    );
    return toStandings(raw);
  }

  @tool({
    title: 'List handbooks',
    description:
      'Handbooks and manuals UMD Intramural Sports posts on IMLeagues (the participant handbook, rules), school-wide or for one sport. No login needed.',
    input: {
      sport_id: sportId
        .optional()
        .describe(
          'Only list handbooks for this sport, by id from imleagues_list_leagues (default: school-wide handbooks)',
        ),
    },
    output: { handbooks: z.array(handbookSchema).describe('Handbooks in site order') },
  })
  async list_handbooks({
    sport_id,
  }: {
    sport_id?: string | undefined;
  }): Promise<{ handbooks: Handbook[] }> {
    if (sport_id !== undefined) {
      const handbooks = await call<RawHandbook[]>(
        this.fetcher,
        'Network.HandBooksBO',
        'GetHandbooksForSport',
        'Network.HandBooksSportInVO',
        { schoolId: SCHOOL_ID, sportId: sport_id, entityType: 'network' },
      );
      return { handbooks: handbooks.map(toHandbook) };
    }
    const { handbooksLists } = await call<RawHandbooks>(
      this.fetcher,
      'Network.HandBooksBO',
      'Initialize',
      'ViewInVO',
      { entityType: 'network', entityId: SCHOOL_ID, pageType: 'School' },
    );
    // List 0 is the school's own handbooks; list 1 holds the selected sport's, none here.
    return {
      handbooks: handbooksLists
        .filter((list) => list.listType === 0)
        .flatMap((list) => list.handbooks.map(toHandbook)),
    };
  }
}
