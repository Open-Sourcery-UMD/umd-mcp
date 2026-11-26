import { describe, expect, it } from 'vitest';
import { clubInfo, toEvent, toProjectOverview, toRepository } from './mappers.js';

describe('toEvent', () => {
  it('maps a timed calendar event', () => {
    expect(
      toEvent({
        id: 'abc',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=abc',
        summary: 'Hack Session',
        description: 'Weekly hack session for project collaboration.',
        location: 'IRB 4105',
        start: { dateTime: '2026-11-30T18:00:00-05:00', timeZone: 'America/New_York' },
        end: { dateTime: '2026-11-30T19:00:00-05:00', timeZone: 'America/New_York' },
      }),
    ).toEqual({
      id: 'abc',
      title: 'Hack Session',
      description: 'Weekly hack session for project collaboration.',
      location: 'IRB 4105',
      start: '2026-11-30T18:00:00-05:00',
      end: '2026-11-30T19:00:00-05:00',
      url: 'https://www.google.com/calendar/event?eid=abc',
      status: 'confirmed',
    });
  });

  it('uses date for all-day events and nulls blank fields', () => {
    expect(
      toEvent({
        id: 'day',
        summary: '  ',
        description: '  ',
        location: '',
        start: { date: '2026-12-01' },
        end: { date: '2026-12-02' },
      }),
    ).toEqual({
      id: 'day',
      title: 'Untitled event',
      description: null,
      location: null,
      start: '2026-12-01',
      end: '2026-12-02',
      url: 'https://opensourcery.umd.edu',
      status: 'confirmed',
    });
  });
});

describe('toRepository', () => {
  it('builds the GitHub URL for a public org repo', () => {
    expect(toRepository('umd-mcp')).toEqual({
      name: 'umd-mcp',
      url: 'https://github.com/Open-Sourcery-UMD/umd-mcp',
    });
  });
});

describe('toProjectOverview', () => {
  it('flattens the repository into snake_case fields', () => {
    const result = toProjectOverview({
      repository: {
        name: 'website',
        fullName: 'Open-Sourcery-UMD/website',
        url: 'https://github.com/Open-Sourcery-UMD/website',
        description: '  The website for Open Sourcery.  ',
        stars: 2,
        forks: 2,
        language: 'TypeScript',
        pushedAt: '2026-11-20T21:28:59Z',
      },
      commits: [
        {
          sha: 'abc',
          message: 'Update README',
          authorName: 'Om Arya',
          authorLogin: 'om-arya',
          date: '2026-11-20T17:44:42Z',
          url: 'https://github.com/Open-Sourcery-UMD/website/commit/abc',
        },
      ],
      pullRequests: [
        {
          number: 19,
          title: 'Fix current team size',
          url: 'https://github.com/Open-Sourcery-UMD/website/pull/19',
          authorLogin: 'om-arya',
          state: 'closed',
          merged: true,
          createdAt: '2026-03-19T20:47:44Z',
          closedAt: '2026-03-19T20:47:51Z',
        },
      ],
    });

    expect(result.full_name).toBe('Open-Sourcery-UMD/website');
    expect(result.description).toBe('The website for Open Sourcery.');
    expect(result.commits[0]?.author_login).toBe('om-arya');
    expect(result.pull_requests[0]?.merged).toBe(true);
  });
});

describe('clubInfo', () => {
  it('returns the public club links from opensourcery.umd.edu', () => {
    expect(clubInfo().website).toBe('https://opensourcery.umd.edu');
    expect(clubInfo().github_org).toBe('https://github.com/Open-Sourcery-UMD');
  });
});
