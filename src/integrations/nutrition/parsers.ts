import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { format, parseISO } from 'date-fns';
import splitString from 'split-string';
import { decode } from '../../common.js';
import { type Selection, text } from '../../lib/scrape.js';
import { collapse, numeric } from '../../lib/text.js';
import {
  ALLERGENS,
  type Allergen,
  DIETARY_LABELS,
  type DietaryLabel,
  type Meal,
  type MenuItem,
  type Nutrient,
  type Recipe,
  type Station,
} from './schemas.js';

/** split-string's types declare a default export that its CommonJS build does not have. */
const split = splitString as unknown as typeof splitString.default;

/** Converts YYYY-MM-DD into the MM/DD/YYYY form the site's date picker submits. */
export function toSiteDate(date: string): string {
  return format(parseISO(date), 'MM/dd/yyyy');
}

/**
 * Parses one dish row. The dish name links to its nutrition label, whose query string carries
 * the recipe id. Each icon's alt text reads either "Contains <allergen>" or a dietary label,
 * in the site's "pea_protein" / "HalalFriendly" spellings.
 */
function parseItem($: CheerioAPI, row: Selection): MenuItem {
  const link = row.find('a.menu-item-name');
  const href = link.attr('href') ?? '';
  const id = new URLSearchParams(href.split('?')[1]).get('RecNumAndPort') ?? '';

  const allergens: Allergen[] = [];
  const labels: DietaryLabel[] = [];
  for (const icon of row.find('img.nutri-icon').toArray()) {
    const alt = $(icon).attr('alt')?.trim() ?? '';
    const allergen = /^contains\s+(.+)$/i.exec(alt)?.[1];
    if (allergen !== undefined)
      allergens.push(decode(ALLERGENS, allergen.toLowerCase(), 'allergen'));
    else if (alt !== '') labels.push(decode(DIETARY_LABELS, alt.toLowerCase(), 'dietary label'));
  }

  return { name: text(link), id, allergens, labels };
}

/** Parses one station card: a title followed by the rows of dishes it serves. */
function parseStation($: CheerioAPI, card: Selection): Station {
  return {
    name: text(card.find('.card-title')),
    items: card
      .find('.menu-item-row')
      .map((_, row) => parseItem($, $(row)))
      .get(),
  };
}

/** Parses one meal tab; its `href` points at the pane holding that meal's station cards. */
function parseMeal($: CheerioAPI, tab: Selection): Meal {
  const pane = $(tab.attr('href') ?? '');
  return {
    name: text(tab),
    stations: pane
      .find('.card')
      .map((_, card) => parseStation($, $(card)))
      .get(),
  };
}

/**
 * Parses a nutrition.umd.edu menu page into its meal periods. A page with no menu posted
 * (a date too far ahead, for example) has no meal tabs and yields an empty list.
 */
export function parseMenu(html: string): Meal[] {
  const $ = cheerio.load(html);
  return $('ul.nav-tabs a[role="tab"]')
    .map((_, tab) => parseMeal($, $(tab)))
    .get();
}

/**
 * Splits a comma-separated list at the top level only, so sub-ingredients stay attached to
 * their ingredient: "Tofu (Water, Soybeans), Salt" -> ["Tofu (Water, Soybeans)", "Salt"].
 */
function splitTopLevel(value: string): string[] {
  return split(value, { separator: ',', brackets: { '(': ')' } })
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/** Names the label's summary list uses for nutrients its main grid shows under another name. */
const NUTRIENT_ALIASES: Record<string, string> = {
  Fat: 'Total Fat',
  Carbohydrates: 'Total Carbohydrate',
  'Trans Fatty Acid': 'Trans Fat',
};

/**
 * Parses one nutrient cell, e.g. "Total Fat 21.2g", "Vitamin C mg" (amount not reported) or
 * "Includes 0g Added Sugars". Returns undefined for cells that are not nutrients.
 */
function parseNutrient(cell: string, dailyValue: string): Nutrient | undefined {
  const match =
    /^includes\s+(?<amount>[\d.]+)(?<unit>[a-z]+)\s+(?<name>.+)$/i.exec(cell) ??
    /^(?<name>.+?)\.?\s+(?<amount>[\d.]+)?(?<unit>g|mg|mcg|kcal)$/i.exec(cell);
  if (match?.groups === undefined) return undefined;
  const { name, amount, unit } = match.groups as { name: string; amount?: string; unit: string };
  const percent = /(\d+)%/.exec(dailyValue)?.[1];
  return {
    name: NUTRIENT_ALIASES[name] ?? name,
    amount: amount === undefined ? null : Number(amount),
    unit,
    daily_value: percent === undefined ? null : Number(percent),
  };
}

/**
 * Reads the nutrient cells of a label. They come in pairs (nutrient, % daily value), first in
 * the main grid and then in a summary list that repeats some nutrients, sometimes with a daily
 * value the grid left blank. The first occurrence wins and later ones fill in missing values.
 */
function parseNutrients($: CheerioAPI): Nutrient[] {
  const cells = $('span.nutfactstopnutrient')
    .map((_, span) => collapse($(span).text()))
    .get();

  const nutrients = new Map<string, Nutrient>();
  for (let i = 0; i + 1 < cells.length; i += 2) {
    const nutrient = parseNutrient(cells[i] ?? '', cells[i + 1] ?? '');
    if (nutrient === undefined || nutrient.unit === 'kcal') continue;
    const existing = nutrients.get(nutrient.name);
    if (existing === undefined) nutrients.set(nutrient.name, nutrient);
    else {
      existing.amount ??= nutrient.amount;
      existing.daily_value ??= nutrient.daily_value;
    }
  }
  return [...nutrients.values()];
}

/**
 * Parses a nutrition.umd.edu label page. Returns undefined when the page carries no recipe:
 * a malformed id gets an empty page, and an unknown one gets a "Missing Recipe" placeholder.
 */
export function parseRecipe(html: string, id: string): Recipe | undefined {
  const $ = cheerio.load(html);
  const name = text($('h1'));
  if ($('table.facts_table').length === 0 || name.startsWith('Missing Recipe')) return undefined;
  const calories = numeric(text($('.facts_table p:contains("Calories per serving") + p')));
  if (calories === null) {
    throw new Error(`nutrition: no calorie count on the label for "${id}"`);
  }
  return {
    id,
    name,
    serving_size: text($('.nutfactsservsize:last')),
    calories,
    nutrients: parseNutrients($),
    ingredients: splitTopLevel(text($('.labelingredientsvalue'))),
    allergens: splitTopLevel(text($('.labelallergensvalue'))).map((a) => a.toLowerCase()),
  };
}
