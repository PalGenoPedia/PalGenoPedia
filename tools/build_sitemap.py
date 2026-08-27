#!/usr/bin/env python3
"""
build_sitemap.py - rebuild sitemap.xml from the served pages plus the
generated record pages.

READS   the served *.html pages (same rule as tools/seo_inject.py)
        tools/_records_manifest.json   written by tools/build_records.py
WRITES  sitemap.xml

Record pages are emitted with <xhtml:link rel="alternate" hreflang="..."> for
each language, which is how a sitemap declares language variants. Pages the
generator marked non-indexable (stubs with no documented incident and no prose)
are left out - a sitemap should only ever list URLs you want indexed.

Run after tools/build_records.py.  Idempotent.
"""
import json, os, xml.sax.saxutils as sx

BASE = "https://palgenopedia.org"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MANIFESTS = [os.path.join(HERE, "_records_manifest.json"),
             os.path.join(HERE, "_history_manifest.json")]
SKIP_DIRS = ('.git', 'draft', '.idea', '.claude', 'node_modules')

# Interactive Pages/ views superseded by a generated section - kept in seo_inject.py
# in sync with this list. A sitemap is a "please crawl this" instruction, so a
# page marked noindex has no business being listed in it.
NOINDEX_PATHS = {
    "Pages/War_Crimes_Stats/stat-hospitals-attacked.html",
    "Pages/War_Crimes_Stats/stat-schools-destroyed.html",
    "Pages/War_Crimes_Stats/stat-universities-damaged.html",
    "Pages/War_Crimes_Stats/stat-religious-sites.html",
    "Pages/Historical_Massacres/massacres.html",
}

# hand-maintained priorities for the hub pages; everything else gets a default
PRIORITY = {
    "": ("1.0", "daily"),
    "war-crimes/index.html": ("0.8", "weekly"),
    "hunger-crisis-stats.html": ("0.8", "weekly"),
    "historical-events/index.html": ("0.9", "weekly"),
    "historical-events/massacres/timeline.html": ("1.0", "daily"),
    "volunteer.html": ("0.4", "monthly"),
}
DATA_URLS = ["data/events.json", "data/events.ndjson", "data/events.csv",
             "llms.txt", "llms-full.txt"]


def is_redirect_stub(path):
    """True for the placeholder left at a URL that moved.

    A stub carries a canonical to its replacement and nothing else worth
    indexing. It must not be listed in the sitemap (which would advertise a
    URL we are trying to retire) and must not have an SEO block injected
    (which would overwrite the canonical that makes the redirect work)."""
    try:
        with open(path, encoding='utf-8') as fh:
            head = fh.read(1200)
    except Exception:
        return False
    return 'http-equiv="refresh"' in head


def page_href(rel):
    """The URL a served file is reached at - a directory index is served at
    the directory, not at its .../index.html path."""
    if rel == 'index.html':
        return '/'
    if rel.endswith('/index.html'):
        return '/' + rel[:-len('index.html')]
    return '/' + rel


def served_static():
    """Static pages, excluding generated record pages and non-indexable files."""
    manifest_paths = set()
    for man in MANIFESTS:
        if not os.path.exists(man):
            continue
        for p in json.load(open(man, encoding="utf-8"))["pages"]:
            manifest_paths.add(p["path"].strip("/"))

    out = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            if not f.endswith(".html"):
                continue
            rel = os.path.relpath(os.path.join(dp, f), ROOT).replace("\\", "/")
            if rel.startswith("data/jsonld/") or rel.startswith("partials/"):
                continue
            if rel == "404.html":          # noindex by design
                continue
            # generated record page? handled below, with its hreflang alternates
            if rel.endswith("/index.html") and rel[:-len("/index.html")] in manifest_paths:
                continue
            if is_redirect_stub(os.path.join(dp, f)):
                continue
            if rel in NOINDEX_PATHS:
                continue
            out.append(rel)
    return sorted(out)


def main():
    L = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
         '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']

    def entry(loc, pri, freq, alts=None):
        # No <lastmod>: nothing in the pipeline carries a real per-page edit
        # date (the manifests hold url/path/lang/section/id/slug/incidents/
        # indexable, nothing else) - stamping today's date here would just
        # mean every one of ~330 URLs "changes" on every build, whether or
        # not that record's data actually did. Google treats a missing
        # lastmod as neutral and a wrong one as a reason to discount the
        # field; omit it until there's a real date to put here.
        L.append("  <url>")
        L.append("    <loc>%s</loc>" % sx.escape(loc))
        if alts:
            for lang, href in alts:
                L.append('    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>'
                         % (lang, sx.escape(href)))
        L.append("    <changefreq>%s</changefreq>" % freq)
        L.append("    <priority>%s</priority>" % pri)
        L.append("  </url>")

    entry(BASE + "/", *PRIORITY[""])
    n_static = 1
    for rel in served_static():
        if rel == "index.html":
            continue
        pri, freq = PRIORITY.get(rel, ("0.7", "weekly"))
        entry(BASE + page_href(rel), pri, freq)
        n_static += 1

    for rel in DATA_URLS:
        entry("%s/%s" % (BASE, rel), "0.9", "daily")

    n_rec = 0
    pages = []
    for man in MANIFESTS:
        if os.path.exists(man):
            pages += json.load(open(man, encoding="utf-8"))["pages"]
    if pages:
        # group the language variants of one record so each entry can carry
        # its alternates
        groups = {}
        for p in pages:
            groups.setdefault((p["section"], p["id"]), []).append(p)
        for key in sorted(groups):
            variants = groups[key]
            alts = [(v["lang"], v["url"]) for v in sorted(variants, key=lambda x: x["lang"])]
            en = next((v for v in variants if v["lang"] == "en"), None)
            if en:
                alts.append(("x-default", en["url"]))
            for v in variants:
                if not v.get("indexable", True):
                    continue          # stub: served, deliberately not listed
                entry(v["url"], "0.7", "monthly", alts)
                n_rec += 1

    L.append("</urlset>")
    body = "\r\n".join(L) + "\r\n"
    with open(os.path.join(ROOT, "sitemap.xml"), "wb") as fh:
        fh.write(body.encode("utf-8"))

    total = n_static + len(DATA_URLS) + n_rec
    print("sitemap.xml: %d URLs  (%d static pages, %d data files, %d record pages)"
          % (total, n_static, len(DATA_URLS), n_rec))


if __name__ == "__main__":
    main()
