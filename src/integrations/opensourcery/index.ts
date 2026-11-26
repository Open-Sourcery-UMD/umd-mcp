import { z } from 'zod';
import { Integration, tool } from '../base.js';
import {
  clubInfo,
  toEvent,
  toProjectOverview,
  toRepository,
  type RawEvent,
  type RawProjectOverview,
} from './mappers.js';
import {
  clubInfoSchema,
  eventSchema,
  projectOverviewSchema,
  repositorySchema,
  SITE,
  type ClubInfo,
  type Event,
  type ProjectOverview,
  type Repository,
} from './schemas.js';

export class OpenSourcery extends Integration {
  readonly name = 'opensourcery';
  readonly baseUrl = `${SITE}/api`;

  @tool({
    title: 'Get Open Sourcery club info',
    description:
      'Public contact and links for Open Sourcery, UMD open-source development club (website, GitHub org, Discord, email, Instagram, LinkedIn). No login needed.',
    input: {},
    output: clubInfoSchema.shape,
  })
  get_club_info(): Promise<ClubInfo> {
    return Promise.resolve(clubInfo());
  }

  @tool({
    title: 'List upcoming Open Sourcery events',
    description:
      'Upcoming club events from the Open Sourcery Google Calendar published on opensourcery.umd.edu (hack sessions and similar), with title, time, location and calendar link. No login needed.',
    input: {},
    output: {
      events: z.array(eventSchema).describe('Upcoming events, soonest first'),
    },
  })
  async list_events(): Promise<{ events: Event[] }> {
    const raw = await this.get<RawEvent[]>('events');
    return { events: raw.map(toEvent) };
  }

  @tool({
    title: 'List Open Sourcery public repositories',
    description:
      'Names and GitHub URLs of public repositories in the Open-Sourcery-UMD GitHub organization, via opensourcery.umd.edu. No login needed.',
    input: {},
    output: {
      repositories: z
        .array(repositorySchema)
        .describe('Public repositories in the Open-Sourcery-UMD organization'),
    },
  })
  async list_repositories(): Promise<{ repositories: Repository[] }> {
    const names = await this.get<string[]>('github', { action: 'orgRepos' });
    return { repositories: names.map(toRepository) };
  }

  @tool({
    title: 'Get Open Sourcery project overview',
    description:
      'Overview of one public Open-Sourcery-UMD GitHub repository via opensourcery.umd.edu: description, stars, language, recent commits and pull requests. Pass a name from opensourcery_list_repositories. No login needed.',
    input: {
      repo: z
        .string()
        .describe('Public repository name under Open-Sourcery-UMD, e.g. "umd-mcp" or "website"'),
    },
    output: projectOverviewSchema.shape,
  })
  async get_project({ repo }: { repo: string }): Promise<ProjectOverview> {
    const raw = await this.get<RawProjectOverview>('github', {
      action: 'projectOverview',
      repo,
    });
    return toProjectOverview(raw);
  }
}
