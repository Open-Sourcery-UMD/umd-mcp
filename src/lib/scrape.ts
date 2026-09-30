import type { CheerioAPI } from 'cheerio';
import type { Link, Table } from '../common.js';
import { collapse } from './text.js';

/** A cheerio selection, as returned by `$(...)`. */
export type Selection = ReturnType<CheerioAPI>;

/** Text of a selection with the template whitespace collapsed. */
export function text(selection: Selection): string {
  return collapse(selection.text());
}

/** Like `text`, but null when the selection is empty or blank. */
export function textOrNull(selection: Selection): string | null {
  if (selection.length === 0) return null;
  const value = text(selection);
  return value === '' ? null : value;
}

/** Resolves an href against `base`; null when there is none. */
export function absoluteUrl(href: string | null | undefined, base: string): string | null {
  const value = href?.trim() ?? '';
  return value === '' ? null : new URL(value, base).toString();
}

/** Every link inside `root` with non-empty text, hrefs resolved against `base`. */
export function links($: CheerioAPI, root: Selection, base: string): Link[] {
  return root
    .find('a[href]')
    .toArray()
    .flatMap((anchor) => {
      const url = absoluteUrl($(anchor).attr('href'), base);
      const label = text($(anchor));
      return url === null || label === '' ? [] : [{ text: label, url }];
    });
}

/** A table as header cells and body rows of cell text; blank rows are dropped. */
export function table($: CheerioAPI, element: Selection): Table {
  const headers = element
    .find('thead th, thead td')
    .map((_, cell) => text($(cell)))
    .get();
  const rows = element
    .find('tr')
    .toArray()
    .filter((row) => $(row).closest('thead').length === 0)
    .map((row) =>
      $(row)
        .find('th, td')
        .map((_, cell) => text($(cell)))
        .get(),
    )
    .filter((row) => row.some((cell) => cell !== ''));
  return { headers, rows };
}

/** Every table inside `root`, in page order. */
export function tables($: CheerioAPI, root: Selection): Table[] {
  return root
    .find('table')
    .map((_, element) => table($, $(element)))
    .get();
}
