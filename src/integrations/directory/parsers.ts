import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { type Selection, text, textOrNull } from '../../lib/scrape.js';
import type { Person, SearchResults } from './schemas.js';

/** Text of a labelled block ("<strong>Phone:</strong> +1 ...") without its label. */
function labelledText(block: Selection): string | null {
  const own = block.clone();
  own.find('strong').remove();
  return textOrNull(own);
}

function parsePerson($: CheerioAPI, item: Selection): Person {
  const email = textOrNull(item.find('.email a').first());
  return {
    name: text(item.find('.name').first()),
    directory_id:
      email !== null && email.toLowerCase().endsWith('@umd.edu')
        ? email.slice(0, email.indexOf('@')).toLowerCase()
        : null,
    email,
    institution: textOrNull(item.find('.institution').first()),
    title: textOrNull(item.find('.displayTitle').first()),
    department: textOrNull(item.find('.deptName').first()),
    address: item
      .find('.address')
      .toArray()
      .flatMap((block) => labelledText($(block)) ?? []),
    phone: labelledText(item.find('.phoneNumbers').first()),
  };
}

/** Parses the results page (`GET /search` after a search was posted). */
export function parseResults(html: string): SearchResults {
  const $ = cheerio.load(html);
  const people = $('.DisplaySearchItem')
    .map((_, item) => parsePerson($, $(item)))
    .get();
  return {
    count: people.length,
    limit_reached: $('.ResultNumber .resultLimit').length > 0,
    message: textOrNull($('.StatMessage').first()),
    people,
  };
}
