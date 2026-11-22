import { z } from 'zod';
import { Integration, tool } from '../base.js';
import { toReport, toTag, type RawPublicView } from './mappers.js';
import { reportSchema, tagSchema, type Report, type Tag, SITE } from './schemas.js';

export class Reports extends Integration {
  readonly name = 'reports';
  readonly baseUrl = `${SITE}/api`;

  @tool({
    title: 'List public reports',
    description:
      'List the public institutional data reports on reports.umd.edu and their categories. No login needed.',
    input: {},
    output: {
      reports: z.array(reportSchema).describe('Every public report on reports.umd.edu'),
      tags: z
        .array(tagSchema)
        .describe('Every report category with the number of public reports filed under it'),
    },
  })
  async list_reports(): Promise<{ reports: Report[]; tags: Tag[] }> {
    const response = await this.get<RawPublicView>('Home/GetPublicView');
    const reports = response.details.map(toReport);
    // The site's tag list starts with an "All" pseudo-category whose id is null; drop it.
    const tags = response.tags.filter((tag) => tag.id !== null).map(toTag);
    return { reports, tags };
  }
}
