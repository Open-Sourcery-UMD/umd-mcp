import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { max } from 'lodash-es';
import { decode } from '../../../common.js';
import { isoDateTimeFrom } from '../../../lib/dates.js';
import { htmlToTextOrNull } from '../../../lib/html.js';
import {
  absoluteUrl,
  links,
  type Selection,
  text,
  texts,
  textOrNull,
} from '../../../lib/scrape.js';
import { lines, numeric, trimmed, yesNo } from '../../../lib/text.js';
import {
  type Event,
  type EventList,
  type EventSummary,
  type Performance,
  type Presenter,
  PRESENTER_NAMES,
  SEATING,
  SITE,
} from './schemas.js';

/** A listing card's date, e.g. "Thu, Oct. 15, 2026 | 7:30PM". */
const CARD_DATE_TIME = 'EEE, MMM. d, yyyy | h:mma';

/** Longest first, so a name that starts with another is matched whole. */
const PRESENTER_PRINTED = Object.keys(PRESENTER_NAMES).sort((a, b) => b.length - a.length);

/**
 * The presenters a listing card prints joined with ", ", e.g. "Clarice Presents, UMD School of
 * Music". Names contain commas themselves, so each is matched against the known names in turn.
 */
function toPresenters(printed: string): Presenter[] {
  const presenters: Presenter[] = [];
  let rest = printed;
  while (rest !== '') {
    const remaining = rest;
    const name = PRESENTER_PRINTED.find(
      (candidate) => remaining === candidate || remaining.startsWith(`${candidate}, `),
    );
    presenters.push(decode(PRESENTER_NAMES, name ?? remaining, 'presenter'));
    rest = remaining.slice(name?.length ?? remaining.length).replace(/^, /, '');
  }
  return presenters;
}

/** An event page's `datetime` attribute, e.g. "2026-10-15T19:30:00-04:00", without its offset. */
function withoutOffset(value: string | undefined): string {
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.exec(value ?? '')?.[0];
  if (local === undefined) throw new Error(`clarice: unreadable performance time "${value}"`);
  return local;
}

/** The slug at the end of an event page URL. */
function slugOf(url: string): string {
  return new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '';
}

/** The number of result pages the pager links to, at least up to the current one. */
function pageCount($: CheerioAPI, current: number): number {
  const linked = $('nav.pager a[href]')
    .toArray()
    .map((anchor) => numeric(new URL($(anchor).attr('href') ?? '', SITE).searchParams.get('page')))
    .filter((page) => page !== null);
  return (max([...linked, current]) ?? current) + 1;
}

function toEventSummary($: CheerioAPI, card: Selection): EventSummary {
  const link = card.find('.event-result-card__content a.primary-link');
  const url = absoluteUrl(link.attr('href'), SITE) ?? SITE;
  const printed = text(card.find('.event-result-card__date-time'));
  const start = isoDateTimeFrom(printed, CARD_DATE_TIME);
  if (start === null) throw new Error(`clarice: unreadable event date "${printed}"`);
  return {
    slug: slugOf(url),
    title: text(link),
    url,
    presenters: toPresenters(text(card.find('.event-result-card__presenter'))),
    start,
    livestream: card.hasClass('livestream-card'),
    accessibility: texts($, card, '.accessibility-item .visible-for-screen-readers'),
    image_url: absoluteUrl(card.find('.event-result-card__image img').attr('src'), SITE),
  };
}

/** One page of the events list; `page` is the zero-based index the site's pager uses. */
export function parseEventList(html: string, page: number): EventList {
  const $ = cheerio.load(html);
  return {
    events: $('.view-content .event-result-card')
      .toArray()
      .map((card) => toEventSummary($, $(card))),
    page: page + 1,
    pages: pageCount($, page),
  };
}

function toPerformance($: CheerioAPI, row: Selection): Performance {
  const status = textOrNull(row.find('.field--name-field-instance-status .field__item'));
  return {
    start: withoutOffset(row.find('time[datetime]').attr('datetime')),
    venue: textOrNull(row.find('.addeventatc .location')),
    livestream: yesNo(textOrNull(row.find('.field--name-field-is-livestream .field__item'))),
    cancelled: status === 'Cancelled',
    sold_out: status === 'Sold out',
    link: links($, row.find('.field--name-field-livestream-link'), SITE)[0] ?? null,
  };
}

/** The content of the hero's at-a-glance section labelled `label`, e.g. "Price". */
function glance($: CheerioAPI, label: string): Selection {
  return $('.event-hero__at-a-glance-section')
    .filter(
      (_, section) => text($(section).find('.event-hero__at-a-glance-section-label')) === label,
    )
    .find('.event-hero__at-a-glance-section-content');
}

/** The price list, one line per price; each is a list item the site renders as a bullet. */
function toPrice($: CheerioAPI): string | null {
  const items = glance($, 'Price')
    .find('> ul > li')
    .toArray()
    .map((item) => htmlToTextOrNull($(item).html()));
  return trimmed(lines(items).join('\n'));
}

function toVenue($: CheerioAPI): Event['venue'] {
  const items = glance($, 'Venue').find('li');
  const name = textOrNull(items.eq(0));
  if (name === null) return null;
  const seating = textOrNull(items.eq(1));
  return {
    name,
    url: absoluteUrl(items.eq(0).find('a').attr('href'), SITE),
    seating: seating === null ? null : decode(SEATING, seating, 'seating'),
  };
}

/** A value the page's inline script hands the ticketing widget, e.g. `spektrixIdValue`. */
function nodeData(html: string, key: string): string | null {
  return trimmed(new RegExp(`${key}:\\s*"([^"]*)"`).exec(html)?.[1]);
}

/** An event page. */
export function parseEvent(html: string, slug: string): Event {
  const $ = cheerio.load(html);
  return {
    slug,
    title: text($('.event-hero__title')),
    subtitle: textOrNull($('.event-hero__subtitle')),
    url: `${SITE}/events/${slug}`,
    presenters: $('.event-hero__presents span')
      .toArray()
      .map((span) => decode(PRESENTER_NAMES, text($(span)), 'presenter')),
    image_url: absoluteUrl($('.event-hero__image img').attr('src'), SITE),
    price: toPrice($),
    venue: toVenue($),
    notice: htmlToTextOrNull($('.event-hero__announcement__text').html()),
    description: htmlToTextOrNull($('.paragraph--type--html').first().html()),
    performances: $('#event-performance-dates .performanceRow')
      .toArray()
      .map((row) => toPerformance($, $(row))),
    tickets_event_id: nodeData(html, 'spektrixIdValue'),
    livestream_tickets_event_id: nodeData(html, 'spektrixLivestreamIdValue'),
  };
}
