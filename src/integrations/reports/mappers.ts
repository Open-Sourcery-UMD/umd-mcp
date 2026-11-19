import { type Report, type Tag, SITE } from './schemas.js';
import { trimmed } from '../../lib/text.js';

type RawTags = {
  id: number | null;
  name: string;
  count: number;
};

export type RawReport = {
  id: number;
  description: string | null;
  title: string;
  tags: RawTags[];
};

export type RawPublicView = {
  details: RawReport[];
  tags: RawTags[];
};

export function toReport(raw: RawReport): Report {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ? trimmed(raw.description) : null,
    url: `${SITE}/tableaupublic/${raw.id}`,
    tags: raw.tags.map((tag) => tag.name),
  };
}

export function toTag(raw: RawTags): Tag {
  return {
    name: raw.name,
    count: raw.count,
  };
}
