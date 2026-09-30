import makeFetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';
import { z } from 'zod';
import { type Fetcher, request } from '../../lib/http.js';
import { Integration, tool } from '../base.js';
import { parseResults } from './parsers.js';
import {
  type Affiliation,
  AFFILIATIONS,
  affiliation,
  directoryId,
  type Institution,
  institution,
  type Person,
  personSchema,
  type SearchResults,
  searchResultsSchema,
  searchText,
} from './schemas.js';

const ORIGIN = 'https://identity.umd.edu';

/** Fetch with a cookie jar for anonymous searches; the directory needs a JSESSIONID to search. */
const anonymousFetch: Fetcher = makeFetchCookie(fetch, new CookieJar());

const HTML = { accept: 'text/html' };

export class Directory extends Integration {
  readonly name = 'directory';
  readonly baseUrl = ORIGIN;
  /**
   * Signing in adds students to the searchable population and raises the cap to 100. The
   * "Log in" button is a form POST, hence `loginForm`. Since `/search` is also the anonymous
   * page, the browser is only considered signed in once it is back on `/search` after the
   * login POST navigated it away (the auth hub starts waiting only after that navigation).
   */
  override readonly service = {
    name: 'directory',
    loginUrl: `${ORIGIN}/search`,
    loginForm: { login: 'Log in' },
    signedIn: (url: URL) => url.origin === ORIGIN && url.pathname === '/search',
  };

  /** Whether a signed-in directory session is live (students are searchable then). */
  private get signedIn(): boolean {
    const session = this.connection?.session;
    return session !== undefined && !session.expired;
  }

  /** A request to `/search` through the signed-in session when there is one, else anonymously. */
  private searchRequest(init: RequestInit): Promise<Response> {
    return this.signedIn
      ? this.request('search', {}, init)
      : request(this.baseUrl, 'search', {}, init, anonymousFetch);
  }

  /**
   * Runs one search: a GET to (re)establish the session cookie, then the form POST, whose
   * 302 back to `/search` is followed and renders the results held in the session.
   */
  private async runSearch(form: URLSearchParams): Promise<SearchResults> {
    await this.searchRequest({ headers: HTML });
    const res = await this.searchRequest({ method: 'POST', body: form, headers: HTML });
    return parseResults(await res.text());
  }

  @tool({
    title: 'Search the directory',
    description:
      'Search the UMD campus directory for people by last name (prefix; "Pin*" wildcards work), full name, email address, Directory ID or phone number. No login needed for faculty, staff and affiliates (at most 50 results); after login students are included and up to 100 are returned.',
    input: {
      query: z
        .string()
        .trim()
        .min(2)
        .describe('Last name, full name, email, Directory ID or phone number, e.g. "Pines"'),
      sounds_like: z
        .boolean()
        .default(false)
        .describe('Also match last names that sound like the query, e.g. "Pynes" for Pines'),
    },
    output: searchResultsSchema.shape,
  })
  async search({
    query,
    sounds_like,
  }: {
    query: string;
    sounds_like: boolean;
  }): Promise<SearchResults> {
    const form = new URLSearchParams({
      basicSearchInput: query,
      basicSearch: 'Search',
      _lastNameSL: 'on',
    });
    if (sounds_like) form.set('lastNameSL', 'true');
    return this.runSearch(form);
  }

  @tool({
    title: 'Advanced directory search',
    description:
      'Search the UMD campus directory by separate name parts, email, work phone, department, affiliation and institution. At least one of the name, email or phone fields is required; department only narrows another field. No login needed for faculty, staff and affiliates; students are only included after login.',
    input: {
      first_name: searchText.describe('First name'),
      middle_name: searchText.describe('Middle name'),
      last_name: searchText.describe('Last name (prefix match)'),
      email: searchText.describe('Email address'),
      phone: searchText.describe('Work phone, digits or dashed, e.g. "301-405-5803"'),
      department: searchText.describe('Department name to narrow by, e.g. "Computer Science"'),
      affiliations: z
        .array(affiliation)
        .min(1)
        .optional()
        .describe(
          'Affiliations to include (default: faculty, staff and affiliate, plus student when signed in)',
        ),
      institutions: z
        .array(institution)
        .min(1)
        .default(['UMCP'])
        .describe('Institutions to include (default: UMCP only)'),
    },
    output: searchResultsSchema.shape,
  })
  async search_advanced({
    first_name,
    middle_name,
    last_name,
    email,
    phone,
    department,
    affiliations,
    institutions,
  }: {
    first_name?: string | undefined;
    middle_name?: string | undefined;
    last_name?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    department?: string | undefined;
    affiliations?: Affiliation[] | undefined;
    institutions: Institution[];
  }): Promise<SearchResults> {
    if ([first_name, middle_name, last_name, email, phone].every((value) => value === undefined)) {
      throw new Error(
        `${this.name}: directory_search_advanced needs at least one of first_name, middle_name, last_name, email or phone`,
      );
    }
    const form = new URLSearchParams({
      advancedSearch: 'Advanced Search',
      'advancedSearchInputs.firstName': first_name ?? '',
      'advancedSearchInputs.middleName': middle_name ?? '',
      'advancedSearchInputs.lastName': last_name ?? '',
      'advancedSearchInputs.email': email ?? '',
      'advancedSearchInputs.workPhone': phone ?? '',
      'advancedSearchInputs.department': department ?? '',
    });
    const defaults: Affiliation[] = this.signedIn
      ? ['faculty', 'staff', 'affiliate', 'student']
      : ['faculty', 'staff', 'affiliate'];
    for (const kind of affiliations ?? defaults) {
      form.set(`advancedSearchInputs.affiliation['${AFFILIATIONS[kind]}']`, 'true');
    }
    for (const code of institutions) {
      form.set(`advancedSearchInputs.institution['${code}']`, 'true');
    }
    return this.runSearch(form);
  }

  @tool({
    title: 'Get a person',
    description:
      'Look up one person in the UMD campus directory by Directory ID (the part of their email before @umd.edu). No login needed for faculty, staff and affiliates; students are only found after login.',
    input: { directory_id: directoryId },
    output: {
      person: personSchema
        .nullable()
        .describe('The person, or null when the directory has no match'),
    },
  })
  async get_person({ directory_id }: { directory_id: string }): Promise<{ person: Person | null }> {
    const results = await this.search({
      query: `${directory_id}@umd.edu`,
      sounds_like: false,
    });
    return {
      person:
        results.people.find((person) => person.directory_id === directory_id) ??
        results.people[0] ??
        null,
    };
  }
}
