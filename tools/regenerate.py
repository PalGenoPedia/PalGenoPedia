#!/usr/bin/env python3
"""
regenerate.py — PalGenoPedia machine-readable layer generator.

READS   Pages/Historical_Massacres/events.csv     canonical event data (from the Sheet)
        Pages/Historical_Massacres/details.csv     sources + war-crime rows
        tools/_history_manifest.json               id -> generated record-page URL
WRITES  data/events.json                           the normalised dataset (now an OUTPUT)
        data/events.csv  data/events.ndjson         flat / line-delimited exports
        data/events.jsonld  data/dataset.jsonld
        data/jsonld/<id>.jsonld
        data/jsonld/embed/<id>.html (+ dataset.html, events-graph.html)
        feed.xml  feed.rss

Single source of truth: the Google Sheet -> events.csv / details.csv. Everything
here is derived. `verification_status` is hardcoded "verified"; casualty min/max
are parsed from the raw strings; `period` is by date (>= 2023-10-07 = current).
Run after build_history.py so the manifest URLs are current.
"""
import io, json, os, sys, re, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_records as B

BASE = "https://palgenopedia.org"
TIMELINE = f"{BASE}/historical-events/massacres/"
SNAPSHOT = datetime.date.today().isoformat()   # provenance / "as_of" date
CURRENT_FROM = "2023-10-07"                      # date >= this -> period "current"

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "Pages", "Historical_Massacres")

DATASET_META = {
    "schema_version": "1.0",
    "dataset_description": ("Documented war crimes, massacres, and humanitarian violations "
                            "concerning Palestine, 1948-present. Figures carry explicit "
                            "provenance and verification status."),
    "provenance_sources": ["Al Jazeera", "B'Tselem", "Euro-Med Monitor", "Gaza Health Ministry",
                           "Historical Archives", "Human Rights Watch", "UN", "UN OCHA"],
}

# id -> canonical English record URL, from the history manifest (the generated
# per-event pages superseded the old interactive archive).
def _hist_urls():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_history_manifest.json")
    out = {}
    if os.path.exists(p):
        try:
            for x in json.load(open(p, encoding="utf-8")).get("pages", []):
                if x.get("lang") == "en" and x.get("id") and x.get("path"):
                    out[x["id"]] = BASE + x["path"]
        except Exception:
            pass
    return out
MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
WK = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

HERE = os.path.dirname(os.path.abspath(__file__))
DEP = os.path.dirname(HERE)
DATA = os.path.join(DEP, "data")
JLD = os.path.join(DATA, "jsonld")
EMB = os.path.join(JLD, "embed")

def ensure(p):
    os.makedirs(p, exist_ok=True)

def _dt(d):
    try: return datetime.datetime.strptime(d, "%Y-%m-%d")
    except Exception: return datetime.datetime.strptime(SNAPSHOT, "%Y-%m-%d")

def iso(d):
    return _dt(d).strftime("%Y-%m-%dT%H:%M:%SZ")

def rfc822(d):
    dt = _dt(d)
    return f"{WK[dt.weekday()]} {dt.strftime('%d')} {MON[dt.month-1]} {dt.year} 00:00:00 +0000"

_HIST_URLS = _hist_urls()


def _archived():
    p = os.path.join(DATA, "archived-links.json")
    if not os.path.exists(p):
        return {}
    try:
        d = json.load(open(p, encoding="utf-8"))
    except Exception:
        return {}
    return {u: v["wayback"] for u, v in d.items()
            if v.get("status") == "archived" and v.get("wayback")}


ARCHIVED = _archived()

def detail_url(e):
    # every event now has a generated record page (build_history.py renders all
    # rows in events.csv); fall back to the timeline hash only if one is missing.
    return _HIST_URLS.get(e["id"], f"{TIMELINE}#event/{e['id']}")

def guid(e):
    return f"{BASE}/data/events.json#{e['id']}"

def build_article(e):
    a = {}
    a["@context"] = "https://schema.org"
    a["@type"] = "Article"
    a["@id"] = f"{BASE}/data/events.json#{e['id']}"
    a["headline"] = e["title"]
    a["url"] = detail_url(e)
    a["datePublished"] = e["date_start"]
    a["dateModified"] = SNAPSHOT
    a["inLanguage"] = "en"
    about = {"@type": "Event", "name": e["title"], "startDate": e["date_start"]}
    if e.get("date_end") and e["date_end"] != e["date_start"]:
        about["endDate"] = e["date_end"]
    if e.get("date_context"):
        about["description"] = e["date_context"]
    loc = e["location"]
    ln = loc.get("name_current") or loc.get("name_historical")
    if ln or (loc.get("lat") is not None and loc.get("lng") is not None):
        place = {"@type": "Place"}
        if ln: place["name"] = ln
        if loc.get("lat") is not None and loc.get("lng") is not None:
            place["geo"] = {"@type": "GeoCoordinates", "latitude": loc["lat"], "longitude": loc["lng"]}
        about["location"] = place
    a["about"] = about
    if e.get("summary"):
        a["articleBody"] = e["summary"]
    kws = [x for x in [e.get("event_type"), e.get("period")] if x]
    if e.get("classification"): kws.append(e["classification"])
    a["keywords"] = ", ".join(kws)
    if e.get("perpetrators"):
        a["mentions"] = [{"@type": "Organization", "name": p} for p in e["perpetrators"]]
    if e.get("sources"):
        a["citation"] = [{"@type": "Article", "name": s["source"],
                          **({"url": s["source_link"]} if s.get("source_link") else {}),
                          **({"about": {"@type": "Thing", "name": s["category"]}} if s.get("category") else {})}
                         for s in e["sources"]]
    props = []
    for key, label in (("deaths", "Deaths"), ("injured", "Injured"), ("forced_displacement", "Forced displacement")):
        v = (e["casualties"].get(key) or {})
        if v.get("raw"):
            pv = {"@type": "PropertyValue", "name": label, "propertyID": f"casualties/{key}", "value": v["raw"]}
            if v.get("min") is not None: pv["minValue"] = v["min"]
            if v.get("max") is not None: pv["maxValue"] = v["max"]
            props.append(pv)
    if e.get("verification_status"):
        props.append({"@type": "PropertyValue", "name": "Verification status", "propertyID": "verification_status", "value": e["verification_status"]})
    if e.get("classification"):
        props.append({"@type": "PropertyValue", "name": "Classification", "propertyID": "classification", "value": e["classification"]})
    if e.get("author"):
        props.append({"@type": "PropertyValue", "name": "Author", "propertyID": "author", "value": e["author"]})
    if props:
        a["additionalProperty"] = props
    a["provider"] = {"@type": "Organization", "name": "PalGenoPedia", "url": BASE}
    a["isBasedOn"] = f"{BASE}/data/events.json"
    return a

def build_dataset(events, articles):
    ds = {}
    ds["@context"] = "https://schema.org"
    ds["@type"] = "Dataset"
    ds["@id"] = f"{BASE}/data/events.json"
    ds["name"] = "PalGenoPedia Documented Events Dataset"
    ds["description"] = ("Open documentation of verified war crimes, massacres, and humanitarian "
                         "violations concerning Palestine, 1948–present. Every figure carries provenance "
                         "and a verification status. Canonical machine-readable source for PalGenoPedia.")
    ds["url"] = f"{BASE}/data/events.json"
    ds["datePublished"] = SNAPSHOT
    ds["dateModified"] = SNAPSHOT
    ds["inLanguage"] = "en"
    ds["creator"] = {"@type": "Organization", "name": "PalGenoPedia", "url": BASE}
    ds["keywords"] = "Palestine, war crimes, massacres, humanitarian violations, documentation, 1948, Gaza, Nakba"
    ds["distribution"] = [
        {"@type": "DataDownload", "encodingFormat": "application/json", "contentUrl": f"{BASE}/data/events.json"},
        {"@type": "DataDownload", "encodingFormat": "application/x-ndjson", "contentUrl": f"{BASE}/data/events.ndjson"},
        {"@type": "DataDownload", "encodingFormat": "text/csv", "contentUrl": f"{BASE}/data/events.csv"},
    ]
    ds["hasPart"] = [{"@type": "CreativeWork", "@id": a["@id"], "name": a["headline"]} for a in articles]
    ds["isBasedOn"] = f"{BASE}/data/events.json"
    return ds

def item_body(e):
    c = e["casualties"]
    cas = [f"{k.replace('_',' ')}: {c.get(k)['raw']}" for k in ("deaths","injured","forced_displacement") if (c.get(k) or {}).get("raw")]
    lines = [f"{e['title']} — {e['event_type']} ({e['verification_status']}).",
             f"Date: {e['date_start']}" + (f" to {e['date_end']}" if e.get('date_end') and e['date_end']!=e['date_start'] else "")]
    ln = e["location"].get("name_current") or e["location"].get("name_historical")
    if ln: lines.append(f"Location: {ln}")
    if cas: lines.append("Casualties: " + "; ".join(cas))
    if e.get("perpetrators"): lines.append("Alleged perpetrators: " + ", ".join(e["perpetrators"]))
    if e.get("summary"): lines.append("Summary: " + e["summary"])
    if e.get("sources"):
        sr = [f"{s['source']}" + (f" ({s['source_link']})" if s.get("source_link") else "") for s in e["sources"]]
        lines.append("Sources: " + "; ".join(sr))
    return "\n".join(lines)

def write_feeds(events):
    from xml.sax.saxutils import escape
    now_iso = iso(SNAPSHOT)
    se = sorted(events, key=lambda x: x["date_start"] or "", reverse=True)
    n = len(events)
    # Atom
    atom = ['<?xml version="1.0" encoding="UTF-8"?>']
    atom.append('<feed xmlns="http://www.w3.org/2005/Atom">')
    atom.append(f'  <title>PalGenoPedia — Documented Events</title>')
    atom.append(f'  <id>{escape(BASE + "/data/events.json")}</id>')
    atom.append(f'  <updated>{now_iso}</updated>')
    atom.append('  <link rel="self" href="' + escape(BASE + "/feed.xml") + '"/>')
    atom.append(f'  <link rel="alternate" href="{escape(TIMELINE)}"/>')
    atom.append(f'  <subtitle>Documented war crimes, massacres, and humanitarian violations concerning Palestine, 1948–present. Generated from the canonical /data/events.json ({n} events).</subtitle>')
    atom.append('  <author><name>PalGenoPedia</name></author>')
    atom.append('  <!-- Regenerate from data/events.json to publish future additions. Newest events first. -->')
    for e in se:
        atom.append("  <entry>")
        atom.append(f"    <title>{escape(e['title'])}</title>")
        atom.append(f'    <link rel="alternate" href="{escape(detail_url(e))}"/>')
        atom.append(f"    <id>{escape(guid(e))}</id>")
        atom.append(f"    <published>{iso(e['date_start']) if e['date_start'] else now_iso}</published>")
        atom.append(f"    <updated>{now_iso}</updated>")
        atom.append(f'    <category term="{escape(e["event_type"])}"/>')
        atom.append(f'    <category term="verification:{escape(e["verification_status"])}"/>')
        atom.append(f"    <summary>{escape(item_body(e))}</summary>")
        atom.append("  </entry>")
    atom.append("</feed>")
    with _out(os.path.join(DEP, "feed.xml"), encoding="utf-8") as f:
        f.write("\n".join(atom) + "\n")
    # RSS
    rss = ['<?xml version="1.0" encoding="UTF-8"?>']
    rss.append('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">')
    rss.append("  <channel>")
    rss.append(f"    <title>PalGenoPedia — Documented Events</title>")
    rss.append(f"    <link>{escape(BASE)}</link>")
    rss.append(f"    <description>Documented war crimes, massacres, and humanitarian violations concerning Palestine, 1948–present. Generated from canonical /data/events.json ({n} events).</description>")
    rss.append(f"    <atom:link rel=\"self\" href=\"{escape(BASE + '/feed.rss')}\"/>")
    rss.append(f"    <language>en</language>")
    rss.append(f"    <lastBuildDate>{rfc822(SNAPSHOT)}</lastBuildDate>")
    rss.append(f"    <generator>PalGenoPedia static feed generator (consume-only from events.json)</generator>")
    rss.append("    <!-- Regenerate from data/events.json to publish future additions. -->")
    for e in se:
        rss.append("    <item>")
        rss.append(f"      <title>{escape(e['title'])}</title>")
        rss.append(f"      <link>{escape(detail_url(e))}</link>")
        rss.append(f"      <guid isPermaLink=\"false\">{escape(guid(e))}</guid>")
        rss.append(f"      <pubDate>{rfc822(e['date_start']) if e['date_start'] else rfc822(SNAPSHOT)}</pubDate>")
        rss.append(f"      <category>{escape(e['event_type'])}</category>")
        rss.append(f"      <category>verification:{escape(e['verification_status'])}</category>")
        rss.append(f"      <description>{escape(item_body(e))}</description>")
        rss.append("    </item>")
    rss.append("  </channel>")
    rss.append("</rss>")
    with _out(os.path.join(DEP, "feed.rss"), encoding="utf-8") as f:
        f.write("\n".join(rss) + "\n")

def parse_range(raw):
    """'≈107–250' -> (107, 250, 250) ; '471' -> (471,471,471) ; prose -> (None,None,None).
    estimate is the conservative upper bound (max)."""
    head = re.split(r"[(;]", (raw or "").strip(), 1)[0]
    nums = [int(n.replace(",", "")) for n in re.findall(r"\d[\d,]*", head)]
    if not nums:
        return (None, None, None)
    return (min(nums), max(nums), max(nums))


def load_events_from_csv():
    """Build the normalised event list from the Sheet CSVs — the shape the
    JSON-LD / feed builders below expect (was data/events.json)."""
    a_ = B.clean
    rows = [r for r in B.read_csv(os.path.join(SRC, "events.csv")) if not B.is_blank(r.get("id"))]
    details = [r for r in B.read_csv(os.path.join(SRC, "details.csv"))
               if a_(r.get("event_id")) and a_(r.get("category"))]

    by_ev = {}
    for r in details:
        by_ev.setdefault(a_(r.get("event_id")), []).append(r)

    out = []
    for r in rows:
        eid = a_(r.get("id"))
        ds = a_(r.get("date_start"))[:10]
        de = a_(r.get("date_end"))[:10] or ds
        cas = {}
        for col, key in (("deaths", "deaths"), ("injured", "injured"),
                         ("forced_displacement", "forced_displacement")):
            raw = a_(r.get(col))
            lo, hi, est = parse_range(raw)
            cas[key] = {"raw": raw, "min": lo, "max": hi, "estimate": est}

        drows = by_ev.get(eid, [])
        seen, sources = set(), []
        for d in drows:
            s = a_(d.get("source"))
            if not s:
                continue
            link = a_(d.get("source_link"))
            k = (s, link)
            if k in seen:
                continue
            seen.add(k)
            url = link if link.startswith("http") else None
            sources.append({"source": s,
                            "source_link": url,
                            "archived_url": ARCHIVED.get(B.url_key(url)) if url else None,
                            "category": a_(d.get("category")) or None})
        war_crimes = [a_(d.get("heading_label")) for d in drows
                      if a_(d.get("category")) == "war_crime" and a_(d.get("heading_label"))]
        summary = " ".join(x for x in (a_(r.get("summary_para_1")), a_(r.get("summary_para_2")),
                                       a_(r.get("summary_para_3"))) if x)

        out.append({
            "id": eid,
            "title": a_(r.get("event_name")),
            "period": "current" if ds >= CURRENT_FROM else "historical",
            "date_start": ds,
            "date_end": de,
            "date_context": a_(r.get("date_context")) or None,
            "event_type": a_(r.get("event_type")),
            "classification": a_(r.get("classification")) or None,
            "location": {
                "name_historical": a_(r.get("location_historical")),
                "name_current": a_(r.get("location_current")) or a_(r.get("location_historical")),
                "lat": float(r["location_lat"]) if a_(r.get("location_lat")) else None,
                "lng": float(r["location_lng"]) if a_(r.get("location_lng")) else None,
            },
            "casualties": cas,
            "perpetrators": [p.strip() for p in re.split(r"\s*;\s*", a_(r.get("perpetrators"))) if p.strip()],
            "summary": summary,
            "war_crimes": war_crimes,
            "verification_status": "verified",
            "sources": sources,
            "source_file": "events.csv",
            "last_updated": a_(r.get("last_updated")) or None,
            "author": a_(r.get("author")) or None,
        })
    out.sort(key=lambda e: e["date_start"] or "")
    return out


FLAT_COLS = ["id", "title", "period", "date_start", "date_end", "event_type", "classification",
             "location_historical", "location_current", "lat", "lng",
             "deaths_raw", "deaths_estimate", "injured_raw", "injured_estimate",
             "displaced_raw", "displaced_estimate", "perpetrators", "verification_status",
             "summary", "num_sources", "source_links"]


def flat_row(e):
    import csv, io
    c = e["casualties"]
    d = {
        "id": e["id"], "title": e["title"], "period": e["period"],
        "date_start": e["date_start"], "date_end": e["date_end"],
        "event_type": e["event_type"], "classification": e["classification"] or "",
        "location_historical": e["location"]["name_historical"],
        "location_current": e["location"]["name_current"],
        "lat": e["location"]["lat"] if e["location"]["lat"] is not None else "",
        "lng": e["location"]["lng"] if e["location"]["lng"] is not None else "",
        "deaths_raw": c["deaths"]["raw"], "deaths_estimate": c["deaths"]["estimate"] or "",
        "injured_raw": c["injured"]["raw"], "injured_estimate": c["injured"]["estimate"] or "",
        "displaced_raw": c["forced_displacement"]["raw"],
        "displaced_estimate": c["forced_displacement"]["estimate"] or "",
        "perpetrators": ";".join(e["perpetrators"]),
        "verification_status": e["verification_status"], "summary": e["summary"],
        "num_sources": len(e["sources"]),
        "source_links": ";".join(s["source_link"] for s in e["sources"] if s["source_link"]),
    }
    buf = io.StringIO()
    csv.DictWriter(buf, FLAT_COLS, extrasaction="ignore", lineterminator="\n").writerow(d)
    return buf.getvalue().rstrip("\n")


# ── llms.txt / llms-full.txt ──────────────────────────────────────────────
# Both were hand-maintained until 2026-08-30, and both had drifted from the data
# on every count they made: llms.txt claimed 56 hospitals / 18 universities /
# 32 schools / 25 religious sites / 17 massacres against a real 50 / 13 / 27 /
# 20 / 27, and llms-full.txt carried a frozen "Snapshot 2026-08-24" header.
# Both sit in build_sitemap.py's DATA_URLS at priority 0.9, changefreq daily,
# and machine ingestion is the site's stated purpose - so a stale corpus is not
# a cosmetic problem. They are generated from the same events and manifests as
# everything else now.
#
# The prose below is editorial and stays hand-written. Every number, URL and
# event block underneath it is derived.
NL = chr(10)

LLMS_INTRO = (
    "> An open documentation resource of verified war crimes, massacres, and "
    "humanitarian violations concerning Palestine, 1948–present. Content is "
    "compiled from UN, Human Rights Watch, B'Tselem, Al-Haq, PCHR, and the Gaza "
    "Health Ministry. Every figure carries provenance and a verification status."
)

LLMS_DATA = [
    ("/data/events.json", "Canonical normalized dataset: documented events, "
     "1948–present (historical massacres + current-genocide incidents), each "
     "with casualties (raw + parsed min/max), perpetrators, per-event sources, "
     "war-crime classifications and verification status. Derived from the "
     "project's source CSVs on every update."),
    ("/data/events.ndjson", "One event per line (ideal for RAG retrieval and "
     "model fine-tuning chunking)."),
    ("/data/events.csv", "Flat table with numeric casualty estimates and "
     "source-link columns."),
    ("/llms-full.txt", "Every documented event as plain prose, one section each "
     "- the whole corpus in a single file, generated from events.json."),
]

LLMS_PAGES = [
    ("/", "Overview, headline statistics, and the filtered event timeline."),
    ("/historical-events/", "Historical massacres and systematic oppression."),
    ("/historical-events/massacres/", "The interactive timeline / map / list, and "
     "the index of one page per event, 1948–present."),
    ("/historical-events/ethnic-cleansing/", "418 depopulated Palestinian "
     "villages, 1948."),
    ("/historical-events/testimonies/", "First-hand testimony archive."),
    ("/war-crimes/", "War-crime and international-law violation statistics."),
    ("/methodology.html", "How records are sourced, verified and counted."),
    ("/volunteer.html", "How to contribute as a data-collection or research "
     "volunteer."),
]

LLMS_NOTES = [
    "Casualty figures are often ranges (e.g. ≈107–250); they are "
    "preserved verbatim in the `raw` field and as conservative upper-bound "
    "integers in `estimate`.",
    "`verification_status` is currently \"verified\" for every event.",
    "`events.json` lists notable individual incidents with independent sourcing "
    "— it is NOT a running total of the war. Its casualty figures sum to far "
    "less than external whole-war tolls (e.g. Gaza Health Ministry / UN OCHA "
    "aggregate figures reported elsewhere). The two measure different things; do "
    "not add them together or treat one as a correction of the other.",
    "Every record exists in English, German and Arabic under `/de/` and `/ar/` "
    "path segments. Event names and perpetrator names are not translated and "
    "stay in English in all three.",
    "See STATS_RECONCILIATION.md in the repository for known figure "
    "discrepancies across pages.",
]

SECTION_BLURB = {
    "hospitals": "documented hospitals and medical facilities",
    "universities": "documented universities and higher-education institutions",
    "schools": "documented schools",
    "religious-sites": "documented mosques, churches and other religious sites",
}


def _records_summary():
    """(section, path, total, indexed) per war-crimes section, read from the
    manifest build_records.py wrote earlier in this same build.

    English pages only: the /de/ and /ar/ variants are the same records in
    another language, not additional ones, and counting them would treble every
    figure in the file."""
    try:
        pages = json.load(open(os.path.join(HERE, "_records_manifest.json"),
                               encoding="utf-8"))["pages"]
    except Exception:
        return []
    out = []
    for sec in ("hospitals", "universities", "schools", "religious-sites"):
        en = [p for p in pages
              if p.get("section") == sec and p.get("lang") == "en"
              and p.get("id") and p.get("kind") != "tab"]
        if en:
            out.append((sec, "/war-crimes/%s/" % sec, len(en),
                        sum(1 for p in en if p.get("indexable"))))
    return out


def build_llms(events):
    """llms.txt - the curated entry point, per https://llmstxt.org/"""
    L = ["# " + B.SITE, "", LLMS_INTRO, "",
         "## Data (machine-readable, canonical)", ""]
    for href, desc in LLMS_DATA:
        L.append("- %s — %s" % (href, desc))
    L += ["", "## Pages", ""]
    for href, desc in LLMS_PAGES:
        L.append("- %s — %s" % (href, desc))
    L += ["", "## Documented records (per-facility, per-incident detail)", "",
          "The events above are a curated %d-event summary. The site's largest "
          "and most" % len(events),
          "granular content is not in that dataset: individually documented "
          "facilities",
          "and historical events, each with a dated incident history, casualty "
          "figures,",
          "and per-incident sources. This is the level of detail most useful for "
          "a",
          "specific-entity query (was <facility> attacked, what happened at "
          "<event>).", ""]
    for sec, href, total, idx in _records_summary():
        L.append("- %s — %d %s, %d with enough documented detail to be "
                 "indexed; /de/ and /ar/ variants under the same path."
                 % (href, total, SECTION_BLURB[sec], idx))
    hist = sum(1 for e in events if e.get("period") == "historical")
    L.append("- /historical-events/massacres/ — %d individually documented "
             "events (%d historical, 1948–2022; %d from the current genocide, "
             "Oct 2023 onward), each with its own page; /de/ and /ar/ variants "
             "under the same path." % (len(events), hist, len(events) - hist))
    L.append("- /sitemap.xml — the full, current list of every indexed URL "
             "on the site, including every record above. Prefer this over the "
             "Pages list for complete coverage; this file is a curated summary, "
             "not the exhaustive index.")
    L += ["", "## Notes for ingestors", ""]
    for n in LLMS_NOTES:
        L.append("- " + n)
    L.append("")
    return NL.join(L)


def _casualty_line(c):
    bits = []
    for key, label in (("deaths", "deaths"), ("injured", "injured"),
                       ("forced_displacement", "forced displacement")):
        raw = ((c.get(key) or {}).get("raw") or "").strip()
        if raw:
            bits.append("%s: %s" % (label, raw))
    return "; ".join(bits)


def build_llms_full(events):
    """llms-full.txt - the whole event corpus as prose, one section per event."""
    hist = sum(1 for e in events if e.get("period") == "historical")
    L = ["# %s — Full Documented Events Corpus" % B.SITE, "",
         "Generated %s from data/events.json. %d documented events (%d historical "
         "1948–2022, %d current genocide Oct 2023 onward). All figures carry "
         "provenance; see the per-event sources. Regenerated whenever the source "
         "data changes - do not edit by hand."
         % (SNAPSHOT, len(events), hist, len(events) - hist), ""]
    for e in events:
        loc = e.get("location") or {}
        place = (loc.get("name_current") or loc.get("name_historical") or "").strip()
        L.append("## %s (%s)" % (e.get("title", ""), e.get("id", "")))
        L.append("- Period: %s" % e.get("period", ""))
        ds = (e.get("date_start") or "").strip()
        de = (e.get("date_end") or "").strip()
        L.append("- Date: %s" % (ds if (not de or de == ds) else "%s to %s" % (ds, de)))
        if e.get("date_context"):
            L.append("- Context: %s" % e["date_context"])
        if e.get("event_type"):
            L.append("- Event type: %s" % e["event_type"])
        if e.get("classification"):
            L.append("- Classification: %s" % e["classification"])
        if place:
            L.append("- Location: %s" % place)
        if loc.get("lat") is not None and loc.get("lng") is not None:
            L.append("- Coordinates: %s, %s" % (loc["lat"], loc["lng"]))
        cas = _casualty_line(e.get("casualties") or {})
        if cas:
            L.append("- Casualties: %s" % cas)
        if e.get("perpetrators"):
            L.append("- Alleged perpetrators: %s" % ", ".join(e["perpetrators"]))
        if e.get("war_crimes"):
            L.append("- Alleged war crimes: %s" % ", ".join(e["war_crimes"]))
        if e.get("verification_status"):
            L.append("- Verification status: %s" % e["verification_status"])
        if e.get("url"):
            L.append("- Record page: %s" % e["url"])
        if e.get("summary"):
            L.append("- Summary: %s" % e["summary"])
        srcs = []
        for s in e.get("sources") or []:
            nm = (s.get("source") or "").strip()
            ln = (s.get("source_link") or "").strip()
            if nm and ln:
                srcs.append("%s (%s)" % (nm, ln))
            elif nm or ln:
                srcs.append(nm or ln)
        if srcs:
            L.append("- Sources: %s" % "; ".join(srcs))
        L.append("")
    return NL.join(L)


# ── --check ───────────────────────────────────────────────────────────────
# This script used to accept --check silently and write anyway, which is worse
# than rejecting the flag: `python tools/regenerate.py --check` looked like a
# dry run and wasn't. One context manager stands in for open(...,"w"): in check
# mode it collects the bytes and diffs them against what is on disk instead of
# replacing it, so every output is covered without touching the eleven call
# sites' bodies.
CHECK = False
_CHANGED = []


class _out:
    def __init__(self, path, mode="w", encoding="utf-8", newline=None):
        self.path, self.encoding, self.newline = path, encoding, newline
        self._buf = io.StringIO()
        self._fh = None

    def __enter__(self):
        if CHECK:
            return self._buf
        self._fh = open(self.path, "w", encoding=self.encoding, newline=self.newline)
        return self._fh

    def __exit__(self, *exc):
        if self._fh is not None:
            return self._fh.__exit__(*exc)
        new = self._buf.getvalue()
        # No newline juggling: with newline="" nothing is translated on write,
        # and reading back with the same newline= setting round-trips exactly;
        # with newline=None the write translates to os.linesep and the read
        # translates it back. Comparing like for like is enough either way.
        try:
            with open(self.path, encoding=self.encoding, newline=self.newline) as fh:
                same = fh.read() == new
        except OSError:
            same = False
        if not same:
            _CHANGED.append(os.path.relpath(self.path, DEP))
        return False


def main():
    ensure(JLD); ensure(EMB)
    events = load_events_from_csv()

    # data/events.json is now an OUTPUT, derived from the CSVs
    bundle = {
        **DATASET_META,
        "generated_from": "Pages/Historical_Massacres/{events,details}.csv (Google Sheet sync)",
        "counts": {"total_events": len(events),
                   "historical": sum(1 for e in events if e["period"] == "historical"),
                   "current": sum(1 for e in events if e["period"] == "current")},
        "events": events,
    }
    with _out(os.path.join(DATA, "events.json"), encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)
    # flat CSV + ndjson exports
    with _out(os.path.join(DATA, "events.csv"), encoding="utf-8", newline="") as f:
        f.write(",".join(FLAT_COLS) + "\n")
        for e in events:
            f.write(flat_row(e) + "\n")
    with _out(os.path.join(DATA, "events.ndjson"), encoding="utf-8") as f:
        for e in events:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    articles = [build_article(e) for e in events]
    dataset = build_dataset(events, articles)

    # per-event jsonld
    for e, a in zip(events, articles):
        with _out(os.path.join(JLD, f"{e['id']}.jsonld"), encoding="utf-8") as f:
            json.dump(a, f, ensure_ascii=False, indent=2)
    # combined graph
    combined = {"@context": "https://schema.org", "@graph": [dataset] + articles}
    with _out(os.path.join(DATA, "events.jsonld"), encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)
    # dataset standalone
    with _out(os.path.join(DATA, "dataset.jsonld"), encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)
    # embed snippets
    for e, a in zip(events, articles):
        block = '<script type="application/ld+json">\n' + json.dumps(a, ensure_ascii=False, indent=2) + '\n</script>\n'
        with _out(os.path.join(EMB, f"{e['id']}.html"), encoding="utf-8") as f:
            f.write(block)
    ds_block = '<script type="application/ld+json">\n' + json.dumps(dataset, ensure_ascii=False, indent=2) + '\n</script>\n'
    with _out(os.path.join(EMB, "dataset.html"), encoding="utf-8") as f:
        f.write(ds_block)
    gr_block = '<script type="application/ld+json">\n' + json.dumps(combined, ensure_ascii=False, indent=2) + '\n</script>\n'
    with _out(os.path.join(EMB, "events-graph.html"), encoding="utf-8") as f:
        f.write(gr_block)

    with _out(os.path.join(DEP, "llms.txt"), encoding="utf-8") as f:
        f.write(build_llms(events))
    with _out(os.path.join(DEP, "llms-full.txt"), encoding="utf-8") as f:
        f.write(build_llms_full(events))

    write_feeds(events)
    if CHECK:
        print("regenerate --check: %d generated file(s) would change" % len(_CHANGED))
        for rel in sorted(_CHANGED):
            print("  " + rel)
        sys.exit(1 if _CHANGED else 0)
    print("OK: %d events from events.csv -> data/events.json + .csv + .ndjson, "
          "JSON-LD, feed.xml, feed.rss" % len(events))


if __name__ == "__main__":
    KNOWN = {"--check"}
    unknown = [a for a in sys.argv[1:] if a not in KNOWN]
    if unknown:
        sys.exit("regenerate.py: unknown option(s): %s (only --check)" % " ".join(unknown))
    CHECK = "--check" in sys.argv[1:]
    main()
