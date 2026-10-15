import type Parser from 'rss-parser';
import { decodeOrNull } from '../../common.js';
import { htmlToText } from '../../lib/html.js';
import { numeric, trimmed } from '../../lib/text.js';
import {
  BUSY_LEVELS,
  type BusyMeter,
  HALL_LEVELS,
  type HallName,
  type NewsItem,
} from './schemas.js';

/** The busy meter's JSON as hall levels; halls with an unreadable level are dropped. */
export function toBusyMeter(body: unknown): BusyMeter {
  const raw = (Array.isArray(body) ? body[0] : body) as Record<string, unknown> | undefined;
  const halls = (Object.keys(HALL_LEVELS) as HallName[]).flatMap((name) => {
    const level = decodeOrNull(BUSY_LEVELS, numeric(raw?.[HALL_LEVELS[name]]) ?? undefined);
    return level === null ? [] : [{ name, level }];
  });
  return halls.length === 0
    ? { available: false, reason: 'The busy meter service returned no levels', halls: [] }
    : { available: true, reason: null, halls };
}

export function toNewsItem(item: Parser.Item): NewsItem {
  return {
    title: trimmed(item.title) ?? '',
    url: item.link ?? '',
    published: item.isoDate ?? null,
    author: trimmed(item.creator),
    text: htmlToText(item.content ?? ''),
  };
}
