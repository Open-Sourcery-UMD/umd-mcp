import makeFetchCookie from 'fetch-cookie';
import { Cookie, CookieJar } from 'tough-cookie';
import type { BrowserCookie } from './browser.js';
import { AuthRequiredError } from './errors.js';
import type { Fetcher } from './http.js';

/**
 * Describes a web app behind UMD single sign-on whose session an integration needs. `login`
 * drives the sign-in browser through `loginUrl`, waits until the browser is back inside the
 * app, and copies the app's cookies into a `Session` the integration then uses for requests.
 */
export type ServiceSpec = {
  /** Short identifier used in messages and `whoami`, e.g. "testudo". */
  name: string;
  /**
   * Page that sends an anonymous browser through single sign-on and back into the app,
   * e.g. `https://app.testudo.umd.edu/main/`. Cookies are collected for this URL's origin.
   */
  loginUrl: string;
  /**
   * For apps whose sign-in is a button rather than a redirect: after `loginUrl` loads, these
   * fields are POSTed to it as a form, which then starts the single sign-on redirect.
   */
  loginForm?: Record<string, string>;
  /**
   * Returns true once the browser has landed on a page that means the session exists.
   * Defaults to "same origin as `loginUrl`"; IdP pages are on other origins, so that is
   * usually right. Override when the app's own sign-in pages share its origin.
   */
  signedIn?: (url: URL) => boolean;
};

/** Whether `url` counts as being inside the app for `spec`. */
export function isSignedInUrl(spec: ServiceSpec, url: URL): boolean {
  return spec.signedIn?.(url) ?? url.origin === new URL(spec.loginUrl).origin;
}

/**
 * A signed-in session with one service: a cookie jar seeded from the sign-in browser plus a
 * `fetch` that carries those cookies, follows redirects, and stores any cookies the app sets
 * along the way (session ids rotate).
 *
 * The session marks itself expired, and throws `AuthRequiredError`, when the app answers 401
 * or redirects a request off its origin, which is what every UMD app does to bounce an
 * anonymous client to the IdP.
 */
export class Session {
  readonly jar = new CookieJar();
  readonly #fetch: Fetcher;
  #expired = false;

  private constructor(readonly spec: ServiceSpec) {
    this.#fetch = makeFetchCookie(fetch, this.jar);
  }

  /** Builds a session from cookies harvested from the sign-in browser. */
  static async fromCookies(spec: ServiceSpec, cookies: readonly BrowserCookie[]): Promise<Session> {
    const session = new Session(spec);
    for (const cookie of cookies) {
      await session.jar.store.putCookie(
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

  /** Forgets the session so the next `login` establishes a fresh one. */
  invalidate(): void {
    this.#expired = true;
  }

  /** Fetch with the session's cookies. Throws `AuthRequiredError` if the app rejects them. */
  fetch: Fetcher = async (input, init) => {
    if (this.#expired) {
      throw new AuthRequiredError(
        `The ${this.spec.name} session has expired. Call the \`login\` tool to sign in again.`,
      );
    }
    const requested = new URL(input);
    const res = await this.#fetch(requested, init);
    if (res.status === 401 || new URL(res.url).origin !== requested.origin) {
      this.#expired = true;
      throw new AuthRequiredError(
        `${this.spec.name} no longer accepts the session (${
          res.status === 401 ? 'HTTP 401' : `redirected to ${new URL(res.url).origin}`
        }). Call the \`login\` tool to sign in again.`,
      );
    }
    return res;
  };
}
