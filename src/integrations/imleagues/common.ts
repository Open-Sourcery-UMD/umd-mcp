import { z } from 'zod';
import { AuthRequiredError } from '../../lib/errors.js';
import { type Fetcher, request } from '../../lib/http.js';
import { trimmed } from '../../lib/text.js';

export const SITE = 'https://www.imleagues.com';

/** UMD's id on IMLeagues ("University of Maryland", imleagues.com/Maryland). */
export const SCHOOL_ID = '4395e0c781af4905a4088a9561509399';

/** The name the signed-in side registers its session under. */
export const SERVICE = 'imleagues';

/**
 * The answer codes the site gives a request that is not signed in: -1 for a resource guests
 * may never see, -2 for one the caller lacks permission for.
 */
const GUEST_CODES = new Set([-1, -2]);

/** Every sport, league and division id on the site is 32 hex digits. */
export const entityId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{32}$/, 'Expected a 32-character IMLeagues id')
  .toLowerCase();

export const leagueId = entityId.describe(
  'League id from imleagues_list_leagues, e.g. "cddcc03a8a03443ab7f539bca2a77783"',
);

/** The id in a `/spa/{kind}/{id}/...` link; null when `href` is not one. */
export function linkedId(href: string | undefined, kind: string): string | null {
  return href?.match(new RegExp(`/spa/${kind}/([0-9a-z]+)/`))?.[1] ?? null;
}

/** What the site's AJAX handler wraps every answer in. */
type RawResult<T> = {
  isDone: boolean;
  code: number;
  message?: string | null;
  /** The answer; on failure, sometimes `{ code, message }` describing it. */
  data: T;
};

/** Why a call that is not done failed, in the site's words when it gives any. */
function failureReason(result: RawResult<unknown>): string {
  const data = result.data as { message?: unknown } | null;
  return (
    trimmed(result.message) ??
    trimmed(data?.message) ??
    `the request was rejected (code ${result.code})`
  );
}

/**
 * Calls a method of the site's AJAX handler the way its single-page app does: `bo` and
 * `input` name the server-side class and its input type. Returns the answer's `data`. The
 * handler answers HTTP 200 even when it refuses, so a refusal for want of sign-in becomes
 * `AuthRequiredError` here and any other one an error with the site's reason.
 */
export async function call<T>(
  fetcher: Fetcher,
  bo: string,
  method: string,
  input: string,
  body: object,
): Promise<T> {
  const res = await request(
    SITE,
    'Services/AjaxRequestHandler.ashx',
    {
      class: `imLeagues.Web.Members.Services.BO.${bo}`,
      method,
      paramType: `imLeagues.Internal.API.VO.Input.${input}`,
    },
    {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    },
    fetcher,
  );
  const result = (await res.json()) as RawResult<T>;
  if (result.isDone) return result.data;
  if (GUEST_CODES.has(result.code)) {
    throw AuthRequiredError.expired(SERVICE, failureReason(result));
  }
  throw new Error(`${SERVICE}: ${failureReason(result)}`);
}
