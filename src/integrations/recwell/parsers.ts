import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { weekdayFromName } from '../../common.js';
import { htmlToText } from '../../lib/html.js';
import { absoluteUrl, type Selection, tables, text, textOrNull } from '../../lib/scrape.js';
import { trimmed } from '../../lib/text.js';
import {
  type ClubSport,
  type FacilityCategory,
  type FacilitySummary,
  type FitnessClass,
  type Page,
  type Section,
  SITE,
} from './schemas.js';

/** Builds a section from a container, using `heading` or the container's first h2/h3. */
function toSection($: CheerioAPI, container: Selection, heading: string | null): Section | null {
  const body = container.clone();
  let title = heading;
  if (title === null) {
    const first = body.find('h2, h3').first();
    title = textOrNull(first);
    first.remove();
  }
  const section = {
    heading: title,
    text: htmlToText(body.html() ?? '', { tables: 'skip' }),
    tables: tables($, body),
  };
  return section.text === '' && section.tables.length === 0 ? null : section;
}

/** The main column of a page, with navigation chrome removed. */
function mainColumn($: CheerioAPI): Selection {
  const main = $('main#main-content');
  main.find('nav, umd-element-breadcrumb, script, style, noscript').remove();
  const column = main.find('.col-800-9').first();
  return column.length === 0 ? main : column;
}

/**
 * Parses a Drupal page into sections: one per accordion item and tab panel, and one per
 * remaining content block (headed by its first h2/h3 when it has one).
 */
export function parsePage(html: string, url: string): Page {
  const $ = cheerio.load(html);
  const title = text($('h1[slot="headline"]').first()) || text($('title'));
  const sections = mainColumn($)
    .children()
    .toArray()
    .flatMap((block) => {
      const items = $(block).find('umd-element-accordion-item, div[slot="tabs"] > div[data-title]');
      if (items.length === 0) return toSection($, $(block), null) ?? [];
      return items.toArray().flatMap((item) => {
        const accordion = item.tagName === 'umd-element-accordion-item';
        const heading = accordion
          ? textOrNull($(item).find('[slot="headline"]').first())
          : trimmed($(item).attr('data-title'));
        const body = accordion ? $(item).find('[slot="text"]').first() : $(item);
        return toSection($, body, heading) ?? [];
      });
    });
  return { title, url, sections };
}

/** Parses the facilities page: one card per `<p><a><strong>Name</strong></a><br>blurb</p>`. */
export function parseFacilities(html: string): FacilitySummary[] {
  const $ = cheerio.load(html);
  return $('div[slot="tabs"] > div[data-title]')
    .toArray()
    .flatMap((panel) => {
      const category: FacilityCategory = /outdoor/i.test($(panel).attr('data-title') ?? '')
        ? 'outdoor'
        : 'indoor';
      return $(panel)
        .find('p')
        .toArray()
        .flatMap((paragraph) => {
          const link = $(paragraph).find('a').has('strong').first();
          const name = text(link.find('strong'));
          const url = absoluteUrl(link.attr('href'), SITE);
          if (name === '' || url === null) return [];
          const description = text($(paragraph)).replace(name, '').trim();
          return [{ name, category, description, url }];
        });
    });
}

/** Parses the group fitness page: one accordion per weekday holding a class table. */
export function parseGroupFitness(html: string): FitnessClass[] {
  const $ = cheerio.load(html);
  return $('umd-element-accordion-item')
    .toArray()
    .flatMap((item) => {
      const headline = text($(item).find('[slot="headline"]').first());
      const fallback = weekdayFromName(headline.split(/\s+/)[0] ?? '');
      if (fallback === null) return [];
      return $(item)
        .find('table tbody tr')
        .toArray()
        .flatMap((row) => {
          const cells = $(row).find('td');
          const name = text(cells.eq(1));
          if (name === '') return [];
          return [
            {
              day: weekdayFromName(text(cells.eq(0))) ?? fallback,
              name,
              location: text(cells.eq(2)),
              instructor: textOrNull(cells.eq(3)),
              start_time: text(cells.eq(4)),
              end_time: text(cells.eq(5)),
              registration_url: absoluteUrl(cells.eq(6).find('a').attr('href'), SITE),
            },
          ];
        });
    });
}

/** Parses the club directory table: Club | Email | Support. */
export function parseClubSports(html: string): ClubSport[] {
  const $ = cheerio.load(html);
  return $('table tbody tr')
    .toArray()
    .flatMap((row) => {
      const cells = $(row).find('td');
      const name = text(cells.eq(0));
      if (name === '') return [];
      const mailto = cells.eq(1).find('a[href^="mailto:"]').attr('href');
      return [
        {
          name,
          website: absoluteUrl(cells.eq(0).find('a').attr('href'), SITE),
          email: mailto === undefined ? textOrNull(cells.eq(1)) : mailto.replace(/^mailto:/, ''),
          support_url: absoluteUrl(cells.eq(2).find('a').attr('href'), SITE),
        },
      ];
    });
}
