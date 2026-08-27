# PalGenoPedia build pipeline

How data gets from a Google Sheet to an indexed page. Written as handoff
context — paste it into a new session before asking for changes.

Last verified: 2026-08-28.

---

## The shape of it

```
Google Sheets (English, hand-entered)
    │
    │  ① formulas in the same workbook
    ▼
_de / _ar tabs  (GOOGLETRANSLATE + VLOOKUP — fully derived, nothing typed)
    │
    │  ② Apps Script: syncAll()  → GitHub Contents API
    ▼
CSV files committed to main
    │
    │  ③ GitHub Actions: build-records.yml, on any push touching a CSV
    │     build_records.py   → war-crimes facility records + data/record-pages.json
    │     build_history.py   → historical + current-genocide event records
    │                          + the timeline (= the massacres section index)
    │     regenerate.py      → data/events.json + .csv + .ndjson, JSON-LD, feeds
    │     seo_inject.py      → the <head> SEO block on every hand-authored page
    │     build_sitemap.py   → sitemap.xml
    │  → commits the whole regenerated output back to main
    ▼
static HTML + data/ + feeds + sitemap
    │
    │  ④ GitHub Pages redeploys from that commit
    ▼
palgenopedia.org
```

Nothing is compiled at request time. **What is committed is exactly what is
served.** There is no bundler, no framework, no server. Every path in a page
resolves at runtime relative to that *page*, not to the file the string was
written in.

**The Sheet is the only thing anyone edits.** Every `.html`, everything under
`data/`, the feeds and the sitemap are regenerated from the CSVs by the
Action and must never be hand-edited — the next run overwrites them. The
hand-authored surfaces are a fixed ~19-page set (the two hubs, the six
war-crimes stat pages, hunger-crisis-stats, methodology, volunteer, 404, the
translation JSON) plus the redirect stubs.

---

## ① Source: four Google Sheets workbooks

| section | spreadsheet ID | facilities tab | incidents tab |
|---|---|---|---|
| Hospitals | `1JUJTf0sdPo4o-DluzuwjMOMAc6Fhe4k9kFv-UIXyMg4` | `Hospital_facilities` | `Hospital_incidents` |
| Universities | `1USy-ZPTwzio49_yKkkc-5WPOscIBDa5tetRZ8NTWZFo` | `University_facilities` | `University_incidents` |
| Schools | `1NuD4YMqCwUZyCDE4r0xHyzBdWod9WFH-cEuN6eP7LWw` | `Schools_facilities` | `Schools_incidents` |
| Religious sites | `1_zn0gHo2XlEoQFHtPwNxJG6pFvYiK9WbYiR-6thxj7A` | `Religous_facilities` | `Religous_incidents` |

Each workbook also holds four translation tabs: `<base>_de` and `<base>_ar`
for both facilities and incidents.

A fifth workbook holds the historical + current-genocide events, on a
different data model — see **⑤ Historical events** below. It **is** in the
Apps Script `SPREADSHEETS` config now and syncs like the rest.

| section | spreadsheet ID | events tab | details tab |
|---|---|---|---|
| Historical events | `1fTNCpO6vhsRZz_OrHNs7b4B7aVotfcA0XH8yygybkPo` | `Events` | `Details` |

**Two spelling traps, both load-bearing:**

- The religious tab is spelled **`Religous`** (missing the `i`). The export
  carries it through to `Religous_facilities.csv`. Renaming it in the sheet
  breaks the sync, so the typo stays in the filenames and nowhere else.
- The schools *tab* is plural (`Schools_facilities`) but the *file* it exports
  to is singular (`School_facilities.csv`). That mapping lives in the Apps
  Script config, not in the generator.

### Key columns

Facilities: `id` `name` `type` `sub_type` `governorate` `area` `lat` `lng`
`beds_pre_war` `specialization` `pre_war_status` `post_war_status`
`introduction` `notes` `Image_url`

Incidents: `incident_id` `facility_id` `facility_name` `starting_date`
`ending_date` `attack_type` `result` `description` `full_discription`
`source_url_1` `source_url_2` `archived_resources` `has_image` `image_url`
`archived_image` `video_url` `archived_video` `civilians_killed`
`civilians_injured` `hw_killed` `hw_injured` `added_by` `reviewed_by`

> `full_discription` is misspelled in the source and the generator reads it
> under that name. Do not "fix" it on one side only.

### `id` and `incident_id` are NOT stable

Both are formulas that count non-blank rows. Delete a facility and every id
below it slides onto a *different* record. This is not theoretical — it
happened on 2026-08-23 and briefly repointed 25 of 49 hospital URLs.

Consequences, all already handled:

- **URLs are keyed on names, not ids.** See ③.
- **Incident URL fragments** are built from date + attack type, never from
  `incident_id`.
- A `uid` column exists in `tools/apps-script/assign-uids.gs` for a
  write-once key. It was trialled and removed; the site runs without it. The
  generator reads it if present and falls back to names if absent.

---

## ② Translation: derived, not typed

The `_de` and `_ar` tabs pull each field by lookup and run it through
`GOOGLETRANSLATE`. Measured coverage is **100.0% with zero untranslated
cells** across ~1,100 cells — that is a formula signature, not hand work.

**For the facility sheets the translation join cannot drift.** When a base id
shifts, the translation shifts with it, because both regenerate together on
every recalculation. That is why no stable key is needed there. The `_anchor`
column in the *facility* translation tabs is the facility **name** — a
readability helper, not a key.

**The historical workbook is different — its translation tabs DO drift, and
`_anchor` IS the join key there.** `Events_de` / `Details_de` (and `_ar`)
carry a self-counting `id` / `detail_id` formula that fell ~28 rows behind the
base once the 80 current-genocide detail rows were added — base `DET-1291`
then matched a delta row holding the translation of `DET-1256`, and current
events briefly showed German text from unrelated events. Those tabs carry an
`_anchor` column holding the **base id verbatim** (1370/1370 coverage), and
`build_history.py` joins on it:
`merge_translations(..., trans_key="_anchor")`. Do not revert that.

**If you ever hand-correct a translation**, that cell becomes the only copy of
that text and needs a stable anchor — do it in a separate overrides tab keyed
on `_anchor`, not by typing into the derived sheet.

---

## ③ Export: Apps Script → GitHub

Lives in the **Hospitals** workbook's bound Apps Script project.

| function | role |
|---|---|
| `syncAll()` | walks the `SPREADSHEETS` config, exports every tab, pushes each |
| `sheetToCsv(sheet)` | full export, all columns |
| `sheetToCsvFiltered(sheet)` | translation tabs; drops `(English — reference)` columns |
| `pushToGitHub(path, csv)` | one commit per file via the Contents API |

Repo-side helpers in `tools/apps-script/`:

- `assign-uids.gs` — write-once `uid` column, counter in Script Properties.
  Not currently applied.
- `github-sync-fix.gs` — `testGitHubAuth()` plus a `pushToGitHub` that throws
  on a failed write.

### The silent-failure trap

The original `pushToGitHub` set `muteHttpExceptions: true` and never read the
PUT's response code. When the PAT expired on 2026-07-07, `syncAll()` kept
reporting "Execution completed" while writing nothing — **seven weeks of green
ticks over a dead sync.** Use the version in `github-sync-fix.gs`, which
throws.

### Token

A fine-grained PAT with **Contents: Read and write** on
`PalGenoPedia/PalGenoPedia`. Store it in **Project Settings → Script
Properties** as `GITHUB_TOKEN` — never in the code. (A `storeToken()` function
with a hardcoded token existed and should stay deleted.)

Tokens expire. When the sync goes quiet, run `testGitHubAuth()` first:

```
GET /user  -> 200  authenticated as PalGenoPedia
GET /repos/PalGenoPedia/PalGenoPedia -> 200  push permission: true
```

`401` = expired. `200 /user` + `404` repo = fine-grained token not granted
this repo.

### The historical workbook (in the sync since 2026-08-27)

One block in `SPREADSHEETS`, on the same Hospitals Apps Script project:

```javascript
  {
    id: '1fTNCpO6vhsRZz_OrHNs7b4B7aVotfcA0XH8yygybkPo',
    sheets: {
      'Events':  'Pages/Historical_Massacres/events.csv',
      'Details': 'Pages/Historical_Massacres/details.csv',
    },
    translationSheets: {
      'Events_de':  'Pages/Historical_Massacres/events_de.csv',
      'Events_ar':  'Pages/Historical_Massacres/events_ar.csv',
      'Details_de': 'Pages/Historical_Massacres/details_de.csv',
      'Details_ar': 'Pages/Historical_Massacres/details_ar.csv',
    }
  },
```

Editing that sheet + `syncAll()` now publishes the generated event pages, the
timeline, **and** `data/events.json` + the feeds + JSON-LD (see ④).

---

## ④ Generate: GitHub Actions

`.github/workflows/build-records.yml`

Fires on push to `main` touching:

```
Pages/War_Crimes_Stats/**/*.csv
Pages/Historical_Massacres/*.csv
tools/build_records.py   tools/build_history.py   tools/build_sitemap.py
tools/regenerate.py      tools/seo_inject.py
js/record-page.js        Styles/record-page.css
```

Runs the five generators **in this order** (each reads the previous one's
output), then commits everything back to `main`:

```
build_records.py  →  build_history.py  →  regenerate.py  →  seo_inject.py  →  build_sitemap.py
```

`concurrency: cancel-in-progress: true` — a sync makes many commits and each
fires the workflow; only the last matters, every run is a full regeneration.

### The tools

| # | script | reads | writes |
|---|---|---|---|
| 1 | `build_records.py` | facility CSVs | `war-crimes/**`, `_records_manifest.json`, `data/record-pages.json` |
| 2 | `build_history.py` | `Pages/Historical_Massacres/{events,details}.csv` (+ `_de`/`_ar`), `partials/timeline-shell.html` | `historical-events/massacres/**` — one record page per event (1948→present) + the timeline at `massacres/{,/de,/ar}/index.html`; `_history_manifest.json` |
| 3 | `regenerate.py` | the same historical CSVs + `_history_manifest.json` | **`data/events.json`** + `data/events.csv` + `data/events.ndjson`, `data/*.jsonld`, `data/jsonld/**`, `feed.xml`, `feed.rss` |
| 4 | `seo_inject.py` | `data/events.json` + hand-authored pages | marker-delimited `<head>` block (canonical, OG, feed links, JSON-LD) in each hand-authored page |
| 5 | `build_sitemap.py` | served pages + both manifests | `sitemap.xml` |
| — | `tree_gen.py` | the repo | `tools/tree_map.txt` (not in CI) |

All stdlib-only, all idempotent. Whole chain locally:

```bash
python tools/build_records.py && python tools/build_history.py && \
python tools/regenerate.py && python tools/seo_inject.py && python tools/build_sitemap.py
```

`--check` reports without writing (`build_records`, `build_history`,
`seo_inject`). `--reslug` forces new slugs (breaks live URLs). `--only <section>`
limits `build_records`.

**`data/events.json` is an OUTPUT.** It used to be the hand-maintained
canonical source. Since 2026-08-27 the CSVs are canonical and `regenerate.py`
*builds* it — deriving `period` (date ≥ `2023-10-07` → `current`), casualty
`min`/`max`/`estimate` from the raw strings, `sources[]` + `war_crimes[]` from
`details.csv`, `verification_status` hardcoded `"verified"`, dataset metadata
from constants in the script.

### Adding a section

One config block in `SECTIONS` at the top of `build_records.py`:

```python
"religious-sites": {
    "dir": "Pages/War_Crimes_Stats/stat-religious-attacked",
    "facilities": "Religous_facilities",
    "incidents": "Religous_incidents",
    "hub": "/Pages/War_Crimes_Stats/stat-religious-sites.html",
    "schema_type": "PlaceOfWorship",
    "types": ("mosque", "historic mosque", ...),   # lowercased allow-list
    "group": "war-crimes",
    "seg": "religious-sites",
    "label": {"en": ..., "de": ..., "ar": ...},
    "noun":  {"en": ..., "de": ..., "ar": ...},
},
```

`types` is an allow-list because the sheets overlap — `Hospital_facilities.csv`
carries mosques and universities too. Without it the same record would publish
at two URLs.

`hub` names the **interactive** page (the developers' view) each section was
generated from. As of 2026-08-24 nothing renders a link to it — the sidebar's
"← Interactive database" link was removed and `page_subheader()`'s
`back_href`/`back_label` are passed `None` on every tab/section-index page.
`hub` now only documents the correspondence (see the comment at
`build_records.py:769`); the field is not dead weight to delete, but nothing
reads it for output. Breadcrumbs use the generated section index, and the
interactive pages themselves are `noindex, follow` and reachable only by
direct URL — see **Pages/ is now developer-only** below.

---

## URL structure

```
/war-crimes/                                  hub (was war-crimes-stats.html)
/war-crimes/<section>/                        section index, EN
/war-crimes/<section>/<slug>/                 record, EN
/war-crimes/<section>/de/<slug-de>/           record, DE  (localised slug)
/war-crimes/<section>/ar/<slug-ar>/           record, AR  (Arabic script slug)
/war-crimes/<section>/{overview|incidents|timeline|statistics|resources}/
/war-crimes/<section>/de/{tab}/               tabs per language
```

Plus six hand-authored, API-driven pages sharing the same scheme (and one
more hand-authored surface, `/hunger-crisis-stats.html`, reached from the
nav's Hunger Crisis link):

```
/war-crimes/civilian-casualties/     /war-crimes/journalists-killed/
/war-crimes/children-killed/         /war-crimes/medical-personnel/
/war-crimes/total-starvation/        /war-crimes/children-starvation/
```

Each keeps its own data at `<page>/data/`. The last two moved from
`Pages/Hunger_Crisis/` on 2026-08-24; `children-starvation/data/` is shared
by both pages (not split per-page) because both read from it. Their
breadcrumb parent is overridden in `seo_inject.py`'s `BREADCRUMB_PARENT` to
"Hunger Crisis Statistics" ahead of the generic `war-crimes/` entry — URL
folder and topical parent aren't the same thing here.

And the historical half:

```
/historical-events/                            hub (was historical-events.html)
/historical-events/ethnic-cleansing/           418 villages, one page, not generated
/historical-events/massacres/                  the interactive Timeline / Map / List
                                               — this IS the section index (generated)
/historical-events/massacres/{de,ar}/          same, DE / AR
/historical-events/massacres/<slug>/           event record page, EN
/historical-events/massacres/{de,ar}/<slug>/   event record page, DE / AR
/historical-events/massacres/timeline.html     redirect stub → /historical-events/massacres/
                                               (old /major-incidents-timeline.html also stubs here)
/historical-events/testimonies/                hand-authored, self-contained (no data/ folder)
```

**The timeline is the section index (since 2026-08-28).** `build_history.py`
`render_index()` fills `partials/timeline-shell.html` (the interactive
Timeline/Map/List skeleton, extracted from the old hand-authored page) with a
per-language `<head>` and a **static `<ol class="timeline-static">` of every
event** inside `#timeline-embed`. `dual-timeline-manager.js` empties that
container and rebuilds it on load — the static list is the no-JS / crawler
baseline. The old card grid is gone. `timeline-shell.html` lives under
`partials/` so `seo_inject.py` / `build_sitemap.py` skip it; the generated
`index.html` carries its own canonical + `ItemList` JSON-LD.

`testimonies/` moved from `Pages/quotes-archive-page.html` on 2026-08-24 — the
last live, indexed page still sitting under `Pages/`. It has no CSV or shared
data dependency, so the move was just a relocation plus an `seo_inject.py`
re-run.

Event slugs are the same string in all three languages: `event_name` has no
translated column, so there is nothing per-language to slug from. The
language still gets its own directory — the content differs and each needs
its own canonical.

Incident deep links: `…/<slug>/#incident-2025-08-02-artillery-shelling`
— date + attack type, collision-suffixed with a content digest. Never the
`incident_id`.

### Current output

| section | facilities / events | incidents / details | pages | indexable |
|---|---|---|---|---|
| hospitals | ~51 | ~308 | ~168 | ~123 |
| universities | ~13 | ~50 | ~54 | ~51 |
| schools | ~27 | few | ~96 | ~18 |
| religious-sites | ~20 | ~25 | ~75 | ~60 |
| massacres | **27 events** (17 historical + 10 current-genocide) | ~1,370 details | 84 event pages + 3 timeline index pages | all |

`sitemap.xml`: ~367 URLs (14 static, 5 data files, ~348 record pages) —
excludes the `NOINDEX_PATHS` entries under `Pages/` and every redirect stub.
Exact counts shift with the CSVs; the build prints them.

Schools is mostly stubs on purpose — see *indexability* below.

---

## ⑤ Historical events

A different data model, so a different generator. `build_records.py` renders a
*facility* with a list of *incidents*. An *event* is up to three summary
paragraphs plus a set of categorised prose blocks. `build_history.py` imports
`build_records` for the shell, header, slugs, escaping and CSV handling, so
the two cannot drift. It owns the event render, the timeline index, and
(indirectly, via `regenerate.py` reading the same CSVs) `data/events.json`.

### Data

`events.csv` — **27 rows** (17 historical `hist0NN` + 10 current-genocide
`curr_0NN`, split by `date_start` ≥ `2023-10-07`). Columns:
`id` `event_name` `event_type` `date_start` `date_end` `date_context`
`deaths` `injured` `forced_displacement` `location_lat` `location_lng`
`location_historical` `location_current` `perpetrators` `classification`
`author` `summary_para_1..3`.

- `id` is a **typed** column now (not a row-count formula) — `hist001`… and
  `curr_001`… are load-bearing (feed GUIDs, `#event/<id>` anchors, the
  translation `_anchor` join).
- The old `hero_1..4_{label,value}` columns are **retired** — `build_history.py`
  `hero_pairs()` computes the four-fact stat strip from the row (Date /
  Location / Deaths / Displaced-or-Injured, truncated). `last_updated` is
  also unused.
- No `verification_status` column — hardcoded `"verified"` in `regenerate.py`.

`details.csv` — ~1,370 real rows in ten categories, rendered in this order:
`quick_fact` `casualty` `timeline` `testimony` `war_crime` `legal`
`commander` `personality` `historical_impact` `source`. Columns:
`detail_id` `event_id` `category` `order` `time` `heading_label` `value`
`content` `source` `source_link`. Rendered as `.rp-card` lists (heading +
body + 📰 source; `testimony` and `timeline` get their own card variant),
mirroring the timeline modal.

> Both CSVs export thousands of blank padding rows. A row counts only when it
> has the required keys (`id` for events, `event_id` + `category` for details).

### Translation differs from the facility sheets

The `_de`/`_ar` event tabs carry `event_type` `date_context`
`location_historical` `location_current` `classification` — and a single
**`brief_summary`**, not the three `summary_para_*` the base has. So an
English page shows three paragraphs and a translated page shows one. That is
the data, not a bug.

`event_name`, `perpetrators` and the hero label/value pairs are **not**
translated and render in English on all three.

### The old interactive archive

`Pages/Historical_Massacres/massacres.html` still exists (`noindex`, beside
the CSVs) but nothing links to it any more — the generated timeline at
`/historical-events/massacres/` superseded it. Safe to leave as a developer
reference; its `#event/<id>` deep links in `404.html` were repointed at the
generated record pages.

### Villages are deliberately not generated

418 rows, but `additional_notes` runs 7–51 characters — `"Fear and
capitulation"` — and there are no translations. Every village would fail the
substantive bar and publish as a noindex stub, 1,254 of them. The page moved
and got proper SEO; the data stays on it. A separate spreadsheet with real
per-village prose is planned, at which point district pages (18 × 3) become
the sensible unit.

---

## `Pages/` is now developer-only (2026-08-24)

A Semrush audit flagged 95 invalid structured-data items and a robots.txt
format error, both traced to legacy interactive pages under `Pages/` that
were still being crawled and linked even after their generated replacements
shipped. The fix was three separate controls, all required together — a
sitemap entry says "please crawl this," `noindex` says "don't index this,"
and an internal link is what a human or crawler actually finds by browsing:

- **Internal links removed.** Every public link into a superseded interactive
  page was retargeted at its generated replacement (`404.html`,
  `historical-events/index.html`, the sidebar "← Interactive database" link
  in `build_records.py`/`build_history.py`). The files were not deleted or
  gated — they are still reachable by direct URL, for developers.
- **`noindex, follow`** added via `NOINDEX_PATHS` (kept in sync between
  `tools/seo_inject.py` and `tools/build_sitemap.py`) for the pages that stay
  live at their old URL with no replacement page of their own:
  `Pages/Historical_Massacres/massacres.html`,
  `Pages/nakba_villages_map.html`, and four `Pages/War_Crimes_Stats/stat-*`
  pages (hospitals-attacked, religious-sites, schools-destroyed,
  universities-damaged).
- **Sitemap exclusion** for the same set, via the same `NOINDEX_PATHS` guard
  in `build_sitemap.py`'s `served_static()`.

Two other classes remain in `Pages/` legitimately and are unaffected:

- **Source CSVs** the generators read from (`Pages/Historical_Massacres/*.csv`,
  `Pages/War_Crimes_Stats/**/*.csv`) — kept there per standing instruction,
  not part of this cleanup.
- **Redirect stubs** at every URL that got a full migration (see below) —
  `index, follow` on purpose, since a stub's canonical is what search engines
  need to read to consolidate the old URL into the new one; `noindex` would
  block that.

Also fixed in the same pass: `seo_inject.py`'s `jsonld_for()` was building an
invalid 17-item `Event` `ItemList` for `massacres.html` (missing the
required `location` field) — removed rather than patched, since the same 17
events already carry valid `Event` schema on their generated pages at
`/historical-events/massacres/<slug>/`. `robots.txt` also had a non-standard
`LLMS:` directive (llms.txt has no robots.txt directive of its own) —
removed.

**Full page-to-page migrations completed this session**, each following the
same pattern (move the file, absolute-path every internal reference, write a
redirect stub, re-run `seo_inject.py` so canonical/OG/JSON-LD regenerate for
the new path, re-run `build_sitemap.py`, update every inbound link):

| old path | new path |
|---|---|
| `Pages/War_Crimes_Stats/stat-children-killed.html` | `/war-crimes/children-killed/` |
| `Pages/War_Crimes_Stats/stat-civilian-casualties.html` | `/war-crimes/civilian-casualties/` |
| `Pages/War_Crimes_Stats/stat-journalists-killed.html` | `/war-crimes/journalists-killed/` |
| `Pages/War_Crimes_Stats/stat-medical-personnel.html` | `/war-crimes/medical-personnel/` |
| `Pages/Hunger_Crisis/hunger-total-starvation.html` | `/war-crimes/total-starvation/` |
| `Pages/Hunger_Crisis/hunger-starved-children.html` | `/war-crimes/children-starvation/` |
| `Pages/ethnic-cleansing-documentation.html` | `/historical-events/ethnic-cleansing/` |
| `Pages/quotes-archive-page.html` | `/historical-events/testimonies/` |

**One honest exception was checked for and found none** — every live,
indexed page has now been migrated out of `Pages/`. The one remaining
candidate (`quotes-archive-page.html`) was migrated 2026-08-24 and closed
the list above.

---

## Rules that must not be broken

**Slugs are keyed on names.** `load_previous_slugs()` reads the manifest by
`uid`; with no uid it falls through to slug-from-name, which reproduces the
published slug for anything not renamed. Never reintroduce an `id`-keyed
lookup — that is what repointed 25 hospitals.

**Indexability is earned.** `substantive = bool(incidents) or
len(intro)+len(notes) >= 200`. Below that a record is `noindex, follow` and
excluded from the sitemap. It flips automatically when data arrives. Do not
lower the bar to make thin pages index.

**Empty tab pages are noindex.** A resources tab with no CSV renders its empty
state and is held back.

**CRLF.** The repo has `core.autocrlf=true` and files are CRLF in the working
tree. Editors that rewrite whole files to LF produce a whole-file diff. Read
as bytes, remember the ending, restore it on write.

**Bash heredocs eat backslashes.** A patch script containing `—` or `\n`
must be written with the Write tool, not piped through a heredoc.

**Cache-busting.** Changed JS/CSS gets `?v=N` bumped everywhere it is
referenced. Currently: `footer-init.js?v=6`, `header-component.js?v=5`,
`partials/site-footer.html?v=6` (was `common-styles.html`),
`dual-timeline-manager.js?v=6`, `timeline.css?v=1`, `record-page.css?v=21`,
`record-page.js?v=5`. `transferSize: 0` in
`performance.getEntriesByType('resource')` proves a stale cached asset.

**GitHub Pages cannot 301.** A moved page leaves a stub carrying a canonical
to its replacement plus `<meta http-equiv="refresh">`. Never `noindex` a
stub — that stops the canonical being read. Both SEO tools skip any file
containing `http-equiv="refresh"`.

**Every generator must be listed in `MANIFESTS`.** Both `seo_inject.py` and
`build_sitemap.py` read a *list* of manifests, currently
`_records_manifest.json` and `_history_manifest.json`. A generator missing
from that list gets a duplicate canonical and JSON-LD block stamped into every
page it writes, and is left out of the sitemap.

**`site_header()` takes the active nav tab.** It used to hardcode War Crimes,
which was right while only one generator existed. Pass `active_href` —
`"/war-crimes/"` or `"/historical-events/"` — or the wrong tab lights up.

**`seo_inject.py` must skip generated pages.** It walks the whole tree,
including `war-crimes/` and `historical-events/massacres/` (record pages AND
the timeline index). Those already carry a canonical and JSON-LD from their
generator; injecting would duplicate both. It filters on the manifests (and
skips `partials/` and redirect stubs) — scope should be ~19 pages, not ~290.
If that number jumps, the guard broke.

**The pruner only walks its own section.** `build_records.py` removes stale
files inside `war-crimes/<seg>/` only, which is why hand-authored pages can
live at `war-crimes/<other>/` safely.

---

## Rebase conflicts are normal

The Action commits generated files to `main`, so local work conflicts with it
routinely. Do not hand-merge:

```bash
git pull --rebase origin main
# on conflict — regenerate the whole chain, then continue:
python tools/build_records.py && python tools/build_history.py && \
python tools/regenerate.py && python tools/seo_inject.py && python tools/build_sitemap.py
git add -A && git rebase --continue
```

Windows commits store LF (autocrlf) while the Linux Action stores CRLF, so
generated files churn between the two. Harmless, but it makes diffs noisy.

---

## Open items

- **Schools incidents** — 2 records for 27 schools. Everything else is built
  and waiting; the pages promote themselves on the first build after the CSV
  lands.
- **`ID Not Found`** — 6 incidents point at no facility and are dropped:
  1 of 309 hospitals, 3 of 50 universities, 2 of 25 religious. The build
  warns on every run; fix in the sheet.
- **`medical-personnel/data/cases-data.csv`** — never existed; the page shows
  a pending state.
- **Stray space in a URL template** — `war-crimes/civilian-casualties/index.html`
  line 322 reads ``killedInGazaFull: ` ${API_BASE_V2}/…` `` with a leading
  space. Browsers strip it so the fetch works, but it is an unintended edit
  that has now been committed twice.
- Eight `disabled: true` stat cards on the hub point at pages that do not
  exist yet (housing, industrial, ambulances, infrastructure, displacement,
  water systems, water tanks, siege violations).
- **`hist004` (Qibya) `date_end` is `"19647"`** — the generator drops a
  `date_end` that does not parse, but the cell is still wrong.
- **Village spreadsheet** — planned separately; district pages once it has
  real prose.
- **The 9 retired `Events` columns** (`hero_1..4_*`, `last_updated`) are still
  in the sheet — the code ignores them, deleting them is optional tidy-up.
- **`details.csv` `value` / `time` columns are English-only** — no
  `value_de` / `time_de`, so those bits render in English on every page.
- 59 of 662 source-URL cells are not URLs.
- The 10 current-genocide `source` detail rows carry the source name in
  `content`/`source` but no `heading_label`; `build_history.py` promotes the
  name to the card heading. Adding proper `heading_label` + a description in
  the sheet would make those cards richer.

**Resolved since the last edit:** historical workbook is in the sync; the
`data/` layer + feeds regenerate in CI; `data/events.json` is CSV-derived;
the timeline is the massacres index; translation join fixed via `_anchor`.
