import { z } from 'zod';
import { isoDate, localDateTime } from '../../../common.js';

/** A team member's role, keyed by the label the site prints (none for a player). */
export const TEAM_ROLES = { Captain: 'captain', 'Co-Captain': 'co_captain', '': 'player' } as const;

type TeamRole = (typeof TEAM_ROLES)[keyof typeof TEAM_ROLES];

/** A game's outcome for a team, keyed by the label the site prints. */
export const GAME_RESULTS = {
  W: 'win',
  L: 'loss',
  T: 'tie',
  'Awaiting Scores': 'awaiting_scores',
} as const;

type GameResult = (typeof GAME_RESULTS)[keyof typeof GAME_RESULTS];

/** Whether a game is in the regular season or the playoffs, keyed by the site's type code. */
export const GAME_TYPES = { '0': 'regular', '1': 'playoff' } as const;

export type GameType = (typeof GAME_TYPES)[keyof typeof GAME_TYPES];

const GAME_STATUSES = ['upcoming', 'final', 'awaiting_scores', 'cancelled'] as const;

/** Team ids are 32 hex digits, or "zzz" and 19 digits for teams created more recently. */
export const teamId = z
  .string()
  .trim()
  .regex(/^([0-9a-f]{32}|zzz\d{19})$/i, 'Expected an IMLeagues team id like zzz1543970016234307584')
  .toLowerCase()
  .describe(
    'Team id from imleagues_member_list_my_teams, imleagues_member_get_league or imleagues_get_standings, e.g. "zzz1543970016234307584"',
  );

export const gameId = z
  .string()
  .trim()
  .regex(/^\d+$/, 'Expected a game id like 23973553')
  .describe('Game id from imleagues_member_get_team, e.g. "23973553"');

export const gameType = z
  .enum(Object.values(GAME_TYPES) as GameType[])
  .describe('"regular" for a regular season game, "playoff" for a playoff game');

export const myTeamSchema = z.object({
  id: z.string().describe('Team id to pass to imleagues_member_get_team'),
  name: z.string().describe('Team name'),
  captain: z.string().nullable().describe("The captain's name; null when the team has none"),
});

const leagueTeamSchema = z.object({
  id: z.string().describe('Team id to pass to imleagues_member_get_team'),
  name: z.string().describe('Team name'),
  players: z.number().int().describe('Players on the roster'),
  men: z.number().int().describe('Men on the roster'),
  women: z.number().int().describe('Women on the roster'),
  captain: z.string().nullable().describe("The captain's name; null when the team has none"),
  approved: z.boolean().describe('Whether the league staff have approved the team'),
  looking_for_players: z.boolean().describe('Whether the team is advertising for players'),
});

const divisionSchema = z.object({
  id: z.string().describe('IMLeagues division id'),
  name: z.string().describe('Usually the night and time slot, e.g. "2FA Mon 9:00PM"'),
  waitlist: z.boolean().describe("Whether this is the league's waitlist rather than a division"),
  locked: z.boolean().describe('Whether the division is closed to new teams'),
  capacity: z.number().int().nullable().describe('Most teams the division takes; null if no cap'),
  open_spots: z.number().int().nullable().describe('Spots left for new teams; null if no cap'),
  teams: z.array(leagueTeamSchema).describe('Teams in the division, in site order'),
});

export const leagueSchema = z.object({
  id: z.string().describe('League id'),
  name: z.string().describe('League name, e.g. "Fraternity A"'),
  sport: z.string().describe('Sport name, e.g. "7v7 Flag Football"'),
  coed: z.boolean().describe('Whether teams are mixed gender'),
  regular_season_end: isoDate
    .nullable()
    .describe('Day after the last regular season game; null when not set'),
  waitlist_opens: localDateTime(
    'When teams can start joining the waitlist; null when the league has none',
  ).nullable(),
  description: z
    .string()
    .nullable()
    .describe('League information and rules as plain text; null when the league has none'),
  divisions: z.array(divisionSchema).describe('Divisions, with the waitlist last'),
});

const memberSchema = z.object({
  name: z.string().describe("Member's name"),
  role: z
    .enum(Object.values(TEAM_ROLES) as TeamRole[])
    .describe('"captain", "co_captain" or "player"'),
});

const teamGameSchema = z.object({
  id: z.string().describe('Game id to pass to imleagues_member_get_game'),
  type: gameType.describe('Pass to imleagues_member_get_game with the id'),
  date: z
    .string()
    .describe('Month and day as printed, e.g. "Sep 09"; imleagues_member_get_game has the time'),
  home: z.boolean().describe('Whether this team is the home team'),
  opponent_id: z.string().nullable().describe('Opponent team id; null before it is decided'),
  opponent: z.string().nullable().describe("Opponent team's name; null before it is decided"),
  result: z
    .enum(Object.values(GAME_RESULTS) as GameResult[])
    .nullable()
    .describe("This team's result; null before the game is played"),
  score: z
    .string()
    .nullable()
    .describe(
      'Final score as printed, home team first, e.g. "35 - 34"; null before it is reported',
    ),
  facility: z.string().nullable().describe('Facility, e.g. "Armory"; null when not set'),
  surface: z
    .string()
    .nullable()
    .describe('Court or field within the facility, e.g. "Court 1"; null when not set'),
});

export const teamSchema = z.object({
  id: z.string().describe('Team id'),
  name: z.string().describe('Team name'),
  sport_id: z.string().describe('Sport id to pass to imleagues_list_handbooks'),
  sport: z.string().describe('Sport name'),
  league_id: z.string().describe('League id to pass to imleagues_member_get_game'),
  league: z.string().describe('League name'),
  division_id: z.string().nullable().describe('Division id; null when not in a division'),
  division: z.string().nullable().describe('Division name; null when not in a division'),
  wins: z.number().int().describe('Games won'),
  losses: z.number().int().describe('Games lost'),
  ties: z.number().int().describe('Games tied'),
  streak: z.string().nullable().describe('e.g. "Won 6", "Loss 1"; null before any game'),
  points_per_game: z.number().nullable().describe('Points scored per game; null before any game'),
  points_per_game_rank: z
    .string()
    .nullable()
    .describe('Rank in the league, e.g. "25th"; null before any game'),
  points_allowed_per_game: z
    .number()
    .nullable()
    .describe('Points allowed per game; null before any game'),
  points_allowed_rank: z
    .string()
    .nullable()
    .describe('Rank in the league, e.g. "18th"; null before any game'),
  members: z.array(memberSchema).describe('Active roster, captain first'),
  games: z.array(teamGameSchema).describe('Regular season games, then playoff games'),
});

const gameTeamSchema = z.object({
  id: z.string().nullable().describe('Team id; null before the team is decided'),
  name: z.string().nullable().describe('Team name; null before the team is decided'),
  record: z.string().nullable().describe('Wins-losses-ties, e.g. "6-0-0"; null when not given'),
  score: z.number().nullable().describe('Final score; null before scores are reported'),
  sportsmanship: z
    .number()
    .nullable()
    .describe('Sportsmanship rating for the game; null before it is given'),
  rank: z.number().int().nullable().describe('Place in the standings; null before any game'),
  streak: z.string().nullable().describe('e.g. "Won 6"; null before any game'),
  points_for: z.number().nullable().describe('Points scored this season; null when not given'),
  points_against: z.number().nullable().describe('Points allowed this season; null when not given'),
});

export const gameSchema = z.object({
  id: z.string().describe('Game id'),
  type: gameType,
  status: z
    .enum(GAME_STATUSES)
    .describe(
      '"upcoming": not yet played; "final": scores are in; "awaiting_scores": played but not scored; "cancelled"',
    ),
  sport: z.string().describe('Sport name'),
  league_id: z.string().describe('League id'),
  league: z.string().describe('League name'),
  division: z.string().nullable().describe('Division name; null when not in a division'),
  starts: localDateTime('When the game starts'),
  ends: localDateTime('When the game is scheduled to end'),
  facility: z.string().nullable().describe('Facility, e.g. "Armory"; null when not set'),
  surface: z.string().nullable().describe('Court or field within the facility; null when not set'),
  address: z.string().nullable().describe("The facility's street address; null when not given"),
  latitude: z.number().nullable().describe('Facility latitude; null when not given'),
  longitude: z.number().nullable().describe('Facility longitude; null when not given'),
  home: gameTeamSchema.describe('The home team'),
  away: gameTeamSchema.describe('The away team'),
  periods: z
    .array(
      z.object({
        name: z.string().describe('Period name, e.g. "1st Half"'),
        home_score: z.number().nullable().describe("Home team's score; null before it is reported"),
        away_score: z.number().nullable().describe("Away team's score; null before it is reported"),
      }),
    )
    .describe('Score in each period, when the game reports them'),
});

export type MyTeam = z.infer<typeof myTeamSchema>;
export type League = z.infer<typeof leagueSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Game = z.infer<typeof gameSchema>;
