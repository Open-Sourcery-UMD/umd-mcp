import { z } from 'zod';
import { isoDate } from '../../common.js';

export const SITE = 'https://umterps.com';

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

/** Where a game is played, keyed by the site's location indicator. */
export const VENUES = { H: 'home', A: 'away', N: 'neutral' } as const;

type Venue = (typeof VENUES)[keyof typeof VENUES];

const venue = z.enum(Object.values(VENUES) as Venue[]);

/** Whether a game has been played, keyed by the site's status code. */
export const GAME_STATUSES = { A: 'upcoming', O: 'played' } as const;

type GameStatus = (typeof GAME_STATUSES)[keyof typeof GAME_STATUSES];

const gameStatus = z.enum(Object.values(GAME_STATUSES) as GameStatus[]);

/** Outcomes keyed by the site's result code; "N" (no result recorded) is mapped to null. */
export const OUTCOMES = { W: 'win', L: 'loss', T: 'tie' } as const;

type Outcome = (typeof OUTCOMES)[keyof typeof OUTCOMES];

const outcome = z.enum(Object.values(OUTCOMES) as Outcome[]);

/** Game types the site documents; the live calendar also returns undocumented codes ("X"). */
export const GAME_TYPES: Record<string, string> = {
  R: 'regular_season',
  E: 'exhibition',
  P: 'postseason',
};

/** Who competes, keyed by the site's gender code. */
export const GENDERS = { m: 'men', f: 'women', g: 'mixed' } as const;

type Gender = (typeof GENDERS)[keyof typeof GENDERS];

const gender = z
  .enum(Object.values(GENDERS) as Gender[])
  .nullable()
  .describe('Who competes; null for programs without a gender (e.g. cheer)');

const link = z.string().nullable();

export const sportSchema = z.object({
  id: z.number().int().describe('Sport id to pass to the other tools'),
  title: z.string().describe('e.g. "Men\'s Basketball"'),
  short_name: z.string().describe('Site short name, e.g. "mbball"'),
  abbreviation: z.string().nullable().describe('e.g. "MBB"'),
  slug: z.string().describe('URL slug, e.g. "mens-basketball"; pages live at /sports/{slug}'),
  gender,
  schedule_id: z.number().int().nullable().describe('Current season schedule id'),
  roster_id: z.number().int().nullable().describe('Current season roster id'),
  default_location: z.string().nullable().describe('Home venue, e.g. "SECU Stadium"'),
  tickets_url: link,
  stats_url: link,
  twitter: z.string().nullable(),
  instagram: z.string().nullable(),
});

export const sportRefSchema = z.object({
  id: z.number().int(),
  title: z.string(),
});

export const opponentSchema = z.object({
  id: z.number().int().nullable(),
  name: z.string().describe('Opponent name, e.g. "Hampton"'),
  prefix: z.string().nullable().describe('Ranking prefix shown before the name, e.g. "#2"'),
  mascot: z.string().nullable(),
  location: z.string().nullable().describe('Opponent hometown, e.g. "Hampton, VA"'),
  website: link,
  logo_url: link,
});

export const gameMediaSchema = z.object({
  tv: z.string().nullable().describe('TV network, e.g. "BTN"'),
  radio: z.string().nullable(),
  video_url: link.describe('Where to watch'),
  audio_url: link.describe('Where to listen'),
  stats_url: link.describe('Live stats'),
  tickets_url: link,
  preview_url: link.describe('Preview story'),
});

export const gameResultSchema = z
  .object({
    outcome: outcome.nullable().describe('null when no result was recorded'),
    team_score: z.string().nullable().describe('Maryland score as printed'),
    opponent_score: z.string().nullable(),
    boxscore_url: link,
    recap_url: link.describe('Recap story'),
  })
  .nullable()
  .describe('null until the game has been played');

export const gameSchema = z.object({
  id: z.number().int().describe('Game id to pass to athletics_get_game'),
  sport: sportRefSchema.nullable(),
  date: isoDate.describe('Game date in US Eastern time'),
  time: z.string().nullable().describe('Start time as printed, e.g. "8 PM"; null when TBA'),
  starts_at: z.string().nullable().describe('Start as an ISO 8601 UTC timestamp'),
  status: gameStatus,
  state: z.string().nullable().describe('Site game state, e.g. "SCHEDULED", "GAMECOMPLETE"'),
  type: z.string().describe('"regular_season", "exhibition", "postseason" or the site\'s own code'),
  venue,
  at_or_vs: z.string().nullable().describe('"at" or "vs"'),
  location: z.string().nullable().describe('City, e.g. "College Park, MD"'),
  facility: z.string().nullable().describe('Venue name, e.g. "SECU Stadium"'),
  conference_game: z.boolean(),
  opponent: opponentSchema.nullable(),
  tournament: z.string().nullable().describe('Tournament name when part of one'),
  media: gameMediaSchema,
  result: gameResultSchema,
  preview_story_id: z.number().int().nullable().describe('Pass to athletics_get_article'),
  recap_story_id: z.number().int().nullable().describe('Pass to athletics_get_article'),
});

export const teamRecordSchema = z.object({
  overall: z.string().nullable().describe('e.g. "2-2"'),
  conference: z.string().nullable(),
  streak: z.string().nullable().describe('e.g. "W3", "L2"'),
  home: z.string().nullable(),
  away: z.string().nullable(),
  neutral: z.string().nullable(),
});

export const scheduleSchema = z.object({
  id: z.number().int().describe('Schedule id'),
  title: z.string().describe('e.g. "2026 Football Schedule"'),
  season: z.string().nullable().describe('e.g. "2026" or "2025-26"'),
  sport: sportRefSchema.nullable(),
  conference: z.string().nullable().describe('e.g. "Big Ten"'),
  record: teamRecordSchema,
  games: z.array(gameSchema).describe('Games in date order'),
});

export const seasonSchema = z.object({
  schedule_id: z.number().int().describe('Pass as `season_schedule_id` to athletics_get_schedule'),
  season: z.string().describe('e.g. "2025"'),
  current: z.boolean(),
});

export const playerSchema = z.object({
  roster_player_id: z.number().int().describe('Id of this player on this roster'),
  player_id: z.number().int().nullable().describe('Id of the person across seasons'),
  name: z.string(),
  jersey_number: z.string().nullable(),
  position: z.string().nullable().describe('Short position, e.g. "LB"'),
  academic_year: z.string().nullable().describe('e.g. "Freshman"'),
  height: z.string().nullable().describe('e.g. "6-4"'),
  weight: z.number().nullable().describe('Pounds'),
  hometown: z.string().nullable(),
  high_school: z.string().nullable(),
  previous_school: z.string().nullable(),
  major: z.string().nullable(),
  captain: z.boolean(),
  image_url: link,
});

export const coachSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  title: z.string().nullable().describe('e.g. "Head Coach"'),
  head_coach: z.boolean(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  url: link.describe('Bio page'),
  image_url: link,
});

export const rosterSchema = z.object({
  id: z.number().int(),
  title: z.string().describe('e.g. "2026 Football Roster"'),
  season: z.string().nullable(),
  sport: sportRefSchema.nullable(),
  players: z.array(playerSchema),
  coaches: z.array(coachSchema),
});

export const playerSearchResultSchema = z.object({
  player_id: z.number().int(),
  roster_player_id: z.number().int().nullable().describe('Most recent roster entry'),
  name: z.string(),
  seasons: z.string().nullable().describe('Seasons played, e.g. "2023, 2024"'),
  sport: z.string().nullable(),
  sport_id: z.number().int().nullable(),
  image_url: link,
});

export const storySchema = z.object({
  id: z.number().int().describe('Story id to pass to athletics_get_article'),
  title: z.string(),
  subheadline: z.string().nullable(),
  teaser: z.string().nullable().describe('Plain-text teaser'),
  date: z.string().describe('Published, ISO 8601 in US Eastern time'),
  sport: z.string().nullable().describe('e.g. "Football"'),
  sport_id: z.number().int().nullable(),
  url: z.string().describe('Story page'),
  image_url: link,
});

export const articleSchema = storySchema.extend({
  content: z.string().describe('Story body as plain text'),
  byline: z.string().nullable(),
  links: z
    .array(z.object({ text: z.string().nullable(), url: z.string() }))
    .describe('Related links the story carries'),
});

export const calendarDaySchema = z.object({
  date: isoDate,
  games: z.array(gameSchema),
});

export const upcomingEventSchema = z.object({
  id: z.number().int().describe('Game id to pass to athletics_get_game'),
  sport: sportRefSchema.nullable(),
  date: isoDate,
  time: z.string().nullable(),
  starts_at: z.string().nullable().describe('ISO 8601 UTC timestamp'),
  venue,
  location: z.string().nullable(),
  opponent: z.string().nullable().describe('Opponent as displayed, e.g. "#2 Indiana"'),
  conference_game: z.boolean(),
  tv: z.string().nullable(),
  video_url: link,
  stats_url: link,
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
