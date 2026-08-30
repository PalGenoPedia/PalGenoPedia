# DEPLOY.md — PalGenoPedia LLM / structured-data layer

The machine-readable layer (`data/`, the feeds, the JSON-LD) that crawlers and
LLM ingestors read. See `tools/PIPELINE.md` for the whole build; this file
covers just this layer.

Last verified: 2026-08-30.

---

## How it's built

`tools/regenerate.py`, run by `.github/workflows/build-records.yml` on every
push that touches a CSV (step 3 of 5 — after `build_history.py`, so the
history manifest exists):

- **Reads** `Pages/Historical_Massacres/events.csv` + `details.csv`
  (+ `_de`/`_ar`) and `tools/_history_manifest.json`.
- **Writes** — all derived, never hand-edit:
  - `data/events.json` — the normalised dataset (was hand-maintained, now an
    output). Per-event: `id`, `title`, `period` (`historical` / `current`,
    split at `2023-10-07`), dates, `event_type`, `classification`, `location`
    (`name_historical`/`name_current`/`lat`/`lng`), `casualties`
    (`{raw, min, max, estimate}` per deaths/injured/forced_displacement —
    min/max parsed from the raw strings), `perpetrators[]`, `summary`,
    `war_crimes[]` + `sources[]` (both from `details.csv`),
    `verification_status` (hardcoded `"verified"`), `author`.
  - `data/events.csv`, `data/events.ndjson` — flat / line-delimited exports.
  - `data/events.jsonld`, `data/dataset.jsonld`, `data/jsonld/<id>.jsonld`,
    `data/jsonld/embed/*.html` — schema.org (`Article` per event, `Dataset`
    for the collection).
  - `feed.xml` (Atom), `feed.rss` — newest event first; each entry links to
    the event's generated record page.

Run the whole chain locally with the command in `PIPELINE.md` ④, or just
`python tools/regenerate.py` after a `build_history.py` run.

---

## Validation (the Action runs the build; these catch a bad CSV)

**JSON-LD parses**
```bash
python -c "import json,glob; [json.load(open(f,encoding='utf-8')) for f in glob.glob('data/jsonld/*.jsonld')+['data/dataset.jsonld','data/events.jsonld','data/events.json']]; print('JSON OK')"
```

**Atom / RSS / sitemap well-formed**
```bash
python -c "import xml.dom.minidom as m; [m.parse(x) for x in ('feed.xml','feed.rss','sitemap.xml')]; print('XML OK')"
```

**Event count consistent across events.json, JSON-LD, feeds**
```bash
python -c "import json,glob,re; \
n=len(json.load(open('data/events.json',encoding='utf-8'))['events']); \
jl=len(glob.glob('data/jsonld/*.jsonld')); \
rss=len(re.findall(r'<item>',open('feed.rss',encoding='utf-8').read())); \
atom=len(re.findall(r'<entry>',open('feed.xml',encoding='utf-8').read())); \
print('events.json=%d jsonld=%d rss=%d atom=%d'%(n,jl,rss,atom)); \
assert n==jl==rss==atom, 'COUNT MISMATCH'; print('COUNT OK')"
```

**Every event links to a real page** — each feed/JSON-LD `url` should be a
generated record page under `/historical-events/massacres/<slug>/`, resolved
from `_history_manifest.json`. Events missing from the manifest fall back to
`/historical-events/massacres/#event/<id>`.
```bash
python -c "import re; t=open('feed.rss',encoding='utf-8').read()+open('feed.xml',encoding='utf-8').read(); \
print('stray legacy links:', len(re.findall(r'(Pages/Current_Genocide|major-incidents-timeline)', t)))"
```
(Expect 0.)

---

## Notes

- **`data/events.json` is an OUTPUT.** The CSVs (the Google Sheet) are the
  canonical source. Editing `data/events.json` by hand is pointless — the next
  Action run overwrites it.

- **CSP caveat (`connect-src 'self'`).** The GitHub Pages CSP blocks
  third-party sites from a live cross-origin `fetch()` of `/data/*.jsonld` or
  the feeds from a browser. Bot crawlers and server-side ingest (which
  download the files) are unaffected.

- **Whole-war vs. per-incident totals.** `data/events.json` lists notable
  individual incidents with independent sourcing; its casualty figures sum to
  far less than external whole-war tolls. Do not add them together. See
  `STATS_RECONCILIATION.md`.

- **Schema choices.** Per-event = `schema.org/Article`. Collection =
  `Dataset`. `ClaimReview` deliberately omitted. Verification status is a
  `PropertyValue`.

  Since 2026-08-30 the **generated pages agree with this file.** They used to
  disagree: `build_history.py` emitted a top-level `Event` per event page and
  `build_records.py` a top-level `Hospital` / `School` / `CollegeOrUniversity` /
  `PlaceOfWorship` per facility page, while this layer already emitted `Article`
  for the same records. Both now emit **`Article` + `about`**, with the event or
  the facility as the described entity.

  Two things that markup was actually claiming, and no longer does:

  - the event pages carried `eventStatus: EventScheduled` plus
    `eventAttendanceMode: OfflineEventAttendanceMode` — the exact shape Google's
    Events rich result consumes, i.e. an in-person event at that place on that
    date going ahead as scheduled. It was the only `EventScheduled` on the site
    (81 blocks against 1,095 `EventHappened`). Site-wide it is now 1,176 / 0.
  - the facility pages carried `areaServed`, a service-area claim about
    institutions that were destroyed. Dropped.

  Nothing was lost: none of those types produced a rich result for this content.
  `BreadcrumbList` is what Google actually renders here, and it is untouched at
  484 blocks. `about` is also the property knowledge-graph and LLM ingestion
  pipelines read to bind a document to an entity, which matters given
  `robots.txt` invites GPTBot / ClaudeBot / CCBot by name.

- **Source archiving.** `.github/workflows/archive-links.yml` (weekly, and on a
  `data/archive-policy.json` push) snapshots source URLs to the Wayback Machine
  — `tools/archive_links.py`, state in `data/archived-links.json`. It is
  **opt-in per domain**: editors curate `data/archive-policy.json` from the
  volunteer portal ("Archive priorities"), setting each source domain's
  priority + method. `data/source-domains.json` (refreshed by `build-records.yml`)
  is the domain list the dashboard reads. Each source in `data/events.json`
  carries `archived_url`; generated pages show a 🕰 link. Needs repo secrets
  `IA_ACCESS` / `IA_SECRET`. See `PIPELINE.md` ⑥.
