# AGENTS.md

Guidance for coding agents working in this repository. Read it in full before changing code.

umd-mcp is a stdio MCP server (TypeScript, ESM, Node >= 26, pnpm) that wraps University of
Maryland web services as tools. README.md is the user-facing reference for the tool
list, the sign-in flow and the "Adding an integration" walkthrough; keep its tool tables in step
with the code.

## Commands

```sh
pnpm dev                 # run the server on stdio with hot reload (tsx watch)
pnpm inspect             # MCP Inspector against src/index.ts — the way to exercise tools by hand
pnpm check               # typecheck + lint + format:check + knip + test (what CI runs, plus build)
pnpm typecheck | lint | lint:fix | format | knip | build
pnpm test                # vitest run
pnpm vitest run path/to/file.test.ts -t "name"   # single test file / test
```

- `pnpm check` must pass before work is done. Run `pnpm format` after editing Markdown tables.
- Tests live in `test/**/*.test.ts` or `src/**/*.test.ts` (there are currently none;
  `passWithNoTests` is on). Vitest transpiles through `tsc` via a plugin in `vitest.config.ts`
  because Vite's transformer can't lower TC39 decorators.
- `knip` fails on unused files, exports and dependencies. `ignoreExportsUsedInFile` is on, so an
  exported schema used in its own file is fine, but an exported type or helper nothing imports
  is not: delete it rather than keep it "for later".
- Commits follow Conventional Commits (commitlint hook) and PR titles are checked too;
  release-please cuts versions. The pre-commit hook runs eslint --fix and prettier via
  lint-staged.
- To verify a tool for real, either run it through `pnpm inspect`, or write a throwaway tsx
  script outside the repo that instantiates the class and calls the method, and check that live
  data parses through the output schema. Don't commit such scripts.

## Architecture

`src/index.ts` → `createServer()` (`src/server.ts`) → `createIntegrations()`
(`src/integrations/index.ts`) instantiates every `Integration` and calls `register(server)`.
**stdout is the MCP transport; log only to stderr.**

**Integration base (`src/integrations/base.ts`).** Each upstream is a subclass with `name`,
`baseUrl`, and methods marked `@tool({ title, description, input, output })` (TC39 decorators,
not legacy). Tool name = `<name with - → _>_<method>`; only `login`/`logout`/`whoami` set an
explicit `name`. `output` is a zod shape that is validated at runtime (extra fields dropped) and
returned as `structuredContent` plus a JSON text block; the decorator's types check the method's
params and return type against the shapes at compile time. Default annotations are
read-only/open-world. `handleError()` turns `AuthRequiredError`, `CasError`, `HttpError` and
`ZodError` into tool error results — don't catch these in tool methods.

**HTTP.** Requests go through `this.get` (JSON) / `this.getText` (HTML) / `this.postForm` /
`this.postJson` / `this.request`, which use `this.fetcher` and the plain functions in
`src/lib/http.ts` (`request`, `getJson`, `getText`). A query value may be an array (the key
repeats); undefined values are dropped, so pass optional filters straight through. A second
upstream host is called with `getJson(origin, path, query, this.fetcher)` rather than a second
code path. Every request times out after a minute; non-2xx statuses become `HttpError` with the
server's own message when it gives one.

**Sign-in (`src/lib/auth.ts`, `session.ts`, `browser.ts`, `integrations/shibboleth`).** An
integration needing UMD SSO declares `service: ServiceSpec`; `register()` calls `connect(spec)`,
which puts it in a module-level registry. The `login` tool launches a headed Chrome/Edge via
playwright-core on a persistent profile (`~/.umd-mcp/browser-profile`), does a CAS login at
`shib.idm.umd.edu` with a one-shot loopback listener, validates the ticket, then visits every
registered service's `loginUrl` and copies its cookies into a per-service `Session`
(tough-cookie jar + fetch-cookie). The session marks itself expired per
`spec.expired`/`signInPage`, after which requests throw `AuthRequiredError` telling the model to
call `login`. `ServiceSpec` options: `loginUrl`, `signedIn` (needed whenever the app's own login
or SSO-redirect pages share its origin), `loginForm`, `loginClick`, `expired`, `signInPage`.
Values tied to a session (CSRF tokens, account ids) use `perSession()`; anonymous flows needing
cookies override `fetcher` with `cookieFetcher()`. Apps that answer a lost session with HTTP 200
and an error code in the body (IMLeagues) throw `AuthRequiredError.expired(...)` from their call
helper. `CANVAS_TOKEN` lets ELMS skip browser sign-in.

- The CAS callback host must be `localtest.dev.umd.edu` (resolves to 127.0.0.1), never
  `localhost` — the IdP's AWS WAF returns a bare 403 for `localhost` service URLs.
- Only CAS/Shibboleth sign-in is supported. Sites with their own username/password form
  (PaperCut at maker.umd.edu, Spektrix patron accounts at The Clarice) don't fit `ServiceSpec`;
  ask before extending it for them.

## Integration layout

```
src/integrations/<name>/
  index.ts      # the Integration subclass and its private helpers/constants, nothing else
  schemas.ts    # input schemas, value tables + z.enum, exported output schemas, inferred types
  mappers.ts    # Raw* upstream payload types and to*() functions (JSON APIs)
  parsers.ts    # parse*() functions over cheerio (scraped HTML); an integration may have both
```

- `planetterp/` is the minimal reference; read two or three similar integrations before writing
  a new one and copy their shape.
- An upstream with public and signed-in halves is two sibling classes with a shared `common.ts`
  beside them: `testudo/soc` + `testudo/portal`, `activeterp/catalog` + `activeterp/member`,
  `imleagues/catalog` + `imleagues/member`. The signed-in class's name ends in `-member` (or is
  the portal) and its README section is marked "(login)". An integration that reads two
  different upstreams for one site is also split into siblings (`clarice/site` +
  `clarice/tickets`).
- `common.ts` holds what both halves share: the site origin, ids, id schemas, the site's call
  mechanics as plain functions that take the `fetcher`.
- Order inside `schemas.ts`: constants and value tables, input schemas, output schemas
  (`xSchema`), then the `export type X = z.infer<typeof xSchema>` block for types something
  imports. No `// ----` banner comments.
- Register the class in `createIntegrations()` and add a `### <name>` table to README.md, both
  in alphabetical order after `shibboleth` (the sign-in tools), a public class before its
  member sibling. Mark the README heading "(login)" when every tool needs sign-in, "(optional
  login)" when sign-in only widens the results (`directory`).

## Tool design

- **Match the API, not the goal.** One tool per upstream endpoint or per entity. Joining calls
  that describe one entity is fine (a bill with its stages; a building with its inventory
  record); joining unrelated APIs is not (no `find_senators`-style tools that fetch "me" and "all
  senators"). The model cross-references between tools itself. When unsure how to split, ask.
- **No page-browsing tools.** Don't add tools that render an informational web page as text
  (`get_page`, `INFO_PAGES`). An MCP tool integrates with a server's data.
- **Write tools say so.** A tool that changes something sets `readOnlyHint: false`, plus
  `destructiveHint: true` when it deletes or cannot be undone, or `idempotentHint: true` when
  repeating it is harmless (see `go`).
- **Exploring as the user.** While probing a site signed in as the user, only fetch read
  endpoints, and inspect responses as shapes (keys and types), not values. Don't touch Testudo
  registration (`dropAdd/*`, waitlist), not even with a GET, which can lock the session.
- **Privacy.** Don't expose other people's contact details (rosters with emails and phones)
  when names and roles already cover the use case.
- **Out of scope:** UMD data that lives in Google Sheets or similar third-party stores, VPN-only
  services (Grouper), and sites where nothing is public and sign-in isn't CAS.
- Filtering and paging done client-side over a full upstream list is fine (and common) when the
  list is small; return `total` alongside the page.

## Schemas and wording

The ~20 integrations read as one voice. Copy existing phrasing rather than inventing new
patterns; a one-off phrasing is a review comment.

- `.describe()` every input and output field. Tool descriptions say what the tool returns, name
  related tools by their full prefixed name (`maps_get_building`), and end with "No login
  needed." or "Requires login.".
- Description idioms: examples as `e.g. "IRB"`; ids as `X id from tool_name, e.g. "..."`;
  nullable fields end `; null when ...`; defaults as `(default: all)` / `(default false)`.
- **Enums for known value sets.** Use a `CODE: 'value'` table, `z.enum(Object.values(TABLE))`,
  and `decode()` / `decodeOrNull()` / `member()` from `src/common.ts` in the mapper, so an
  unexpected upstream value surfaces as a tool error instead of passing through silently.
- Reuse `src/common.ts` schemas in inputs **and** outputs: `term`, `courseId`, `sectionId`,
  `departmentCode`, `weekday`, `isoDate`, `pagination()`, `limit()`, `linkSchema`,
  `tableSchema`, `postalAddressSchema`, `today()`, `CAMPUS_TIME_ZONE`.
- No `.transform()` in schemas; mappers and parsers do conversion.
- Output field names are snake_case and describe the domain, not the upstream's field names.
- Optional parameters are typed `x?: T | undefined` (`exactOptionalPropertyTypes` is on).
- Errors a tool raises itself are `new Error(\`${this.name}: ...\`)` with a message the model can
  act on (e.g. "pass a number").

## Reuse, DRY and dependencies

- **Prefer established npm packages over hand-written code, every time.** Before writing a
  parser, cookie jar, retry loop, date handling, feed reader or pagination helper, find the
  standard package and `pnpm add` it. In use: `cheerio`, `html-to-text`, `date-fns` +
  `@date-fns/tz`, `lodash-es`, `tough-cookie` + `fetch-cookie`, `graphql-request`, `gtfs` +
  `better-sqlite3`, `rss-parser`, `marked`, `qs`, `parse-link-header`, `p-memoize`,
  `expiry-map`, `split-string`. Add a direct dependency rather than work around a missing or
  nested one.
- **Use the shared helpers; never re-implement them locally.**
  - `src/lib/text.ts`: `trimmed`, `collapse`, `lines`, `joinWords`, `numeric`, `list`.
  - `src/lib/html.ts`: `htmlToText`, `htmlToTextOrNull`, `preformattedText`.
  - `src/lib/scrape.ts`: cheerio `text`, `texts`, `textOrNull`, `absoluteUrl`, `links`, `table`,
    `tables`.
  - `src/lib/dates.ts`: `isoDateFrom`, `isoDateTimeFrom` (printed dates to ISO via date-fns
    patterns).
  - `src/lib/http.ts`, `session.ts`, `errors.ts`: requests, `cookieFetcher`, `perSession`,
    `HttpError`, `AuthRequiredError`.
- **Anything a second integration could need belongs in `src/lib` or `src/common.ts`**, as a
  helper or a `ServiceSpec` option — not as a private workaround in one integration. If the same
  schema, helper or call wrapper appears in two files, move it to the nearest shared place
  (`<site>/common.ts` for siblings, `src/common.ts`/`src/lib` for the codebase).
- Fold near-duplicate tool handlers into one private method on the class.
- Keep solutions simple. No temp-file/exit-hook machinery when a dependency does the job, no
  clones of base-class helpers (`patchJson`) when `postJson` with `init.method` works, no
  redundant predicates, no TODOs addressed to the maintainer.
- **No dependency injection for testability.** No constructor parameters, options objects or
  fetch/launch injection points added so tests can swap fakes. Use module-level state and plain
  functions; mock at the boundary (vi.mock) if tests are ever added.

## Comments

- JSDoc on non-obvious constants, helpers and classes: one or two sentences saying what it is
  and why, in the site's terms (e.g. why a layer is filtered, why a header is required).
- Record upstream quirks next to the code that handles them (HTTP 200 refusals, case-mismatched
  keys, flags without which counts come back zero). Don't narrate the obvious.

## Reviewing work

After building or when asked for a pass, review like a senior developer across the whole change:
read every diff (including delegated ones) and ask whether it is the simplest correct, DRY,
readable version; check that new code reuses `src/lib`/`common.ts`; check README tables match
the tools; run `pnpm check`.
