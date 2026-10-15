import { decode, member } from '../../../common.js';
import { isoDateTimeFrom } from '../../../lib/dates.js';
import { htmlToTextOrNull } from '../../../lib/html.js';
import { numeric, trimmed } from '../../../lib/text.js';
import {
  type Game,
  GAME_RESULTS,
  GAME_TYPES,
  type League,
  type Team,
  TEAM_ROLES,
} from './schemas.js';

/** How a game page prints its start and end, e.g. "9/9/2026 3:50:00 PM". */
const GAME_DATE_TIME = 'M/d/yyyy h:mm:ss a';

/** The id of a league's waitlist, which the site lists as one more division. */
const WAITLIST_DIVISION_ID = '0';

type RawLeagueTeam = {
  id: string;
  name: string;
  playersNo: number;
  guysNo: number;
  girlsrNo: number;
  approved: boolean;
  lookForPlayer: boolean;
  captainInfo?: { name?: string | null } | null;
};

export type RawLeague = {
  id: string;
  name: string;
  sportName: string;
  isCoedLeague: boolean;
  regularSeasonEnd?: string | null;
  allowWaitList: boolean;
  watilistRegStart?: string | null;
  description?: string | null;
  divisionTeams: {
    id: string;
    name: string;
    isLocked: boolean;
    maxTeamCount: number;
    leaveTeamSpot: number;
    teams: RawLeagueTeam[];
  }[];
};

type RawTeamGame = {
  gameId: number;
  gameType: number;
  gameDateMonthStr: string;
  gameDateDayStr: string;
  gameOpponent: string;
  opponentTeamId?: string | null;
  opponentTeamName?: string | null;
  gameResultStr?: string | null;
  gameResultScore?: string | null;
  facilityName?: string | null;
  surfaceName?: string | null;
};

export type RawTeam = {
  id: string;
  name: string;
  sportId: string;
  sportName: string;
  leagueId: string;
  leagueName: string;
  divisionId?: string | null;
  divisionName?: string | null;
  wlt: string;
  streak?: string | null;
  ppgValue?: string | null;
  ppgRanking?: string | null;
  paValue?: string | null;
  paRanking?: string | null;
  teamMembers: { memberName: string; teamMemberLevel: string }[];
  regularGameList: RawTeamGame[];
  playoffGameList: RawTeamGame[];
};

type RawGameSide = 'team1' | 'team2';

export type RawGame = {
  id: number;
  type: number;
  sportName: string;
  leagueId: string;
  leagueName: string;
  divisionName?: string | null;
  startDate: string;
  endDate: string;
  facilityName?: string | null;
  surfaceName?: string | null;
  facilityLocation?: string | null;
  facilityLat?: string | null;
  facilityLon?: string | null;
  isUpcomingGame: boolean;
  isCompleteGame: boolean;
  isGameCancelled: boolean;
  gameperiodDetailList: { text: string; team1Score?: number | null; team2Score?: number | null }[];
} & Record<`${RawGameSide}${'Id' | 'Name' | 'WLT' | 'SP' | 'STRK' | 'Result'}`, string | null> &
  Record<`${RawGameSide}${'Rank' | 'PF' | 'PA'}`, number | null>;

/** A value the site prints as "---" when it has none, e.g. a rank before any game. */
function stat(value: string | null | undefined): string | null {
  const printed = trimmed(value);
  return printed === null || /^-+$/.test(printed) ? null : printed;
}

function gameDateTime(value: string, what: string): string {
  const parsed = isoDateTimeFrom(value, GAME_DATE_TIME);
  if (parsed === null) throw new Error(`imleagues: unreadable ${what} "${value}"`);
  return parsed;
}

export function toLeague(raw: RawLeague): League {
  return {
    id: raw.id,
    name: raw.name,
    sport: raw.sportName,
    coed: raw.isCoedLeague,
    regular_season_end: trimmed(raw.regularSeasonEnd)?.slice(0, 10) ?? null,
    waitlist_opens: raw.allowWaitList ? trimmed(raw.watilistRegStart) : null,
    description: htmlToTextOrNull(raw.description),
    divisions: raw.divisionTeams.map((division) => {
      const capped = division.maxTeamCount > 0;
      return {
        id: division.id,
        name: division.name,
        waitlist: division.id === WAITLIST_DIVISION_ID,
        locked: division.isLocked,
        capacity: capped ? division.maxTeamCount : null,
        open_spots: capped ? Math.max(division.leaveTeamSpot, 0) : null,
        teams: division.teams.map((team) => ({
          id: team.id,
          name: team.name,
          players: team.playersNo,
          men: team.guysNo,
          women: team.girlsrNo,
          captain: trimmed(team.captainInfo?.name),
          approved: team.approved,
          looking_for_players: team.lookForPlayer,
        })),
      };
    }),
  };
}

function toTeamGame(raw: RawTeamGame): Team['games'][number] {
  const result = trimmed(raw.gameResultStr);
  return {
    id: String(raw.gameId),
    type: decode(GAME_TYPES, raw.gameType, 'game type'),
    date: `${raw.gameDateMonthStr} ${raw.gameDateDayStr}`,
    home: member(['VS', '@'], raw.gameOpponent, 'home or away marker') === 'VS',
    opponent_id: trimmed(raw.opponentTeamId),
    opponent: trimmed(raw.opponentTeamName),
    result: result === null ? null : decode(GAME_RESULTS, result, 'game result'),
    score: trimmed(raw.gameResultScore),
    facility: trimmed(raw.facilityName),
    surface: trimmed(raw.surfaceName),
  };
}

export function toTeam(raw: RawTeam): Team {
  const [wins, losses, ties] = (raw.wlt.match(/\d+/g) ?? []).map(Number);
  return {
    id: raw.id,
    name: raw.name,
    sport_id: raw.sportId,
    sport: raw.sportName,
    league_id: raw.leagueId,
    league: raw.leagueName,
    division_id: trimmed(raw.divisionId),
    division: trimmed(raw.divisionName),
    wins: wins ?? 0,
    losses: losses ?? 0,
    ties: ties ?? 0,
    streak: stat(raw.streak),
    points_per_game: numeric(stat(raw.ppgValue)),
    points_per_game_rank: stat(raw.ppgRanking),
    points_allowed_per_game: numeric(stat(raw.paValue)),
    points_allowed_rank: stat(raw.paRanking),
    members: raw.teamMembers.map((teamMember) => ({
      name: teamMember.memberName,
      role: decode(TEAM_ROLES, teamMember.teamMemberLevel, 'team role'),
    })),
    games: [...raw.regularGameList, ...raw.playoffGameList].map(toTeamGame),
  };
}

function toGameTeam(raw: RawGame, side: RawGameSide): Game['home'] {
  return {
    id: trimmed(raw[`${side}Id`]),
    name: trimmed(raw[`${side}Name`]),
    record: trimmed(raw[`${side}WLT`]),
    score: numeric(raw[`${side}Result`]),
    sportsmanship: numeric(raw[`${side}SP`]),
    rank: raw[`${side}Rank`] || null,
    streak: stat(raw[`${side}STRK`]),
    points_for: raw[`${side}PF`],
    points_against: raw[`${side}PA`],
  };
}

function gameStatus(raw: RawGame): Game['status'] {
  if (raw.isGameCancelled) return 'cancelled';
  if (raw.isUpcomingGame) return 'upcoming';
  return raw.isCompleteGame ? 'final' : 'awaiting_scores';
}

export function toGame(raw: RawGame): Game {
  return {
    id: String(raw.id),
    type: decode(GAME_TYPES, raw.type, 'game type'),
    status: gameStatus(raw),
    sport: raw.sportName,
    league_id: raw.leagueId,
    league: raw.leagueName,
    division: trimmed(raw.divisionName),
    starts: gameDateTime(raw.startDate, 'game start'),
    ends: gameDateTime(raw.endDate, 'game end'),
    facility: trimmed(raw.facilityName),
    surface: trimmed(raw.surfaceName),
    address: trimmed(raw.facilityLocation),
    latitude: numeric(raw.facilityLat),
    longitude: numeric(raw.facilityLon),
    home: toGameTeam(raw, 'team1'),
    away: toGameTeam(raw, 'team2'),
    periods: raw.gameperiodDetailList.map((period) => ({
      name: period.text,
      home_score: period.team1Score ?? null,
      away_score: period.team2Score ?? null,
    })),
  };
}
