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
}

/** Anything that behaves like `fetch`; a `Session` supplies one that carries its cookies. */
export type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

const plainFetch: Fetcher = (input, init) => fetch(input, init);

function buildUrl(baseUrl: string, path: string, query: Query): URL {
  const url = new URL(`${baseUrl}/${path.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

export type Query = Record<string, string | number | boolean | undefined>;

/**
 * Fetches `path` relative to `baseUrl` with `query` appended, and throws `HttpError` on a
 * non-2xx status. `init` is passed to fetch, so a POST body or extra headers can be given.
 */
export async function request(
  baseUrl: string,
  path: string,
  query: Query = {},
  init: RequestInit = {},
  fetcher: Fetcher = plainFetch,
): Promise<Response> {
  const url = buildUrl(baseUrl, path, query);
  const res = await fetcher(url, init);
  if (!res.ok) {
    throw new HttpError(res.status, url.toString(), await res.text());
  }
  return res;
}

/**
 * Small JSON fetch helper. Builds a URL from base + path + query, throws `HttpError`
 * on non-2xx responses, and returns the parsed JSON body. Pass a `Session`'s `fetch` as
 * `fetcher` to make the request with that session's cookies.
 */
export async function getJson<T>(
  baseUrl: string,
  path: string,
  query: Query = {},
  fetcher: Fetcher = plainFetch,
): Promise<T> {
  const res = await request(
    baseUrl,
    path,
    query,
    { headers: { accept: 'application/json' } },
    fetcher,
  );
  return (await res.json()) as T;
}

/**
 * Like `getJson`, but returns the raw body as text. Used for upstreams that only serve HTML.
 */
export async function getText(
  baseUrl: string,
  path: string,
  query: Query = {},
  fetcher: Fetcher = plainFetch,
): Promise<string> {
  const res = await request(
    baseUrl,
    path,
    query,
    { headers: { accept: 'text/html, text/plain' } },
    fetcher,
  );
  return res.text();
}
