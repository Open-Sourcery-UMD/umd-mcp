import { format, parseISO } from 'date-fns';
import { decode, decodeOrNull } from '../../common.js';
import { htmlToTextOrNull } from '../../lib/html.js';
import { absoluteUrl } from '../../lib/scrape.js';
import { joinWords, trimmed } from '../../lib/text.js';
import {
  type Article,
  type CalendarDay,
  type Coach,
  GAME_STATUSES,
  GAME_TYPES,
  type Game,
  GENDERS,
  OUTCOMES,
  type Opponent,
  type Player,
  type PlayerSearchResult,
  type Roster,
  type Schedule,
  type Season,
  SITE,
  type Sport,
  type SportRef,
  type Story,
  type UpcomingEvent,
  VENUES,
} from './schemas.js';

export type RawSport = {
  id: number;
  title: string;
  shortName?: string | null;
  abbrev?: string | null;
  globalSportNameSlug?: string | null;
  globalSportGender?: string | null;
  nonSport?: boolean;
  rosterId?: number | null;
  scheduleId?: number | null;
  defaultLocation?: string | null;
  ticketsLink?: string | null;
  defaultStatsLink?: string | null;
  twitterName?: string | null;
  instagramName?: string | null;
};

type RawSportRef = { id?: number; title?: string } | null;

type RawLink = { url?: string | null } | null;

type RawOpponent = {
  id?: number | null;
  title?: string | null;
  prefix?: string | null;
  mascot?: string | null;
  location?: string | null;
  website?: string | null;
  image?: { fullpath?: string | null } | null;
} | null;

export type RawGame = {
  id: number;
  sport?: RawSportRef;
  /** Local (US Eastern) start, e.g. "2026-09-05T20:00:00"; every game the site serves has one. */
  date: string;
  dateUtc?: string | null;
  time?: string | null;
  tbd?: boolean;
  status?: string;
  gameStateDisplay?: string | null;
  type?: string | null;
  locationIndicator?: string;
  atVs?: string | null;
  location?: string | null;
  facility?: { title?: string | null } | null;
  conference?: boolean;
  opponent?: RawOpponent;
  tournament?: { title?: string | null } | null;
  media?: {
    tv?: string | null;
    radio?: string | null;
    video?: RawLink;
    audio?: RawLink;
    stats?: RawLink;
    tickets?: RawLink;
    preview?: RawLink;
  } | null;
  result?: {
    status?: string | null;
    teamScore?: string | null;
    opponentScore?: string | null;
    boxscore?: RawLink;
    recap?: RawLink;
  } | null;
  previewStoryId?: number | null;
  postStoryId?: number | null;
};

export type RawSchedule = {
  id: number;
  title: string;
  season?: { title?: string | null } | null;
  sport?: RawSportRef;
  conference?: { title?: string | null } | null;
  record?: {
    overall?: string | null;
    conference?: string | null;
    streak?: string | null;
    home?: string | null;
    away?: string | null;
    neutral?: string | null;
  } | null;
  games?: RawGame[];
};

export type RawSeason = { scheduleId: number; seasonTitle: string; isCurrent: boolean };

type RawImage = { absoluteUrl?: string | null; url?: string | null } | null;

type RawName = { firstName?: string | null; lastName?: string | null };

type RawPlayer = RawName & {
  rosterPlayerId: number;
  playerId?: number | null;
  jerseyNumber?: string | null;
  positionShort?: string | null;
  academicYearLong?: string | null;
  heightFeet?: number | null;
  heightInches?: number | null;
  weight?: number | null;
  hometown?: string | null;
  highSchool?: string | null;
  previousSchool?: string | null;
  major?: string | null;
  isCaptain?: boolean;
  image?: RawImage;
};

export type RawCoach = RawName & {
  id: number;
  isHeadCoach?: boolean;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  url?: string | null;
  image?: RawImage;
};

export type RawRoster = {
  id: number;
  displayTitle?: string | null;
  season?: { title?: string | null } | null;
  sport?: RawSportRef;
  players?: RawPlayer[];
  coaches?: RawCoach[];
};

export type RawPlayerHistory = RawName & {
  playerId: number;
  rosterPlayerId?: number | null;
  seasons?: string | null;
  sportName?: string | null;
  sportId?: number | null;
  image?: RawImage;
};

export type RawStory = {
  id: number;
  title: string;
  subHeadline?: string | null;
  teaser?: string | null;
  content?: string | null;
  byline?: string | null;
  date: string;
  sportDisplay?: string | null;
  sport?: RawSportRef;
  url?: string | null;
  primaryImage?: { fullUrl?: string | null } | null;
  links?: { linkText?: string | null; linkFullUrl?: string | null; linkUrl?: string | null }[];
};

export type RawPaged<T> = { items: T[]; total: number; pages: number };

export type RawCalendarDay = { date: string; events?: RawGame[] };

export type RawNextEvent = {
  id: number;
  sport?: RawSportRef;
  date: string;
  dateUtc?: string | null;
  time?: string | null;
  tbd?: boolean;
  locationIndicator?: string;
  location?: string | null;
  isConference?: boolean;
  opponent?: { title?: string | null; name?: string | null; prefix?: string | null } | null;
  media?: {
    tv?: string | null;
    radio?: string | null;
    video?: string | null;
    audio?: string | null;
    stats?: string | null;
  } | null;
};

function siteUrl(path: string | null | undefined): string | null {
  return absoluteUrl(path, SITE);
}

function linkUrl(raw: RawLink | undefined): string | null {
  return siteUrl(raw?.url);
}

function imageUrl(raw: RawImage | undefined): string | null {
  return trimmed(raw?.absoluteUrl) ?? siteUrl(raw?.url);
}

/** The site's local (US Eastern) date-time, e.g. "2026-09-05T20:00:00", as YYYY-MM-DD. */
function localDate(value: string): string {
  return format(parseISO(value), 'yyyy-MM-dd');
}

/** A win-loss record as the site prints it ("<span>2</span> - <span>2</span>"), as "2-2". */
function recordText(value: string | null | undefined): string | null {
  return htmlToTextOrNull(value)?.replace(/\s*-\s*/g, '-') ?? null;
}

/** A game's printed start time; null when the site flags it as TBA. */
function startTime(raw: { tbd?: boolean; time?: string | null }): string | null {
  return raw.tbd === true ? null : trimmed(raw.time);
}

function toSportRef(raw: RawSportRef | undefined): SportRef | null {
  return raw?.id === undefined ? null : { id: raw.id, title: raw.title ?? '' };
}

export function toSport(raw: RawSport): Sport {
  return {
    id: raw.id,
    title: raw.title,
    short_name: raw.shortName ?? '',
    abbreviation: trimmed(raw.abbrev),
    slug: raw.globalSportNameSlug ?? '',
    gender: decodeOrNull(GENDERS, trimmed(raw.globalSportGender)),
    schedule_id: raw.scheduleId ?? null,
    roster_id: raw.rosterId ?? null,
    default_location: trimmed(raw.defaultLocation),
    tickets_url: trimmed(raw.ticketsLink),
    stats_url: trimmed(raw.defaultStatsLink),
    twitter: trimmed(raw.twitterName),
    instagram: trimmed(raw.instagramName),
  };
}

function toOpponent(raw: RawOpponent | undefined): Opponent | null {
  if (raw == null) return null;
  return {
    id: raw.id ?? null,
    name: raw.title ?? '',
    prefix: trimmed(raw.prefix),
    mascot: trimmed(raw.mascot),
    location: trimmed(raw.location),
    website: trimmed(raw.website),
    logo_url: siteUrl(raw.image?.fullpath),
  };
}

export function toGame(raw: RawGame): Game {
  const media = raw.media ?? null;
  const result = raw.result ?? null;
  return {
    id: raw.id,
    sport: toSportRef(raw.sport),
    date: localDate(raw.date),
    time: startTime(raw),
    starts_at: trimmed(raw.dateUtc),
    status: decode(GAME_STATUSES, raw.status, 'game status'),
    state: trimmed(raw.gameStateDisplay),
    type: decode(GAME_TYPES, trimmed(raw.type), 'game type'),
    venue: decode(VENUES, raw.locationIndicator, 'location indicator'),
    at_or_vs: trimmed(raw.atVs),
    location: trimmed(raw.location),
    facility: trimmed(raw.facility?.title),
    conference_game: raw.conference === true,
    opponent: toOpponent(raw.opponent),
    tournament: trimmed(raw.tournament?.title),
    media: {
      tv: trimmed(media?.tv),
      radio: trimmed(media?.radio),
      video_url: linkUrl(media?.video),
      audio_url: linkUrl(media?.audio),
      stats_url: linkUrl(media?.stats),
      tickets_url: linkUrl(media?.tickets),
      preview_url: linkUrl(media?.preview),
    },
    result:
      result === null
        ? null
        : {
            outcome: result.status === 'N' ? null : decodeOrNull(OUTCOMES, result.status),
            team_score: trimmed(result.teamScore),
            opponent_score: trimmed(result.opponentScore),
            boxscore_url: linkUrl(result.boxscore),
            recap_url: linkUrl(result.recap),
          },
    preview_story_id: raw.previewStoryId ?? null,
    recap_story_id: raw.postStoryId ?? null,
  };
}

export function toSchedule(raw: RawSchedule): Schedule {
  const record = raw.record ?? null;
  return {
    id: raw.id,
    title: raw.title,
    season: trimmed(raw.season?.title),
    sport: toSportRef(raw.sport),
    conference: trimmed(raw.conference?.title),
    record: {
      overall: recordText(record?.overall),
      conference: recordText(record?.conference),
      streak: trimmed(record?.streak),
      home: recordText(record?.home),
      away: recordText(record?.away),
      neutral: recordText(record?.neutral),
    },
    games: (raw.games ?? []).map(toGame),
  };
}

export function toCalendarDay(raw: RawCalendarDay): CalendarDay {
  return { date: localDate(raw.date), games: (raw.events ?? []).map(toGame) };
}

export function toSeason(raw: RawSeason): Season {
  return { schedule_id: raw.scheduleId, season: raw.seasonTitle, current: raw.isCurrent };
}

function fullName(raw: RawName): string {
  return joinWords(raw.firstName, raw.lastName) ?? '';
}

function toPlayer(raw: RawPlayer): Player {
  return {
    roster_player_id: raw.rosterPlayerId,
    player_id: raw.playerId ?? null,
    name: fullName(raw),
    jersey_number: trimmed(raw.jerseyNumber),
    position: trimmed(raw.positionShort),
    academic_year: trimmed(raw.academicYearLong),
    height: raw.heightFeet == null ? null : `${raw.heightFeet}-${raw.heightInches ?? 0}`,
    weight: raw.weight ?? null,
    hometown: trimmed(raw.hometown),
    high_school: trimmed(raw.highSchool),
    previous_school: trimmed(raw.previousSchool),
    major: trimmed(raw.major),
    captain: raw.isCaptain === true,
    image_url: imageUrl(raw.image),
  };
}

export function toCoach(raw: RawCoach): Coach {
  return {
    id: raw.id,
    name: fullName(raw),
    title: trimmed(raw.title),
    head_coach: raw.isHeadCoach === true,
    email: trimmed(raw.email),
    phone: trimmed(raw.phone),
    url: siteUrl(raw.url),
    image_url: imageUrl(raw.image),
  };
}

export function toRoster(raw: RawRoster): Roster {
  return {
    id: raw.id,
    title: raw.displayTitle ?? '',
    season: trimmed(raw.season?.title),
    sport: toSportRef(raw.sport),
    players: (raw.players ?? []).map(toPlayer),
    coaches: (raw.coaches ?? []).map(toCoach),
  };
}

export function toPlayerSearchResult(raw: RawPlayerHistory): PlayerSearchResult {
  return {
    player_id: raw.playerId,
    roster_player_id: raw.rosterPlayerId ?? null,
    name: fullName(raw),
    seasons: trimmed(raw.seasons),
    sport: trimmed(raw.sportName),
    sport_id: raw.sportId ?? null,
    image_url: imageUrl(raw.image),
  };
}

export function toStory(raw: RawStory): Story {
  return {
    id: raw.id,
    title: raw.title,
    subheadline: trimmed(raw.subHeadline),
    teaser: htmlToTextOrNull(raw.teaser),
    date: raw.date,
    sport: trimmed(raw.sportDisplay),
    sport_id: raw.sport?.id ?? null,
    url: siteUrl(raw.url) ?? `${SITE}/news`,
    image_url: siteUrl(raw.primaryImage?.fullUrl),
  };
}

export function toArticle(raw: RawStory): Article {
  return {
    ...toStory(raw),
    content: htmlToTextOrNull(raw.content) ?? '',
    byline: trimmed(raw.byline),
    links: (raw.links ?? []).flatMap((entry) => {
      const url = siteUrl(entry.linkFullUrl) ?? siteUrl(entry.linkUrl);
      return url === null ? [] : [{ text: trimmed(entry.linkText) ?? url, url }];
    }),
  };
}

export function toUpcomingEvent(raw: RawNextEvent): UpcomingEvent {
  return {
    id: raw.id,
    sport: toSportRef(raw.sport),
    date: localDate(raw.date),
    time: startTime(raw),
    starts_at: trimmed(raw.dateUtc),
    venue: decode(VENUES, raw.locationIndicator, 'location indicator'),
    location: trimmed(raw.location),
    opponent: joinWords(raw.opponent?.prefix, raw.opponent?.title ?? raw.opponent?.name),
    conference_game: raw.isConference === true,
    tv: trimmed(raw.media?.tv),
    radio: trimmed(raw.media?.radio),
    video_url: trimmed(raw.media?.video),
    audio_url: trimmed(raw.media?.audio),
    stats_url: trimmed(raw.media?.stats),
  };
}
