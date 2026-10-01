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

/** Resolves an href against `base`; null when there is none or it is not a URL. */
export function absoluteUrl(href: string | null | undefined, base: string): string | null {
  const value = href?.trim() ?? '';
  return value !== '' && URL.canParse(value, base) ? new URL(value, base).toString() : null;
}

/** Text of every element under `root` matching `selector`, blanks dropped. */
export function texts($: CheerioAPI, root: Selection, selector: string): string[] {
  return root
    .find(selector)
    .toArray()
    .flatMap((element) => textOrNull($(element)) ?? []);
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

/**
 * A table as header cells and body rows of cell text. Rows of nested tables and blank rows
 * are dropped; without a `<thead>`, a first row made only of `<th>` cells is the header.
 */
export function table($: CheerioAPI, element: Selection): Table {
  const own = (node: Selection) => node.closest('table').is(element);
  const cells = (row: Selection) =>
    row
      .find('th, td')
      .map((_, cell) => text($(cell)))
      .get();
  let headers = element
    .find('thead th, thead td')
    .filter((_, cell) => own($(cell)))
    .map((_, cell) => text($(cell)))
    .get();
  const body = element
    .find('tr')
    .toArray()
    .map((row) => $(row))
    .filter((row) => own(row) && row.closest('thead').length === 0);
  const first = body[0];
  if (headers.length === 0 && first !== undefined && first.children('td').length === 0) {
    headers = cells(first);
    body.shift();
  }
  const rows = body.map(cells).filter((row) => row.some((cell) => cell !== ''));
  return { headers, rows };
}

/** Every table inside `root`, in page order. */
export function tables($: CheerioAPI, root: Selection): Table[] {
  return root
    .find('table')
    .toArray()
    .map((element) => table($, $(element)));
}
