import { escapeRegExp } from 'lodash-es';
import { z } from 'zod';
import { pagination } from '../../common.js';
import { getJson, HttpError } from '../../lib/http.js';
import { perSession } from '../../lib/session.js';
import { Integration, tool, type ToolResult } from '../base.js';
import { type LinkQuery, linkTableQuery } from './datatable.js';
import {
  describeErrors,
  parseCollections,
  parseCreatedKeyword,
  parseCsrfToken,
  parseJsErrors,
  parseLinkPage,
  parseMembers,
  parseTransferRequests,
  type RawDataTable,
  type RawGroup,
  type RawLinkRow,
  type RawMember,
  type RawUser,
  toLink,
  toMember,
  toUser,
} from './parsers.js';
import {
  type Collection,
  collectionId,
  collectionSchema,
  keyword,
  type Link,
  LINK_SORTS,
  linkSchema,
  type LinkSort,
  linkSort,
  type LinkStats,
  linkStatsSchema,
  type Member,
  memberSchema,
  SITE,
  sortOrder,
  type TransferOutcome,
  transferOutcome,
  type TransferRequest,
  transferRequestId,
  transferRequestSchema,
  type TransferRequests,
  transferRequestsSchema,
  uid,
  type User,
  userId,
  userSchema,
} from './schemas.js';

const JS = 'text/javascript';
const JSON_TYPE = 'application/json';

/**
 * A non-GET request as the site's pages make them: a form POST, a JSON POST or PATCH, or a
 * DELETE without a body.
 */
type Send =
  | { method: 'POST'; form: URLSearchParams }
  | { method: 'POST' | 'PATCH'; json: unknown }
  | { method: 'DELETE' };

/**
 * go.umd.edu is UMD's deployment of Z, the University of Minnesota's Rails link shortener.
 * There is no JSON API for signed-in users (the `/api/v1` one needs a JWT secret from the
 * API page), so the tools drive the same endpoints the site's pages do: a server-side
 * DataTable for the link list, HTML pages for details, JSON for most writes and `.js.erb`
 * responses for the rest. Admin-only pages (all links, stale links, audit log) are left out.
 */
export class Go extends Integration {
  readonly name = 'go';
  readonly baseUrl = `${SITE}/shortener`;
  /**
   * Any page under /shortener bounces an anonymous browser to the sign-in page, which posts
   * itself to the SAML IdP and lands back on the links page once signed in.
   */
  override readonly service = {
    name: 'go',
    loginUrl: `${SITE}/shortener/urls`,
    signedIn: (url: URL) => url.origin === SITE && url.pathname === '/shortener/urls',
    signInPage: (url: URL) => url.pathname === '/shortener/signin',
  };

  /** The CSRF token Rails expects on non-GET requests, read from the links page once per session. */
  private csrfToken = this.csrfTokens();

  /** A fresh per-session memo of the CSRF token; replaced when the site rejects a token. */
  private csrfTokens() {
    return perSession(async () => parseCsrfToken(await this.getText('urls')));
  }

  /**
   * Sends a non-GET request with the CSRF token. A 422 becomes an error carrying the
   * server's validation messages; one without any (Rails' answer to a stale token) is
   * retried once with a fresh token.
   */
  private async send(path: string, how: Send, accept: string, retried = false): Promise<Response> {
    const init: RequestInit = {
      headers: {
        accept,
        'x-csrf-token': await this.csrfToken(this.session),
        'x-requested-with': 'XMLHttpRequest',
      },
    };
    try {
      if ('form' in how) return await this.postForm(path, how.form, init);
      if ('json' in how)
        return await this.postJson(path, how.json, { ...init, method: how.method });
      return await this.request(path, {}, { ...init, method: how.method });
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 422) throw error;
      const messages = describeErrors(error.body);
      if (messages !== null || retried) {
        throw new Error(`${this.name}: ${messages ?? 'the request was rejected'}`, {
          cause: error,
        });
      }
      this.csrfToken = this.csrfTokens();
      return this.send(path, how, accept, true);
    }
  }

  /** One page of the "My Links" table. */
  private linkTable(query: LinkQuery): Promise<RawDataTable<RawLinkRow>> {
    return this.get<RawDataTable<RawLinkRow>>(`urls/datatable.json?${linkTableQuery(query)}`);
  }

  /** The signed-in user's links whose keyword is one of `keywords`, case-insensitively. */
  private async findLinks(keywords: string[]): Promise<Link[]> {
    const page = await this.linkTable({
      match: { keyword: `^(${keywords.map(escapeRegExp).join('|')})$` },
      sort: LINK_SORTS.created,
      order: 'desc',
      start: 0,
      length: keywords.length,
    });
    const wanted = new Set(keywords.map((k) => k.toLowerCase()));
    return page.data.map(toLink).filter((link) => wanted.has(link.keyword.toLowerCase()));
  }

  /** The signed-in user's link with `keyword`; throws when they have none. */
  private async findLink(keyword: string): Promise<Link> {
    const [link] = await this.findLinks([keyword]);
    if (link === undefined)
      throw new Error(`${this.name}: no link "${keyword}" in your collections`);
    return link;
  }

  /** The signed-in user's collection with `id`; throws when they are not in it. */
  private async findCollection(id: number): Promise<Collection> {
    const collection = parseCollections(await this.getText('groups')).find((c) => c.id === id);
    if (collection === undefined) throw new Error(`${this.name}: no collection ${id}`);
    return collection;
  }

  /** The members page of a collection. */
  private async members(collection: number): Promise<Member[]> {
    return parseMembers(await this.getText(`groups/${collection}/members`));
  }

  /** The pending transfer request with `id`, from either callout of the links page. */
  private async findTransferRequest(id: number): Promise<TransferRequest> {
    const { incoming, outgoing } = parseTransferRequests(await this.getText('urls'));
    const request = [...incoming, ...outgoing].find((r) => r.id === id);
    if (request === undefined) throw new Error(`${this.name}: no pending transfer request ${id}`);
    return request;
  }

  /**
   * Calls an endpoint that answers success with a redirect to the links page and failure
   * by re-rendering its form. Returns the validation message, or null on success.
   */
  private async sendForm(path: string, how: Send): Promise<string | null> {
    const res = await this.send(path, how, JS);
    if (new URL(res.url).pathname === '/shortener/urls') return null;
    return parseJsErrors(await res.text()) ?? 'the request was rejected';
  }

  @tool({
    title: 'List my links',
    description:
      "The signed-in user's go.umd.edu short links across every collection they are in, newest first by default. The query matches keywords, destinations and collection names. Requires login.",
    input: {
      query: z.string().trim().min(1).optional().describe('Text to search for, e.g. "advising"'),
      collection: collectionId.optional().describe('Only links in this collection'),
      sort: linkSort,
      order: sortOrder,
      ...pagination(25),
    },
    output: {
      total: z.number().int().describe('Links matching the query'),
      links: z.array(linkSchema).describe('One page of links in the requested order'),
    },
  })
  async list_links({
    query,
    collection,
    sort,
    order,
    limit,
    offset,
  }: {
    query?: string | undefined;
    collection?: number | undefined;
    sort: LinkSort;
    order: 'asc' | 'desc';
    limit: number;
    offset: number;
  }): Promise<{ total: number; links: Link[] }> {
    const page = await this.linkTable({
      search: query,
      match: collection === undefined ? {} : { group_id: `^${collection}$` },
      sort: LINK_SORTS[sort],
      order,
      start: offset,
      length: limit,
    });
    return { total: page.recordsFiltered, links: page.data.map(toLink) };
  }

  @tool({
    title: 'Get a link',
    description:
      "One of the signed-in user's go.umd.edu links with its stats page: destination, collection, note, click counts by hour, day and month, the busiest day and where clicks came from. Requires login.",
    input: { keyword },
    output: linkStatsSchema.shape,
  })
  async get_link({ keyword }: { keyword: string }): Promise<LinkStats> {
    return parseLinkPage(await this.getText(`urls/${keyword}`), keyword);
  }

  @tool({
    title: 'Create a link',
    description:
      "Create a go.umd.edu short link to a URL, with a chosen keyword or a generated one, in the personal space or one of the user's collections. Keywords are letters, digits, dashes and underscores and must be unused. Requires login.",
    input: {
      url: z
        .string()
        .trim()
        .min(1)
        .describe('Destination URL; "http://" is assumed when no scheme is given'),
      keyword: keyword.optional().describe('Keyword to use (default: a generated one)'),
      collection: collectionId
        .optional()
        .describe('Collection to put the link in (default: the personal space)'),
    },
    output: linkSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false },
  })
  async create_link({
    url,
    keyword: wanted,
    collection,
  }: {
    url: string;
    keyword?: string | undefined;
    collection?: number | undefined;
  }): Promise<Link> {
    const form = new URLSearchParams({ 'url[url]': url, 'url[keyword]': wanted ?? '' });
    if (collection !== undefined) form.set('url[group_id]', String(collection));
    const res = await this.send('urls', { method: 'POST', form }, JS);
    const js = await res.text();
    const created = parseCreatedKeyword(js);
    if (created === null) {
      throw new Error(`${this.name}: ${parseJsErrors(js) ?? 'the link was not created'}`);
    }
    return this.findLink(created);
  }

  @tool({
    title: 'Update a link',
    description:
      "Change where one of the signed-in user's go.umd.edu links points, rename its keyword, move it to another collection or edit its note. Only the fields given change. Requires login.",
    input: {
      keyword: keyword.describe('Keyword of the link to change'),
      url: z.string().trim().min(1).optional().describe('New destination URL'),
      new_keyword: keyword.optional().describe('New keyword; the old short link stops working'),
      collection: collectionId.optional().describe('Collection to move the link to'),
      note: z.string().trim().max(1000).optional().describe('New note; "" removes it'),
    },
    output: linkSchema.shape,
    annotations: { readOnlyHint: false, idempotentHint: true },
  })
  async update_link({
    keyword,
    url,
    new_keyword,
    collection,
    note,
  }: {
    keyword: string;
    url?: string | undefined;
    new_keyword?: string | undefined;
    collection?: number | undefined;
    note?: string | undefined;
  }): Promise<Link> {
    if ([url, new_keyword, collection, note].every((value) => value === undefined)) {
      throw new Error(
        `${this.name}: go_update_link needs at least one of url, new_keyword, collection or note`,
      );
    }
    const link = await this.findLink(keyword);
    const changes = { url, keyword: new_keyword, group_id: collection, note };
    await this.send(`urls/${link.id}`, { method: 'PATCH', json: { url: changes } }, JSON_TYPE);
    return this.findLink(new_keyword ?? keyword);
  }

  @tool({
    title: 'Delete a link',
    description:
      "Delete one of the signed-in user's go.umd.edu links; the short link stops working and its click history is lost. Returns the link as it was. Requires login.",
    input: { keyword },
    output: linkSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true },
  })
  async delete_link({ keyword }: { keyword: string }): Promise<Link> {
    const link = await this.findLink(keyword);
    await this.send(`urls/${link.id}`, { method: 'DELETE' }, JSON_TYPE);
    return link;
  }

  @tool({
    title: 'Get a QR code',
    description:
      "A PNG QR code that opens one of the signed-in user's go.umd.edu links, as the site offers for download. Requires login.",
    input: { keyword },
  })
  async get_qr_code({ keyword }: { keyword: string }): Promise<ToolResult> {
    const res = await this.request(
      `urls/${keyword}/download_qrcode`,
      {},
      {
        headers: { accept: 'image/png' },
      },
    );
    if (!(res.headers.get('content-type') ?? '').startsWith('image/png')) {
      throw new Error(`${this.name}: no link "${keyword}" in your collections`);
    }
    const data = Buffer.from(await res.arrayBuffer()).toString('base64');
    return { content: [{ type: 'image', data, mimeType: 'image/png' }] };
  }

  @tool({
    title: 'List my collections',
    description:
      'The collections the signed-in user is in on go.umd.edu, with how many links and members each has. A collection is a shared space whose members all manage its links; links outside any collection are in the personal space. Requires login.',
    input: {},
    output: {
      collections: z
        .array(collectionSchema)
        .describe('Collections in the order the site lists them'),
    },
  })
  async list_collections(): Promise<{ collections: Collection[] }> {
    return { collections: parseCollections(await this.getText('groups')) };
  }

  @tool({
    title: 'Create a collection',
    description:
      'Create a go.umd.edu collection with the signed-in user as its first member. Requires login.',
    input: {
      name: z.string().trim().min(1).describe('Collection name'),
      description: z.string().trim().optional().describe('Description'),
    },
    output: collectionSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false },
  })
  async create_collection({
    name,
    description,
  }: {
    name: string;
    description?: string | undefined;
  }): Promise<Collection> {
    const group = { name, description: description ?? '' };
    const res = await this.send('groups', { method: 'POST', json: { group } }, JSON_TYPE);
    const { id } = (await res.json()) as RawGroup;
    return this.findCollection(id);
  }

  @tool({
    title: 'Update a collection',
    description:
      "Rename one of the signed-in user's go.umd.edu collections or change its description. Only the fields given change. Requires login.",
    input: {
      collection: collectionId,
      name: z.string().trim().min(1).optional().describe('New name'),
      description: z.string().trim().optional().describe('New description; "" removes it'),
    },
    output: collectionSchema.shape,
    annotations: { readOnlyHint: false, idempotentHint: true },
  })
  async update_collection({
    collection,
    name,
    description,
  }: {
    collection: number;
    name?: string | undefined;
    description?: string | undefined;
  }): Promise<Collection> {
    if (name === undefined && description === undefined) {
      throw new Error(`${this.name}: go_update_collection needs a name or a description`);
    }
    const group = { name, description };
    await this.send(`groups/${collection}`, { method: 'PATCH', json: { group } }, JSON_TYPE);
    return this.findCollection(collection);
  }

  @tool({
    title: 'Delete a collection',
    description:
      "Delete one of the signed-in user's go.umd.edu collections. The site refuses while the collection still has links; move or delete them first. Returns the collection as it was. Requires login.",
    input: { collection: collectionId },
    output: collectionSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true },
  })
  async delete_collection({ collection }: { collection: number }): Promise<Collection> {
    const found = await this.findCollection(collection);
    const res = await this.send(`groups/${collection}`, { method: 'DELETE' }, JSON_TYPE);
    // The site answers with an empty 204 instead of deleting when links remain.
    if (res.status === 204) {
      throw new Error(
        `${this.name}: collection ${collection} still has links; move or delete them first`,
      );
    }
    return found;
  }

  @tool({
    title: 'List collection members',
    description:
      "The people who can manage the links in one of the signed-in user's go.umd.edu collections. Requires login.",
    input: { collection: collectionId },
    output: { members: z.array(memberSchema).describe('Members in the order the site lists them') },
  })
  async list_collection_members({
    collection,
  }: {
    collection: number;
  }): Promise<{ members: Member[] }> {
    return { members: await this.members(collection) };
  }

  @tool({
    title: 'Add a collection member',
    description:
      "Give a UMD person access to one of the signed-in user's go.umd.edu collections, by Directory ID. Use go_lookup_users to find it. Requires login.",
    input: { collection: collectionId, uid },
    output: memberSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false },
  })
  async add_collection_member({
    collection,
    uid,
  }: {
    collection: number;
    uid: string;
  }): Promise<Member> {
    const res = await this.send(
      `groups/${collection}/members`,
      { method: 'POST', json: { uid } },
      JSON_TYPE,
    );
    return toMember((await res.json()) as RawMember);
  }

  @tool({
    title: 'Remove a collection member',
    description:
      "Take a person's access to one of the signed-in user's go.umd.edu collections away. Returns the member as they were listed. Requires login.",
    input: { collection: collectionId, user: userId },
    output: memberSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true },
  })
  async remove_collection_member({
    collection,
    user,
  }: {
    collection: number;
    user: number;
  }): Promise<Member> {
    const member = (await this.members(collection)).find((m) => m.id === user);
    if (member === undefined) {
      throw new Error(`${this.name}: no member ${user} in collection ${collection}`);
    }
    await this.send(`groups/${collection}/members/${user}`, { method: 'DELETE' }, JSON_TYPE);
    return member;
  }

  @tool({
    title: 'Look up users',
    description:
      "Find UMD people by name or Directory ID in go.umd.edu's own people search, to get the Directory ID that go_add_collection_member and go_transfer_links take. An exact Directory ID match comes first, then up to ten others. No login needed.",
    input: {
      query: z.string().trim().min(2).describe('Name or Directory ID, e.g. "Pines" or "djpines"'),
    },
    output: { users: z.array(userSchema).describe('Matching people') },
  })
  async lookup_users({ query }: { query: string }): Promise<{ users: User[] }> {
    // The one endpoint under /shortener the site serves anonymously, so it is called with a
    // plain fetch; should that change, `getJson` reports the sign-in page as not JSON.
    const hits = await getJson<RawUser[]>(this.baseUrl, 'lookup_users', { search_terms: query });
    return { users: hits.map(toUser) };
  }

  @tool({
    title: 'List transfer requests',
    description:
      'Pending offers to hand go.umd.edu links between people: links others offered the signed-in user, and links the user offered others. Links in a pending offer are hidden from go_list_links until it is answered. Requires login.',
    input: {},
    output: transferRequestsSchema,
  })
  async list_transfer_requests(): Promise<TransferRequests> {
    return parseTransferRequests(await this.getText('urls'));
  }

  @tool({
    title: 'Transfer links',
    description:
      "Offer some of the signed-in user's go.umd.edu links to another UMD person, who then owns them once they accept. Offering links to yourself moves them to your personal space at once. Requires login.",
    input: {
      keywords: z.array(keyword).min(1).describe('Keywords of the links to hand over'),
      to: uid.describe('Directory ID of the person to give the links to'),
    },
    output: {
      outcome: transferOutcome.describe(
        '"pending" until the person accepts, "approved" when the site moved the links at once',
      ),
      request: transferRequestSchema
        .nullable()
        .describe(
          'The pending request, which go_reject_transfer_request can take back; null when approved',
        ),
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
  })
  async transfer_links({
    keywords,
    to,
  }: {
    keywords: string[];
    to: string;
  }): Promise<{ outcome: TransferOutcome; request: TransferRequest | null }> {
    const owned = new Set(
      (await this.findLinks(keywords)).map((link) => link.keyword.toLowerCase()),
    );
    const missing = keywords.filter((k) => !owned.has(k.toLowerCase()));
    if (missing.length > 0) {
      throw new Error(
        `${this.name}: no link ${missing.map((k) => `"${k}"`).join(', ')} in your collections`,
      );
    }
    const form = new URLSearchParams({ 'transfer_request[to_group]': to });
    for (const k of keywords) form.append('keywords[]', k);
    const error = await this.sendForm('transfer_requests', { method: 'POST', form });
    if (error !== null) throw new Error(`${this.name}: ${error}`);
    const wanted = new Set(keywords.map((k) => k.toLowerCase()));
    const { outgoing } = parseTransferRequests(await this.getText('urls'));
    const request = outgoing.find((r) =>
      r.links.every((link) => wanted.has(link.keyword.toLowerCase())),
    );
    return request === undefined
      ? { outcome: 'approved', request: null }
      : { outcome: 'pending', request };
  }

  /** Answers a pending transfer request and returns it with the outcome. */
  private async answerTransferRequest(
    id: number,
    path: string,
    how: Send,
    outcome: TransferOutcome,
  ): Promise<TransferRequest & { outcome: TransferOutcome }> {
    const found = await this.findTransferRequest(id);
    const error = await this.sendForm(path, how);
    if (error !== null) throw new Error(`${this.name}: ${error}`);
    return { ...found, outcome };
  }

  @tool({
    title: 'Accept a transfer request',
    description:
      'Accept links another person offered the signed-in user on go.umd.edu; they move to the personal space. Requires login.',
    input: { request: transferRequestId },
    output: { ...transferRequestSchema.shape, outcome: transferOutcome },
    annotations: { readOnlyHint: false, destructiveHint: true },
  })
  async accept_transfer_request({
    request,
  }: {
    request: number;
  }): Promise<TransferRequest & { outcome: TransferOutcome }> {
    return this.answerTransferRequest(
      request,
      `transfer_requests/${request}/confirm`,
      { method: 'POST', form: new URLSearchParams() },
      'approved',
    );
  }

  @tool({
    title: 'Reject a transfer request',
    description:
      'Turn down links another person offered the signed-in user on go.umd.edu, or take back an offer the user made that has not been accepted; the links stay where they were. Requires login.',
    input: { request: transferRequestId },
    output: { ...transferRequestSchema.shape, outcome: transferOutcome },
    annotations: { readOnlyHint: false, destructiveHint: true },
  })
  async reject_transfer_request({
    request,
  }: {
    request: number;
  }): Promise<TransferRequest & { outcome: TransferOutcome }> {
    return this.answerTransferRequest(
      request,
      `transfer_requests/${request}`,
      { method: 'DELETE' },
      'rejected',
    );
  }
}
