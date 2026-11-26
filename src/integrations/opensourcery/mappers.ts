import { prose, trimmed } from '../../lib/text.js';
import {
  GITHUB_ORG,
  SITE,
  type ClubInfo,
  type Event,
  type ProjectOverview,
  type Repository,
} from './schemas.js';

export type RawEventWhen = {
  dateTime?: string;
  date?: string;
  timeZone?: string;
};

export type RawEvent = {
  id: string;
  status?: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: RawEventWhen;
  end?: RawEventWhen;
};

export type RawCommit = {
  sha: string;
  message: string;
  authorName?: string | null;
  authorLogin?: string | null;
  date?: string | null;
  url: string;
};

export type RawPullRequest = {
  number: number;
  title: string;
  url: string;
  authorLogin?: string | null;
  state: string;
  merged: boolean;
  createdAt?: string | null;
  closedAt?: string | null;
};

export type RawProjectOverview = {
  repository: {
    name: string;
    fullName: string;
    url: string;
    description?: string | null;
    stars: number;
    forks: number;
    language?: string | null;
    pushedAt?: string | null;
  };
  commits?: RawCommit[];
  pullRequests?: RawPullRequest[];
};

function when(raw: RawEventWhen | undefined): string {
  return raw?.dateTime ?? raw?.date ?? '';
}

export function toEvent(raw: RawEvent): Event {
  return {
    id: raw.id,
    title: trimmed(raw.summary) ?? 'Untitled event',
    description: prose(raw.description),
    location: trimmed(raw.location),
    start: when(raw.start),
    end: when(raw.end),
    url: raw.htmlLink ?? SITE,
    status: trimmed(raw.status) ?? 'confirmed',
  };
}

export function toRepository(name: string): Repository {
  return {
    name,
    url: `https://github.com/${GITHUB_ORG}/${name}`,
  };
}

export function toProjectOverview(raw: RawProjectOverview): ProjectOverview {
  const { repository } = raw;
  return {
    name: repository.name,
    full_name: repository.fullName,
    url: repository.url,
    description: prose(repository.description),
    stars: repository.stars,
    forks: repository.forks,
    language: trimmed(repository.language),
    pushed_at: trimmed(repository.pushedAt),
    commits: (raw.commits ?? []).map((commit) => ({
      sha: commit.sha,
      message: commit.message,
      author_name: trimmed(commit.authorName),
      author_login: trimmed(commit.authorLogin),
      date: trimmed(commit.date),
      url: commit.url,
    })),
    pull_requests: (raw.pullRequests ?? []).map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author_login: trimmed(pr.authorLogin),
      state: pr.state,
      merged: pr.merged,
      created_at: trimmed(pr.createdAt),
      closed_at: trimmed(pr.closedAt),
    })),
  };
}

export function clubInfo(): ClubInfo {
  return {
    name: 'Open Sourcery',
    description: 'An open-source development club at the University of Maryland, College Park',
    website: SITE,
    github_org: `https://github.com/${GITHUB_ORG}`,
    email: 'umdopensourcery@gmail.com',
    discord: 'https://discord.com/invite/BWvbpgskZT',
    instagram: 'https://www.instagram.com/umdopensourcery/',
    linkedin: 'https://www.linkedin.com/company/Open-Sourcery-UMD/',
  };
}
