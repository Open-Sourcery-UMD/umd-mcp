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
   * e.g. `https://app.testudo.umd.edu/main/`. Cookies are collected for this URL's origin.
   */
  loginUrl: string;
  /** For apps whose sign-in is a button: fields POSTed to `loginUrl` as a form once it loads. */
  loginForm?: Record<string, string>;
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
};

/** Whether `url` counts as being inside the app for `spec`. */
export function isSignedInUrl(spec: ServiceSpec, url: URL): boolean {
  return spec.signedIn?.(url) ?? url.origin === new URL(spec.loginUrl).origin;
}

/**
 * A signed-in session with one service: a cookie jar seeded from the sign-in browser plus a
 * `fetch` that carries those cookies and keeps any the app sets later (session ids rotate).
 *
 * The session marks itself expired, and throws `AuthRequiredError`, when the app answers 401
 * or redirects off its origin (how most UMD apps bounce to the IdP), or to `spec.signInPage`.
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
    const landed = new URL(res.url);
    const bounced = landed.origin !== requested.origin || (this.spec.signInPage?.(landed) ?? false);
    if (res.status === 401 || bounced) {
      this.#expired = true;
      throw new AuthRequiredError(
        `${this.spec.name} no longer accepts the session (${
          res.status === 401 ? 'HTTP 401' : `redirected to ${landed.origin}${landed.pathname}`
        }). Call the \`login\` tool to sign in again.`,
      );
    }
    return res;
  };
}
