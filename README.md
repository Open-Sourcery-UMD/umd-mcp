# umd-mcp

An [MCP](https://modelcontextprotocol.io) server exposing University of Maryland data: courses
and grades (PlanetTerp, the Schedule of Classes, the Testudo student portal, ELMS), dining
menus and news, Shuttle-UM routes and timetables, athletics, the campus calendar, TerpLink
organizations and events, RecWell facilities, the University Senate, and the campus directory.

## Development

```sh
pnpm install
pnpm dev        # run the server on stdio with hot reload
pnpm inspect    # open the MCP Inspector against the dev server
pnpm test       # run tests
pnpm check      # typecheck + lint + format check + knip (dead code) + tests
pnpm build      # emit dist/
```

## Using with a client

Add to your MCP client config (e.g. Claude Desktop, Claude Code):

```json
{
  "mcpServers": {
    "umd": {
      "command": "node",
      "args": ["/path/to/umd-mcp/dist/index.js"]
    }
  }
}
```

## Signing in

Some UMD services need a signed-in user. The `login` tool opens a browser window that umd-mcp
controls (Chrome or Edge, on its own profile under `~/.umd-mcp/browser-profile`) at the UMD
Shibboleth IdP, with a CAS `service` URL pointing at a one-shot listener on 127.0.0.1. Once the
user finishes signing in (including Duo) the IdP redirects back with a service ticket, which the
server validates against `serviceValidate` to learn who signed in.

While that single sign-on session is fresh, `login` then visits every connected service (see
below) in the same window so each app can set its own session cookie, and copies those cookies
into a per-service `Session`. The window closes by itself. The profile persists, so later logins
are usually silent. `logout` forgets everything and clears the profile's cookies.

Why a browser: CAS only issues a ticket for the service named in the login URL, and each app
turns its ticket into a cookie for its own origin. The only way for the server to hold those
cookies is to be the browser that receives them.

The callback host is `localtest.dev.umd.edu`, a public DNS name UMD IT publishes that resolves
to 127.0.0.1. It is used instead of `localhost` because the IdP sits behind an AWS WAF that
rejects any `service` URL containing `localhost` with a 403.

Environment variables:

- `UMD_MCP_BROWSER`: path to a Chromium executable, if Chrome or Edge are not installed.
- `UMD_MCP_PROFILE_DIR`: where to keep the browser profile.
- `CANVAS_TOKEN`: a Canvas personal access token (from ELMS profile settings). When set, the
  ELMS tools use it as a bearer token and need no browser sign-in.

## Tools

Tool names are `<integration>_<method>`, except the sign-in tools. Integrations marked
"(login)" need the `login` tool first; the rest work anonymously.

### shibboleth

| Tool     | Description                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| `login`  | Sign in with a UMD Directory ID.                                                                                    |
| `logout` | Forget the signed-in user and every service session, and clear the sign-in browser so the next login prompts again. |
| `whoami` | Report the currently signed-in UMD user, or that nobody is signed in, and which services have a live session.       |

### planetterp

| Tool                         | Description                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `planetterp_get_course`      | Look up a UMD course by its code on PlanetTerp.                                                                  |
| `planetterp_list_courses`    | List UMD courses on PlanetTerp in alphabetical order, optionally within one department.                          |
| `planetterp_get_professor`   | Look up a UMD professor or teaching assistant by name on PlanetTerp.                                             |
| `planetterp_list_professors` | List UMD professors and teaching assistants on PlanetTerp in alphabetical order.                                 |
| `planetterp_get_grades`      | Grade distributions from PlanetTerp for a course, a professor, or both, broken down by section.                  |
| `planetterp_search`          | Search PlanetTerp for courses and professors whose code or name contains the query, as the site search bar does. |

### nutrition

| Tool                   | Description                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nutrition_get_menu`   | What a UMD dining hall is serving on a given day, by meal period and station, with allergens and dietary labels for each dish, from nutrition.umd.edu. |
| `nutrition_get_recipe` | The nutrition label for a dish on a UMD dining hall menu: serving size, calories, nutrition facts with daily values, ingredients and allergens.        |

### testudo-soc

| Tool                                   | Description                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testudo_soc_list_terms`               | Terms the UMD Schedule of Classes currently lists (about four: the current term plus the next few).                                                         |
| `testudo_soc_list_departments`         | Departments (four-letter course prefixes) offering courses in a term, from the UMD Schedule of Classes.                                                     |
| `testudo_soc_list_courses`             | Every course a department offers in a term, from the UMD Schedule of Classes: title, credits, grading methods, gen-ed codes, prerequisites and description. |
| `testudo_soc_get_course`               | One course in a term from the UMD Schedule of Classes, with every section: instructors, seat counts, meeting days, times, rooms and delivery method.        |
| `testudo_soc_get_sections`             | Sections of one or more courses in a term, from the UMD Schedule of Classes: instructors, seat counts, meeting days, times, rooms and delivery method.      |
| `testudo_soc_search_courses`           | Search the UMD Schedule of Classes for a term the way its search form does.                                                                                 |
| `testudo_soc_autocomplete_courses`     | Course ids and titles in a term whose id starts with the given text, from the UMD Schedule of Classes autocomplete.                                         |
| `testudo_soc_autocomplete_instructors` | Instructors teaching in a term whose last or first name contains the given text, from the UMD Schedule of Classes autocomplete.                             |
| `testudo_soc_list_gen_ed_categories`   | The general education categories and requirement codes (FSAW, DSHS, DVUP, ...) the UMD Schedule of Classes lists for a term.                                |
| `testudo_soc_list_gen_ed_courses`      | Courses fulfilling one general education requirement in a term, from the UMD Schedule of Classes.                                                           |
| `testudo_soc_list_syllabi`             | Past syllabi on file for a course in the UMD Schedule of Classes syllabus repository: the term and instructor of each.                                      |
| `testudo_soc_get_building`             | Look up a classroom building by the building code and room number a section lists: full name, campus building number and map links.                         |

### testudo (login)

| Tool                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testudo_get_current_term`                  | The current academic term at UMD with its registration status and key dates, from the Testudo student portal.                                                                                                                                                                                                                                                                                                                                                 |
| `testudo_list_terms`                        | Terms the signed-in student can use with a given Testudo feature: "schedule" lists terms with a class schedule (use with testudo_get_schedule), "grades" terms with posted grades, "enrollment_certification" terms an enrollment certification can be ordered for, "graduation" every term a graduation date can fall in, "graduation_application" terms open for a graduation application, and "grade_option" terms with an open pass/fail election window. |
| `testudo_get_schedule`                      | The signed-in student's class schedule for a term from the Testudo student portal: each registered section with its instructors, credits, delivery method and weekly meetings (days, times, building and room).                                                                                                                                                                                                                                               |
| `testudo_get_grades`                        | The signed-in student's grades for a term from the Testudo student portal: final grades once posted, mid-term grades while the term runs, and the semester and cumulative GPA.                                                                                                                                                                                                                                                                                |
| `testudo_get_unofficial_transcript`         | The signed-in student's unofficial transcript from the Testudo student portal, as plain text: transfer credit, every past course with its grade, and current courses.                                                                                                                                                                                                                                                                                         |
| `testudo_get_profile`                       | The signed-in student's contact information on file with the university, from the Testudo student portal: name, email, phone numbers, local and permanent addresses and emergency contact.                                                                                                                                                                                                                                                                    |
| `testudo_get_registration_appointment`      | When the signed-in student may register for classes, from the Testudo student portal: the registration appointment for the upcoming term, any blocks on the account, and the majors, minors and certificates on record.                                                                                                                                                                                                                                       |
| `testudo_get_request_status`                | Status of the official transcript and enrollment certification orders the signed-in student has placed through the Testudo student portal, and any judicial or financial block that would stop new orders.                                                                                                                                                                                                                                                    |
| `testudo_get_graduation_application_status` | The signed-in student's graduation applications from the Testudo student portal: the term applied for, the diploma name and mailing address, and the status of each degree.                                                                                                                                                                                                                                                                                   |
| `testudo_get_grade_options`                 | The grading option (regular or pass/fail) the signed-in student has elected for each course in a term, from the Testudo student portal, with the pass/fail credit totals.                                                                                                                                                                                                                                                                                     |
| `testudo_get_parent_access`                 | Parent or guest accounts the signed-in student has granted access to their Testudo records.                                                                                                                                                                                                                                                                                                                                                                   |

### athletics

| Tool                            | Description                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `athletics_list_sports`         | Every varsity sport at Maryland (the Terps, umterps.com) with the ids the other athletics tools take.                                                 |
| `athletics_list_seasons`        | Past and current seasons a sport has a schedule for, with the schedule id to pass to athletics_get_schedule for a past season.                        |
| `athletics_get_schedule`        | A Maryland team's schedule and results: every game with date, time, opponent, venue, TV/streaming, and the score once played, plus the team's record. |
| `athletics_get_game`            | One Maryland game by id (from athletics_get_schedule or athletics_get_calendar): opponent, venue, media links and result.                             |
| `athletics_get_roster`          | A Maryland team's current roster: players with jersey number, position, class, height, weight, hometown and major, plus the coaching staff.           |
| `athletics_search_players`      | Find current and former Maryland athletes by last name, across all seasons on umterps.com, optionally within one sport.                               |
| `athletics_get_coaches`         | A Maryland team's coaching staff with titles, email, phone and bio page links.                                                                        |
| `athletics_get_news`            | Latest Maryland Athletics news stories, newest first, optionally for one sport.                                                                       |
| `athletics_get_article`         | The full text of a Maryland Athletics news story (game recaps, previews, announcements) by story id.                                                  |
| `athletics_get_calendar`        | Every Maryland game or event in a date range across all sports (or one sport), grouped by day, with opponents, venues, media links and results.       |
| `athletics_get_upcoming_events` | A Maryland team's next few games with date, time, opponent, venue and where to watch.                                                                 |
| `athletics_get_live_scores`     | Maryland games in progress right now with their live scores, as the site reports them; empty when nothing is being played.                            |

### calendar

| Tool                             | Description                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `calendar_search_events`         | Events on the UMD campus calendar (calendar.umd.edu) in a date range, optionally narrowed by full-text query, event type, audience or featured status.                                                             |
| `calendar_get_event`             | One event from the UMD campus calendar by id or slug, with its full description, location, contact and recurrence rule.                                                                                            |
| `calendar_list_categories`       | The event-type, audience and status categories the UMD campus calendar files events under, with the slugs calendar_search_events accepts.                                                                          |
| `calendar_get_academic_calendar` | The approved UMD semester calendars from the Office of the Provost: first and last day of classes, breaks, reading day, final exams, commencement and summer sessions for each academic year, several years ahead. |

### dining

| Tool                    | Description                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dining_get_busy_meter` | Current crowd level (less, moderately or extremely busy) of the three UMD dining halls, from the service behind the "Dining Hall Status" page.      |
| `dining_get_calendar`   | Key dates for the current semester from UMD Dining Services: when dining plans go live, holiday and break hours, closures and Dining Dollar expiry. |
| `dining_get_news`       | The newest posts on dining.umd.edu, mainly "The Dish" monthly newsletter, from its RSS feed.                                                        |

### directory (login)

| Tool                        | Description                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `directory_search`          | Search the UMD campus directory for people by last name (prefix; "Pin*" wildcards work), full name, email address, Directory ID or phone number. |
| `directory_search_advanced` | Search the UMD campus directory by separate name parts, email, work phone, department, affiliation and institution.                              |
| `directory_get_person`      | Look up one person in the UMD campus directory by Directory ID (the part of their email before @umd.edu).                                        |

### elms (login)

| Tool                       | Description                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `elms_whoami`              | The signed-in user as ELMS (Canvas) knows them: name, login id, email and time zone.                                                                                                                               |
| `elms_list_courses`        | The signed-in student's courses on ELMS (Canvas) with term, instructors and current grade standing.                                                                                                                |
| `elms_get_course`          | One ELMS (Canvas) course with its syllabus, front page and the navigation tabs enabled for it, so you know which of assignments, modules, announcements, files or external tools (Zoom, Piazza, Gradescope) exist. |
| `elms_list_assignments`    | Assignments in an ELMS (Canvas) course, ordered by due date, each with the signed-in student's submission status and score.                                                                                        |
| `elms_get_submission`      | The signed-in student's submission for one ELMS (Canvas) assignment: status, score, grade and any instructor comments.                                                                                             |
| `elms_get_grades`          | The signed-in student's current and final scores in every ELMS (Canvas) course they are enrolled in, or in one course.                                                                                             |
| `elms_list_modules`        | The modules of an ELMS (Canvas) course with their items (assignments, files, pages, links) and completion state.                                                                                                   |
| `elms_list_announcements`  | Announcements posted in one or more ELMS (Canvas) courses within a date window (default: the last 14 days).                                                                                                        |
| `elms_get_todo`            | Assignments the signed-in student still needs to submit, as ELMS (Canvas) lists them in the to-do sidebar.                                                                                                         |
| `elms_get_planner`         | Everything due or happening for the signed-in student across all ELMS (Canvas) courses in a date range (default: the next 14 days): assignments, quizzes, announcements, events and notes, with submission status. |
| `elms_get_upcoming_events` | Upcoming calendar events and assignment due dates across all ELMS (Canvas) courses, as the Canvas dashboard shows them.                                                                                            |
| `elms_get_activity_stream` | Recent activity across the signed-in student's active ELMS (Canvas) courses: new announcements, discussion posts, grades and messages.                                                                             |
| `elms_list_conversations`  | The signed-in student's ELMS (Canvas) Inbox: conversations with their subject, participants and last message.                                                                                                      |
| `elms_get_conversation`    | One ELMS (Canvas) Inbox conversation with every message in it.                                                                                                                                                     |

### recwell

| Tool                                 | Description                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recwell_get_facility_alerts`        | Current RecWell facility alerts: holiday and reduced hours, closures and protocol changes, as headed sections with any hours tables.                           |
| `recwell_list_facilities`            | RecWell facilities with a one-paragraph description and link each, grouped as indoor or outdoor.                                                               |
| `recwell_get_facility`               | A RecWell facility's page: description, regular hours of operation per season (one tab per semester, as tables), access rules, rental and parking information. |
| `recwell_get_group_fitness_schedule` | The weekly RecWell group fitness class schedule: class, location, instructor, start and end time and registration link, optionally for one weekday.            |
| `recwell_list_club_sports`           | Every RecWell club sport with its website, contact email and donation page.                                                                                    |

### senate

| Tool                                     | Description                                                                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `senate_list_legislation`                | Bills before the University Senate (senate.umd.edu): the current academic year's legislation with where each bill stands and who is reviewing it, or the archive of past bills back to 2001.                   |
| `senate_get_bill`                        | One University Senate bill by id or document number: the proposal, sponsor, policy link, related bills, and every stage of its history with dates, decisions and the PDFs filed at each stage.                 |
| `senate_list_senators`                   | Current members of the University Senate with the seat, constituency, college and term end of each.                                                                                                            |
| `senate_get_constituent`                 | How the University Senate files a member of the campus community, by UMD Directory ID: their college, department, title, population and constituency.                                                          |
| `senate_list_committees`                 | The University Senate's standing and special committees, the University councils it seats, and past councils and task forces, each with a one-paragraph summary.                                               |
| `senate_get_committee`                   | One University Senate committee, University council, or past council or task force by name: its page as text (charge, chair, contact), current members with seats and colleges, and the bills it is reviewing. |
| `senate_list_past_committee_legislation` | Every bill each University Senate standing committee has reviewed, grouped by committee and academic year back to 2001.                                                                                        |
| `senate_get_committee_meetings`          | A University Senate standing committee's meeting dates and times for an academic year, with the agendas posted for each.                                                                                       |
| `senate_get_meetings`                    | The University Senate meeting schedule for an academic year with the agenda, materials, slides and minutes posted for each meeting, and the years the archive covers.                                          |

### terplink

| Tool                                    | Description                                                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terplink_search_organizations`         | Search the roughly 1,000 active student organizations on TerpLink by name or keyword, optionally within categories from terplink_list_organization_categories. |
| `terplink_get_organization`             | Full profile of one TerpLink student organization: description, email, type, primary contact, social links and mailing address.                                |
| `terplink_list_organization_categories` | The categories TerpLink files student organizations under (Academic, Cultural/Ethnic, Honor Society, ...).                                                     |
| `terplink_search_events`                | Search TerpLink events by keyword, date range, hosting organization, category, theme or perk.                                                                  |
| `terplink_get_event`                    | Full details of one TerpLink event: description, venue or meeting link, hosts, categories, perks and RSVP capacity.                                            |
| `terplink_list_event_categories`        | The categories TerpLink events are tagged with (Academic, Service, Sports and Recreation, ...).                                                                |
| `terplink_get_news`                     | News articles student organizations and departments post on TerpLink, newest first, optionally filtered by keyword or organization.                            |
| `terplink_get_article`                  | One TerpLink news article with its full body as plain text.                                                                                                    |
| `terplink_search_service_opportunities` | Volunteer and community service opportunities listed for UMD students (mirrored from GivePulse), searchable by keyword.                                        |

### transportation

| Tool                                  | Description                                                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transportation_list_routes`          | Every Shuttle-UM bus route in the current timetable (regular routes such as 104 College Park Metro plus event routes), with whether each runs today, from the published GTFS feed.                    |
| `transportation_get_route`            | One Shuttle-UM route with its stops in order (for the most common trip pattern on the given day) and the route polyline, from the published GTFS feed.                                                |
| `transportation_list_stops`           | Shuttle-UM bus stops from the published GTFS feed, filtered by a name fragment or by distance from a point.                                                                                           |
| `transportation_get_stop`             | One Shuttle-UM bus stop with its location and every route that serves it, from the published GTFS feed.                                                                                               |
| `transportation_get_schedule`         | Scheduled departures of a Shuttle-UM route on a date, optionally at one stop, from the published GTFS feed.                                                                                           |
| `transportation_get_service_alerts`   | Current Shuttle-UM system updates and alerts (detours, schedule changes) and the modified-service notices linked from the DOTS schedules page.                                                        |
| `transportation_get_service_calendar` | The Shuttle-UM service calendar for the academic year: for each break, exam week and intersemester period, the dates and whether service is regular or modified, with the notice page for the detail. |

## Adding an integration

An integration is a folder under `src/integrations/` that wraps one upstream and declares the
tools it contributes:

```
src/integrations/example/
  index.ts      # the Integration subclass, and nothing else
  schemas.ts    # input schemas, exported output schemas, and their inferred types
  mappers.ts    # Raw* types for the upstream payloads and the to*() functions (parsers.ts when scraping HTML)
  NOTES.md      # what was learned crawling the upstream: endpoints, shapes, quirks, dead ends
```

Subclass `Integration` from `src/integrations/base.ts`, declare `name` and `baseUrl`, and mark
each tool method with `@tool()`. The MCP tool name is `<name>_<method>` (pass `name` in the
spec to override). Then add the class to `createIntegrations()` in `src/integrations/index.ts`.

```ts
import { z } from 'zod';
import { Integration, tool } from '../base.js';
import { type Building, buildingSchema } from './schemas.js';

export class Example extends Integration {
  readonly name = 'example';
  readonly baseUrl = 'https://example.umd.edu/api';

  @tool({
    title: 'Get campus building',
    description: 'Look up a campus building by its code. No login needed.',
    input: { code: z.string().describe('Building code, e.g. "IRB"') },
    output: buildingSchema.shape,
  })
  async get_building({ code }: { code: string }): Promise<Building> {
    return this.get<Building>(`buildings/${code}`);
  }
}
```

Everything in the spec is advertised to the client so the model knows what a tool does, what
it takes, and what it returns before calling it:

- `description` and `title` are passed through; `annotations` are merged over the defaults
  (read-only, open-world).
- `input` becomes the tool's `inputSchema`. The decorator checks at compile time that the
  method's parameter type accepts the parsed shape.
- `output` (optional) becomes the tool's `outputSchema`. The decorator checks at compile time
  that the method returns a matching object. At runtime the value is validated against the
  shape and returned both as `structuredContent` and as a JSON text block for clients that
  only read text. Fields not in the shape are dropped.

Conventions the existing integrations follow:

- `.describe()` every input and output field; the text ends up in the JSON Schema the model
  reads. End descriptions with "No login needed." or "Requires login.".
- Use `z.enum` wherever the upstream's value set is known, via a `CODE: 'value'` table and
  `decode()` from `src/common.ts`, so an unexpected upstream value surfaces as a tool error.
- Reuse the shared schemas in `src/common.ts` (`term`, `courseId`, `sectionId`, `weekday`,
  `isoDate`, `pagination`, ...) and the helpers in `src/lib/`: `text.ts` (blank-to-null
  trimming, joining), `html.ts` (HTML to plain text), `scrape.ts` (cheerio text, links and
  tables). Reach for an npm package before writing a parser by hand.
- `this.get(path, query)` fetches JSON and `this.getText()` HTML relative to `baseUrl`;
  `this.request()` is the general form for POSTs. HTTP errors and output-schema mismatches
  become tool error results automatically; override `handleError()` to customise that.

### Integrations behind single sign-on

If the upstream needs a UMD login, declare a `service` on the integration. `login` then signs
in to it along with everything else, and `this.get()` / `this.getText()` / `this.request()`
carry the app's cookies. Before the user signs in, or after the app rejects the session, they
throw `AuthRequiredError`, which becomes a tool error telling the model to call `login`.

```ts
export class StudentPortal extends Integration {
  readonly name = 'testudo';
  readonly baseUrl = 'https://app.testudo.umd.edu/services';
  override readonly service = {
    name: 'testudo',
    // Page that sends an anonymous browser through single sign-on and back into the app.
    loginUrl: 'https://app.testudo.umd.edu/main/',
    // Optional: when the browser counts as signed in. Default is "same origin as loginUrl".
    signedIn: (url: URL) => url.hash.startsWith('#/main'),
    // Optional: fields to POST to loginUrl for apps whose sign-in is a button, not a redirect.
    // loginForm: { login: 'Log in' },
  };
}
```

## Project layout

```
src/
  index.ts             # stdio entrypoint
  server.ts            # createServer(): registers every integration
  common.ts            # shared zod schemas and small helpers (terms, course ids, weekdays, enums)
  lib/                 # HTTP helper, sign-in hub (auth.ts), per-service Session, browser driver,
                       # text/HTML/scraping helpers
  integrations/
    base.ts            # Integration base class, @tool decorator, result helpers
    index.ts           # createIntegrations(): instantiate integrations here
    <name>/            # one folder per integration (see above)
    testudo/soc/       # public Schedule of Classes
    testudo/portal/    # student portal (login)
    grouper/NOTES.md   # research only; Grouper is VPN-only and not implemented
```
