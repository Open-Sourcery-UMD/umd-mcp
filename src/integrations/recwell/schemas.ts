import { z } from 'zod';
import { tableSchema, weekday } from '../../common.js';

export const SITE = 'https://recwell.umd.edu';

/** Facility pages, keyed by the name a caller asks for. */
export const FACILITY_PAGES = {
  eppley_recreation_center: 'eppley-recreation-center-0',
  natatorium: 'natatorium',
  ritchie_coliseum: 'ritchie-coliseum-0',
  reckord_armory: 'reckord-armory',
  regents_drive_studios: 'regents-drive-studios',
  severn_building_fitness_center: 'severn-building-fitness-center',
  school_of_public_health: 'school-public-health',
  terps_esports_center: 'terps-esports-center',
  outdoor_aquatic_center: 'outdoor-aquatic-center',
  la_plata_beach: 'la-plata-beach',
  turf_fields: 'turf-fields',
  engineering_fields: 'engineering-fields',
  fraternity_row_fields: 'fraternity-row-fields',
  tennis_and_pickleball_courts: 'eppley-tennis-and-pickleball-courts',
  prince_frederick_fitness_zone: 'facilities/facilities/prince-frederick-fitness-zone',
  bike_shop: 'programs-activities/adventure-program/bike-shop',
  bouldering_zone: 'programs-activities/adventure-program/bouldering-zone',
  climbing_wall: 'programs-activities/adventure-program/climbing-wall-bouldering-grotto',
  outdoor_gear_rental: 'programs-activities/adventure-program/outdoor-gear-rental',
} as const;

export type FacilityKey = keyof typeof FACILITY_PAGES;

export const facilityKey = z
  .enum(Object.keys(FACILITY_PAGES) as FacilityKey[])
  .describe('Which facility page to read');

/** Informational pages, keyed by topic. */
export const INFO_PAGES = {
  membership_services: 'membership-services',
  member_benefits: 'membership-services/member-benefits',
  rules_and_regulations: 'membership-services/rules-regulations',
  court_reservations: 'facilities/court-reservations',
  facility_rental: 'facilities/facility-rental',
  inclement_weather: 'facilities/inclement-weather',
  accessibility: 'facilities/accessibility',
  aquatics: 'programs-activities/aquatics',
  adventure_program: 'programs-activities/adventure-program',
  esports: 'programs-activities/esports',
  golf: 'programs-activities/golf',
  community_and_youth_programs: 'programs-activities/community-youth-programs',
  personal_training: 'programs-activities/fitness/personal-training',
  fitness_centers: 'programs-activities/fitness/fitness-centers-weight-rooms',
  body_composition_assessments: 'programs-activities/fitness/fitness-body-composition-assessments',
  wellness: 'safety-wellness/wellness',
  injury_prevention_and_care: 'safety-wellness/injury-prevention-and-care-ipc',
  instructional_classes_and_certifications: 'safety-wellness/instructional-classes-certifications',
  about: 'about-us/about-us',
  contact: 'about-us/contact-us',
  student_employment: 'about-us/student-employment',
} as const;

export type InfoPageKey = keyof typeof INFO_PAGES;

export const infoPageKey = z
  .enum(Object.keys(INFO_PAGES) as InfoPageKey[])
  .describe('Which page to read');

export const FACILITY_CATEGORIES = ['indoor', 'outdoor'] as const;

export type FacilityCategory = (typeof FACILITY_CATEGORIES)[number];

export const facilityCategory = z
  .enum(FACILITY_CATEGORIES)
  .describe('Whether the site lists it under indoor or outdoor facilities');

export const sectionSchema = z.object({
  heading: z
    .string()
    .nullable()
    .describe('Section heading (an accordion title, tab title or h2); null for lead text'),
  text: z.string().describe('The section as plain text, tables excluded'),
  tables: z.array(tableSchema).describe('Tables in the section'),
});

export const pageSchema = z.object({
  title: z.string().describe('Page title'),
  url: z.string().describe('Page URL'),
  sections: z.array(sectionSchema).describe('Content sections in page order'),
});

export const facilitySummarySchema = z.object({
  name: z.string().describe('Facility name'),
  category: facilityCategory,
  description: z.string().describe('Blurb from the facilities page'),
  url: z.string().describe('Facility page'),
});

export const fitnessClassSchema = z.object({
  day: weekday,
  name: z.string().describe('Class name, e.g. "BodyPump"'),
  location: z.string().describe('Where it meets, e.g. "ERC Fitness Studio"'),
  instructor: z.string().nullable().describe('Instructor name; null when unassigned'),
  start_time: z.string().describe('Start time as printed, e.g. "7:30AM"'),
  end_time: z.string().describe('End time as printed, e.g. "8:30AM"'),
  registration_url: z
    .string()
    .nullable()
    .describe('Registration link on activeterp.umd.edu; registration opens 24 hours before class'),
});

export const clubSportSchema = z.object({
  name: z.string().describe('Club name, e.g. "Badminton"'),
  website: z.string().nullable().describe("The club's own site or TerpLink page"),
  email: z.string().nullable().describe('Contact email'),
  support_url: z.string().nullable().describe('Donation page, if any'),
});

export type Section = z.infer<typeof sectionSchema>;
export type Page = z.infer<typeof pageSchema>;
export type FacilitySummary = z.infer<typeof facilitySummarySchema>;
export type FitnessClass = z.infer<typeof fitnessClassSchema>;
export type ClubSport = z.infer<typeof clubSportSchema>;
