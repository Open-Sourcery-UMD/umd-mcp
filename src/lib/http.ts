import * as cheerio from 'cheerio';
import makeFetchCookie from 'fetch-cookie';
import { isString } from 'lodash-es';
import { CookieJar } from 'tough-cookie';
import { collapse, trimmed } from './text.js';

/** How long a request may take before it is abandoned, unless `init.signal` says otherwise. */
const TIMEOUT_MS = 60_000;

/** How much of an error page to repeat back in a tool error. */
const DETAIL_LENGTH = 200;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    /** The response body, for callers that read validation messages out of a 4xx. */
    public readonly body = '',
    message?: string,
  ) {
    super(message ?? `Request to ${url} failed with status ${status}`);
    this.name = 'HttpError';
  }

  /**
   * The server's own reason, when the body carries one: a JSON `message`/`error`, an HTML
   * page's title, or the first words of a plain-text body. Null when there is nothing useful.
   */
  get detail(): string | null {
    const body = this.body.trim();
    if (body === '') return null;
    if (body.startsWith('{')) {
      try {
        const json = JSON.parse(body) as Record<string, unknown>;
        const first = Array.isArray(json.errors) ? (json.errors[0] as unknown) : undefined;
        const message = [
          json.message,
          json.Message,
          json.error,
          (first as { message?: unknown })?.message,
          first,
        ].find(isString);
        return message === undefined ? null : collapse(message).slice(0, DETAIL_LENGTH);
      } catch {
        return null;
      }
    }
    if (/^<(!doctype|html)/i.test(body)) {
      return trimmed(cheerio.load(body)('title').first().text());
    }
    return collapse(body).slice(0, DETAIL_LENGTH);
  }
}

/** Anything that behaves like `fetch`; a `Session` supplies one that carries its cookies. */
export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Query parameters for `request`. An array repeats the key once per value, e.g.
 * `{ 'include[]': ['a', 'b'] }`; `undefined` leaves the key out.
 */
export type Query = Record<
  string,
  string | number | boolean | readonly (string | number)[] | undefined
>;

/** Plain `fetch`, for integrations without a sign-in session. */
export const plainFetch: Fetcher = (input, init) => fetch(input, init);

/**
 * `fetch` with its own cookie jar, for anonymous flows that still need a server session
 * (a search that keeps its results in the session, an anti-forgery token tied to a cookie).
 */
export function cookieFetcher(): Fetcher {
  return makeFetchCookie(fetch, new CookieJar());
}

function buildUrl(baseUrl: string, path: string, query: Query): URL {
  const url = new URL(`${baseUrl}/${path.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, String(item));
    }
  }
  return url;
}

/** `init` with `defaults` added for any header it does not set itself. */
export function withHeaders(init: RequestInit, defaults: Record<string, string>): RequestInit {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(defaults)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return { ...init, headers };
}

/** Why `fetch` rejected, in words the model can act on. */
function failure(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return `no response within ${TIMEOUT_MS / 1000}s`;
  }
  const code = (error as { cause?: { code?: unknown } })?.cause?.code;
  if (isString(code)) return code;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Fetches `path` relative to `baseUrl` with `query` appended, and throws `HttpError` on a
 * non-2xx status. `init` is passed to fetch, so a POST body or extra headers can be given.
 * Requests time out after a minute unless `init.signal` is given.
 */
export async function request(
  baseUrl: string,
  path: string,
  query: Query = {},
  init: RequestInit = {},
  fetcher: Fetcher = plainFetch,
): Promise<Response> {
  const url = buildUrl(baseUrl, path, query);
  let res: Response;
  try {
    res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  } catch (error) {
    throw new Error(`Request to ${url.toString()} failed: ${failure(error)}`, { cause: error });
  }
  if (!res.ok) {
    throw new HttpError(res.status, url.toString(), await res.text());
  }
  return res;
}

/** Like `request`, but asks for JSON and returns the parsed body. */
export async function getJson<T>(
  baseUrl: string,
  path: string,
  query: Query = {},
  fetcher: Fetcher = plainFetch,
  init: RequestInit = {},
): Promise<T> {
  const res = await request(
    baseUrl,
    path,
    query,
    withHeaders(init, { accept: 'application/json' }),
    fetcher,
  );
  const body = await res.text();
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    const type = res.headers.get('content-type') ?? 'no content type';
    throw new Error(`${res.url} did not return JSON (${type})`, { cause: error });
  }
}

/** Like `request`, but asks for HTML or text and returns the body as a string. */
export async function getText(
  baseUrl: string,
  path: string,
  query: Query = {},
  fetcher: Fetcher = plainFetch,
  init: RequestInit = {},
): Promise<string> {
  const res = await request(
    baseUrl,
    path,
    query,
    withHeaders(init, { accept: 'text/html, text/plain' }),
    fetcher,
  );
  return res.text();
}
