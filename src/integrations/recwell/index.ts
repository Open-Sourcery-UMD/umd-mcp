import { z } from 'zod';
import { type Weekday, weekday } from '../../common.js';
import { Integration, tool } from '../base.js';
import { parseClubSports, parseFacilities, parseGroupFitness, parsePage } from './parsers.js';
import {
  type ClubSport,
  clubSportSchema,
  FACILITY_PAGES,
  type FacilityKey,
  facilityKey,
  type FacilitySummary,
  facilitySummarySchema,
  type FitnessClass,
  fitnessClassSchema,
  type Page,
  pageSchema,
  SITE,
} from './schemas.js';

export class RecWell extends Integration {
  readonly name = 'recwell';
  readonly baseUrl = SITE;

  /** A site page parsed into sections. */
  private async page(path: string): Promise<Page> {
    return parsePage(await this.getText(path), `${SITE}/${path}`);
  }

  @tool({
    title: 'Get facility alerts',
    description:
      'Current RecWell facility alerts: holiday and reduced hours, closures and protocol changes, as headed sections with any hours tables. No login needed.',
    input: {},
    output: pageSchema.shape,
  })
  async get_facility_alerts(): Promise<Page> {
    return this.page('facility-alerts');
  }

  @tool({
    title: 'List facilities',
    description:
      'RecWell facilities with a one-paragraph description and link each, grouped as indoor or outdoor. Use recwell_get_facility for hours tables and details. No login needed.',
    input: {},
    output: {
      facilities: z
        .array(facilitySummarySchema)
        .describe('Facilities in the order the site lists them'),
    },
  })
  async list_facilities(): Promise<{ facilities: FacilitySummary[] }> {
    return { facilities: parseFacilities(await this.getText('facilities/facilities')) };
  }

  @tool({
    title: 'Get a facility',
    description:
      "A RecWell facility's page: description, regular hours of operation per season (one tab per semester, as tables), access rules, rental and parking information. Holiday hours and closures are in recwell_get_facility_alerts. No login needed.",
    input: { facility: facilityKey },
    output: pageSchema.shape,
  })
  async get_facility({ facility }: { facility: FacilityKey }): Promise<Page> {
    return this.page(FACILITY_PAGES[facility]);
  }

  @tool({
    title: 'Get group fitness schedule',
    description:
      'The weekly RecWell group fitness class schedule: class, location, instructor, start and end time and registration link, optionally for one weekday. Registration opens 24 hours before a class and needs the free Group Fitness membership. No login needed.',
    input: {
      day: weekday.optional().describe('Only classes on this weekday (default: the whole week)'),
    },
    output: {
      classes: z.array(fitnessClassSchema).describe('Classes in the order the site lists them'),
    },
  })
  async get_group_fitness_schedule({
    day,
  }: {
    day?: Weekday | undefined;
  }): Promise<{ classes: FitnessClass[] }> {
    const classes = parseGroupFitness(
      await this.getText('programs-activities/fitness/group-fitness'),
    );
    return { classes: day === undefined ? classes : classes.filter((c) => c.day === day) };
  }

  @tool({
    title: 'List club sports',
    description:
      'Every RecWell club sport with its website, contact email and donation page. Joining means emailing the club and registering on IMLeagues. No login needed.',
    input: {},
    output: { clubs: z.array(clubSportSchema).describe('Clubs in alphabetical order') },
  })
  async list_club_sports(): Promise<{ clubs: ClubSport[] }> {
    return {
      clubs: parseClubSports(await this.getText('programs-activities/club-sports/club-directory')),
    };
  }
}
