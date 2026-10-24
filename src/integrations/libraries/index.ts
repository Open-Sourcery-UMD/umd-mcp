import { Integration, tool } from '../base.js';
import { availabilityLibrary, availabilitySchema, hoursLibrary, hoursSchema } from './schemas.js';
import type { Availability, Hours } from './schemas.js';
import { type RawAvailability, toAvailability, toHours } from './mappers.js';

export class Libraries extends Integration {
  readonly name = 'libraries';
  readonly baseUrl = 'https://api.www.lib.umd.edu/api/libtools';

  @tool({
    title: 'Get library hours',
    description:
      'Get today’s opening hours and current status for a supported UMD Library location. Supported libraries are McKeldin, STEM, Makerspace, MSPAL, and Art. No login needed.',
    input: {
      library: hoursLibrary,
    },
    output: hoursSchema.shape,
  })
  async get_hours({ library }: { library: string }): Promise<Hours> {
    const raw = await this.get<{
      status: string;
      hours_from?: string;
      hours_to?: string;
    }>(`${library}/hours/today`);

    return toHours(raw);
  }

  @tool({
    title: 'Get library space availability',
    description:
      'Get today’s library space availability for a supported UMD Library Location. Supported libraries are McKeldin, STEM, MSPAL, and Art. No login needed.',
    input: {
      library: availabilityLibrary,
    },
    output: availabilitySchema.shape,
  })
  async get_availability({ library }: { library: string }): Promise<Availability> {
    const raw = await this.get<RawAvailability>(`${library}/availability`);
    return toAvailability(raw);
  }
}
