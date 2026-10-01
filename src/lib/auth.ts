import * as cheerio from 'cheerio';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { launchBrowser, type BrowserPage } from './browser.js';
import { AuthRequiredError, CasError } from './errors.js';
import { isSignedInUrl, Session, type ServiceSpec } from './session.js';

export { Session, type ServiceSpec } from './session.js';

const LOGIN_URL = 'https://shib.idm.umd.edu/shibboleth-idp/profile/cas/login';
const LOGOUT_URL = 'https://shib.idm.umd.edu/shibboleth-idp/profile/cas/logout';
const SERVICE_VALIDATE_URL = 'https://shib.idm.umd.edu/shibboleth-idp/profile/cas/serviceValidate';
const CALLBACK_HOST = 'localtest.dev.umd.edu';

/** How long the user has to finish each interactive step before `login()` gives up. */
const STEP_TIMEOUT_MS = 5 * 60 * 1000;

/** Who the IdP says the user is, as returned by `serviceValidate`. */
export type Principal = {
  /** UMD Directory ID, e.g. `jsmith`. */
  user: string;
  /** Attributes released to this service, keyed by name. Multi-valued attributes keep every value. */
  attributes: Record<string, string[]>;
};

/** Sign-in state of one connected service. */
export type ServiceStatus = {
  name: string;
  signedIn: boolean;
};

/**
 * A service an integration has connected. `session` is `undefined` until `login()` has
 * established one (or after it expires); `require()` throws `AuthRequiredError` instead.
 */
export class Connection {
  session: Session | undefined;

  constructor(readonly spec: ServiceSpec) {}

  /** The live session, or throws `AuthRequiredError` telling the model to call `login`. */
  require(): Session {
    if (this.session === undefined) {
      throw new AuthRequiredError(
        `Not signed in to ${this.spec.name}. Call the \`login\` tool first.`,
      );
    }
    if (this.session.expired) {
      throw new AuthRequiredError(
        `The ${this.spec.name} session has expired. Call the \`login\` tool to sign in again.`,
      );
    }
    return this.session;
  }
}

let current: Principal | undefined;
let inFlight: Promise<void> | undefined;
const connections = new Map<string, Connection>();

/**
 * Registers a single sign-on service so `login()` establishes a session with it. Connecting
 * the same name twice returns the existing connection.
 */
export function connect(spec: ServiceSpec): Connection {
  let connection = connections.get(spec.name);
  if (connection === undefined) {
    connection = new Connection(spec);
    connections.set(spec.name, connection);
  }
  return connection;
}

/** The signed-in user, or `undefined`. */
export function getPrincipal(): Principal | undefined {
  return current;
}

/** The signed-in user; throws `AuthRequiredError` when there is none. */
export function requirePrincipal(): Principal {
  if (current === undefined) throw new AuthRequiredError();
  return current;
}

/** Whether each connected service currently has a live session. */
export function serviceStatus(): ServiceStatus[] {
  return [...connections.values()].map((connection) => ({
    name: connection.spec.name,
    signedIn: connection.session !== undefined && !connection.session.expired,
  }));
}

/**
 * Signs the user in through a browser the server controls. Visits every connected service
 * without a live session so the app can set its cookies, then identifies the user with a CAS
 * ticket sent to a one-shot loopback listener. Services already signed in are skipped, and
 * concurrent calls share one login.
 *
 * A controlled browser is the only way to get the cookies: CAS hands each app its own ticket,
 * and each app turns it into a cookie for its own origin.
 */
export function login(): Promise<void> {
  inFlight ??= runLogin().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

/**
 * Forgets the user and every service session, and clears the sign-in browser's cookies so
 * the IdP single sign-on session is gone too.
 */
export async function logout(): Promise<void> {
  current = undefined;
  for (const connection of connections.values()) connection.session = undefined;
  const browser = await launchBrowser({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(LOGOUT_URL).catch(() => undefined);
    await browser.clearCookies();
  } finally {
    await browser.close();
  }
}

async function runLogin(): Promise<void> {
  const pending = [...connections.values()].filter(
    (connection) => connection.session === undefined || connection.session.expired,
  );
  if (current !== undefined && pending.length === 0) return;

  const browser = await launchBrowser({ headless: false });
  try {
    const page = await browser.newPage();
    // Services first: some (Testudo) send `renew=true`, which makes the IdP prompt even with
    // fresh single sign-on. Identifying afterwards rides on that sign-in instead of prompting
    // twice.
    for (const connection of pending) {
      connection.session = await establish(page, connection.spec);
    }
    if (current === undefined) current = await identify(page);
  } finally {
    await browser.close();
  }
}

/** Runs the CAS flow against a loopback callback and validates the ticket it receives. */
async function identify(page: BrowserPage): Promise<Principal> {
  const { promise, resolve, reject } = Promise.withResolvers<Principal>();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', service);
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    const ticket = url.searchParams.get('ticket');
    if (ticket === null) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html('Sign-in failed', 'The CAS server did not return a ticket. Try again.'));
      return;
    }
    validateTicket(ticket, service).then(
      (principal) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html('Signed in', `Signed in as <b>${principal.user}</b>.`));
        resolve(principal);
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html('Sign-in failed', message));
        reject(error instanceof Error ? error : new Error(message));
      },
    );
  });

  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', ok);
  });
  const { port } = server.address() as AddressInfo;
  const service = `http://${CALLBACK_HOST}:${port}/callback`;

  const timer = setTimeout(() => {
    reject(new Error('Timed out waiting for the browser sign-in. Call login again to retry.'));
  }, STEP_TIMEOUT_MS);
  timer.unref();

  try {
    const loginUrl = new URL(LOGIN_URL);
    loginUrl.searchParams.set('service', service);
    await page.goto(loginUrl.toString());
    const principal = await promise;
    await page.waitForUrl((url) => url.pathname === '/callback', STEP_TIMEOUT_MS);
    return principal;
  } finally {
    clearTimeout(timer);
    server.close();
  }
}

/** Sends the browser into a service and captures the cookies the app sets. */
async function establish(page: BrowserPage, spec: ServiceSpec): Promise<Session> {
  await page.goto(spec.loginUrl);
  if (spec.loginForm !== undefined) await page.submitForm(spec.loginUrl, spec.loginForm);
  try {
    await page.waitForUrl((url) => isSignedInUrl(spec, url), STEP_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Timed out signing in to ${spec.name}`, { cause: error });
  }
  return Session.fromCookies(spec, await page.cookies(spec.loginUrl));
}

/** Validates a service ticket with the IdP and returns the principal it asserts. */
async function validateTicket(ticket: string, service: string): Promise<Principal> {
  const url = new URL(SERVICE_VALIDATE_URL);
  url.searchParams.set('service', service);
  url.searchParams.set('ticket', ticket);
  const res = await fetch(url, { headers: { accept: 'application/xml, text/xml' } });
  if (!res.ok) {
    throw new CasError('HTTP_ERROR', `serviceValidate responded with status ${res.status}`);
  }
  return parseServiceResponse(await res.text());
}

/**
 * Parses a CAS 2.0/3.0 `serviceValidate` response. Returns the principal on
 * `<cas:authenticationSuccess>`; throws `CasError` on `<cas:authenticationFailure>`.
 */
export function parseServiceResponse(xml: string): Principal {
  const $ = cheerio.load(xml, { xml: true });
  const failure = $('cas\\:authenticationFailure').first();
  if (failure.length > 0) {
    throw new CasError(failure.attr('code') ?? 'UNKNOWN', failure.text().trim());
  }
  const user = $('cas\\:authenticationSuccess > cas\\:user').first().text().trim();
  if (user === '') {
    throw new CasError('INVALID_RESPONSE', 'serviceValidate response has no <cas:user>');
  }
  const attributes: Record<string, string[]> = {};
  $('cas\\:authenticationSuccess > cas\\:attributes > *').each((_, el) => {
    const name = el.tagName.replace(/^cas:/, '');
    (attributes[name] ??= []).push($(el).text().trim());
  });
  return { user, attributes };
}

function html(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><title>umd-mcp: ${title}</title><body style="font-family:system-ui;margin:3rem"><h1>${title}</h1><p>${body}</p>`;
}
