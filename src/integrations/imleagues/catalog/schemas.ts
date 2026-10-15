import { z } from 'zod';
import { isoDate, linkSchema, localDateTime } from '../../../common.js';
import { entityId } from '../common.js';

/** Where a league's sign-up stands, keyed by the label the site prints. */
export const LEAGUE_STATUSES = {
  Upcoming: 'upcoming',
  Open: 'open',
  Waitlist: 'waitlist',
  Additions: 'additions',
  Closed: 'closed',
} as const;

type LeagueStatus = (typeof LEAGUE_STATUSES)[keyof typeof LEAGUE_STATUSES];

const leagueStatus = z
  .enum(Object.values(LEAGUE_STATUSES) as LeagueStatus[])
  .describe(
    '"upcoming": registration has not opened; "open": new teams can register; "waitlist": new teams go on a waitlist; "additions": registration is over but players can still join existing teams; "closed": no more sign-ups',
  );

/** How a handbook is published, keyed by the site's handbook type code. */
export const HANDBOOK_TYPES = { '0': 'file', '1': 'text' } as const;

type HandbookType = (typeof HANDBOOK_TYPES)[keyof typeof HANDBOOK_TYPES];

const handbookType = z
  .enum(Object.values(HANDBOOK_TYPES) as HandbookType[])
  .describe('"file": an uploaded document at `url`; "text": written out in `text`');

export const sportId = entityId.describe(
  'Sport id from imleagues_list_leagues, e.g. "9ac3cdabab2b46feb415a1885a8e3b23"',
);

export const leagueSchema = z.object({
  id: z.string().describe('League id to pass to imleagues_get_standings'),
  name: z.string().describe('League name, e.g. "Men\'s A", "Mixed Gender B", "Open Doubles"'),
  status: leagueStatus,
  registration_opens: localDateTime(
    'When team registration opens; null once it has opened',
  ).nullable(),
  registration_closes: localDateTime(
    'When team registration closes; null when not listed',
  ).nullable(),
  join_teams_until: localDateTime(
    'Last moment players can join an existing team; null when not listed',
  ).nullable(),
  season_start: isoDate.nullable().describe('First day of play; null when not listed'),
  season_end: isoDate.nullable().describe('Last day of play; null when not listed'),
});

export const sportSchema = z.object({
  id: z.string().describe('Sport id to pass to imleagues_list_handbooks'),
  name: z.string().describe('Sport name, e.g. "7v7 Flag Football", "Pickleball"'),
  logo_url: z.string().nullable().describe('Sport icon; null when none'),
  leagues: z.array(leagueSchema).describe('Leagues in site order'),
});

export const termSchema = z.object({
  name: z.string().describe('Term name, e.g. "Fall 2026"'),
  sports: z.array(sportSchema).describe('Sports with leagues this term, in site order'),
});

export const teamStandingSchema = z.object({
  id: z.string().describe('Team id to pass to imleagues_member_get_team'),
  name: z.string().describe('Team name'),
  logo_url: z.string().nullable().describe('Team logo; null when none'),
  stats: z
    .record(z.string(), z.string())
    .describe(
      'Standings columns as printed, keyed by name, e.g. "Wins": "6", "Forfeits/Defaults": "0/2", "Winning %": ".920", "Streak": "Won 6"',
    ),
});

export const divisionStandingsSchema = z.object({
  id: z.string().describe('IMLeagues division id'),
  name: z.string().describe('Usually the night and time slot, e.g. "2FA Mon 9:00PM"'),
  teams: z.array(teamStandingSchema).describe('Teams in standings order'),
});

export const standingsSchema = z.object({
  league_id: z.string().describe('League id'),
  sport_id: z.string().describe('Sport id to pass to imleagues_list_handbooks'),
  tiebreakers: z
    .array(z.string())
    .describe('How tied teams are ordered, in priority order, e.g. "Winning %", "Head to Head"'),
  teams: z
    .array(teamStandingSchema)
    .describe('Every team in the league in standings order, including teams without a division'),
  divisions: z.array(divisionStandingsSchema).describe('Standings within each division'),
});

export const handbookSchema = z.object({
  id: z.string().describe('IMLeagues handbook id'),
  name: z.string().describe('Handbook title, e.g. "Participant Handbook 2025-26"'),
  description: z.string().nullable().describe('Short description; null when none'),
  type: handbookType,
  text: z.string().nullable().describe('Handbook body as plain text; null for an uploaded file'),
  links: z.array(linkSchema).describe('Links in the handbook body, e.g. to a shared document'),
  url: z.string().nullable().describe('The uploaded document; null for a written handbook'),
});

export type League = z.infer<typeof leagueSchema>;
export type Sport = z.infer<typeof sportSchema>;
export type Term = z.infer<typeof termSchema>;
export type TeamStanding = z.infer<typeof teamStandingSchema>;
export type Standings = z.infer<typeof standingsSchema>;
export type Handbook = z.infer<typeof handbookSchema>;
