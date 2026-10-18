import { Integration, tool } from '../base.js';
import { type Hours, hoursSchema, hoursLibrary } from './schemas.js';
import { toHours } from './mappers.js';

export class Libraries extends Integration {
  readonly name = 'libraries';
  readonly baseUrl = 'https://api.www.lib.umd.edu/api/libtools';

  @tool({
    title: 'Get library hours',
    description:
      'Get today’s opening hours and current status for a supported UMD library. Supported libraries are McKeldin, STEM, Makerspace, MSPAL, and Art. No login needed.',
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
}
