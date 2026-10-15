import * as cheerio from 'cheerio';
import { zipObject } from 'lodash-es';
import { decode, type Link } from '../../../common.js';
import { htmlToTextOrNull } from '../../../lib/html.js';
import { absoluteUrl, links } from '../../../lib/scrape.js';
import { trimmed } from '../../../lib/text.js';
import { type Handbook, HANDBOOK_TYPES, type Standings, type TeamStanding } from './schemas.js';
import { SITE } from '../common.js';

type RawTeamStanding = {
  teamInfo: { id: string; text: string; icon?: string | null };
  standValueList: string[];
};

export type RawStandings = {
  standingVM: {
    leagueId: string;
    sportId: string;
    columNameList: { id: string; name: string }[];
    leagueStandings: RawTeamStanding[];
    divisionStandings: {
      divisionId: string;
      divisionName: string;
      teamsStandings: RawTeamStanding[];
    }[];
    sportStandings?: string[] | null;
  };
};

export type RawHandbook = {
  id: string;
  name: string;
  description?: string | null;
  handbookType: string;
  inputText?: string | null;
  url?: string | null;
  viewLink?: { link?: string | null } | null;
};

export type RawHandbooks = {
  handbooksLists: { handbooks: RawHandbook[]; listType: number }[];
};

function toTeamStanding(raw: RawTeamStanding, columns: string[]): TeamStanding {
  return {
    id: raw.teamInfo.id,
    name: raw.teamInfo.text,
    logo_url: absoluteUrl(raw.teamInfo.icon, SITE),
    stats: zipObject(columns, raw.standValueList),
  };
}

export function toStandings({ standingVM: raw }: RawStandings): Standings {
  const columns = raw.columNameList.map((column) => column.id);
  return {
    league_id: raw.leagueId,
    sport_id: raw.sportId,
    tiebreakers: raw.sportStandings ?? [],
    teams: raw.leagueStandings.map((team) => toTeamStanding(team, columns)),
    divisions: raw.divisionStandings.map((division) => ({
      id: division.divisionId,
      name: division.divisionName,
      teams: division.teamsStandings.map((team) => toTeamStanding(team, columns)),
    })),
  };
}

/** Links inside a handbook body, hrefs resolved against the site. */
function bodyLinks(html: string | null | undefined): Link[] {
  if (html == null) return [];
  const $ = cheerio.load(html);
  return links($, $('body'), SITE);
}

export function toHandbook(raw: RawHandbook): Handbook {
  return {
    id: raw.id,
    name: raw.name,
    description: trimmed(raw.description),
    type: decode(HANDBOOK_TYPES, raw.handbookType, 'handbook type'),
    text: htmlToTextOrNull(raw.inputText),
    links: bodyLinks(raw.inputText),
    url: absoluteUrl(trimmed(raw.url) ?? raw.viewLink?.link, SITE),
  };
}
