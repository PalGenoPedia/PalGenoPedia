# DEPLOY.md — PalGenoPedia LLM / structured-data layer

Operational checklist to ship the AI-ingest layer. Everything here is
**derived** from the one canonical file `data/events.json`. The generator
only reads that file; it never writes it.

---

## 1. Files to copy into the repo (repo root = GitHub Pages source)

Copy the entire `deploy/` tree to your Pages source. Mapping:

```
deploy/                         -> repo root
├── robots.txt                  -> /robots.txt
├── sitemap.xml                 -> /sitemap.xml
├── llms.txt                    -> /llms.txt
├── llms-full.txt               -> /llms-full.txt
├── STATS_RECONCILIATION.md     -> /STATS_RECONCILIATION.md   (reference, not served)
├── feed.xml                    -> /feed.xml
├── feed.rss                    -> /feed.rss
├── data/
│   ├── events.json             -> /data/events.json           *** CANONICAL SOURCE OF TRUTH ***
│   ├── events.ndjson           -> /data/events.ndjson
│   ├── events.csv              -> /data/events.csv
│   ├── dataset.jsonld          -> /data/dataset.jsonld
│   ├── events.jsonld           -> /data/events.jsonld
│   └── jsonld/
│       ├── <id>.jsonld         -> /data/jsonld/<id>.jsonld    (27 files)
│       └── embed/
│           ├── <id>.html       -> /data/jsonld/embed/<id>.html (27 <script> blocks)
│           ├── dataset.html
│           └── events-graph.html
└── tools/
    └── regenerate.py           -> /tools/regenerate.py        (one-line regen, see §3)
```

`STATS_RECONCILIATION.md` documents a known stats discrepancy; keep it in
the repo but it is not a served page.

---

## 2. Git commands

```bash
git add robots.txt sitemap.xml llms.txt llms-full.txt STATS_RECONCILIATION.md \
        feed.xml feed.rss \
        data/events.json data/events.ndjson data/events.csv \
        data/dataset.jsonld data/events.jsonld \
        data/jsonld tools/regenerate.py
git commit -m "Add LLM-ingest layer: llms.txt, sitemap, JSON-LD, RSS/Atom feeds"
git push
```

If `data/jsonld/` subdir add misses files, add explicitly:
```bash
git add data/jsonld
git commit -m "Add per-event JSON-LD + embed snippets"
git push
```

---

## 3. Regenerate the JSON-LD + RSS/Atom layer (one line)

Run from the repo root (the script lives next to `data/`):

```bash
python tools/regenerate.py
```

- Reads only `data/events.json`.
- Rewrites `data/dataset.jsonld`, `data/events.jsonld`, all `data/jsonld/*.jsonld`,
  all `data/jsonld/embed/*.html`, `feed.xml`, `feed.rss`.
- Idempotent: after you edit `events.json` (add/remove/update an event),
  re-run this and everything republishes. No manual feed edits.
- No third-party dependencies (Python stdlib only).

---

## 4. Validation checklist (run before each push)

**a. JSON-LD parses**
```bash
python -c "import json,glob; [json.load(open(f)) for f in glob.glob('data/jsonld/*.jsonld')+['data/dataset.jsonld','data/events.jsonld']]; print('JSON-LD OK')"
```

**b. Atom/RSS well-formed**
```bash
python -c "import xml.dom.minidom as m; [m.parse(x) for x in ('feed.xml','feed.rss','sitemap.xml')]; print('XML OK')"
```

**c. Event count consistent across events.json, JSON-LD, feeds**
```bash
python -c "import json,glob,re; \
n=len(json.load(open('data/events.json'))['events']); \
jl=len(glob.glob('data/jsonld/*.jsonld')); \
rss=len(re.findall(r'<item>',open('feed.rss').read())); \
atom=len(re.findall(r'<entry>',open('feed.xml').read())); \
print('events.json=%d jsonld=%d rss=%d atom=%d'%(n,jl,rss,atom)); \
assert n==jl==rss==atom, 'COUNT MISMATCH'; print('COUNT OK')"
```

**d. No event links resolve to 404**
- Historical events link to `Pages/Historical_Massacres/massacres.html#event/<id>` (verified live 200).
- Current-genocide detail pages referenced in the source JSON 404, so current
  events fall back to `major-incidents-timeline.html`. Confirm no `Current_Genocide/...`
  URLs leaked into the feeds:
```bash
python -c "import re; t=open('feed.rss').read()+open('feed.xml').read(); \
print('stray 404 detail links:', len(re.findall(r'Current_Genocide/[^\"<>]+', t)))"
```
(Expect 0. Fix the upstream 404s separately if you want per-event current pages.)

**e. events.json and STATS_RECONCILIATION.md not unintentionally modified**
```bash
git status --short data/events.json STATS_RECONCILIATION.md
```
Expect no output (both should be unchanged between regen runs). The generator
never writes them; if they appear modified, something else touched them.

---

## 5. Important notes

- **`data/events.json` is the sole canonical source of truth.** JSON-LD, feeds,
  ndjson, and csv are all derived. Edit events there, then run §3 and §4.

- **CSP caveat (`connect-src 'self'`).** Your GitHub Pages Content-Security-Policy
  restricts `connect-src` to `'self'`. This blocks third-party sites from doing a
  live cross-origin `fetch()` of `/data/*.jsonld` or the feeds from a browser.
  Bot crawlers and server-side ingest (download the files) are unaffected. To allow
  live browser-side cross-origin reads, relax `connect-src` in your CSP — out of
  scope here.

- **Stats discrepancy intentionally unresolved.** The site exposes multiple
  conflicting "total deaths" figures (home hero ~21.0K, events.csv sum 25,085,
  current-genocide JSON 61,200). This restructure does **not** silently pick one.
  `STATS_RECONCILIATION.md` documents it and the fix (compute all UI hero numbers
  from the canonical files at render time; add an `as_of` date). Make the content
  decision there before changing any numbers.

- **Schema choices.** Per-event = `schema.org/Article` (genuinely applicable).
  Collection = `Dataset`. `ClaimReview` was deliberately omitted — no event is
  modelled as a reviewable disputed claim; forcing it would be inaccurate.
  Verification status is preserved as a `PropertyValue` instead.
