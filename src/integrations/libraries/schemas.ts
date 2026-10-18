import { z } from 'zod';

export const hoursLibrary = z
  .enum(['mckeldin', 'stem', 'makerspace', 'mspal', 'art'])
  .describe(
    'Library identifiers supported by the UMD Libraries API: "mckeldin", "stem", "makerspace", "mspal", or "art"',
  );

export const hoursSchema = z.object({
  status: z.string().describe('Current library status, such as "open" or "closed"'),
  hours_from: z
    .string()
    .nullable()
    .describe('Opening time for today; null when the library is closed or unavailable'),
  hours_to: z
    .string()
    .nullable()
    .describe('Closing time for today; null when the library is closed or unavailable'),
});

export type Hours = z.infer<typeof hoursSchema>;
