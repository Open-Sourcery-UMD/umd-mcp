import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Cookie, type Page } from 'playwright-core';
import { domainMatch } from 'tough-cookie';

export type { Cookie as BrowserCookie } from 'playwright-core';

/**
 * A browser tab driven by the sign-in flow. The small surface keeps the auth code off
 * Playwright's API.
 */
export interface BrowserPage {
  /** Navigates and waits for the resulting page (after any redirects) to load. */
  goto(url: string): Promise<void>;
  /** POSTs `fields` to `action` as a form from the current page and waits until it leaves the page. */
  submitForm(action: string, fields: Record<string, string>): Promise<void>;
  /** Clicks the first element matching `selector`, waiting for it to appear. */
  click(selector: string): Promise<void>;
  /** The page's current URL. */
  url(): URL;
  /** Resolves with the page URL once `predicate` accepts it, or rejects after `timeoutMs`. */
  waitForUrl(predicate: (url: URL) => boolean, timeoutMs: number): Promise<URL>;
  /** Every cookie set for the host of `url`, whatever its path, including HttpOnly ones. */
  cookies(url: string): Promise<Cookie[]>;
}

/** A browser session backed by the persistent umd-mcp profile. */
interface Browser {
  newPage(): Promise<BrowserPage>;
  /** Deletes every cookie in the profile, ending single sign-on for future launches. */
  clearCookies(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Where the sign-in browser keeps its profile. Persisting the IdP session means a later
 * `login` usually completes without prompting.
 */
const PROFILE_DIR =
  process.env.UMD_MCP_PROFILE_DIR ?? join(homedir(), '.umd-mcp', 'browser-profile');

/** What Chromium says when another process already has the profile open. */
const PROFILE_IN_USE = /profile appears to be in use|SingletonLock|existing browser session/i;

/**
 * Launches a Chromium-based browser on the persistent profile: `UMD_MCP_BROWSER` when set,
 * else installed Chrome, then Edge, then a Playwright-managed Chromium (never downloaded).
 * Sign-in needs a window (`headless: false`); cleanup does not.
 */
export async function launchBrowser({ headless }: { headless: boolean }): Promise<Browser> {
  await mkdir(PROFILE_DIR, { recursive: true });
  const context = await launchContext(headless);
  return {
    newPage: async () => wrapPage(await context.newPage()),
    clearCookies: () => context.clearCookies(),
    close: () => context.close(),
  };
}

async function launchContext(headless: boolean): Promise<BrowserContext> {
  const executablePath = process.env.UMD_MCP_BROWSER;
  const attempts =
    executablePath === undefined
      ? [{ channel: 'chrome' }, { channel: 'msedge' }, {}]
      : [{ executablePath }];
  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      return await chromium.launchPersistentContext(PROFILE_DIR, {
        headless,
        viewport: null,
        ...attempt,
      });
    } catch (error) {
      failures.push(error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error));
    }
  }
  if (failures.some((failure) => PROFILE_IN_USE.test(failure))) {
    throw new Error(
      'The umd-mcp sign-in browser is already open, probably from another login or another ' +
        'umd-mcp process. Finish or close it and try again.',
    );
  }
  throw new Error(
    'Could not start a browser for signing in. Install Google Chrome or Microsoft Edge, or ' +
      `set UMD_MCP_BROWSER to a Chromium executable. Tried: ${failures.join(' | ')}`,
  );
}

function wrapPage(page: Page): BrowserPage {
  return {
    async goto(url) {
      await page.goto(url);
    },
    async submitForm(action, fields) {
      const from = page.url();
      const navigated = page.waitForEvent(
        'framenavigated',
        (frame) => frame === page.mainFrame() && frame.url() !== from,
      );
      // Evaluated as a string so the DOM types are not needed in this Node-only codebase.
      await page.evaluate(`(() => {
        const form = document.createElement('form');
        form.method = 'post';
        form.action = ${JSON.stringify(action)};
        for (const [name, value] of Object.entries(${JSON.stringify(fields)})) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.append(input);
        }
        document.body.append(form);
        form.submit();
      })()`);
      await navigated;
    },
    async click(selector) {
      await page.locator(selector).first().click();
    },
    url() {
      return new URL(page.url());
    },
    async waitForUrl(predicate, timeoutMs) {
      await page.waitForURL(predicate, { timeout: timeoutMs });
      return new URL(page.url());
    },
    async cookies(url) {
      const host = new URL(url).hostname;
      const cookies = await page.context().cookies();
      return cookies.filter((cookie) => domainMatch(host, cookie.domain.replace(/^\./, '')));
    },
  };
}
