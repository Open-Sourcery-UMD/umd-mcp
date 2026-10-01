import makeFetchCookie from 'fetch-cookie';
import { Cookie, CookieJar } from 'tough-cookie';
import type { BrowserCookie } from './browser.js';
import { AuthRequiredError } from './errors.js';
import type { Fetcher } from './http.js';

/**
 * A web app behind UMD single sign-on. `login` sends the browser to `loginUrl`, waits until it
 * is back inside the app, and copies the app's cookies into a `Session`.
 */
export type ServiceSpec = {
  /** Short identifier used in messages and `whoami`, e.g. "testudo". */
  name: string;
  /**
   * Page that sends an anonymous browser through single sign-on and back into the app,
   * e.g. `https://app.testudo.umd.edu/main/`. Cookies are collected for this URL's host.
   */
  loginUrl: string;
  /** For apps whose sign-in is a button: fields POSTed to `loginUrl` as a form once it loads. */
  loginForm?: Record<string, string>;
  /**
   * For apps whose sign-in button submits a form the page itself prepares (an anti-forgery
   * token, a provider field): a CSS selector clicked once `loginUrl` loads, unless the browser
   * is already signed in.
   */
  loginClick?: string;
  /**
   * Whether the browser has landed inside the signed-in app. Defaults to "same origin as
   * `loginUrl`". Override when the app's own sign-in pages share its origin.
   */
  signedIn?: (url: URL) => boolean;
  /**
   * Whether a URL is the app's own sign-in page, for apps that bounce an expired session there
   * (same origin, HTTP 200) rather than to the IdP. Landing on it marks the session expired.
   */
  signInPage?: (url: URL) => boolean;
  /**
   * Whether a response means the app no longer accepts the session. Defaults to "401, or a
   * redirect off the app's origin or to `signInPage`". Override for apps that answer 401 to
   * ordinary permission failures too.
   */
  expired?: (response: Response, requested: URL, landed: URL) => boolean;
};

/** Whether `url` counts as being inside the app for `spec`. */
export function isSignedInUrl(spec: ServiceSpec, url: URL): boolean {
  return spec.signedIn?.(url) ?? url.origin === new URL(spec.loginUrl).origin;
}

/** The default `ServiceSpec.expired`: how most UMD apps reject a stale session. */
function rejected(spec: ServiceSpec, response: Response, requested: URL, landed: URL): boolean {
  return (
    response.status === 401 ||
    landed.origin !== requested.origin ||
    (spec.signInPage?.(landed) ?? false)
  );
}

/**
 * A signed-in session with one service: a cookie jar seeded from the sign-in browser plus a
 * `fetch` that carries those cookies and keeps any the app sets later (session ids rotate).
 *
 * The session marks itself expired, and throws `AuthRequiredError`, once a response fails
 * `spec.expired` (by default: a 401, or a redirect off the app's origin or to `signInPage`).
 */
export class Session {
  readonly #jar = new CookieJar();
  readonly #fetch: Fetcher;
  #expired = false;

  private constructor(readonly spec: ServiceSpec) {
    this.#fetch = makeFetchCookie(fetch, this.#jar);
  }

  /** Builds a session from cookies harvested from the sign-in browser. */
  static async fromCookies(spec: ServiceSpec, cookies: readonly BrowserCookie[]): Promise<Session> {
    const session = new Session(spec);
    for (const cookie of cookies) {
      await session.#jar.store.putCookie(
        new Cookie({
          key: cookie.name,
          value: cookie.value,
          domain: cookie.domain.replace(/^\./, ''),
          hostOnly: !cookie.domain.startsWith('.'),
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          expires: cookie.expires > 0 ? new Date(cookie.expires * 1000) : 'Infinity',
        }),
      );
    }
    return session;
  }

  /** True once a request has shown the app no longer accepts the session. */
  get expired(): boolean {
    return this.#expired;
  }

  /** Fetch with the session's cookies. Throws `AuthRequiredError` if the app rejects them. */
  fetch: Fetcher = async (input, init) => {
    if (this.#expired) throw AuthRequiredError.expired(this.spec.name);
    const requested = new URL(input);
    const res = await this.#fetch(requested, init);
    const landed = new URL(res.url);
    const expired =
      this.spec.expired ?? ((response, from, to) => rejected(this.spec, response, from, to));
    if (expired(res, requested, landed)) {
      this.#expired = true;
      throw AuthRequiredError.expired(
        this.spec.name,
        res.status === 401 ? 'HTTP 401' : `redirected to ${landed.origin}${landed.pathname}`,
      );
    }
    return res;
  };
}

/**
 * Memoises a value per `Session`, e.g. a CSRF token or account id read from a page once, and
 * forgets it when the session is replaced after a new sign-in.
 */
export function perSession<T>(
  compute: (session: Session) => Promise<T>,
): (session: Session) => Promise<T> {
  const cache = new WeakMap<Session, Promise<T>>();
  return (session) => {
    let value = cache.get(session);
    if (value === undefined) {
      value = compute(session).catch((error: unknown) => {
        cache.delete(session);
        throw error;
      });
      cache.set(session, value);
    }
    return value;
  };
}
