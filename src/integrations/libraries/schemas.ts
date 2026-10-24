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

export const availabilityLibrary = z
  .enum(['mckeldin', 'stem', 'mspal', 'art'])
  .describe(
    'Library identifiers supported by the UMD Libraries API: "mckeldin", "stem", "mspal", or "art"',
  );

export const availabilityGroupSchema = z.object({
  group_id: z.int().describe('Internal numeric library space group identifier'),
  name: z.string().describe('Name of the bookable library space group'),
  available: z.int().describe('Number of spaces currently available in this group'),
  total: z.int().describe('Total number of spaces in this group'),
  next_available: z
    .string()
    .nullable()
    .describe('Next expected availability time; null when no time is provided'),
});

export const availabilitySchema = z.object({
  groups: z
    .array(availabilityGroupSchema)
    .describe('Bookable library space groups and their current availability'),
  overall_available: z.int().describe('Total number of spaces currently available'),
  total: z.int().describe('Total number of spaces'),
});

export type Hours = z.infer<typeof hoursSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
