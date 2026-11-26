import { z } from 'zod';

export const SITE = 'https://opensourcery.umd.edu';
export const GITHUB_ORG = 'Open-Sourcery-UMD';

export const eventSchema = z.object({
  id: z.string().describe('Google Calendar event id for this occurrence'),
  title: z.string().describe('Event title, e.g. "Hack Session"'),
  description: z
    .string()
    .nullable()
    .describe('Event description from the club calendar; null when none is set'),
  location: z
    .string()
    .nullable()
    .describe('Where the event is held, e.g. "IRB 4105"; null when none is set'),
  start: z
    .string()
    .describe('Start time as an ISO-8601 datetime or all-day date from Google Calendar'),
  end: z.string().describe('End time as an ISO-8601 datetime or all-day date from Google Calendar'),
  url: z.string().describe('Google Calendar HTML link for the event'),
  status: z.string().describe('Calendar status, typically "confirmed"'),
});

export const repositorySchema = z.object({
  name: z
    .string()
    .describe('Public GitHub repository name under the Open-Sourcery-UMD org, e.g. "umd-mcp"'),
  url: z
    .string()
    .describe('GitHub URL for the repository, e.g. "https://github.com/Open-Sourcery-UMD/umd-mcp"'),
});

export const commitSchema = z.object({
  sha: z.string().describe('Commit SHA'),
  message: z.string().describe('Commit message as returned by the site API'),
  author_name: z.string().nullable().describe('Commit author display name; null when unknown'),
  author_login: z.string().nullable().describe('GitHub login of the author; null when unknown'),
  date: z.string().nullable().describe('Commit timestamp as an ISO-8601 string; null when unknown'),
  url: z.string().describe('GitHub URL for the commit'),
});

export const pullRequestSchema = z.object({
  number: z.int().describe('Pull request number on GitHub'),
  title: z.string().describe('Pull request title'),
  url: z.string().describe('GitHub URL for the pull request'),
  author_login: z.string().nullable().describe('GitHub login of the author; null when unknown'),
  state: z.string().describe('Pull request state, e.g. "open" or "closed"'),
  merged: z.boolean().describe('Whether the pull request was merged'),
  created_at: z.string().nullable().describe('ISO-8601 creation time; null when unknown'),
  closed_at: z.string().nullable().describe('ISO-8601 close time; null when still open or unknown'),
});

export const projectOverviewSchema = z.object({
  name: z.string().describe('Repository name'),
  full_name: z.string().describe('owner/name on GitHub'),
  url: z.string().describe('GitHub URL for the repository'),
  description: z
    .string()
    .nullable()
    .describe('Repository description from GitHub; null when none is set'),
  stars: z.int().describe('GitHub stargazer count'),
  forks: z.int().describe('GitHub fork count'),
  language: z
    .string()
    .nullable()
    .describe('Primary language reported by GitHub; null when none is set'),
  pushed_at: z.string().nullable().describe('ISO-8601 time of the latest push; null when unknown'),
  commits: z.array(commitSchema).describe('Recent commits from the site overview API'),
  pull_requests: z
    .array(pullRequestSchema)
    .describe('Recent pull requests from the site overview API'),
});

export const clubInfoSchema = z.object({
  name: z.string().describe('Club name'),
  description: z.string().describe('One-line description of Open Sourcery'),
  website: z.string().describe('Public club website'),
  github_org: z.string().describe('GitHub organization URL'),
  email: z.string().describe('Public contact email'),
  discord: z.string().describe('Public Discord invite URL'),
  instagram: z.string().describe('Public Instagram URL'),
  linkedin: z.string().describe('Public LinkedIn company URL'),
});

export type Event = z.infer<typeof eventSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type ProjectOverview = z.infer<typeof projectOverviewSchema>;
export type ClubInfo = z.infer<typeof clubInfoSchema>;
