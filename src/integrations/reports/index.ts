import { z } from 'zod';
import { Integration, tool } from '../base.js';
import { toReport, toTag, type RawPublicView } from './mappers.js';
import { reportSchema, tagSchema, type Report, type Tag } from './schemas.js';

export class Reports extends Integration {
  readonly name = 'reports';
  readonly baseUrl = 'https://reports.umd.edu/api';

  @tool({
    title: 'List public reports',
    description:
      "List the public data reports that the UMD Office of Institutional Research, Planning & Assessment publishes on reports.umd.edu, covering admissions, enrollments, degrees, retention and graduation rates, employees and courses. Returns each report's title, description, categories and a link to view it, plus every category with its number of public reports. The reports themselves are interactive Tableau dashboards, so this tool returns links, not the figures inside them. No login needed.",
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
    const rawReports = response.details.map(toReport);
    // The site's tag list starts with an "All" pseudo-category whose id is null; drop it.
    const rawTags = response.tags.filter((tag) => tag.id !== null).map(toTag);
    return { reports: rawReports, tags: rawTags };
  }
}
