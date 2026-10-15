import { z } from 'zod';
import { isoDate, linkSchema } from '../../common.js';

export const SITE = 'https://umterps.com';

/** Where a game is played, keyed by the site's location indicator. */
export const VENUES = { H: 'home', A: 'away', N: 'neutral' } as const;

type Venue = (typeof VENUES)[keyof typeof VENUES];

const venue = z.enum(Object.values(VENUES) as Venue[]).describe('Home, away or neutral site');

/** Whether a game has been played, keyed by the site's status code. */
export const GAME_STATUSES = { A: 'upcoming', O: 'played' } as const;

type GameStatus = (typeof GAME_STATUSES)[keyof typeof GAME_STATUSES];

const gameStatus = z.enum(Object.values(GAME_STATUSES) as GameStatus[]);

/** Outcomes keyed by the site's result code; "N" (no result recorded) is mapped to null. */
export const OUTCOMES = { W: 'win', L: 'loss', T: 'tie' } as const;

export type Outcome = (typeof OUTCOMES)[keyof typeof OUTCOMES];

const outcome = z.enum(Object.values(OUTCOMES) as Outcome[]);

/**
 * What kind of contest a game is, keyed by the site's type code. "S" is how the live schedules
 * flag exhibitions ("Georgetown (EXH.)"); "X" is what invitationals and other multi-team events
 * carry.
 */
export const GAME_TYPES = {
  R: 'regular_season',
  E: 'exhibition',
  S: 'scrimmage',
  P: 'postseason',
  X: 'other',
} as const;

type GameType = (typeof GAME_TYPES)[keyof typeof GAME_TYPES];

const gameType = z.enum(Object.values(GAME_TYPES) as GameType[]);

/** Who competes, keyed by the site's gender code. */
export const GENDERS = { m: 'men', f: 'women', g: 'mixed' } as const;

type Gender = (typeof GENDERS)[keyof typeof GENDERS];

const gender = z
  .enum(Object.values(GENDERS) as Gender[])
  .nullable()
  .describe('Who competes; null for programs without a gender (e.g. cheer)');

export const sportId = z
  .number()
  .int()
  .positive()
  .describe('Sport id from athletics_list_sports, e.g. 3 for Football');

export const page = z
  .number()
  .int()
  .min(1)
  .default(1)
  .describe('Page number, starting at 1 (default 1)');

const link = (what: string) => z.string().nullable().describe(`${what}; null when none`);

export const sportSchema = z.object({
  id: z.number().int().describe('Sport id to pass to the other tools'),
  title: z.string().describe('e.g. "Men\'s Basketball"'),
  short_name: z.string().describe('Site short name, e.g. "mbball"'),
  abbreviation: z.string().nullable().describe('e.g. "MBB"; null when none'),
  slug: z.string().describe('URL slug, e.g. "mens-basketball"; pages live at /sports/{slug}'),
  gender,
  schedule_id: z
    .number()
    .int()
    .nullable()
    .describe('Current season schedule id; null when the sport has no schedule'),
  roster_id: z
    .number()
    .int()
    .nullable()
    .describe('Current season roster id; null when the sport has no roster'),
  default_location: z
    .string()
    .nullable()
    .describe('Home venue, e.g. "SECU Stadium"; null when not set'),
  tickets_url: link('Tickets page'),
  stats_url: link('Season stats page'),
  twitter: z.string().nullable().describe('X/Twitter handle; null when none'),
  instagram: z.string().nullable().describe('Instagram handle; null when none'),
});

export const sportRefSchema = z.object({
  id: z.number().int().describe('Sport id'),
  title: z.string().describe('e.g. "Football"'),
});

export const opponentSchema = z.object({
  id: z.number().int().nullable().describe('Opponent id; null when not set'),
  name: z.string().describe('Opponent name, e.g. "Hampton"'),
  prefix: z
    .string()
    .nullable()
    .describe('Ranking prefix shown before the name, e.g. "#2"; null when unranked'),
  mascot: z.string().nullable().describe('e.g. "Pirates"; null when not set'),
  location: z
    .string()
    .nullable()
    .describe('Opponent hometown, e.g. "Hampton, VA"; null when not set'),
  website: link('Opponent website'),
  logo_url: link('Opponent logo'),
});

export const gameMediaSchema = z.object({
  tv: z.string().nullable().describe('TV network, e.g. "BTN"; null when not televised'),
  radio: z.string().nullable().describe('Radio network; null when not broadcast'),
  video_url: link('Where to watch'),
  audio_url: link('Where to listen'),
  stats_url: link('Live stats'),
  tickets_url: link('Tickets page'),
  preview_url: link('Preview story'),
});

export const gameResultSchema = z
  .object({
    outcome: outcome.nullable().describe('null when no result was recorded'),
    team_score: z.string().nullable().describe('Maryland score as printed; null when not kept'),
    opponent_score: z.string().nullable().describe('Opponent score as printed; null when not kept'),
    boxscore_url: link('Box score'),
    recap_url: link('Recap story'),
  })
  .nullable()
  .describe('null until the game has been played');

export const gameSchema = z.object({
  id: z.number().int().describe('Game id to pass to athletics_get_game'),
  sport: sportRefSchema.nullable().describe('null when the game carries no sport'),
  date: isoDate.describe('Game date in US Eastern time'),
  time: z.string().nullable().describe('Start time as printed, e.g. "8 PM"; null when TBA'),
  starts_at: z
    .string()
    .nullable()
    .describe('Start as an ISO 8601 UTC timestamp; null when not set'),
  status: gameStatus.describe('Whether the game has been played'),
  state: z
    .string()
    .nullable()
    .describe('Site game state, e.g. "SCHEDULED", "GAMECOMPLETE"; null when not set'),
  type: gameType.describe(
    '"scrimmage" covers exhibitions; "other" covers invitationals and multi-team events',
  ),
  venue,
  at_or_vs: z.string().nullable().describe('"at" or "vs"; null when not set'),
  location: z.string().nullable().describe('City, e.g. "College Park, MD"; null when not set'),
  facility: z.string().nullable().describe('Venue name, e.g. "SECU Stadium"; null when not set'),
  conference_game: z.boolean().describe('true for a conference game'),
  opponent: opponentSchema.nullable().describe('null for events without one opponent'),
  tournament: z.string().nullable().describe('Tournament name; null when not part of one'),
  media: gameMediaSchema,
  result: gameResultSchema,
  preview_story_id: z
    .number()
    .int()
    .nullable()
    .describe('Preview story id for athletics_get_article; null when none'),
  recap_story_id: z
    .number()
    .int()
    .nullable()
    .describe('Recap story id for athletics_get_article; null when none'),
});

const record = z.string().nullable().describe('Wins-losses, e.g. "2-2"; null when not kept');

export const teamRecordSchema = z.object({
  overall: record,
  conference: record,
  streak: z.string().nullable().describe('e.g. "W3", "L2"; null when not kept'),
  home: record,
  away: record,
  neutral: record,
});

export const scheduleSchema = z.object({
  id: z.number().int().describe('Schedule id'),
  title: z.string().describe('e.g. "2026 Football Schedule"'),
  season: z.string().nullable().describe('e.g. "2026" or "2025-26"; null when not set'),
  sport: sportRefSchema.nullable().describe('null when the schedule carries no sport'),
  conference: z.string().nullable().describe('e.g. "Big Ten"; null when not set'),
  record: teamRecordSchema.describe("The team's record this season"),
  games: z.array(gameSchema).describe('Games in date order'),
});

export const seasonSchema = z.object({
  schedule_id: z.number().int().describe('Pass as `season_schedule_id` to athletics_get_schedule'),
  season: z.string().describe('e.g. "2025"'),
  current: z.boolean().describe('true for the current season'),
});

export const playerSchema = z.object({
  roster_player_id: z.number().int().describe('Id of this player on this roster'),
  player_id: z
    .number()
    .int()
    .nullable()
    .describe('Id of the person across seasons; null when not set'),
  name: z.string().describe('Full name'),
  jersey_number: z.string().nullable().describe('e.g. "7"; null when not set'),
  position: z.string().nullable().describe('Short position, e.g. "LB"; null when not set'),
  academic_year: z.string().nullable().describe('e.g. "Freshman"; null when not set'),
  height: z.string().nullable().describe('Feet-inches, e.g. "6-4"; null when not set'),
  weight: z.number().nullable().describe('Pounds; null when not set'),
  hometown: z.string().nullable().describe('e.g. "Baltimore, Md."; null when not set'),
  high_school: z.string().nullable().describe('null when not set'),
  previous_school: z.string().nullable().describe('School transferred from; null when none'),
  major: z.string().nullable().describe('null when not set'),
  captain: z.boolean().describe('true for a team captain'),
  image_url: link('Headshot'),
});

export const coachSchema = z.object({
  id: z.number().int().describe('Coach id'),
  name: z.string().describe('Full name'),
  title: z.string().nullable().describe('e.g. "Head Coach"; null when not set'),
  head_coach: z.boolean().describe('true for the head coach'),
  email: z.string().nullable().describe('Work email; null when not published'),
  phone: z.string().nullable().describe('Work phone; null when not published'),
  url: link('Bio page'),
  image_url: link('Headshot'),
});

export const rosterSchema = z.object({
  id: z.number().int().describe('Roster id'),
  title: z.string().describe('e.g. "2026 Football Roster"'),
  season: z.string().nullable().describe('e.g. "2026"; null when not set'),
  sport: sportRefSchema.nullable().describe('null when the roster carries no sport'),
  players: z.array(playerSchema).describe('Players in the order the site lists them'),
  coaches: z.array(coachSchema).describe('Coaching staff in the order the site lists them'),
});

export const playerSearchResultSchema = z.object({
  player_id: z.number().int().describe('Id of the person across seasons'),
  roster_player_id: z
    .number()
    .int()
    .nullable()
    .describe('Most recent roster entry; null when not set'),
  name: z.string().describe('Full name'),
  seasons: z.string().nullable().describe('Seasons played, e.g. "2023, 2024"; null when not set'),
  sport: z.string().nullable().describe('e.g. "Football"; null when not set'),
  sport_id: z.number().int().nullable().describe('Sport id; null when not set'),
  image_url: link('Headshot'),
});

export const storySchema = z.object({
  id: z.number().int().describe('Story id to pass to athletics_get_article'),
  title: z.string().describe('Headline'),
  subheadline: z.string().nullable().describe('null when none'),
  teaser: z.string().nullable().describe('Plain-text teaser; null when none'),
  date: z.string().describe('Published, ISO 8601 in US Eastern time'),
  sport: z.string().nullable().describe('e.g. "Football"; null for general news'),
  sport_id: z.number().int().nullable().describe('Sport id; null for general news'),
  url: z.string().describe('Story page'),
  image_url: link('Lead image'),
});

export const articleSchema = storySchema.extend({
  content: z.string().describe('Story body as plain text'),
  byline: z.string().nullable().describe('Author credit; null when none'),
  links: z
    .array(linkSchema)
    .describe('Related links the story carries; the URL stands in for missing text'),
});

export const calendarDaySchema = z.object({
  date: isoDate,
  games: z.array(gameSchema).describe('Games and events that day'),
});

export const upcomingEventSchema = z.object({
  id: z.number().int().describe('Game id to pass to athletics_get_game'),
  sport: sportRefSchema.nullable().describe('null when the game carries no sport'),
  date: isoDate.describe('Game date in US Eastern time'),
  time: z.string().nullable().describe('Start time as printed, e.g. "8 PM"; null when TBA'),
  starts_at: z
    .string()
    .nullable()
    .describe('Start as an ISO 8601 UTC timestamp; null when not set'),
  venue,
  location: z.string().nullable().describe('City, e.g. "College Park, MD"; null when not set'),
  opponent: z
    .string()
    .nullable()
    .describe('Opponent with any ranking prefix, e.g. "#2 Indiana"; null when there is none'),
  conference_game: z.boolean().describe('true for a conference game'),
  tv: z.string().nullable().describe('TV network, e.g. "BTN"; null when not televised'),
  radio: z.string().nullable().describe('Radio network; null when not broadcast'),
  video_url: link('Where to watch'),
  audio_url: link('Where to listen'),
  stats_url: link('Live stats'),
});

export type Sport = z.infer<typeof sportSchema>;
export type SportRef = z.infer<typeof sportRefSchema>;
export type Opponent = z.infer<typeof opponentSchema>;
export type Game = z.infer<typeof gameSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type Season = z.infer<typeof seasonSchema>;
export type Player = z.infer<typeof playerSchema>;
export type Coach = z.infer<typeof coachSchema>;
export type Roster = z.infer<typeof rosterSchema>;
export type PlayerSearchResult = z.infer<typeof playerSearchResultSchema>;
export type Story = z.infer<typeof storySchema>;
export type Article = z.infer<typeof articleSchema>;
export type CalendarDay = z.infer<typeof calendarDaySchema>;
export type UpcomingEvent = z.infer<typeof upcomingEventSchema>;
