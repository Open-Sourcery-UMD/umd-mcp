import { millisecondsInDay } from 'date-fns/constants';
import ExpiryMap from 'expiry-map';
import pMemoize from 'p-memoize';

/** Memoises a function */
export function cached<Args extends unknown[], T>(
  load: (...args: Args) => Promise<T>,
  maxAgeMs: number = millisecondsInDay,
): (...args: Args) => Promise<T> {
  return pMemoize(load, {
    cache: new ExpiryMap(maxAgeMs),
    cacheKey: (args) => JSON.stringify(args),
  });
}
