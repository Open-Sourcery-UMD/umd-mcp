import { compact, isFinite as isFiniteNumber, isString, toNumber, trim } from 'lodash-es';

/** `value` trimmed; null when it is not a string or is blank. Numbers are stringified. */
export function trimmed(value: unknown): string | null {
  if (typeof value === 'number' && isFiniteNumber(value)) return String(value);
  if (!isString(value)) return null;
  const text = trim(value);
  return text === '' ? null : text;
}

/** `value` with every run of whitespace (non-breaking spaces included) collapsed to one space. */
export function collapse(value: string): string {
  return trim(value.replace(/\s+/g, ' '));
}

/** The non-blank entries of `values`, trimmed. */
export function lines(values: readonly unknown[]): string[] {
  return compact(values.map(trimmed));
}

/** The non-blank `parts` joined with a space, e.g. a first and last name; null when none. */
export function joinWords(...parts: readonly unknown[]): string | null {
  const joined = lines(parts).join(' ');
  return joined === '' ? null : joined;
}

/** Whether any of `texts` contains `query`, ignoring case; true when there is no query. */
export function matchesQuery(
  query: string | undefined,
  ...texts: readonly (string | null | undefined)[]
): boolean {
  if (query === undefined) return true;
  const needle = query.toLowerCase();
  return texts.some((text) => text?.toLowerCase().includes(needle) ?? false);
}

/** A "Yes"/"No" flag as a boolean; null for anything else, blank included. */
export function yesNo(value: unknown): boolean | null {
  return value === 'Yes' ? true : value === 'No' ? false : null;
}

/** A finite number from a number or numeric string; null for anything else. */
export function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && trimmed(value) === null) return null;
  const parsed = toNumber(value);
  return isFiniteNumber(parsed) ? parsed : null;
}

/** `value` when it is an array, else an empty array. */
export function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
