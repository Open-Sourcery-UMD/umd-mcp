import { invert } from 'lodash-es';
import { z } from 'zod';
import { Integration, tool } from '../../base.js';
import { call, leagueId, SCHOOL_ID, SERVICE, SITE } from '../common.js';
import { type RawGame, type RawLeague, type RawTeam, toGame, toLeague, toTeam } from './mappers.js';
import { parseMyTeams } from './parsers.js';
import {
  type Game,
  gameId,
  gameSchema,
  type GameType,
  gameType,
  GAME_TYPES,
  type League,
  leagueSchema,
  type MyTeam,
  myTeamSchema,
  type Team,
  teamId,
  teamSchema,
} from './schemas.js';

/** The site's type code for each game type. */
const GAME_TYPE_CODES = invert(GAME_TYPES);

/**
 * The signed-in side of UMD intramurals on IMLeagues: the member's teams, league pages with
 * their divisions and teams, team pages with records and schedules, and game results. Joining,
 * registering, rosters (which carry teammates' contact details) and score reporting are left to
 * the site itself.
 */
export class IMLeaguesMember extends Integration {
  readonly name = 'imleagues-member';
  readonly baseUrl = SITE;
  /**
   * The school's SSO redirect page sends the browser on to UMD CAS, which returns it through
   * IMLeagues' remote-login page into the member area. Both of those pages share the site's
   * origin, so they are excluded from what counts as signed in. The site answers a lost
   * session with HTTP 200 and a refusal code, which `call` turns into `AuthRequiredError`.
   */
  override readonly service = {
    name: SERVICE,
    loginUrl: `${SITE}/spa/account/ssoredirect?schoolId=${SCHOOL_ID}`,
    signedIn: (url: URL) =>
      url.origin === SITE &&
      !/^\/(spa\/account\/|Integration\/|AuthenticationFailure)/i.test(url.pathname),
  };

  @tool({
    title: 'List my intramural teams',
    description:
      "The signed-in member's UMD intramural teams on IMLeagues, with each team's captain. Requires login.",
    input: {},
    output: { teams: z.array(myTeamSchema).describe('Teams in site order') },
  })
  async list_my_teams(): Promise<{ teams: MyTeam[] }> {
    const html = await call<string>(
      this.fetcher,
      'Member.PlayerBO',
      'GetMemberViewAllTeamsResultHTML',
      'BaseInVO',
      {},
    );
    return { teams: parseMyTeams(html) };
  }

  @tool({
    title: 'Get an intramural league',
    description:
      "A UMD intramural league on IMLeagues: its rules and information, each division's time slot and remaining spots, and every team in each division with its roster size and captain. Requires login.",
    input: { league_id: leagueId },
    output: leagueSchema.shape,
  })
  async get_league({ league_id }: { league_id: string }): Promise<League> {
    const raw = await call<RawLeague>(this.fetcher, 'League.NewHomeBO', 'Initialize', 'ViewInVO', {
      entityType: 'league',
      entityId: league_id,
      pageType: 'League',
    });
    return toLeague(raw);
  }

  @tool({
    title: 'Get an intramural team',
    description:
      'A UMD intramural team on IMLeagues: its league and division, record, streak and scoring, members with their roles, and every regular season and playoff game with the opponent, result and venue. Requires login.',
    input: { team_id: teamId },
    output: teamSchema.shape,
  })
  async get_team({ team_id }: { team_id: string }): Promise<Team> {
    const raw = await call<RawTeam>(this.fetcher, 'Team.HomeBO', 'Initialize', 'ViewInVO', {
      entityType: 'team',
      entityId: team_id,
      pageType: 'Team',
    });
    return toTeam(raw);
  }

  @tool({
    title: 'Get an intramural game',
    description:
      'One UMD intramural game on IMLeagues: when and where it is played, its status, both teams with their records and standings, and the final and per-period scores. Requires login.',
    input: {
      league_id: leagueId.describe('League id from imleagues_member_get_team'),
      game_id: gameId,
      type: gameType.describe('Game type from imleagues_member_get_team'),
    },
    output: gameSchema.shape,
  })
  async get_game({
    league_id,
    game_id,
    type,
  }: {
    league_id: string;
    game_id: string;
    type: GameType;
  }): Promise<Game> {
    const raw = await call<RawGame>(
      this.fetcher,
      'League.ViewGameBO',
      'Initialize',
      'League.ViewGameInVO',
      {
        entityType: 'league',
        entityId: league_id,
        gameId: game_id,
        gameType: GAME_TYPE_CODES[type],
        pageType: 'League',
      },
    );
    return toGame(raw);
  }
}
