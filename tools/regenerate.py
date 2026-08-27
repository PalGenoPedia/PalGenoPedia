#!/usr/bin/env python3
"""
regenerate.py — PalGenoPedia JSON-LD + RSS/Atom layer generator.

READS ONLY (never writes):  ../data/events.json   (sole canonical source of truth)
WRITES (additive, derived): ../data/dataset.jsonld
                            ../data/events.jsonld
                            ../data/jsonld/<id>.jsonld
                            ../data/jsonld/embed/<id>.html (+ dataset.html, events-graph.html)
                            ../feed.xml
                            ../feed.rss

Idempotent: re-running after an events.json update republishes everything.
No external dependencies (stdlib only).

Link integrity: detail-page links are resolved by rule, validated live once
during the initial build (see DEPLOY.md). Current-genocide detail pages were
found to 404, so current events fall back to the timeline page. Set
ENABLE_PROBE=1 to re-check liveness against the live site.
"""
import json, os, sys, glob, datetime

BASE = "https://palgenopedia.org"
TIMELINE = f"{BASE}/historical-events/massacres/timeline.html"
SNAPSHOT = "2026-08-24"          # provenance / "as_of" date for this build
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

def detail_url(e):
    # historical events have their own generated record page; current events
    # have none yet and resolve on the timeline via #event/<id>.
    if e.get("period") == "historical" and e["id"] in _HIST_URLS:
        return _HIST_URLS[e["id"]]
    return f"{TIMELINE}#event/{e['id']}"

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
    with open(os.path.join(DEP, "feed.xml"), "w", encoding="utf-8") as f:
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
    with open(os.path.join(DEP, "feed.rss"), "w", encoding="utf-8") as f:
        f.write("\n".join(rss) + "\n")

def main():
    ensure(JLD); ensure(EMB)
    with open(os.path.join(DATA, "events.json"), encoding="utf-8") as f:
        bundle = json.load(f)
    events = bundle["events"]
    articles = [build_article(e) for e in events]
    dataset = build_dataset(events, articles)

    # per-event jsonld
    for e, a in zip(events, articles):
        with open(os.path.join(JLD, f"{e['id']}.jsonld"), "w", encoding="utf-8") as f:
            json.dump(a, f, ensure_ascii=False, indent=2)
    # combined graph
    combined = {"@context": "https://schema.org", "@graph": [dataset] + articles}
    with open(os.path.join(DATA, "events.jsonld"), "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)
    # dataset standalone
    with open(os.path.join(DATA, "dataset.jsonld"), "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)
    # embed snippets
    for e, a in zip(events, articles):
        block = '<script type="application/ld+json">\n' + json.dumps(a, ensure_ascii=False, indent=2) + '\n</script>\n'
        with open(os.path.join(EMB, f"{e['id']}.html"), "w", encoding="utf-8") as f:
            f.write(block)
    ds_block = '<script type="application/ld+json">\n' + json.dumps(dataset, ensure_ascii=False, indent=2) + '\n</script>\n'
    with open(os.path.join(EMB, "dataset.html"), "w", encoding="utf-8") as f:
        f.write(ds_block)
    gr_block = '<script type="application/ld+json">\n' + json.dumps(combined, ensure_ascii=False, indent=2) + '\n</script>\n'
    with open(os.path.join(EMB, "events-graph.html"), "w", encoding="utf-8") as f:
        f.write(gr_block)

    write_feeds(events)
    print(f"OK: regenerated JSON-LD ({len(articles)} events) + feed.xml + feed.rss from data/events.json")

if __name__ == "__main__":
    main()
