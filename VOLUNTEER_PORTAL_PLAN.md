# Volunteer Contribution Portal — architecture plan

> Not built yet. A login-gated subdomain where volunteers document incidents
> through a structured form instead of editing Google Sheets directly, with
> duplicate-checking and live facility counts — every submission lands in the
> same sheets the existing review process already uses. Planning only, dated
> 2026-08-24.

---

## What was asked for

1. A subdomain with volunteer login credentials.
2. Volunteer picks a section (hospitals, schools, massacres, ...).
3. A list of facilities appears, each showing its current incident count, read
   live from Google Sheets.
4. Volunteer picks a facility → sees that facility's existing incidents,
   filtered and sorted by date.
5. Volunteer checks the date against what's already there, to avoid
   documenting a duplicate.
6. Volunteer fills in a form for the new incident.
7. On submit, the data is added to the correct Google Sheet automatically.
8. A separate volunteer reviews it afterward, directly in the Sheet —
   unchanged from today.

---

## Recommended architecture

Three pieces, minimum:

| Piece | Recommendation |
|---|---|
| Frontend | Plain HTML/JS, no build step, on a subdomain (`contribute.palgenopedia.org`) — a second GitHub Pages site (separate repo) via CNAME, or Cloudflare Pages. Free either way. |
| Auth + backend | One Google Apps Script project, bound to the same spreadsheets the existing sync already writes to, deployed as a Web App with **Execute as: Me, Access: Anyone with a Google account**. |
| Storage | The existing Google Sheets. No new database. |

### Why Apps Script Web App over a custom backend

The alternative is a real service — a Vercel/Cloudflare Workers function, a
Sheets API service account, a proper auth provider (Firebase Auth, Supabase
Auth). That's the more "standard" shape, but strictly more to build and
operate at this scale: a service account's credentials are one more secret to
rotate and one more way to fail silently. `tools/apps-script/github-sync-fix.gs`'s
own history — the `muteHttpExceptions` trap that hid a dead sync for seven
weeks — is a direct warning about exactly that failure mode in this codebase.

The Apps Script route reuses infrastructure and lessons already paid for.
`Access: Anyone with a Google account` *is* the login gate — no password
system to build, store, or leak — and `Session.getActiveUser().getEmail()`
gives a verified identity for free that maps straight onto the existing
`added_by` column.

Reconsider this only if the project later needs SSO, multiple review tiers,
or non-Google volunteers — not before.

**Why not a Google Form:** a bare Form can collect fields, but it can't show
a volunteer "here are this facility's existing incidents, sorted by date"
before they type — that needs a real page with logic behind it.

---

## The volunteer's journey

1. **Sign in with Google.** Access restricted to an allow-list of volunteer
   emails, maintained in a small config sheet the coordinators edit directly.
2. **Choose a section** — Hospitals, Universities, Schools, Religious Sites,
   or Massacres — matching the site's existing `SECTIONS` config in
   `tools/build_records.py`.
3. **Facility list, live counts.** Every facility in that section's sheet,
   each showing its current incident count fetched live via `doGet()` — not
   the site's published count, which lags until the next build.
4. **Pick a facility → see its incidents.** Filtered to that facility, sorted
   newest-first. The volunteer scans this before touching the form — this
   list *is* the duplicate check.
5. **Active duplicate warning.** As the volunteer types a date into the
   new-incident form, the page checks it client-side against the list already
   loaded in step 4. A close match (same date, or same date ± 1 day with a
   similar attack type) surfaces a warning banner before they can submit —
   not just a checkbox they click through.
6. **Fill in the form.** Fields matching the existing incident schema exactly
   (see below) — date, attack type, description, casualties, source URLs,
   media links.
7. **Submit → appended to the Sheet.** `doPost()` validates the payload and
   appends one row to the correct incidents tab. `added_by` is filled
   automatically from the signed-in identity — not typed.
8. **Review, unchanged.** A second volunteer reviews the new row directly in
   the Sheet and fills `reviewed_by`, exactly as today. The portal doesn't
   touch this step.

---

## Data & duplicate-avoidance mechanics

### Column mapping

The form's fields map one-to-one onto the incident columns `PIPELINE.md`
already documents, so a submitted row is indistinguishable from one typed
directly into the sheet:

| Form field | Sheet column | Notes |
|---|---|---|
| Date | `starting_date` | Required; this is what the duplicate check compares against. |
| End date (if range) | `ending_date` | Optional. |
| Attack type | `attack_type` | Dropdown, not free text — keeps it in the seven classes `attack_class()` already groups by, avoiding the 104-spelling problem `build_records.py` already works around. |
| Summary / full account | `description` / `full_discription` | Yes, the second one is misspelled in the live schema — the form field is labeled correctly, only the column name matches the existing (mis)spelling. |
| Source link(s) | `source_url_1` / `source_url_2` | At least one required — ties directly to the sourcing-standard fix already shipped on the main site. |
| Casualty counts | `civilians_killed`, `civilians_injured`, etc. | Numeric, optional, defaults to blank not zero. |
| *(hidden, automatic)* | `added_by` | Filled from the signed-in Google identity, never typed. |

### Do not invent a new `incident_id`

`PIPELINE.md` is explicit: both `id` and `incident_id` are formulas that
count non-blank rows, not stable keys — this already repointed 25 hospital
URLs once when a row was deleted. The portal must append a blank row and let
the sheet's own formula derive the id, exactly like a manually-typed row
does. Do add one new column of your own, e.g. `submission_id` (a UUID
generated client-side), purely so a reviewer can trace "this row came from
this specific portal submission" even after `incident_id` shifts under it
later. That's additive — it doesn't touch anything the existing pipeline
reads.

---

## Section-specific gotchas

**Massacres/historical events use a different schema entirely.**
`build_history.py`'s own docstring is direct about this: a facility has a
list of incidents; a historical event has three summary paragraphs, four
hero label/value pairs, and categorized detail rows (`quick_fact`,
`casualty`, `testimony`, `war_crime`, and six more categories). If Massacres
is in scope for the portal, it needs its own form template — a category
picker plus a content field, not the facility-incident form reused with
different labels.

**The historical workbook isn't wired into the sync yet.** `PIPELINE.md`
flags this as a known, standing gap: the historical spreadsheet is absent
from the Apps Script's `SPREADSHEETS` array, so edits to it currently change
nothing in the repo — the last auto-sync was 2026-06-14. If volunteers
submit massacre details through the portal before this gap is closed, those
submissions land in a sheet nobody currently pulls into the site.
`PIPELINE.md` already has the exact config block to add; closing this is a
prerequisite for including Massacres in the portal, not a portal-side task.

---

## Security & abuse prevention

- **Allow-list, not open sign-up.** The Web App checks the signed-in email
  against a maintained list before accepting any request — anyone outside it
  gets a clear "not an approved volunteer" response, not a silent failure.
- **Server-side validation on every field** in `doPost()` — required fields,
  date format, URL format on source links — never trust what the client
  sent, even though the client also validates for a better experience.
- **Loud failure, not silent.** Direct lesson from `github-sync-fix.gs`: if
  the append to the Sheet fails, the volunteer must see an error, and ideally
  the coordinator gets notified (Apps Script can email on exception). A
  submission that silently vanishes is worse than one that visibly fails.
- **Rate limit per user** (e.g., Apps Script's own quota, or a simple
  counter) — mainly to catch a runaway script or accidental double-submit,
  not because volunteers are an adversarial population.
- **Log every submission** (a hidden audit tab, or Apps Script's own
  execution log) independent of the visible incidents tab, so a bad append
  can be traced and corrected without guessing.

---

## Phased rollout

**Phase 1 — MVP, Hospitals only.** Single schema, most existing incident
volume, best test bed. Google OAuth allow-list, Apps Script Web App, passive
duplicate list (journey step 4), append-only writes, unchanged manual
review. Ship this, use it for a few weeks before extending.

**Phase 2 — Universities, Schools, Religious Sites.** Same schema as
Hospitals, just parameterized by section — mostly config, not new code.
Schools specifically is where this has the most leverage: it's the section
sitting at a 19% indexable ratio for lack of incident data, per the SEO
audit — volunteer-submitted incidents are the direct fix for that, once
reviewed and synced.

**Phase 3 — Massacres, plus the active duplicate-warning check.** Requires
the `SPREADSHEETS` sync gap closed first and its own form template for the
category-based schema. Also the point to add the smarter client-side
duplicate warning from journey step 5, once there's usage data on how often
volunteers actually catch a near-duplicate from the passive list alone.

---

## SEO & LLM ingestion impact

Direct answer: **no impact on the main site's SEO or LLM ingestion**, as
long as the portal is built the way this plan describes — and a real,
positive downstream effect once it's running.

### Why it's safe

This is the same three-part pattern the SEO audit's fix for `Pages/` already
established for this exact site: a sitemap entry says "crawl this,"
`noindex` says "don't index this," and a link is what a crawler actually
finds by browsing. A login-gated portal on a separate subdomain fails all
three by construction, but each is worth enforcing explicitly:

- [ ] Every portal page requires a valid session before rendering any
      content — a crawler without volunteer credentials gets nothing to
      index, full stop. This alone is stronger than any control below.
- [ ] A separate `robots.txt` at the subdomain root (robots.txt is
      per-origin, so the main site's doesn't cover it) with `Disallow: /`.
- [ ] `<meta name="robots" content="noindex, nofollow">` on every portal
      page, as defense-in-depth in case a page is ever reached without auth
      by mistake.
- [ ] No link to the subdomain from any indexed page on the main site — if
      volunteers need to find it, that's an email, a Discord pin, or a link
      from the already-noindexed developer-only pages, never the footer or
      nav.
- [ ] The subdomain never appears in the main site's `sitemap.xml` — it
      wouldn't by default, since `build_sitemap.py` only scans this
      repository, but worth confirming nobody adds it later "for
      completeness."

### The positive effect

Every incident a volunteer documents through this portal, once reviewed,
becomes a new row in the same sheets `build_records.py` already reads —
which means it flows straight into the live pipeline with no new
integration work. More incidents per facility directly raises the
`substantive` bar's pass rate (`bool(incidents) or len(intro)+len(notes) >=
200`), which is precisely the lever the SEO audit identified for Schools'
19% indexable ratio. And it's exactly the specific, per-incident, sourced
content the LLM-ingestion assessment flagged as this site's real structural
advantage over broader news coverage — this portal is a direct, practical
answer to "how do we get more of that."

Build it correctly and it costs the main site nothing on either axis, while
being the single most direct lever available for the two findings both
audits called out as the site's real long-term opportunity.

---

## Open decisions

- **Do volunteers already have Google accounts?** The whole auth-for-free
  approach assumes yes. If a meaningful number don't and won't create one,
  Google OAuth becomes friction instead of simplicity, and the plan needs a
  real auth provider (Firebase Auth, Supabase Auth) instead — more setup,
  but not a large change to everything above it.
- **Expected volunteer count and submission volume?** Apps Script Web Apps
  have execution-time and quota limits (roughly 20,000 URL fetch calls/day,
  6 minutes per execution on a free account). Fine for a small volunteer
  team; worth knowing expected scale before committing.
- **Is Massacres actually in scope for the portal, or facilities only?**
  Determines whether the `SPREADSHEETS` sync gap needs closing before or
  after MVP ships.
- **Who maintains the volunteer allow-list day to day?** A coordinator
  editing a config sheet is the simplest answer, but worth deciding now who
  that person is before the first volunteer needs onboarding.
