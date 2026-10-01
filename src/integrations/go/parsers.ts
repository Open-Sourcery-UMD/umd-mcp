import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { format, isValid, parse } from 'date-fns';
import { startCase } from 'lodash-es';
import { type Selection, text, textOrNull } from '../../lib/scrape.js';
import { numeric, trimmed } from '../../lib/text.js';
import {
  type Collection,
  type Link,
  type LinkStats,
  type Member,
  SITE,
  type TransferRequest,
  type TransferRequests,
  type User,
} from './schemas.js';

/** A page of a server-side DataTable, e.g. `urls/datatable.json`. */
export type RawDataTable<T> = {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: T[];
};

/** A row of the "My Links" table; the cells hold the HTML the page renders into them. */
export type RawLinkRow = {
  group_id: number;
  /** A `<select>` of the user's collections with the link's one selected. */
  group_name: string;
  /** The destination as a link. */
  url: string;
  /** The short link, the destination and any note. */
  keyword: string;
  /** The click count as a link to the stats page. */
  total_clicks: string;
  /** `MM/DD/YYYY`. */
  created_at: string;
  actions: string;
  DT_RowData_keyword: string;
  DT_RowData_url: string;
  /** `url-<id>`. */
  DT_RowId: string;
};

/** A collection as `POST groups` and `PATCH groups/:id` return it. */
export type RawGroup = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

/** A member as `POST groups/:id/members` returns them. */
export type RawMember = {
  id: number;
  uid: string;
  display_name: string;
  internet_id: string;
  email: string | null;
  admin: boolean | null;
};

/** A hit of `lookup_users`. */
export type RawUser = {
  umndid: string;
  display: string;
  internet_id: string;
  display_name: string;
};

/** The name the site gives a user's personal space, which is a collection without a name. */
const NO_COLLECTION = 'No Collection';

/** Converts a printed date ("03/01/2026" by default) into "2026-03-01". */
function parseDate(value: string, pattern = 'MM/dd/yyyy'): string {
  const date = parse(value.trim(), pattern, new Date(0));
  if (!isValid(date)) throw new Error(`go: unexpected date "${value}"`);
  return format(date, 'yyyy-MM-dd');
}

function collectionName(name: string | null): string | null {
  return name === NO_COLLECTION ? null : name;
}

export function shortUrl(keyword: string): string {
  return `${SITE}/${keyword}`;
}

/** The text of an HTML fragment. */
function fragmentText(html: string): string {
  return text(cheerio.load(html)('body'));
}

export function toLink(row: RawLinkRow): Link {
  const id = numeric(/^url-(\d+)$/.exec(row.DT_RowId)?.[1]);
  const collectionId = numeric(row.group_id);
  if (id === null || collectionId === null) {
    throw new Error(`go: unexpected link row "${row.DT_RowId}"`);
  }
  return {
    id,
    keyword: row.DT_RowData_keyword,
    short_url: shortUrl(row.DT_RowData_keyword),
    url: row.DT_RowData_url,
    note: textOrNull(cheerio.load(row.keyword)('div.tw-text-xs').first()),
    collection_id: collectionId,
    collection: collectionName(
      textOrNull(cheerio.load(row.group_name)('option[selected]').first()),
    ),
    total_clicks: numeric(fragmentText(row.total_clicks)) ?? 0,
    created: parseDate(row.created_at),
  };
}

/** The `[label, count]` rows of the Google Charts table the chart function `fn` draws. */
function chartRows(html: string, fn: string): LinkStats['clicks_by_hour'] {
  const literal = new RegExp(`function ${fn}\\(\\)[\\s\\S]*?DataTable\\((\\{.*\\})\\);`).exec(
    html,
  )?.[1];
  if (literal === undefined) throw new Error(`go: the stats page has no ${fn} chart`);
  const table = JSON.parse(literal) as { rows: { c: { v: string | number | null }[] }[] };
  return table.rows.map(({ c }) => ({
    label: String(c[0]?.v ?? ''),
    clicks: numeric(c[1]?.v) ?? 0,
  }));
}

/** The `[country, count]` rows of the traffic location charts, header row dropped. */
function countryRows(html: string): LinkStats['clicks_by_country'] {
  const literal = /arrayToDataTable\((\[.*\])\);/.exec(html)?.[1];
  if (literal === undefined) throw new Error('go: the stats page has no traffic location chart');
  const rows = JSON.parse(literal) as [string | null, number][];
  return rows.slice(1).map(([country, clicks]) => ({ country: trimmed(country), clicks }));
}

/** Converts "12 hits on March 03 2026" (or "URL has never been clicked") into a best day. */
function parseBestDay(value: string): LinkStats['best_day'] {
  const match = /^(\d+) hits? on (.+)$/.exec(value);
  if (match === null) return null;
  return { date: parseDate(match[2] ?? '', 'MMMM dd yyyy'), clicks: numeric(match[1]) ?? 0 };
}

/**
 * Parses a link's stats page (`urls/:keyword`): the details sit in Bootstrap panels, the
 * click series in the Google Charts code at the bottom. The site answers a link the user
 * cannot see with a redirect to the home page, which has none of this.
 */
export function parseLinkPage(html: string, keyword: string): LinkStats {
  const $ = cheerio.load(html);
  const picker = $('select[data-update-path]').first();
  const id = numeric(/\/(\d+)$/.exec(picker.attr('data-update-path') ?? '')?.[1]);
  const collectionId = numeric(picker.attr('data-group-id'));
  if (id === null || collectionId === null) {
    throw new Error(`go: no link "${keyword}" in your collections`);
  }
  // Left column: short URL, destination and collection panels. Right column: note, share,
  // click history (creation date and totals) and best day panels.
  const details = $('.col-md-7 .panel');
  const side = $('.col-md-5 .panel');
  const history = side.eq(2);
  const created = /\d{2}\/\d{2}\/\d{4}/.exec(text(history.find('.panel-body').first()))?.[0];
  if (created === undefined) throw new Error(`go: the stats page of "${keyword}" has no dates`);
  const allTime = history.find('tbody tr').eq(3).find('td').eq(1);
  return {
    id,
    keyword,
    short_url: shortUrl(keyword),
    url: details.eq(1).find('a[href]').first().attr('href') ?? '',
    note: textOrNull($('#url_note').first()),
    collection_id: collectionId,
    collection: collectionName(textOrNull(picker.find('option[selected]').first())),
    total_clicks: numeric(/\d+/.exec(text(allTime))?.[0]) ?? 0,
    created: parseDate(created),
    clicks_by_hour: chartRows(html, 'drawChartHrs24'),
    clicks_by_day_7: chartRows(html, 'drawChartDays7'),
    clicks_by_day_30: chartRows(html, 'drawChartDays30'),
    clicks_by_month: chartRows(html, 'drawChartAllTime'),
    best_day: parseBestDay(text(side.eq(3).find('.panel-body').first())),
    clicks_by_country: countryRows(html),
  };
}

/** Parses the "My Collections" page (`groups`), which leaves out the personal space. */
export function parseCollections(html: string): Collection[] {
  const $ = cheerio.load(html);
  return $('#groups-table tbody tr')
    .toArray()
    .map((row) => {
      const id = numeric(/^group-(\d+)$/.exec($(row).attr('id') ?? '')?.[1]);
      if (id === null) throw new Error('go: unexpected collection row');
      const cells = $(row).find('td');
      return {
        id,
        name: text(cells.eq(0).find('a.group-name').first()),
        description: textOrNull(cells.eq(0).find('.group-description').first()),
        members: numeric(text(cells.eq(1))) ?? 0,
        links: numeric(text(cells.eq(2))) ?? 0,
        created: parseDate(text(cells.eq(3))),
      };
    });
}

/** Parses a collection's members page (`groups/:id/members`). */
export function parseMembers(html: string): Member[] {
  const $ = cheerio.load(html);
  return $('#members-table tbody tr')
    .toArray()
    .map((row) => {
      const id = numeric(/^user-(\d+)$/.exec($(row).attr('id') ?? '')?.[1]);
      if (id === null) throw new Error('go: unexpected member row');
      const cells = $(row).find('td');
      // A member without an email shows "No E-Mail" in italics.
      const email = cells.eq(1);
      return {
        id,
        name: text(cells.eq(0)),
        email: email.find('i').length > 0 ? null : textOrNull(email),
      };
    });
}

export function toMember(raw: RawMember): Member {
  return { id: raw.id, name: raw.display_name, email: trimmed(raw.email) };
}

export function toUser(raw: RawUser): User {
  return { uid: raw.umndid, name: raw.display_name };
}

/** One pending transfer callout: who, and the keyword/URL pairs it covers. */
function parseTransfer(
  $: CheerioAPI,
  item: Selection,
  direction: 'incoming' | 'outgoing',
): TransferRequest {
  const href = item.find('a[data-method="delete"]').first().attr('href') ?? '';
  const id = numeric(/\/transfer_requests\/(\d+)/.exec(href)?.[1]);
  if (id === null) throw new Error('go: unexpected transfer request markup');
  const person = textOrNull(item.find('.to b').first());
  const urls = item.find('.url a');
  return {
    id,
    from: direction === 'incoming' ? person : null,
    to: direction === 'outgoing' ? person : null,
    links: item
      .find('.keyword')
      .toArray()
      .map((el, index) => ({
        keyword: text($(el).find('b')),
        url: urls.eq(index).attr('href') ?? '',
      })),
  };
}

/** Parses the pending transfer callouts at the top of the "My Links" page (`urls`). */
export function parseTransferRequests(html: string): TransferRequests {
  const $ = cheerio.load(html);
  const items = (container: string, direction: 'incoming' | 'outgoing') =>
    $(`${container} .transfer-request-item`)
      .toArray()
      .map((item) => parseTransfer($, $(item), direction));
  return {
    incoming: items('#pending-transfer-requests-to', 'incoming'),
    outgoing: items('#pending-transfer-requests-from', 'outgoing'),
  };
}

/** The CSRF token in the head of every page, which Rails wants on every non-GET request. */
export function parseCsrfToken(html: string): string {
  const token = cheerio.load(html)('meta[name="csrf-token"]').attr('content');
  if (token === undefined) throw new Error('go: the page has no CSRF token');
  return token;
}

/**
 * Reverses Rails' `escape_javascript`, which backslash-escapes the quotes, slashes and
 * newlines of HTML rendered inside a `.js.erb` response.
 */
function unescapeJs(js: string): string {
  return js.replace(/\\(n|r|.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 'r' ? '\r' : c));
}

/** The validation message a `.js.erb` response re-renders a form with; null when none. */
export function parseJsErrors(js: string): string | null {
  return textOrNull(cheerio.load(unescapeJs(js))('.error-space').first());
}

/** The keyword of the link a `POST urls` response announces; null when it announces none. */
export function parseCreatedKeyword(js: string): string | null {
  const copy = cheerio
    .load(unescapeJs(js))('.url-blurb button[data-clipboard-text]')
    .first()
    .attr('data-clipboard-text');
  return copy === undefined ? null : copy.slice(copy.lastIndexOf('/') + 1);
}

/**
 * The messages of a 422 body: either `{ errors: [...] }` or Rails' per-field form
 * `{ keyword: ["has already been taken"] }`, read as "Keyword has already been taken".
 * Null when the body is not JSON, e.g. the HTML page Rails serves for a stale CSRF token.
 */
export function describeErrors(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (Array.isArray(record['errors'])) return record['errors'].map(String).join('. ');
  return Object.entries(record)
    .flatMap(([field, messages]) =>
      Array.isArray(messages) ? messages.map((message) => `${startCase(field)} ${message}`) : [],
    )
    .join('. ');
}
