import { z } from 'zod';
import { isoDate, limit } from '../../common.js';
import { Integration, tool } from '../base.js';
import {
  type RawCalendarDay,
  type RawCoach,
  type RawGame,
  type RawNextEvent,
  type RawPaged,
  type RawPlayerHistory,
  type RawRoster,
  type RawSchedule,
  type RawSeason,
  type RawSport,
  type RawStory,
  toArticle,
  toCalendarDay,
  toCoach,
  toGame,
  toPlayerSearchResult,
  toRoster,
  toSchedule,
  toSeason,
  toSport,
  toStory,
  toUpcomingEvent,
} from './mappers.js';
import {
  type Article,
  articleSchema,
  type CalendarDay,
  calendarDaySchema,
  type Coach,
  coachSchema,
  type Game,
  gameSchema,
  page,
  type PlayerSearchResult,
  playerSearchResultSchema,
  type Roster,
  rosterSchema,
  type Schedule,
  scheduleSchema,
  type Season,
  seasonSchema,
  type Sport,
  sportId,
  sportSchema,
  type Story,
  storySchema,
  type UpcomingEvent,
  upcomingEventSchema,
} from './schemas.js';

/** Players the site returns per page of a last-name search. */
const PAGE_SIZE = 100;

export class Athletics extends Integration {
  readonly name = 'athletics';
  readonly baseUrl = 'https://umterps.com/api/v2';

  @tool({
    title: 'List sports',
    description:
      'Every varsity sport at Maryland (the Terps, umterps.com) with the ids the other athletics tools take. No login needed.',
    input: {},
    output: { sports: z.array(sportSchema).describe('Varsity sports in site order') },
  })
  async list_sports(): Promise<{ sports: Sport[] }> {
    const sports = await this.get<RawSport[]>('Sports');
    return { sports: sports.filter((sport) => sport.nonSport !== true).map(toSport) };
  }

  @tool({
    title: 'List seasons',
    description:
      'Past and current seasons a sport has a schedule for, with the schedule id to pass to athletics_get_schedule for a past season. No login needed.',
    input: { sport_id: sportId },
    output: { seasons: z.array(seasonSchema).describe('Newest season first') },
  })
  async list_seasons({ sport_id }: { sport_id: number }): Promise<{ seasons: Season[] }> {
    const seasons = await this.get<RawSeason[]>('Schedule/pasts', {
      initialSportId: sport_id,
      endSportId: sport_id,
    });
    return { seasons: seasons.map(toSeason) };
  }

  @tool({
    title: 'Get schedule',
    description:
      "A Maryland team's schedule and results: every game with date, time, opponent, venue, TV/streaming, and the score once played, plus the team's record. Defaults to the current season; pass a schedule id from athletics_list_seasons for a past one. No login needed.",
    input: {
      sport_id: sportId,
      season_schedule_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Schedule id of a past season from athletics_list_seasons (default: current season)',
        ),
    },
    output: scheduleSchema.shape,
  })
  async get_schedule({
    sport_id,
    season_schedule_id,
  }: {
    sport_id: number;
    season_schedule_id?: number | undefined;
  }): Promise<Schedule> {
    const scheduleId = season_schedule_id ?? (await this.currentScheduleId(sport_id));
    return toSchedule(await this.get<RawSchedule>(`Schedule/${scheduleId}`));
  }

  /** The schedule id of a sport's current season. */
  private async currentScheduleId(sportId: number): Promise<number> {
    const sport = await this.get<RawSport>(`Sports/${sportId}`);
    if (sport.scheduleId == null) {
      throw new Error(`${this.name}: sport ${sportId} has no current schedule`);
    }
    return sport.scheduleId;
  }

  @tool({
    title: 'Get game',
    description:
      'One Maryland game by id (from athletics_get_schedule or athletics_get_calendar): opponent, venue, media links and result. No login needed.',
    input: { game_id: z.number().int().positive().describe('Game id') },
    output: gameSchema.shape,
  })
  async get_game({ game_id }: { game_id: number }): Promise<Game> {
    return toGame(await this.get<RawGame>(`ScheduleGames/${game_id}`));
  }

  @tool({
    title: 'Get roster',
    description:
      "A Maryland team's current roster: players with jersey number, position, class, height, weight, hometown and major, plus the coaching staff. No login needed.",
    input: { sport_id: sportId },
    output: rosterSchema.shape,
  })
  async get_roster({ sport_id }: { sport_id: number }): Promise<Roster> {
    const { items } = await this.get<RawPaged<RawRoster>>('Rosters', { sportId: sport_id });
    const roster = items[0];
    if (roster === undefined) throw new Error(`${this.name}: sport ${sport_id} has no roster`);
    return toRoster(roster);
  }

  @tool({
    title: 'Search players',
    description:
      'Find current and former Maryland athletes by last name, across all seasons on umterps.com, optionally within one sport. No login needed.',
    input: {
      last_name: z
        .string()
        .trim()
        .min(1)
        .describe('Start of the last name, e.g. "Lock" or just "L"'),
      sport_id: sportId.optional(),
      page,
    },
    output: {
      players: z.array(playerSearchResultSchema).describe('Matches in alphabetical order'),
      total: z.number().int().describe('Total matches, across all pages'),
      pages: z.number().int().describe('Number of pages of matches'),
    },
  })
  async search_players({
    last_name,
    sport_id,
    page: pageIndex,
  }: {
    last_name: string;
    sport_id?: number | undefined;
    page: number;
  }): Promise<{ players: PlayerSearchResult[]; total: number; pages: number }> {
    // The site only filters by the first letter, so every page for it is read and the
    // prefix is applied here before paging the matches.
    const prefix = last_name.toLowerCase();
    const matches: PlayerSearchResult[] = [];
    for (let index = 1, pages = 1; index <= pages; index++) {
      const result = await this.get<RawPaged<RawPlayerHistory>>('Players/history', {
        lastNameStart: prefix.charAt(0).toUpperCase(),
        sportId: sport_id,
        $pageIndex: index,
        $pageSize: PAGE_SIZE,
      });
      pages = result.pages;
      matches.push(
        ...result.items
          .filter((player) => (player.lastName ?? '').toLowerCase().startsWith(prefix))
          .map(toPlayerSearchResult),
      );
    }
    return {
      players: matches.slice((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE),
      total: matches.length,
      pages: Math.ceil(matches.length / PAGE_SIZE),
    };
  }

  @tool({
    title: 'Get coaches',
    description:
      "A Maryland team's coaching staff with titles, email, phone and bio page links. No login needed.",
    input: { sport_id: sportId },
    output: { coaches: z.array(coachSchema).describe('Head coach first') },
  })
  async get_coaches({ sport_id }: { sport_id: number }): Promise<{ coaches: Coach[] }> {
    const { items } = await this.get<{ items: RawCoach[] }>('Staff/coaches', {
      sportId: sport_id,
    });
    return { coaches: items.map(toCoach) };
  }

  @tool({
    title: 'Get news',
    description:
      'Latest Maryland Athletics news stories, newest first, optionally for one sport. Pass a story id to athletics_get_article for the full text. No login needed.',
    input: { sport_id: sportId.optional(), page, page_size: limit(10, 50) },
    output: {
      stories: z.array(storySchema).describe('Stories on the requested page, newest first'),
      total: z.number().int().describe('Total stories matching'),
      pages: z.number().int().describe('Number of pages at this page size'),
    },
  })
  async get_news({
    sport_id,
    page: pageIndex,
    page_size,
  }: {
    sport_id?: number | undefined;
    page: number;
    page_size: number;
  }): Promise<{ stories: Story[]; total: number; pages: number }> {
    const result = await this.get<RawPaged<RawStory>>('Stories', {
      sportId: sport_id,
      $pageIndex: pageIndex,
      $pageSize: page_size,
    });
    return { stories: result.items.map(toStory), total: result.total, pages: result.pages };
  }

  @tool({
    title: 'Get article',
    description:
      'The full text of a Maryland Athletics news story (game recaps, previews, announcements) by story id. No login needed.',
    input: {
      story_id: z.number().int().positive().describe('Story id from athletics_get_news or a game'),
    },
    output: articleSchema.shape,
  })
  async get_article({ story_id }: { story_id: number }): Promise<Article> {
    return toArticle(await this.get<RawStory>(`Stories/${story_id}`));
  }

  @tool({
    title: 'Get calendar',
    description:
      'Every Maryland game or event in a date range across all sports (or one sport), grouped by day, with opponents, venues, media links and results. No login needed.',
    input: {
      from: isoDate.describe('First day of the range'),
      to: isoDate.describe('Last day of the range'),
      sport_id: sportId.optional(),
    },
    output: { days: z.array(calendarDaySchema).describe('Days with at least one event') },
  })
  async get_calendar({
    from,
    to,
    sport_id,
  }: {
    from: string;
    to: string;
    sport_id?: number | undefined;
  }): Promise<{ days: CalendarDay[] }> {
    const days = await this.get<RawCalendarDay[]>(`Calendar/from/${from}/to/${to}`, {
      sportId: sport_id,
    });
    return { days: days.map(toCalendarDay) };
  }

  @tool({
    title: 'Get upcoming events',
    description:
      "A Maryland team's next few games with date, time, opponent, venue and where to watch. No login needed.",
    input: { sport_id: sportId, limit: limit(5, 20) },
    output: { events: z.array(upcomingEventSchema).describe('Soonest first') },
  })
  async get_upcoming_events({
    sport_id,
    limit: pageSize,
  }: {
    sport_id: number;
    limit: number;
  }): Promise<{ events: UpcomingEvent[] }> {
    const { items } = await this.get<{ items: { games?: RawNextEvent[] }[] }>('NextEvents', {
      upcoming: true,
      sportId: sport_id,
      $pageIndex: 1,
      $pageSize: pageSize,
    });
    return { events: items.flatMap((item) => item.games ?? []).map(toUpcomingEvent) };
  }

  @tool({
    title: 'Get live scores',
    description:
      'Maryland games in progress right now with their live scores, as the site reports them; empty when nothing is being played. No login needed.',
    input: {},
    output: {
      games: z
        .array(z.unknown())
        .describe("Live games exactly as the site's LiveStats feed returns them; empty when none"),
    },
  })
  async get_live_scores(): Promise<{ games: unknown[] }> {
    const live = await this.get<unknown[] | { Games?: unknown[] }>('LiveStats');
    return { games: Array.isArray(live) ? live : (live.Games ?? []) };
  }
}
