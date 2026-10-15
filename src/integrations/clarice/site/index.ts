import { z } from 'zod';
import { Integration, tool } from '../../base.js';
import { parseEvent, parseEventList } from './parsers.js';
import {
  CATEGORIES,
  type Category,
  category,
  type Event,
  type EventList,
  eventListSchema,
  eventSchema,
  eventSlug,
  GENRES,
  type Genre,
  genre,
  PRESENTERS,
  type Presenter,
  presenter,
  SITE,
} from './schemas.js';

/**
 * theclarice.umd.edu is a Drupal site with no public API, so the tools read the same server-
 * rendered pages a visitor does. Tickets, seats and prices come from the Spektrix ticketing
 * system's own API in `ClariceTickets`.
 */
export class Clarice extends Integration {
  readonly name = 'clarice';
  readonly baseUrl = SITE;

  @tool({
    title: 'Search Clarice events',
    description:
      'Upcoming performances at The Clarice Smith Performing Arts Center (theclarice.umd.edu): concerts, theater, dance and other events by Clarice Presents, the School of Music and the School of Theatre, Dance, and Performance Studies, optionally narrowed by title, genre, category or presenter. Each performance is listed separately, up to 10 per page. No login needed.',
    input: {
      title: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Only events whose title contains this text, e.g. "nutcracker"'),
      genre: genre.optional().describe('Only events in this genre'),
      category: category.optional().describe('Only events of this kind'),
      presenter: presenter.optional().describe('Only events by this presenter'),
      page: z.number().int().min(1).default(1).describe('Page number, starting at 1 (default 1)'),
    },
    output: eventListSchema.shape,
  })
  async search_events({
    title,
    genre: genreSlug,
    category: categorySlug,
    presenter: presenterSlug,
    page,
  }: {
    title?: string | undefined;
    genre?: Genre | undefined;
    category?: Category | undefined;
    presenter?: Presenter | undefined;
    page: number;
  }): Promise<EventList> {
    const html = await this.getText('events', {
      title,
      field_genre_target_id: genreSlug === undefined ? undefined : GENRES[genreSlug],
      field_event_category_target_id:
        categorySlug === undefined ? undefined : CATEGORIES[categorySlug],
      field_presenter_target_id:
        presenterSlug === undefined ? undefined : PRESENTERS[presenterSlug],
      page: page - 1,
    });
    return parseEventList(html, page - 1);
  }

  @tool({
    title: 'Get a Clarice event',
    description:
      'One event at The Clarice Smith Performing Arts Center by slug: description and program notes, every performance date with its hall, prices, venue and seating, content advisories, and the ticketing id for the clarice_tickets tools. No login needed.',
    input: { slug: eventSlug },
    output: eventSchema.shape,
  })
  async get_event({ slug }: { slug: string }): Promise<Event> {
    return parseEvent(await this.getText(`events/${slug}`), slug);
  }
}
