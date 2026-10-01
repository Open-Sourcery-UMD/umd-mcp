import { convert, type HtmlToTextOptions } from 'html-to-text';

export type TextOptions = {
  /** How tables are rendered: laid out as rows (default), or dropped when parsed separately. */
  tables?: 'rows' | 'skip';
};

/**
 * Renders upstream HTML as plain text for the model: link hrefs, images, iframes and styling
 * are dropped, blank lines are limited to one, and the result is trimmed.
 */
export function htmlToText(html: string, { tables = 'rows' }: TextOptions = {}): string {
  const options: HtmlToTextOptions = {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'iframe', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'link', format: 'skip' },
      { selector: 'table', format: tables === 'skip' ? 'skip' : 'dataTable' },
    ],
  };
  return convert(html, options)
    .replaceAll('\u00a0', ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Like `htmlToText`, but null for a missing, empty or whitespace-only fragment. */
export function htmlToTextOrNull(
  html: string | null | undefined,
  options?: TextOptions,
): string | null {
  if (html == null) return null;
  const text = htmlToText(html, options);
  return text === '' ? null : text;
}

/** Renders HTML whose whitespace is significant (fixed-width reports) without collapsing it. */
export function preformattedText(html: string): string {
  return convert(`<pre>${html}</pre>`, { wordwrap: false }).trim();
}
