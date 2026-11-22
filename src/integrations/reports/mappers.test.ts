import { describe, expect, it } from 'vitest';
import { toTag } from './mappers.js';
import { toReport } from './mappers.js';

describe('toTag', () => {
  it('keeps the name and count and drops the id', () => {
    const raw = { id: 182, name: 'Admissions', count: 4 };

    const result = toTag(raw);

    expect(result).toEqual({ name: 'Admissions', count: 4 });
  });
});

describe('toReport', () => {
  it('keeps the id, title, description, and tags, and constructs the url', () => {
    const raw = {
      id: 332,
      title: 'Undergraduate Applications',
      description: 'Applications for undergraduate programs',
      tags: [{ id: 182, name: 'Admissions', count: 4 }],
    };
    const result = toReport(raw);
    expect(result).toEqual({
      id: 332,
      title: 'Undergraduate Applications',
      description: 'Applications for undergraduate programs',
      url: 'https://reports.umd.edu/tableaupublic/332',
      tags: ['Admissions'],
    });
  });
  it('converts a null description to null', () => {
    const raw = {
      id: 332,
      title: 'Undergraduate Applications',
      description: null,
      tags: [{ id: 182, name: 'Admissions', count: 4 }],
    };
    const result = toReport(raw);
    expect(result).toEqual({
      id: 332,
      title: 'Undergraduate Applications',
      description: null,
      url: 'https://reports.umd.edu/tableaupublic/332',
      tags: ['Admissions'],
    });
  });
  it('turns a blank description into null', () => {
    const raw = {
      id: 332,
      title: 'Undergraduate Applications',
      description: '  ',
      tags: [{ id: 182, name: 'Admissions', count: 4 }],
    };
    const result = toReport(raw);
    expect(result).toEqual({
      id: 332,
      title: 'Undergraduate Applications',
      description: null,
      url: 'https://reports.umd.edu/tableaupublic/332',
      tags: ['Admissions'],
    });
  });
  it('trims whitespace from the description', () => {
    const raw = {
      id: 332,
      title: 'Undergraduate Applications',
      description: '  Applications for undergraduate programs  ',
      tags: [{ id: 182, name: 'Admissions', count: 4 }],
    };
    const result = toReport(raw);
    expect(result).toEqual({
      id: 332,
      title: 'Undergraduate Applications',
      description: 'Applications for undergraduate programs',
      url: 'https://reports.umd.edu/tableaupublic/332',
      tags: ['Admissions'],
    });
  });
});
