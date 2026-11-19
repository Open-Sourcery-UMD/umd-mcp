import { z } from 'zod';

export const SITE = 'https://reports.umd.edu';

export const reportSchema = z.object({
  id: z.int().describe('Id of the report on reports.umd.edu. This id is unique, e.g. 1806'),
  title: z
    .string()
    .describe(
      'Title of the report on reports.umd.edu. This title is unique, e.g. "Undergraduate Applications"',
    ),
  description: z
    .string()
    .nullable()
    .describe('What the report covers, null when the report has no description'),
  url: z.string().describe('Page on reports.umd.edu where the report can be viewed'),
  tags: z.array(z.string()).describe('Categories the report is filed under. e.g. ["Admissions"]'),
});

export const tagSchema = z.object({
  name: z
    .string()
    .describe('Name of the category on reports.umd.edu. This name is unique, e.g. "Admissions"'),
  count: z.int().describe('Number of public reports filed under this category. e.g. 1'),
});

export type Report = z.infer<typeof reportSchema>;
export type Tag = z.infer<typeof tagSchema>;
