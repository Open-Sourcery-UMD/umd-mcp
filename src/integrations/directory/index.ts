import { z } from 'zod';
import { AuthRequiredError } from '../../lib/errors.js';
import { cookieFetcher, type Fetcher, request } from '../../lib/http.js';
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
const anonymousFetch = cookieFetcher();

const HTML = { accept: 'text/html' };

export class Directory extends Integration {
  readonly name = 'directory';
  readonly baseUrl = ORIGIN;
  /**
   * Signing in adds students to the searchable population and raises the cap to 100. The
   * "Log in" button is a form POST, hence `loginForm`. `/search` is also the anonymous page,
   * so the browser only counts as signed in once that POST has taken it away and back.
   */
  override readonly service = {
    name: 'directory',
    loginUrl: `${ORIGIN}/search`,
    loginForm: { login: 'Log in' },
    signedIn: (url: URL) => url.origin === ORIGIN && url.pathname === '/search',
  };

  /** Whether a signed-in directory session is live (students are searchable then). */
  private get signedIn(): boolean {
    return this.connection?.live === true;
  }

  /**
   * Runs one search through `fetcher`: a GET to (re)establish the session cookie, then the
   * form POST, whose 302 back to `/search` is followed and renders the results held in the
   * session.
   */
  private async searchWith(fetcher: Fetcher, form: URLSearchParams): Promise<SearchResults> {
    await request(this.baseUrl, 'search', {}, { headers: HTML }, fetcher);
    const res = await request(
      this.baseUrl,
      'search',
      {},
      { method: 'POST', body: form, headers: HTML },
      fetcher,
    );
    return parseResults(await res.text());
  }

  /**
   * Runs one search through the signed-in session when there is one, else anonymously. The
   * tools work without login, so a session the directory has stopped accepting falls back to
   * the anonymous search instead of asking for `login`.
   */
  private async runSearch(form: URLSearchParams): Promise<SearchResults> {
    if (this.signedIn) {
      try {
        return await this.searchWith(this.fetcher, form);
      } catch (error) {
        if (!(error instanceof AuthRequiredError)) throw error;
      }
    }
    return this.searchWith(anonymousFetch, form);
  }

  @tool({
    title: 'Search the directory',
    description:
      'Search the UMD campus directory for people by last name (prefix; "Pin*" wildcards work), full name, email address, Directory ID or phone number. Faculty, staff and affiliates are always searchable, at most 50 results; students appear only after login, which also raises the cap to 100. No login needed.',
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
      'Search the UMD campus directory by separate name parts, email, work phone, department, affiliation and institution. At least one of the name, email or phone fields is required; department only narrows another field. Students appear only after login. No login needed.',
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
      'Look up one person in the UMD campus directory by Directory ID (the part of their email before @umd.edu). Students appear only after login. No login needed.',
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
    // An email search is exact, so a lone result without a published @umd.edu address is
    // still the person asked for; several results mean the id did not match anyone.
    const { people } = results;
    return {
      person:
        people.find((person) => person.directory_id === directory_id) ??
        (people.length === 1 ? people[0] : undefined) ??
        null,
    };
  }
}
