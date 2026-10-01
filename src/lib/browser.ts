import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Cookie, type Page } from 'playwright-core';

export type { Cookie as BrowserCookie } from 'playwright-core';

/**
 * A browser tab driven by the sign-in flow. The small surface keeps the auth code off
 * Playwright's API.
 */
export interface BrowserPage {
  /** Navigates and waits for the resulting page (after any redirects) to load. */
  goto(url: string): Promise<void>;
  /** POSTs `fields` to `action` as a form from the current page and waits for the navigation. */
  submitForm(action: string, fields: Record<string, string>): Promise<void>;
  /** Resolves with the page URL once `predicate` accepts it, or rejects after `timeoutMs`. */
  waitForUrl(predicate: (url: URL) => boolean, timeoutMs: number): Promise<URL>;
  /** Cookies the browser would send to `url`, including HttpOnly ones. */
  cookies(url: string): Promise<Cookie[]>;
}

/** A browser session backed by the persistent umd-mcp profile. */
export interface Browser {
  newPage(): Promise<BrowserPage>;
  /** Deletes every cookie in the profile, ending single sign-on for future launches. */
  clearCookies(): Promise<void>;
  close(): Promise<void>;
}

export type LaunchOptions = {
  /** Whether to run without a visible window. Sign-in needs a window; cleanup does not. */
  headless: boolean;
};

export type LaunchBrowser = (options: LaunchOptions) => Promise<Browser>;

/**
 * Where the sign-in browser keeps its profile. Persisting the IdP session means a later
 * `login` usually completes without prompting.
 */
export const PROFILE_DIR =
  process.env.UMD_MCP_PROFILE_DIR ?? join(homedir(), '.umd-mcp', 'browser-profile');

/**
 * Launches a Chromium-based browser on the persistent profile: `UMD_MCP_BROWSER` when set,
 * else installed Chrome, then Edge, then a Playwright-managed Chromium (never downloaded).
 */
export const launchBrowser: LaunchBrowser = async ({ headless }) => {
  await mkdir(PROFILE_DIR, { recursive: true });
  const context = await launchContext(headless);
  return {
    newPage: async () => wrapPage(await context.newPage()),
    clearCookies: () => context.clearCookies(),
    close: () => context.close(),
  };
};

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
      const navigated = page.waitForEvent('framenavigated');
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
    async waitForUrl(predicate, timeoutMs) {
      await page.waitForURL(predicate, { timeout: timeoutMs });
      return new URL(page.url());
    },
    cookies(url) {
      return page.context().cookies(url);
    },
  };
}
