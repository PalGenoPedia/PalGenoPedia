#!/usr/bin/env python3
"""
build_history.py - generate one indexable page per documented historical event.

READS   Pages/Historical_Massacres/events.csv          documented events, 1948–present
        Pages/Historical_Massacres/details.csv         categorised rows (sources, war crimes, …)
        Pages/Historical_Massacres/{events,details}_{de,ar}.csv
WRITES  historical-events/massacres/**                 section index + records
        tools/_history_manifest.json                   consumed by the sitemap

Why a separate generator from build_records.py: that one models a *facility*
with a list of *incidents* - a hero, incident cards, attack-type filters,
casualty totals. An event has none of that. It has up to three summary
paragraphs and a set of categorised prose blocks; the four-fact stat strip is
computed from its own fields (hero_pairs()). Different render, same everything
else - this imports build_records for the shell, header, slugs, escaping and
CSV handling so the two cannot drift apart.

Usage
  python tools/build_history.py            build
  python tools/build_history.py --check    report, write nothing
  python tools/build_history.py --reslug   re-derive slugs (breaks live URLs)
"""
import json, os, sys, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_records as B

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MANIFEST = os.path.join(HERE, "_history_manifest.json")

SRC = "Pages/Historical_Massacres"
GROUP, SEG = "historical-events", "massacres"

# The interactive archive stays where it is, beside the CSVs it reads. Its
# #event/<id> anchors are indexed and linked from 404.html, so it keeps its
# URL; these generated pages are an additional, canonical surface.
HUB = "/Pages/Historical_Massacres/massacres.html"

# The interactive Timeline / Map / List page, moved under this section
# 2026-08-27 (was /major-incidents-timeline.html). The section index links
# to it; it links back to these record pages for each historical event.
TIMELINE_PAGE = "/historical-events/massacres/timeline.html"

LABEL = {"en": "Historical Massacres",
         "de": "Historische Massaker",
         "ar": "المجازر التاريخية"}

BACK = {"en": "← Interactive archive",
        "de": "← Interaktives Archiv",
        "ar": "← الأرشيف التفاعلي"}

INDEX_TITLE = {
    "en": "Historical massacres and mass killings in Palestine — documented record",
    "de": "Historische Massaker und Massentötungen in Palästina — dokumentierter Nachweis",
    "ar": "المجازر والقتل الجماعي التاريخية في فلسطين — سجل موثّق",
}
INDEX_DESC = {
    "en": "{n} documented events from 1948 to the present, each with casualty figures, "
          "timeline, testimony, legal classification and cited sources.",
    "de": "{n} dokumentierte Ereignisse von 1948 bis heute, jeweils mit Opferzahlen, "
          "Chronologie, Zeugenaussagen, rechtlicher Einordnung und belegten Quellen.",
    "ar": "{n} حدثًا موثقًا من 1948 حتى اليوم، مع أعداد الضحايا والتسلسل الزمني "
          "والشهادات والتكييف القانوني والمصادر.",
}

# The order sections appear in. Anything the sheet adds that is not listed
# renders after these, under its raw name, rather than being dropped.
CATEGORY_ORDER = ["quick_fact", "casualty", "timeline", "testimony",
                  "war_crime", "legal", "commander", "personality",
                  "historical_impact", "source"]

CATEGORY_LABEL = {
    "quick_fact":        {"en": "At a glance", "de": "Auf einen Blick", "ar": "لمحة سريعة"},
    "casualty":          {"en": "Casualties", "de": "Opfer", "ar": "الضحايا"},
    "timeline":          {"en": "Timeline", "de": "Chronologie", "ar": "التسلسل الزمني"},
    "testimony":         {"en": "Testimony", "de": "Zeugenaussagen", "ar": "الشهادات"},
    "war_crime":         {"en": "War crimes", "de": "Kriegsverbrechen", "ar": "جرائم الحرب"},
    "legal":             {"en": "Legal classification", "de": "Rechtliche Einordnung", "ar": "التكييف القانوني"},
    "commander":         {"en": "Commanders", "de": "Befehlshaber", "ar": "القادة"},
    "personality":       {"en": "Key figures", "de": "Schlüsselfiguren", "ar": "شخصيات رئيسية"},
    "historical_impact": {"en": "Historical impact", "de": "Historische Wirkung", "ar": "الأثر التاريخي"},
    "source":            {"en": "Sources", "de": "Quellen", "ar": "المصادر"},
}

T = {
    "en": {"home": "Home", "events": "Events", "perpetrators": "Perpetrators",
           "classification": "Classification", "location_then": "Location, then",
           "location_now": "Location, now", "context": "Context",
           "source": "Source", "all_events": "All documented events",
           "summary": "Summary", "details": "Documented details", "deaths": "Deaths", "injured": "Injured", "displaced": "Displaced", "data": "Data", "f_date": "Date", "f_location": "Location",
           "timeline_cta": "📅 Explore the interactive timeline, map & list — 1948 to present"},
    "de": {"home": "Startseite", "events": "Ereignisse", "perpetrators": "Täter",
           "classification": "Einordnung", "location_then": "Ort, damals",
           "location_now": "Ort, heute", "context": "Kontext",
           "source": "Quelle", "all_events": "Alle dokumentierten Ereignisse",
           "summary": "Zusammenfassung", "details": "Dokumentierte Angaben", "deaths": "Todesopfer", "injured": "Verletzte", "displaced": "Vertriebene", "data": "Daten", "f_date": "Datum", "f_location": "Ort",
           "timeline_cta": "📅 Interaktive Zeitleiste, Karte & Liste — 1948 bis heute"},
    "ar": {"home": "الرئيسية", "events": "الأحداث", "perpetrators": "الجناة",
           "classification": "التكييف", "location_then": "الموقع، آنذاك",
           "location_now": "الموقع، اليوم", "context": "السياق",
           "source": "المصدر", "all_events": "جميع الأحداث الموثقة",
           "summary": "ملخص", "details": "تفاصيل موثقة", "deaths": "القتلى", "injured": "الجرحى", "displaced": "المهجّرون", "data": "البيانات", "f_date": "التاريخ", "f_location": "الموقع",
           "timeline_cta": "📅 الجدول الزمني التفاعلي والخريطة والقائمة — من 1948 حتى اليوم"},
}


# ── paths ───────────────────────────────────────────────────────────────
def section_index_path(lang):
    return "/%s/%s/" % (GROUP, SEG) if lang == "en" else "/%s/%s/%s/" % (GROUP, SEG, lang)


def rel_url(slug, lang):
    return section_index_path(lang) + slug + "/"


def abs_url(slug, lang):
    return B.BASE_URL + B.url_quote(rel_url(slug, lang))


# ── data ────────────────────────────────────────────────────────────────
def load():
    d = os.path.join(ROOT, SRC)
    events = [r for r in B.read_csv(os.path.join(d, "events.csv"))
              if not B.is_blank(r.get("id"))]
    # details.csv exports ~6,000 blank padding rows past the last real one;
    # a row is real when it has both an event and a category.
    details = [r for r in B.read_csv(os.path.join(d, "details.csv"))
               if B.clean(r.get("event_id")) and B.clean(r.get("category"))]
    # The delta CSVs carry a self-counting detail_id / id formula that drifts
    # once row counts diverge from the base (adding the current-genocide rows
    # did exactly this). `_anchor` holds the base id verbatim — join on that.
    for lang in ("de", "ar"):
        B.merge_translations(events, B.read_csv(os.path.join(d, "events_%s.csv" % lang)), "id", trans_key="_anchor")
        B.merge_translations(details, B.read_csv(os.path.join(d, "details_%s.csv" % lang)), "detail_id", trans_key="_anchor")

    by_event = {}
    for r in details:
        by_event.setdefault(B.clean(r.get("event_id")), []).append(r)
    for rows in by_event.values():
        rows.sort(key=lambda r: (CATEGORY_ORDER.index(B.clean(r.get("category")))
                                 if B.clean(r.get("category")) in CATEGORY_ORDER else 99,
                                 B.num(r.get("order"))))

    known = {B.clean(e.get("id")) for e in events}
    orphan = sorted(k for k in by_event if k not in known)
    if orphan:
        print("  WARNING: %d detail row(s) belong to no event: %s"
              % (sum(len(by_event[k]) for k in orphan), ", ".join(orphan[:5])))
    warn_translation_gaps(d)
    return events, by_event


def warn_translation_gaps(d):
    """Report translation-sheet problems that is_blank() would otherwise hide.

    Not fatal - every case here falls back to English - but three distinct
    causes need three distinct counts, because they need three distinct
    fixes: a formula to repair, columns to add, or nothing at all.
    """
    import csv as _csv

    def rows(path):
        p = __import__("os").path.join(d, path)
        if not __import__("os").path.exists(p):
            return []
        with open(p, encoding="utf-8-sig", newline="") as fh:
            return list(_csv.DictReader(fh))

    base = [r for r in rows("details.csv")
            if B.clean(r.get("event_id")) and B.clean(r.get("category"))]
    base_ids = {r["detail_id"] for r in base}

    for lang in ("de", "ar"):
        trans = rows("details_%s.csv" % lang)
        errors = sum(1 for r in trans
                     if any((v or "").strip().lower() in B.SHEET_ERRORS
                            for k, v in r.items() if k != "detail_id"))
        present = {r["detail_id"] for r in trans if r.get("detail_id") in base_ids}
        missing = len(base_ids - present)
        if errors or missing:
            by_ev = {}
            trans_ids = {r["detail_id"] for r in trans}
            for r in base:
                if r["detail_id"] not in trans_ids:
                    by_ev[r["event_id"]] = by_ev.get(r["event_id"], 0) + 1
            print("  WARNING: details_%s.csv - %d cell(s) are broken formulas "
                  "(#REF! etc), %d row(s) have no translation at all"
                  % (lang, errors, missing))
            if by_ev:
                print("           missing rows by event: %s"
                      % ", ".join("%s=%d" % kv for kv in sorted(by_ev.items())))
            print("           both fall back to English; the formula itself needs "
                  "fixing in the sheet.")

    # value/time have no _de or _ar column in the sheet at all - not a broken
    # row, a column that was never added. Report it once, sized, so it does
    # not read as the same class of problem as the row-level failures above.
    import re
    word = re.compile(r"[A-Za-z]{3,}")
    leaky = {"value": 0, "time": 0}
    for r in base:
        for col in leaky:
            if word.search(r.get(col) or ""):
                leaky[col] += 1
    if any(leaky.values()):
        print("  NOTE: details.csv \"value\" (%d cells) and \"time\" (%d cells) carry "
              "English text with no value_de/time_de or _ar column to translate "
              "from - every language renders them in English. Add the columns "
              "in the sheet if these should translate."
              % (leaky["value"], leaky["time"]))


def load_previous_slugs():
    """Published slugs, keyed by event id.

    Unlike the facility sheets, `id` here is a hand-assigned hist### label,
    not a formula that recounts rows - hist001 has meant Deir Yassin since the
    sheet was written. So it is safe as a slug key, and it is the only key
    available: event_name is not translated, so there is nothing per-language
    to fall back on."""
    if not os.path.exists(MANIFEST):
        return {}
    try:
        old = json.load(open(MANIFEST, encoding="utf-8"))
    except Exception:
        return {}
    return {(p["id"], p["lang"]): p["slug"] for p in old.get("pages", []) if p.get("id")}


def assign_slugs(events, previous, reslug):
    """{event_id: {lang: slug}}.

    event_name has no translated column, so the slug is the same string in all
    three languages. The language still gets its own directory, because the
    page content differs and each needs its own canonical."""
    out, taken = {}, {lang: set() for lang in B.LANGS}
    for ev in events:
        eid = B.clean(ev.get("id"))
        out[eid] = {}
        for lang in B.LANGS:
            prev = previous.get((eid, lang))
            if prev and not reslug:
                out[eid][lang] = prev
                taken[lang].add(prev)
                continue
            base = B.slugify(B.clean(ev.get("event_name"))) or B.slugify(eid)
            s = base
            if s in taken[lang]:
                s = "%s-%s" % (base, B.slugify(eid))
            taken[lang].add(s)
            out[eid][lang] = s
    return out


# ── rendering ───────────────────────────────────────────────────────────
DATE_RE = __import__("re").compile(r"^\d{4}-\d{2}-\d{2}$")


def event_date(ev):
    """Start, or a range when the end is a real date.

    Not every date_end is one - hist004 (Qibya) holds the string "19647",
    which rendered as "1953-10-14 - 19647". A value that does not parse as a
    date is dropped rather than printed at a reader."""
    s = B.clean(ev.get("date_start"))[:10]
    t = B.clean(ev.get("date_end"))[:10]
    if t and t != s and DATE_RE.match(t):
        return "%s – %s" % (s, t)
    return s


_re = __import__("re")
_PAREN_RE = _re.compile(r"\s*\([^)]*\)")


def _short_loc(s):
    """Place name for a stat chip: parentheticals dropped, first comma-part,
    a second only if the pair still fits.
    'Deir Yassin (Dayr Yasin), Jerusalem, British Mandate' -> 'Deir Yassin, Jerusalem'."""
    s = _PAREN_RE.sub("", s or "").strip()
    parts = [p.strip().split(" - ")[0].strip() for p in s.split(",") if p.strip()]
    if not parts:
        return ""
    out = parts[0]
    if len(parts) > 1 and len(out) + len(parts[1]) <= 34:
        out += ", " + parts[1]
    return out[:40].rstrip(" ,;–-") + ("…" if len(out) > 40 else "")


def _short_qty(s):
    """Casualty figure for a stat chip: the leading quantity, before any
    '(', ';' or clause break. '223 Palestinians (189 during 2018…)' -> '223 Palestinians'.
    A bare integer gets thousands separators ('5000' -> '5,000')."""
    s = (s or "").strip()
    s = _re.split(r"\s*[(;]|\s+[-–]\s+", s, 1)[0].strip().rstrip(".,")
    if s.isdigit():
        return "{:,}".format(int(s))
    return s[:42].rstrip(" ,;–-") + ("…" if len(s) > 42 else "")


def hero_pairs(ev, t):
    """The four stat-strip facts, computed from the event's own fields.
    The sheet no longer carries hero_1..4 columns — this replaces them with
    Date / Location / Deaths / (Displaced or Injured, whichever is recorded)."""
    a_ = B.clean
    out = []
    d = event_date(ev)
    if d:
        out.append((d, t["f_date"]))
    loc = _short_loc(a_(ev.get("location_historical")))
    if loc:
        out.append((loc, t["f_location"]))
    def _q(field):
        v = a_(ev.get(field))
        return "" if v in ("", "0", "0.0", "None") else _short_qty(v)

    deaths = _q("deaths")
    if deaths:
        out.append((deaths, t["deaths"]))
    disp, inj = _q("forced_displacement"), _q("injured")
    if disp:
        out.append((disp, t["displaced"]))
    elif inj:
        out.append((inj, t["injured"]))
    return out


def summary_paragraphs(ev, lang):
    """English carries three authored paragraphs; the translation tabs carry a
    single brief_summary instead, so the shape differs by language."""
    if lang == "en":
        return [B.clean(ev.get("summary_para_%d" % i)) for i in (1, 2, 3)
                if B.clean(ev.get("summary_para_%d" % i))]
    s = B.clean(ev.get("brief_summary_%s" % lang))
    return [s] if s else [B.clean(ev.get("summary_para_1"))]


def jsonld(ev, slug, lang, url, summary):
    name = B.clean(ev.get("event_name"))
    node = {
        "@context": "https://schema.org", "@type": "Event",
        "@id": url + "#event", "url": url, "name": name,
        "description": summary[:300],
        "eventStatus": "https://schema.org/EventScheduled",
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "inLanguage": lang,
        "isPartOf": {"@id": B.BASE_URL + "/#website"},
    }
    if B.clean(ev.get("date_start")):
        node["startDate"] = B.clean(ev.get("date_start"))[:10]
    # Same guard as event_date(): 14 of 17 rows hold a raw spreadsheet serial
    # number in date_end ("19647"), not a date. Schema.org requires ISO 8601
    # here, so a value that doesn't parse is omitted rather than shipped
    # invalid into indexed structured data.
    end = B.clean(ev.get("date_end"))[:10]
    if end and DATE_RE.match(end):
        node["endDate"] = end
    place = B.get_field(ev, "location_historical", lang) or B.clean(ev.get("location_historical"))
    if place:
        node["location"] = {"@type": "Place", "name": place}
        lat, lng = B.clean(ev.get("location_lat")), B.clean(ev.get("location_lng"))
        if lat and lng:
            node["location"]["geo"] = {"@type": "GeoCoordinates",
                                       "latitude": lat, "longitude": lng}
    crumbs = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": T[lang]["home"],
             "item": B.BASE_URL + ("/" if lang == "en" else "/%s/" % lang)},
            {"@type": "ListItem", "position": 2, "name": LABEL[lang],
             "item": B.BASE_URL + B.url_quote(section_index_path(lang))},
            {"@type": "ListItem", "position": 3, "name": name, "item": url},
        ],
    }
    return [node, crumbs]


def render_event(ev, details, slugs, lang):
    e, a_ = B.e, B.clean
    t = T[lang]
    eid = a_(ev.get("id"))
    name = a_(ev.get("event_name"))
    etype = B.get_field(ev, "event_type", lang) or a_(ev.get("event_type"))
    context = B.get_field(ev, "date_context", lang) or a_(ev.get("date_context"))
    loc_then = B.get_field(ev, "location_historical", lang) or a_(ev.get("location_historical"))
    loc_now = B.get_field(ev, "location_current", lang) or a_(ev.get("location_current"))
    classif = B.get_field(ev, "classification", lang) or a_(ev.get("classification"))
    perps = a_(ev.get("perpetrators"))
    paras = summary_paragraphs(ev, lang)

    canonical = abs_url(slugs[lang], lang)
    alts = [(l2, abs_url(slugs[l2], l2)) for l2 in B.LANGS]
    alts.append(("x-default", abs_url(slugs["en"], "en")))
    alts_rel = [(l2, B.url_quote(rel_url(slugs[l2], l2))) for l2 in B.LANGS]

    title = "%s — %s | %s" % (name, LABEL[lang], B.SITE)
    desc = (paras[0][:155] if paras else
            "%s, %s. %s" % (name, event_date(ev), etype))[:158]

    L = B.head_common(title, desc, canonical, alts, B.OG_IMAGE, B.INDEXABLE, lang)
    for block in jsonld(ev, slugs[lang], lang, canonical, paras[0] if paras else desc):
        L.append('<script type="application/ld+json">')
        L.append(json.dumps(block, ensure_ascii=False, indent=2))
        L.append("</script>")
    L.append("</head>")
    L.append('<body class="rp-hist rp-hist-event"%s>' % (' dir="rtl"' if lang in B.RTL else ""))
    L.extend(B.site_header(lang, alts_rel, t, "/historical-events/"))
    subtitle = " · ".join([x for x in (etype, event_date(ev), context) if x])
    L.extend(B.page_subheader(name, subtitle, None, None, None))

    a = L.append
    pairs = hero_pairs(ev, t)
    if pairs:
        L.extend(B.stats_strip(pairs))

    a('<div class="container" style="padding-top:1.75rem">')

    # facts that do not fit the four hero slots
    facts = [(t["location_then"], loc_then), (t["location_now"], loc_now),
             (t["perpetrators"], perps), (t["classification"], classif)]
    facts = [(k, v) for k, v in facts if v]
    if facts:
        a('<div class="rp-table-wrap"><table class="rp-table rp-table--prose"><tbody>')
        for k, v in facts:
            a("<tr><th>%s</th><td>%s</td></tr>" % (e(k), e(v)))
        a("</tbody></table></div>")

    if paras:
        a('<h2 class="detail-section-title">%s</h2>' % e(t["summary"]))
        for p in paras:
            a('<p class="rp-lede">%s</p>' % e(p))

    # categorised detail blocks, in CATEGORY_ORDER
    seen = []
    for row in details:
        cat = a_(row.get("category"))
        if cat not in seen:
            seen.append(cat)
    for cat in seen:
        rows = [r for r in details if a_(r.get("category")) == cat]
        lbl = CATEGORY_LABEL.get(cat, {}).get(lang) or cat.replace("_", " ").title()
        a('<h2 class="detail-section-title">%s</h2>' % e(lbl))
        # One card per row — mirrors the timeline modal's enrichment cards
        # (.dtm-detail-row / .dtm-testimony / .dtm-timeline-row in
        # js/dual-timeline-manager.js). testimony and timeline get their own
        # card variant; everything else is a plain heading + body + source card.
        a('<div class="rp-cards rp-cards--%s">' % e(cat))
        for r in rows:
            head = B.get_field(r, "heading_label", lang) or a_(r.get("heading_label"))
            body = B.get_field(r, "content", lang) or a_(r.get("content"))
            val = a_(r.get("value"))
            when = a_(r.get("time"))
            src = a_(r.get("source"))
            link = a_(r.get("source_link"))
            # In a Sources section the source IS the heading. When there is no
            # heading_label, promote the (localised) content / source name to
            # the heading so nothing renders as an empty card or a name echoed
            # twice.
            if cat == "source" and not head:
                head = body or src
                body = ""
            if cat == "source" and (body == head or body == src):
                body = ""
            src_html = ""
            if src and src != head:
                cited = ('<a href="%s" rel="nofollow noopener" target="_blank">%s</a>'
                         % (e(link), e(src))) if link.startswith("http") else e(src)
                src_html = '<div class="rp-card-src">%s</div>' % cited
            elif cat == "source" and link.startswith("http"):
                src_html = ('<div class="rp-card-src"><a href="%s" rel="nofollow noopener" '
                            'target="_blank">%s</a></div>' % (e(link), e(link)))

            if cat == "testimony":
                quote = '“%s”' % e(body) if body else ""
                a('<div class="rp-card rp-card--testimony">'
                  '<div class="rp-card-head">%s</div>'
                  '<div class="rp-card-body">%s</div>%s</div>'
                  % (e(head or t.get("summary", "")), quote, src_html))
            elif cat == "timeline":
                body_html = '<div class="rp-card-body">%s</div>' % e(body) if body else ""
                a('<div class="rp-card rp-card--timeline">'
                  '<div class="rp-card-time">%s</div>'
                  '<div class="rp-card-main"><div class="rp-card-head">%s</div>%s%s</div>'
                  '</div>' % (e(when), e(head), body_html, src_html))
            else:
                title = e(head)
                if val:
                    title += ' <span class="rp-card-val">%s</span>' % e(val)
                elif when:
                    title = e(" ".join([x for x in (when, head) if x]))
                body_html = '<div class="rp-card-body">%s</div>' % e(body) if body else ""
                a('<div class="rp-card"><div class="rp-card-head">%s</div>%s%s</div>'
                  % (title, body_html, src_html))
        a('</div>')

    a('<p style="margin-top:2rem"><a href="%s">%s</a></p>'
      % (B.url_quote(section_index_path(lang)), e(t["all_events"])))
    a("</div>")
    a("</body>")
    a("</html>")
    return B.CRLF.join(L) + B.CRLF


def render_index(events, by_event, slug_map, lang):
    e = B.e
    t = T[lang]
    canonical = B.BASE_URL + B.url_quote(section_index_path(lang))
    alts = [(l2, B.BASE_URL + B.url_quote(section_index_path(l2))) for l2 in B.LANGS]
    alts.append(("x-default", B.BASE_URL + B.url_quote(section_index_path("en"))))
    alts_rel = [(l2, B.url_quote(section_index_path(l2))) for l2 in B.LANGS]

    title = "%s | %s" % (INDEX_TITLE[lang], B.SITE)
    desc = INDEX_DESC[lang].format(n=len(events))

    block = {
        "@context": "https://schema.org", "@type": "CollectionPage",
        "@id": canonical + "#page", "url": canonical, "name": INDEX_TITLE[lang],
        "description": desc, "inLanguage": lang,
        "isPartOf": {"@id": B.BASE_URL + "/#website"},
    }
    crumbs = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": t["home"],
             "item": B.BASE_URL + ("/" if lang == "en" else "/%s/" % lang)},
            {"@type": "ListItem", "position": 2, "name": LABEL[lang], "item": canonical},
        ],
    }

    L = B.head_common(title, desc, canonical, alts, B.OG_IMAGE, B.INDEXABLE, lang)
    for blk in (block, crumbs):
        L.append('<script type="application/ld+json">')
        L.append(json.dumps(blk, ensure_ascii=False, indent=2))
        L.append("</script>")
    L.append("</head>")
    L.append('<body class="rp-hist rp-hist-index"%s>' % (' dir="rtl"' if lang in B.RTL else ""))
    L.extend(B.site_header(lang, alts_rel, t, "/historical-events/"))
    L.extend(B.page_subheader(LABEL[lang], desc, None, None, None))

    total_details = sum(len(by_event.get(B.clean(x.get("id")), [])) for x in events)
    L.extend(B.stats_strip([(len(events), t["events"]),
                            (total_details, t["details"])]))

    a = L.append
    a('<div class="container" style="padding-top:1.75rem">')
    a('<a class="rp-hist-timeline-cta" href="%s">%s</a>'
      % (B.url_quote(TIMELINE_PAGE), e(t["timeline_cta"])))
    a('<h2 class="detail-section-title">%s</h2>' % e(t["all_events"]))
    a('<div class="cards-grid">')
    for ev in sorted(events, key=lambda x: B.clean(x.get("date_start"))):
        eid = B.clean(ev.get("id"))
        nm = B.clean(ev.get("event_name"))
        etype = B.get_field(ev, "event_type", lang) or B.clean(ev.get("event_type"))
        classif = B.get_field(ev, "classification", lang) or B.clean(ev.get("classification"))
        place = B.get_field(ev, "location_historical", lang) or B.clean(ev.get("location_historical"))
        paras = summary_paragraphs(ev, lang)
        a('<a class="card rec-card" href="%s">'
          % B.url_quote(rel_url(slug_map[eid][lang], lang)))
        if classif:
            # the classification is the first thing the interactive archive
            # shows, and it is the thing that makes the card worth opening
            a('<span class="rec-badge">%s</span>' % e(classif.split(";")[0].strip()))
        a('<div class="card-header"><h3 class="card-title">%s</h3></div>' % e(nm))
        if place:
            a('<div class="card-sub">&#128205; %s</div>' % e(place))
        a('<div class="card-sub">&#128197; %s</div>'
          % e(" · ".join([x for x in (event_date(ev), etype) if x])))
        a('<div class="university-quick-facts">')
        for col, lbl in (("deaths", t["deaths"]), ("injured", t["injured"]),
                         ("forced_displacement", t["displaced"])):
            v = B.clean(ev.get(col))
            a('<div class="quick-fact"><div class="quick-fact-value">%s</div>'
              '<div class="quick-fact-label">%s</div></div>'
              % (e(v) if v else "\u2014", e(lbl)))
        a("</div>")
        if paras:
            a('<div class="card-excerpt">%s</div>' % e(paras[0]))
        a("</a>")
    a("</div>")
    a("</div>")
    a('<script src="/js/record-page.js?v=5" defer></script>')
    a("</body>")
    a("</html>")
    return B.CRLF.join(L) + B.CRLF


# ── build ───────────────────────────────────────────────────────────────
def main():
    check = "--check" in sys.argv
    reslug = "--reslug" in sys.argv

    events, by_event = load()
    slug_map = assign_slugs(events, load_previous_slugs(), reslug)
    print("\nmassacres: %d events x %d languages" % (len(events), len(B.LANGS)))

    manifest, written, expected = [], 0, set()

    for ev in events:
        eid = B.clean(ev.get("id"))
        details = by_event.get(eid, [])
        for lang in B.LANGS:
            rel = rel_url(slug_map[eid][lang], lang)
            out = os.path.join(ROOT, *(rel.strip("/").split("/") + ["index.html"]))
            expected.add(os.path.normpath(out))
            manifest.append({"url": abs_url(slug_map[eid][lang], lang), "path": rel,
                             "lang": lang, "section": "massacres", "id": eid,
                             "slug": slug_map[eid][lang], "details": len(details),
                             "indexable": True})
            if check:
                continue
            os.makedirs(os.path.dirname(out), exist_ok=True)
            page = render_event(ev, details, slug_map[eid], lang)
            page = page.replace(B.CRLF, B.LF).replace(B.LF, B.CRLF)
            with open(out, "wb") as fh:
                fh.write(page.encode("utf-8"))
            written += 1

    for lang in B.LANGS:
        rel = section_index_path(lang)
        out = os.path.join(ROOT, *(rel.strip("/").split("/") + ["index.html"]))
        expected.add(os.path.normpath(out))
        manifest.append({"url": B.BASE_URL + B.url_quote(rel), "path": rel, "lang": lang,
                         "section": "massacres", "id": "", "slug": "", "details": 0,
                         "indexable": True, "kind": "index"})
        if check:
            continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        page = render_index(events, by_event, slug_map, lang)
        page = page.replace(B.CRLF, B.LF).replace(B.LF, B.CRLF)
        with open(out, "wb") as fh:
            fh.write(page.encode("utf-8"))
        written += 1

    # drop pages for events that no longer exist
    removed = 0
    if not check:
        for lang in B.LANGS:
            root_dir = os.path.join(ROOT, *section_index_path(lang).strip("/").split("/"))
            if not os.path.isdir(root_dir):
                continue
            for entry in os.listdir(root_dir):
                if lang == "en" and entry in B.LANGS:
                    continue
                f = os.path.normpath(os.path.join(root_dir, entry, "index.html"))
                if os.path.isfile(f) and f not in expected:
                    os.remove(f)
                    try:
                        os.rmdir(os.path.dirname(f))
                    except OSError:
                        pass
                    removed += 1
                    print("  removed stale %s" % os.path.relpath(f, ROOT))

    if check:
        print("--check: would write %d pages" % len(manifest))
        return

    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"generated": datetime.date.today().isoformat(),
                   "count": len(manifest), "pages": manifest},
                  fh, ensure_ascii=False, indent=2)
    print("wrote %d pages, removed %d stale" % (written, removed))
    print("manifest -> %s" % os.path.relpath(MANIFEST, ROOT))


if __name__ == "__main__":
    main()
