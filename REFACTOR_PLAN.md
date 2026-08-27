# PalGenoPedia — site reorganization plan

Handoff doc. Paste into a new session before starting any phase. Written
2026-08-27. Read `tools/PIPELINE.md` first — this plan follows its rules
(static-first, CSV → build script → static HTML → progressive JS, `Pages/`
is CSV-only, slugs keyed on names, every generator in `MANIFESTS`).

---

## 0. Scope and non-negotiables

**In scope:** the hand-authored top level — the loose root `*.html` files,
the two hubs (`war-crimes/index.html`, `historical-events/index.html`), the
timeline page, the hunger pages, and the `Pages/` leftover interactive HTML.

**Untouched:**

- `Pages/*/*.csv` — the six facility workbooks + `Historical_Massacres/*.csv`.
  These stay exactly where they are; the Apps Script sync and
  `build-records.yml` are keyed on those paths (`PIPELINE.md` ③④).
- `war-crimes/<section>/…` and `historical-events/massacres/<slug>/…`
  generated record trees — output only, regenerated every build.
- `data/events.json` and its derived JSON-LD / feed layer.

**Guiding rule:** anything that must be indexed by Google or an LLM must be
emitted as static HTML *by a build script* at build time. Interactive
timeline / map / filter UI is a progressive enhancement layered on top of
that static HTML, never a replacement for it. This is already how
`build_history.py` + `record-page.js` work — the two merges below extend the
same pattern, they do not invent a new one.

---

## 1. Problems this plan fixes

| # | Problem | Evidence |
|---|---|---|
| 1 | Two URLs for the war-crimes landing — `war-crimes-stats.html` (old, indexed, most-linked) and `/war-crimes/` (current hub). Already reconciled by a redirect stub, but worth confirming and keeping tidy. | `war-crimes-stats.html` = canonical + `<meta refresh>` → `/war-crimes/` |
| 2 | `major-incidents-timeline.html` and `historical-events/massacres/` render the **same CSV** (`Pages/Historical_Massacres/events.csv` + `details.csv`) as two unconnected surfaces — one interactive+noindex-ish, one static+indexed | `dual-timeline-manager.js` header; `build_history.py` `events`/`details` |
| 3 | Timeline detail links point at `Pages/Historical_Massacres/massacres.html#event/<id>` (a `noindex` interactive page) instead of the real generated record pages | `timeline-config.json` `detail_page_base`; `PIPELINE.md` "Pages/ is now developer-only" |
| 4 | `hunger-crisis-stats.html` is a full 48 KB page at the site root, **not in the nav**, and its content is partly duplicated inside the war-crimes hub Hunger Data tab | `header-component.js` `mainNav()` has no hunger link; `war-crimes/index.html` `#hungerDataView` |
| 5 | Loose root files with no folder: `methodology.html`, `major-incidents-timeline.html`, `hunger-crisis-stats.html`, `volunteer.html` | repo root |
| 6 | `timeline-data/historical-massacres.json` is a stale hand-maintained fallback: 25 events vs the CSV's 17, `hist_001` vs generated `deir-yassin` id scheme | file metadata `total_events: 25` |
| 7 | `war-crimes/index.html` (1888 ln) and `historical-events/index.html` (2023 ln) duplicate ~600 lines of inline hub CSS + the tab-switch JS | both files |
| 8 | `volunteer.html` still hand-rolls its own `<nav>` with a stale `🍽️ Hunger Crisis` + `📋 Timeline` markup instead of using `header-component.js` | `volunteer.html:895` |

---

## 2. Target information architecture

```
/                             home + headline stats + embedded timeline preview
/war-crimes/                   ← MERGE A: stats dashboard + section directory, one page
    /war-crimes/legal/         legal framework + violation categories (moved off the hub)
    /war-crimes/hospitals/     …/schools/ …/universities/ …/religious-sites/   (generated, unchanged)
    /war-crimes/civilian-casualties/ …/journalists-killed/ …/children-killed/
        …/medical-personnel/                                                  (generated, unchanged)
/hunger-crisis/                hunger dashboard (was hunger-crisis-stats.html)
    /war-crimes/total-starvation/  …/children-starvation/   (generated pages stay; hub links to them)
/historical-events/            history hub (systematic-oppression narrative + links)
    /historical-events/timeline/   ← MERGE B: chronological 1948→present, static list + timeline/map/list UI
    /historical-events/massacres/  generated record index + 17 events (stays; timeline links into it)
    /historical-events/ethnic-cleansing/   (stays)
    /historical-events/testimonies/        (stays)
/about/methodology/            was methodology.html
/get-involved/                 was volunteer.html
```

Nav (`header-component.js` `mainNav()`): **War Crimes · Hunger Crisis ·
History · Timeline · Join Us** — add the Hunger Crisis link that is
currently missing; point Timeline at `/historical-events/timeline/`.

Every moved page leaves a redirect stub (canonical + `<meta refresh>`,
never `noindex` — `PIPELINE.md` rule). Update `404.html`, `feed.*`,
`sitemap` generation, and all inbound links in the same commit.

---

## 3. MERGE A — `war-crimes-stats.html` ⇄ `/war-crimes/` (URL consolidation only)

**Clarified 2026-08-27:** the ask is to make the two *URLs* one page, not to
rewrite the hub's content.

### State
`war-crimes-stats.html` is already a redirect stub — `<link rel="canonical"
href="…/war-crimes/">` + `<meta http-equiv="refresh" content="0; url=/war-crimes/">`
+ `location.replace()`. It carries the `#hash` and `?query` across. This is
exactly the GitHub-Pages-correct way to merge a moved URL (`PIPELINE.md`:
"GitHub Pages cannot 301"). **Functionally already merged.**

### What's left to do
1. **Keep the stub** — do not delete it. It is the most-linked, most-indexed
   page after the homepage; removing it turns every external backlink into a
   404. It stays `index, follow` (no `noindex`) so search engines read the
   canonical and fold the old URL into `/war-crimes/`.
2. **Sweep inbound internal links** so nothing on the site still points at
   the stub — every internal reference should target `/war-crimes/`
   directly, leaving the stub for external traffic only. Current internal
   references to `war-crimes-stats.html`: none found in `*.html` /
   `partials/` / `js/` (already all `/war-crimes/`). Re-check before closing.
3. `historical-events.html` is the identical case for the history hub — same
   verdict, same one-line check.
4. Nothing else. No hub content change, no new sub-page, no `header-component.js`
   change for this item.

> The earlier draft of this section proposed a full hub rewrite (dashboard +
> directory, moving legal prose to `/war-crimes/legal/`). That is a
> *separate, optional* idea — not what "merge the two pages" meant — and is
> parked in §9 below, not scheduled.

---

## 4. MERGE B — timeline ⇄ historical-events/massacres

This is the important one. Both read `Pages/Historical_Massacres/events.csv`
+ `details.csv`. The generated `massacres/` pages are the SEO-visible truth;
the timeline is a nicer way to browse the same rows. Merge = **the timeline
becomes a view mode of the generated section, sharing one build and one set
of record links.**

### Target page: `/historical-events/timeline/` (generated)

`build_history.py` grows a second output alongside `massacres/`:
`historical-events/timeline/index.html` (+ `de/`, `ar/`).

- **Static baseline (always in the HTML, indexable):** a chronological
  `<ol>` of every event — date, title, type badge, casualty line, 1-line
  summary, and a link to the real record page
  `/historical-events/massacres/<slug>/`. This is just the existing
  `massacres/index.html` card data re-sorted by `date_start` and rendered
  as a time-ordered list. No JS needed to read it.
- **Progressive enhancement:** `dual-timeline-manager.js` moves here and,
  on load, upgrades that static list into the Timeline / Map / List tab UI
  (the current `major-incidents-timeline.html` experience). It reads the
  **same CSVs** via PapaParse — the JSON fallback
  (`historical-massacres.json`) is dropped (problem #6).
- **Detail links:** every timeline entry, in every view, links to
  `/historical-events/massacres/<slug>/` — not
  `massacres.html#event/<id>`. Update `timeline-config.json`
  `detail_page_base` and the manager's link builder. Slug comes from the
  same `slugify(event_name)` the generator uses, so the two cannot drift.

### The "current genocide" half of the old timeline

`major-incidents-timeline.html` also shows 10 post-Oct-2023 incidents from
`timeline-data/civilian-casualties-current.json` (`incidents[]`). Those have
**no CSV and no record pages** (`detail_page` values 404 —
`DEPLOY.md` §4d).

Recommendation, in line with "keep updatable CSV as the source":

1. Add `Pages/Current_Genocide/incidents.csv` (+ `_de` / `_ar`) with the
   same column shape `build_history.py`'s `events.csv` uses
   (`event_name,event_type,date_start,date_end,deaths,injured,
   forced_displacement,location_current,perpetrators,classification,
   summary_para_1,verification_status,source_*`). Seed it by converting the
   10 JSON `incidents` once (`incidents` → rows). From then on it is
   hand-edited in the Google Sheet like every other CSV.
2. Register that workbook in the Apps Script `SPREADSHEETS` array **and**
   add the historical workbook that is still missing (`PIPELINE.md` ③ "Gap")
   — one Apps Script change covers both.
3. `build-records.yml` path filter: add
   `Pages/Current_Genocide/*.csv`.
4. `build_history.py` renders these as records under
   `/historical-events/current-genocide/<slug>/` (new `SEG`, same code
   path as massacres — different `date` range, same template) and includes
   them in the `/historical-events/timeline/` combined list.
5. `civilian-casualties-current.json.current_statistics` stays as the
   **whole-war aggregate** (labelled `scope: whole-war`, `as_of` date) —
   `STATS_RECONCILIATION.md`. The timeline's own stat strip sums only the
   per-incident rows it shows and says so (the note at
   `major-incidents-timeline.html:903` already does this correctly — keep
   that wording).

### Retirements after Merge B ships

| file | action |
|---|---|
| `major-incidents-timeline.html` | redirect stub → `/historical-events/timeline/` (carry `#` hash) |
| `Pages/Historical_Massacres/massacres.html` | keep as dev-only (already `noindex`); remap its `#event/<id>` deep links in `404.html` + anywhere else to the generated record pages, then it has no inbound public links |
| `timeline-data/historical-massacres.json` | delete (was the fallback; CSV is now the only source) |
| `timeline-data/civilian-casualties-current.json` | keep — now only the aggregate block is used |

### Steps

1. CSV + Apps Script + workflow filter (items 1–3 above).
2. `build_history.py`: factor the card/list rendering; add
   `render_timeline_index()`; add the `current-genocide` section config;
   emit both to `_history_manifest.json` (so `seo_inject.py` +
   `build_sitemap.py` see them — `PIPELINE.md` `MANIFESTS` rule).
3. Move `dual-timeline-manager.js` + Leaflet includes into the generated
   timeline template; delete the JSON-fallback branch; repoint detail links.
4. `timeline-config.json`: `detail_page_base` →
   `/historical-events/massacres/`; drop `data_source`
   `historical-massacres.json`.
5. Home page (`index.html:1080` `#timeline-embed`,
   `dual-timeline-manager.js?v=2`): point its "view full timeline" button
   (`index.html:819`) at `/historical-events/timeline/`; keep the embedded
   preview but have it read the CSVs (or a small generated
   `timeline-data/timeline.json` the build writes).
6. Redirect stub + inbound link sweep + `sitemap`/`feed` regen + cache
   bumps.

---

## 5. MERGE C — fold hunger into its own top-level section

- Move `hunger-crisis-stats.html` → `/hunger-crisis/index.html`
  (hand-authored, stays hand-authored). Redirect stub at the old URL.
- Add the **Hunger Crisis** nav link (missing today).
- `/hunger-crisis/` links down to the two generated stat pages that
  already exist: `/war-crimes/total-starvation/`,
  `/war-crimes/children-starvation/` (their URLs stay — `PIPELINE.md`
  documents the `BREADCRUMB_PARENT` override that already points them at
  "Hunger Crisis Statistics").
- Delete the duplicated hunger block from the war-crimes hub (Merge A #6).
- `Pages/Hunger_Crisis/*.html` are already migrated stubs — no change.

---

## 6. Housekeeping (low risk, do alongside)

1. **Root tidy** — `methodology.html` → `/about/methodology/`;
   `volunteer.html` → `/get-involved/` (keep `volunteer.html` stub — it is
   heavily linked). Update `header-component.js` paths.
2. **`volunteer.html` nav** — delete its hand-rolled `<nav>` block
   (`:895`), use `#header-placeholder` + `header-component.js` like every
   other page.
3. **Extract shared hub chrome** — pull the ~600 lines of duplicated inline
   `<style>` from `war-crimes/index.html` + `historical-events/index.html`
   into `Styles/hub.css`; pull the tab-switch JS into `js/hub-nav.js`.
   After Merge A the war-crimes hub barely needs it, but the history hub
   still does.
4. **`timeline-data/` cleanup** — after Merge B: `historical-massacres.json`
   deleted; `timeline-sources.json` folded into `methodology`;
   `ethnic-cleansing-villages.*` stay (used by
   `ethnic-cleansing-manager.js`).
5. **One canonical "as_of" date** — `STATS_RECONCILIATION.md` action item:
   have the build write `data/stats-asof.json` and every hub read the hero
   numbers + date from it instead of hard-coding.

---

## 7. Suggested sequencing

| Phase | Contents | Risk | Ships value |
|---|---|---|---|
| 1 ✅ | Nav fix (add Hunger Crisis link), Merge A (confirm the stub-redirect, link sweep), `volunteer.html` nav | low | nav coherent, hunger discoverable — **done 2026-08-27, see §10** |
| 2 | Merge B part 1: `/historical-events/timeline/` generated from the **existing** `events.csv` only (historical, no current-genocide yet), retire `major-incidents-timeline.html` | medium — `build_history.py` change, must hit `MANIFESTS` | timeline + massacres unified on one CSV |
| 3 | Merge B part 2: `Pages/Current_Genocide/incidents.csv`, Apps Script sync (also fixes the historical-workbook gap), `current-genocide` record section, combined timeline | higher — new sync leg, new CSV contract | full 1948→present timeline, all CSV-sourced |
| 4 | Merge C (hunger → `/hunger-crisis/` folder), housekeeping §6.1 root tidy, §6.3 shared hub chrome | low–medium | tidier URLs |
| 5 | Housekeeping §6.4–6.5, stats reconciliation | low | consistency |

Each phase is independently shippable and leaves the site working.

---

## 8. Checks per phase (from `DEPLOY.md` / `PIPELINE.md`)

- `python tools/build_records.py && python tools/build_history.py && python tools/build_sitemap.py` clean.
- `seo_inject.py` scope stays ~20 hand-authored pages (jump = guard broke).
- Every new generated dir appears in `_history_manifest.json` and the sitemap.
- No `Pages/…` or `Current_Genocide/…` stray links leak into `feed.*`
  (`DEPLOY.md` §4d grep).
- Redirect stubs: canonical + `<meta refresh>`, never `noindex`.
- Event/record counts consistent across CSV, generated pages, sitemap.
- CRLF preserved on write; `?v=N` bumped on every touched asset.

---

## 9. Parked — optional war-crimes hub redesign (NOT scheduled)

Separate from Merge A. If the hub Overview tab ever feels overloaded:
dashboard on top, an explicit "Documented records" directory grid below,
legal prose moved to a new `/war-crimes/legal/`, hunger block removed.
Medium risk (1888-line live-API + i18n page). Only do this if there is a
concrete complaint about the hub itself — the URL merge did not require it.

---

## 10. Phase 1 — applied 2026-08-27

Files changed:

- `js/header-component.js` — `mainNav()` gains a `🍽️ Hunger Crisis` link
  (`common.nav.hungerCrisis`, already present in all three
  `translations/*.json`) → `/hunger-crisis-stats.html` (existing URL; the
  folder move is Phase 4). `activeIf('hunger-crisis')` wired;
  `detectActivePage()` already returned `'hunger-crisis'` for that filename.
- `tools/build_records.py` — `SITE_NAV` gains the same entry so the
  **static** header on every generated record page matches; `T['en'|'de'|'ar']['nav']`
  gain `nav.hungerCrisis` (EN/DE/AR). Verified `site_header()` renders it in
  all three languages.
- Cache bump `header-component.js?v=3` → `?v=4` across all 16 hand-authored
  HTML files that load it.
- `volunteer.html` — brand `Gaza Crisis Documentation` → `PalGenoPedia`;
  hand-rolled `<nav>` updated to the canonical five items (added the missing
  `📜 History` link, `🏠 Dashboard` → `🏠 Home`). Full migration to
  `header-component.js` deferred (it is a fully standalone page).

**Not yet propagated:** the ~333 generated record pages + 54 history pages
still show the 4-item nav until `build-records.yml` regenerates them. That
workflow fires on push to `main` touching `tools/build_records.py`, so
pushing this change regenerates them server-side — no need to commit 387
rebuilt files locally (`PIPELINE.md` ④). Run
`python tools/build_records.py && python tools/build_history.py && python tools/build_sitemap.py`
locally first only if you want to review the output.

**Merge A (URL consolidation):** confirmed already done — `war-crimes-stats.html`
and `historical-events.html` are correct redirect stubs, no internal links
point at them. Nothing to change.

### Dead-file cleanup (same session)

Checked the folders/files flagged as possibly unused:

| Item | Verdict | Action |
|---|---|---|
| `js/` | **Used** — every file is loaded (header/footer/config/translation/record-page, dual-timeline-manager, ethnic-cleansing-manager) | kept |
| `js/ethnic_cleansing_json.json` | **Unused** — zero references; the live page fetches `timeline-data/ethnic-cleansing-villages.json` | → `draft/` |
| `timeline-data/` | **Used** — dual-timeline-manager + ethnic-cleansing-manager read from it | kept (note: `historical-massacres.json` is a stale fallback, retired in Phase 2) |
| `data/` | **Used** — `events.json` is the canonical source of truth; `record-pages.json` feeds the war-crimes hub; `jsonld/` is served | kept |
| `partials/common-styles.html` | **Used** — it is the footer *component* partial (`footer-init.js` fetches it), not a stylesheet. Both `seo_inject.py` and `build_sitemap.py` special-case `partials/` to skip it, so it stays in that folder. | **renamed** → `partials/site-footer.html`; `footer-init.js` updated, partial `?v=5`→`?v=6`, `footer-init.js?v=5`→`?v=6` unified across pages |
| `Pages/global-styles.css` | **Used** by 6 hand-authored `war-crimes/*` stat pages — but it is a real stylesheet | moved → `Styles/global-styles.css`, 6 refs repointed |
| `Pages/nakba_villages_map.html` | **Superseded** by generated `/historical-events/ethnic-cleansing/`; no inbound links (only the two build tools' NOINDEX lists) | → `draft/`; removed from `NOINDEX_PATHS` in `seo_inject.py` + `build_sitemap.py` |
| `Pages/quotes-archive-page.html` | **Live redirect stub** → `/historical-events/testimonies/` | kept (moving = 404 on an indexed URL) |
| `Pages/ethnic-cleansing-documentation.html` | **Live redirect stub** → `/historical-events/ethnic-cleansing/` | kept |
| `Pages/Hunger_Crisis/hunger-starved-children.html` | **Live redirect stub** → `/war-crimes/children-starvation/` | kept |
| `Pages/Hunger_Crisis/hunger-total-starvation.html` | **Live redirect stub** → `/war-crimes/total-starvation/` | kept |

`draft/` is gitignored and in every build tool's `SKIP_DIRS`, so moved files
leave the repo and the build entirely. `seo_inject.py --check` scope dropped
21 → 20 (nakba removed), still well under the guard threshold.

---

## 11. Historical event-page restyle + timeline move — applied 2026-08-27

### Event-page styling (the generated `/historical-events/massacres/*` pages)

Given the plain white sub-header vs. the interactive archive's dark hero:

- `build_history.py` now tags `<body class="rp-hist rp-hist-event">` (event
  pages) / `"rp-hist rp-hist-index"` (section index).
- `Styles/record-page.css` (`?v=17`→`?v=20`) gains a `.rp-hist` block: dark
  gradient hero on `.page-subheader` (non-sticky, red radial glow, tri-colour
  bottom stripe, white 800-weight title, red uppercase eyebrow subtitle),
  a flush stat band, red left-accent on `.detail-section-title`, framed
  prose tables, a readable lede. Dark in both colour schemes, mirroring
  `Pages/Historical_Massacres/shared.css`'s `.detail-hero` **without** a
  generator rewrite — same markup the pages already emit.
- War-crimes record pages are untouched (no `rp-hist` class); they already
  carry the richer `.detail-hero` + sidebar from `build_records.py`.
- **Detail sections are cards, not tables** (2026-08-27, second pass): the
  categorised `details.csv` blocks now render as `.rp-card` lists mirroring
  the timeline modal's `.dtm-detail-row` / `.dtm-testimony` /
  `.dtm-timeline-row` — heading + body + `📰` source, testimony with an
  accent rail and italic quote, timeline with a red time chip. The old
  two-column `.rp-table--prose` is kept only for the top facts block.
  `record-page.css` `?v=20`→`?v=21`.

### `major-incidents-timeline.html` → `/historical-events/massacres/timeline.html`

Moved into the massacres folder as a **file** (not `timeline/` — the
`build_history.py` pruner would delete a dir). Redirect stub left at the old
URL (carries `?`/`#`).

| Touch point | Change |
|---|---|
| the page itself | asset refs → root-absolute; `seo_inject.py` regenerates its `<head>` (canonical, ItemList) for the new path |
| `js/dual-timeline-manager.js` (`?v=2`→`?v=3`) | all `fetch()` / CSV paths → root-absolute (works from both the timeline page and the home-page embed); `detailPageBase` → `/historical-events/massacres/`; historical events now link to `<slug>/` record pages via a new `slugify()` (mirrors `build_history.py`); current-genocide events → `timeline.html#event/<id>` (no record page yet) |
| `timeline-data/timeline-config.json` | `events_csv` / `details_csv` / `data_source` / `detail_page_base` → absolute + new base |
| nav | `js/header-component.js` (`?v=4`→`?v=5`) `mainNav()` + `detectActivePage()`; `build_records.py` `SITE_NAV` |
| inbound links | `index.html`, `volunteer.html`, `404.html`, `partials/site-footer.html` |
| `tools/seo_inject.py` | `SECTION_OF` key; `event_items()` now reads the history manifest so the ItemList points at real record pages |
| `tools/build_sitemap.py` | `PRIORITY` key |
| `tools/regenerate.py` | `TIMELINE` const + `detail_url()` → manifest-driven record URLs / timeline hash; regenerated feeds + JSON-LD embeds |
| `tools/build_history.py` | section index gains a `.rp-hist-timeline-cta` link (EN/DE/AR) to the timeline — *"massacres/ leads to the timeline"* |

**Verified in a local server:** timeline loads at the new URL (CSV + JSON
fetch OK, stats compute, no console errors); old URL redirects; home-page
embed still renders; historical detail links resolve to
`/historical-events/massacres/<slug>/`; section-index CTA present in all
three languages.

**Not committed:** the ~460 regenerated pages + `sitemap.xml` churn. The
Action rebuilds all of it from the CSVs on push (`build_records.py` /
`build_history.py` / `build_sitemap.py` are all in the workflow trigger).
`historical-massacres.json` was **not** deleted this session — it is still a
live fallback; retiring it stays a later step.

---

## 12. Collapse to one source of truth — `Pages/Historical_Massacres/*.csv`

Goal: the Google Sheet (→ `events.csv` + `details.csv`) is the *only* place
event data is edited. `data/events.json` and
`timeline-data/civilian-casualties-current.json` stop being hand-maintained
inputs.

### Sheet changes (owner) — **no new columns**

- **`Events`**: add 10 rows for the current-genocide events (`curr_001`…`curr_010`),
  using the existing columns. Convert `civilian-casualties-current.json.incidents[]`
  — script did this: `scratchpad/current_events_rows.tsv`.
- **`Details`**: add the `war_crime` + `source` rows for those 10 events —
  `scratchpad/current_details_rows.tsv` (80 rows).
- **Remove 9 columns**: `hero_1_label`…`hero_4_value` (8) and `last_updated` (1).
  Nothing reads them any more (see below).
- **`id` must be a typed column**, not a row-count formula — the new rows
  need the literal ids `curr_001`… (feed GUIDs + `#event/<id>` depend on
  them). Paste the current computed `hist0NN` values back as static text,
  then type the `curr_` ids. This also retires the `PIPELINE.md` ③
  "ids are not stable" trap.
- `verification_status`: **not added** — hardcoded `"verified"` in the build.
- Whole-war totals (61,200 deaths, infra counts): **not a tab** — hardcoded
  as a dated `const` in `js/dual-timeline-manager.js`, edit there when they move.
- Apps Script: no `SPREADSHEETS` change (same workbook, same `Events`/`Details`
  tabs). Just delete the hard-coded token from `storeToken()`.

### Repo changes

### Status — **applied 2026-08-27** (Sheet synced: 27 events, +80 detail rows, ids `curr_001…`)

| file | change |
|---|---|
| `tools/build_history.py` | `hero_pairs()` computes the 4-fact strip from the row (Date / Location / Deaths / Displaced-or-Injured), truncated, `0` suppressed, bare ints comma-formatted — the `hero_*` columns are dead. All 27 events now generate record pages (84 incl. de/ar). |
| `tools/regenerate.py` | **rewritten** — reads `events.csv` + `details.csv`; derives `period` (date ≥ 2023-10-07), casualty `min`/`max`/`estimate` (`parse_range`), `sources[]` + `war_crimes[]` from `details.csv`, `verification_status="verified"`; dataset metadata = constants. **`data/events.json`, `data/events.csv`, `data/events.ndjson` are now OUTPUTS.** `detail_url()` → generated record page for every event. |
| `js/dual-timeline-manager.js` `?v=3`→`?v=5` | one load from `events.csv` (1948→present), split historical/current by date (`CURRENT_FROM = 2023-10-07`); `extractHeroFacts()` computed from the row; current events link to their real record pages; JSON fallback gutted (degrade to empty, not the stale drift). |
| `tools/seo_inject.py` | `event_items()` → real record-page URL for every id in the manifest (not just historical). Still reads the now-generated `data/events.json`. |
| retired | `timeline-data/civilian-casualties-current.json`, `timeline-data/historical-massacres.json` (deleted); `timeline-config.json` `data_source` refs removed. |

**Verified in a local server:** timeline loads 17 + 10 = 27, no console errors,
current mode filters to 10, current events link to
`/historical-events/massacres/<slug>/` (all 200), `data/events.json`
regenerates from CSV with matching source/casualty data, all JSON-LD + feeds
well-formed.

**Not done — `current_statistics` (whole-war 61,200 toll):** turned out to be
**dead data** — nothing reads it. The timeline shows per-incident sums. If
whole-war figures should appear on the timeline that is a separate ~5-line
add (a `const` + two `textContent` writes); `WAR_TOTALS` was drafted and
removed.

### Translation join fixed (2026-08-27, after the sync)

Adding the 80 `curr_` rows to `Details` but a different count to `Details_de`
/ `Details_ar` broke the `detail_id` join — the delta CSVs' `detail_id` is a
self-counting formula that drifted, so `curr_` events showed **German/Arabic
text from unrelated rows**. Fixed: `merge_translations()` gained a `trans_key`
param and `build_history.py` now joins the delta CSVs on **`_anchor`** (which
holds the base id verbatim, 1370/1370 coverage) instead of `detail_id`.
Verified EN↔DE↔AR now line up for the current events.

`source`-category rows: the current-event ones carry the source name in
`content`/`source` only (no `heading_label`); `build_history.py` now promotes
the localised name to the card heading so they don't render as blank or
doubled cards.

### CI now regenerates the whole derived layer (2026-08-27)

`data/` cannot move to `draft/` — it is the **published output** of the
machine-readable layer (`seo_inject.py` reads `data/events.json` for the
homepage/timeline ItemList; `data/record-pages.json` is fetched at runtime by
the war-crimes hub; the JSON-LD + feed files are served; the dataset
downloads are linked from methodology/404/llms.txt/sitemap).

The reason it drifted: `.github/workflows/build-records.yml` only ran
`build_records.py` / `build_history.py` / `build_sitemap.py`. Fixed — the
workflow now also runs, in order:

```
build_records.py  ->  build_history.py  ->  regenerate.py  ->  seo_inject.py  ->  build_sitemap.py
```

So one Sheet sync now regenerates **everything** from the CSVs: HTML record
pages, `data/events.json` + `.csv` + `.ndjson`, all JSON-LD, `feed.xml`,
`feed.rss`, the injected `<head>` blocks, and the sitemap — and commits it
back to `main`. `data/` tracks the Sheet with zero manual steps, same as the
pages. `tools/regenerate.py` + `tools/seo_inject.py` added to the trigger
`paths:`.

`llms.txt` stale refs fixed (the deleted `civilian-casualties-current.json`,
the moved timeline path).

### Still owner-side (only this)

- **Remove the 9 dead columns** from the `Events` tab (`hero_1_label`…`hero_4_value`, `last_updated`). Optional — the code already ignores them.

DONE: DE/AR rows for the 10 `curr_` events are synced; the Apps Script token
was removed.
