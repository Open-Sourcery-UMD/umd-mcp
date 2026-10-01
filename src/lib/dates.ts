import { format, isValid, parse } from 'date-fns';
import { trimmed } from './text.js';

/**
 * A date printed in `pattern` (date-fns tokens, e.g. `'MM/dd/yyyy'` or `'EEE, MMM d yyyy'`) as
 * YYYY-MM-DD; null when `value` is blank or does not match.
 */
export function isoDateFrom(value: unknown, pattern: string): string | null {
  const printed = trimmed(value);
  if (printed === null) return null;
  const date = parse(printed, pattern, new Date(0));
  return isValid(date) ? format(date, 'yyyy-MM-dd') : null;
}

/** Like `isoDateFrom`, but keeps the time of day: YYYY-MM-DDTHH:mm:ss in local time. */
export function isoDateTimeFrom(value: unknown, pattern: string): string | null {
  const printed = trimmed(value);
  if (printed === null) return null;
  const date = parse(printed, pattern, new Date(0));
  return isValid(date) ? format(date, "yyyy-MM-dd'T'HH:mm:ss") : null;
}
