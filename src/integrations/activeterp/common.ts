import * as cheerio from 'cheerio';
import { format, isValid, parse } from 'date-fns';
import { z } from 'zod';
import { text } from '../../lib/scrape.js';
import { numeric } from '../../lib/text.js';

export const SITE = 'https://activeterp.umd.edu';

/** The id Fusion uses for "none selected". */
export const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/** Every id on the site is a GUID. */
export const guid = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Expected an id like 47b9e718-c4ad-4842-a56b-e54dda5a0a29',
  )
  .toLowerCase();

export const priceMin = z
  .number()
  .nullable()
  .describe('Lowest price in dollars; null when the site does not list one');

export const priceMax = z
  .number()
  .nullable()
  .describe(
    'Highest price in dollars, when the price depends on membership type; equals price_min otherwise',
  );

/** A price's lower and upper bound, as the site prints them. */
export type PriceRange = { price_min: number | null; price_max: number | null };

/** The value of a query parameter in an href; null when absent. */
export function urlParam(href: string | null | undefined, name: string): string | null {
  if (href == null) return null;
  return new URL(href, SITE).searchParams.get(name)?.toLowerCase() ?? null;
}

/** A date as the site prints it, e.g. "Mon, Nov 9 2026", as YYYY-MM-DD; null when unreadable. */
export function siteDate(value: string | null | undefined): string | null {
  if (value == null) return null;
  const date = parse(value.trim(), 'EEE, MMM d yyyy', new Date(0));
  return isValid(date) ? format(date, 'yyyy-MM-dd') : null;
}

/** A date and time as the site prints them, e.g. "Tue, Sep 15 2026 4:36 PM", as local ISO 8601. */
export function siteDateTime(value: string | null | undefined): string | null {
  if (value == null) return null;
  const date = parse(value.trim(), 'EEE, MMM d yyyy h:mm a', new Date(0));
  return isValid(date) ? format(date, "yyyy-MM-dd'T'HH:mm:ss") : null;
}

/** Dollar amounts in a price string or fragment, e.g. "$80.00 - $110.00", as its bounds. */
export function toPriceRange(value: string | null | undefined): PriceRange {
  if (value == null) return { price_min: null, price_max: null };
  const $ = cheerio.load(value);
  const printed = $('[aria-hidden="true"]').first();
  const amounts = [
    ...(printed.length > 0 ? text(printed) : text($.root())).matchAll(/\$([\d,]+(?:\.\d+)?)/g),
  ]
    .map((match) => numeric(match[1]?.replaceAll(',', '')))
    .filter((amount): amount is number => amount !== null);
  return { price_min: amounts[0] ?? null, price_max: amounts.at(-1) ?? null };
}
