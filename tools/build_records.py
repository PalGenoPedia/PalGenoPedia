#!/usr/bin/env python3
"""
build_records.py - generate one indexable page per documented record.

WHY
  The hub pages route to a record with a URL fragment
  (#hospital/al-shifa-medical-complex). A fragment is stripped before the
  request is sent, so every record collapses into the one page that hosts it
  and none of them can rank on their own. This turns the same CSVs into real
  URLs, in every language the data already covers.

READS   Pages/War_Crimes_Stats/<dir>/<Facilities>.csv   (+ _de, _ar)
        Pages/War_Crimes_Stats/<dir>/<Incidents>.csv    (+ _de, _ar)

WRITES  /<section>/<slug>.html          (en, canonical)
        /de/<section>/<slug>.html
        /ar/<section>/<slug>.html
        tools/_records_manifest.json    (URL list, consumed by the sitemap step)

Content is baked into the HTML at build time. js/record-page.js only adds
behaviour on top - the pages are complete with JavaScript disabled, which is
the entire point of generating them.

Field lookup is <field>_<lang> with a fallback to the English column, the same
getField() contract Pages/War_Crimes_Stats/shared.js uses at runtime.

Idempotent: re-run after every Google Sheets export. Output files are rewritten
in place; stale files for records that no longer exist are removed.

Usage
  python tools/build_records.py                 build everything configured
  python tools/build_records.py --only hospitals
  python tools/build_records.py --check         report, write nothing
"""
import csv, json, os, re, sys, html, hashlib, unicodedata, datetime

# Slugs include Arabic script (de/ar record paths). A Windows console defaults
# stdout to the system codepage (cp1252), not UTF-8, so printing one crashes
# --check's manifest preview with UnicodeEncodeError. reconfigure() is
# Python 3.7+; stdlib-only, matches the rest of this file.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

BASE_URL = "https://palgenopedia.org"
SITE = "PalGenoPedia"
OG_IMAGE = BASE_URL + "/images/og-card.png"
LANGS = ("en", "de", "ar")
LF = chr(10)
CRLF = chr(13) + chr(10)
RTL = ("ar",)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MANIFEST = os.path.join(HERE, "_records_manifest.json")


# url -> {"snap": <wayback url>|None, "pending": bool}, from tools/archive_links.py
# (weekly Action, state in data/archived-links.json). Lets each incident show
# whether we hold an independent copy of its web sources. "pending" = the URL is
# queued for capture but the snapshot hasn't landed yet.
def _load_archived():
    p = os.path.join(ROOT, "data", "archived-links.json")
    try:
        d = json.load(open(p, encoding="utf-8"))
    except Exception:
        return {}
    out = {}
    for u, v in d.items():
        if v.get("status") == "archived" and v.get("wayback"):
            out[u] = {"snap": v["wayback"], "pending": False}
        elif v.get("status") in ("requested", "failed", "new"):
            out[u] = {"snap": None, "pending": True}
    return out

ARCHIVED = _load_archived()


def archive_of(url):
    """(snap_url, pending) for a source URL. Matches archive_links.py's own
    normalisation (no trailing slash or #fragment). (None, False) when the URL
    is not tracked at all."""
    key = (url or "").strip().rstrip("/").split("#")[0]
    e = ARCHIVED.get(key) or ARCHIVED.get(url)
    if not e:
        return None, False
    return e["snap"], e["pending"]

# ── what to build ────────────────────────────────────────────────────────
# Pilot scope is hospitals. The other categories are the same shape - add an
# entry here and re-run; no new code is needed.
SECTIONS = {
    "hospitals": {
        "dir": "Pages/War_Crimes_Stats/stat-hospitals-attacked",
        "facilities": "Hospital_facilities",
        "incidents": "Hospital_incidents",
        "resources": "hospitals-resources",
        "hub": "/Pages/War_Crimes_Stats/stat-hospitals-attacked.html",
        "hash_prefix": "hospital",
        "schema_type": "Hospital",
        # Hospital_facilities.csv also carries 10 mosques and 13 universities
        # (9 of them duplicated from the religious/university datasets). Without
        # this allow-list the generator would publish /hospitals/omari-mosque/
        # and later /religious-sites/omari-mosque/ - the same record at two
        # URLs. Filter here so the output is right whatever the sheet contains.
        "types": ("hospital", "field hospital", "clinic", "medical centre",
                  "medical center", "health centre", "health center"),
        # Path is /<group>/<seg>/ with the language as a directory inside it.
        # Record slugs are still localised (see slugify_lang); the section
        # segment is not, so one folder holds all three languages.
        "group": "war-crimes",
        "seg": "hospitals",
        "label": {"en": "Hospitals", "de": "Krankenhäuser", "ar": "المستشفيات"},
        "noun": {"en": "hospital", "de": "Krankenhaus", "ar": "مستشفى"},
    },
    "universities": {
        "dir": "Pages/War_Crimes_Stats/stat-universities-attacked",
        "facilities": "University_facilities",
        "incidents": "University_incidents",
        # No University_*-resources.csv exists yet; the resources tab renders
        # its empty state until one is added. Nothing else needs changing.
        "hub": "/Pages/War_Crimes_Stats/stat-universities-damaged.html",
        "schema_type": "CollegeOrUniversity",
        # Everything in this sheet belongs here, but the allow-list is kept so
        # a stray hospital or mosque pasted into the tab cannot claim a
        # /universities/ URL - the same guard the hospitals section needs.
        "types": ("university", "technical college", "college",
                  "training institute"),
        "group": "war-crimes",
        "seg": "universities",
        "label": {"en": "Universities", "de": "Universitäten", "ar": "الجامعات"},
        "noun": {"en": "university", "de": "Universität", "ar": "جامعة"},
    },
    "schools": {
        "dir": "Pages/War_Crimes_Stats/stat-schools-attacked",
        "facilities": "School_facilities",
        "incidents": "School_incidents",
        "hub": "/Pages/War_Crimes_Stats/stat-schools-destroyed.html",
        "schema_type": "School",
        # The sheet spells it both "School" and "school"; the filter lowercases
        # before comparing, so one entry covers both.
        "types": ("school",),
        "group": "war-crimes",
        "seg": "schools",
        "label": {"en": "Schools", "de": "Schulen", "ar": "المدارس"},
        "noun": {"en": "school", "de": "Schule", "ar": "مدرسة"},
    },
    "religious-sites": {
        "dir": "Pages/War_Crimes_Stats/stat-religious-attacked",
        # The source spreadsheet spells the tab "Religous"; the files it
        # exports carry that spelling through. Renaming it there would break
        # the sync, so the typo stays in the filename and nowhere else - the
        # section, its URL segment and its labels are all spelled correctly.
        "facilities": "Religous_facilities",
        "incidents": "Religous_incidents",
        "hub": "/Pages/War_Crimes_Stats/stat-religious-sites.html",
        # One type for the section, because a section takes one. Mosques,
        # churches and a monastery are all PlaceOfWorship; using Church or
        # Mosque here would mislabel most of the records.
        "schema_type": "PlaceOfWorship",
        "types": ("mosque", "historic mosque", "neighborhood mosque",
                  "greek orthodox church", "catholic church", "baptist church",
                  "ancient monastery"),
        "group": "war-crimes",
        "seg": "religious-sites",
        "label": {"en": "Religious Sites", "de": "Religiöse Stätten",
                  "ar": "المواقع الدينية"},
        "noun": {"en": "religious site", "de": "religiöse Stätte",
                 "ar": "موقع ديني"},
    },
}

# ── UI strings (the record data itself comes from the CSVs) ──────────────
T = {
    "en": {
        "site_tag": "Documented war crimes, massacres and humanitarian violations concerning Palestine",
        "back": "← Back to all {section}",
        "home": "Home",
        "incidents_recorded": "Incidents recorded",
        "civilians_killed": "Civilians killed",
        "capacity": "Capacity (pre-war)",
        "specialization": "Specialization",
        "overview": "Overview",
        "details": "Facility details",
        "incident_history": "Incident history",
        "no_incidents": "No incidents are documented for this facility yet.",
        "sources": "Sources",
        "arch_some": "{k} of {n} web sources independently archived",
        "arch_pending": "archiving pending",
        "arch_copy": "archived",
        "killed": "killed", "injured": "injured",
        "hw_killed": "health workers killed", "hw_injured": "health workers injured",
        "type": "Type", "subtype": "Sub-type", "governorate": "Governorate",
        "area": "Area", "beds": "Beds before the war",
        "pre_status": "Status before the war", "post_status": "Status after attacks",
        "notes": "Notes", "coords": "Coordinates",
        "all": "All",
        "provenance": "This page is generated from the project's open dataset. Every figure carries a source.",
        "data_links": "Machine-readable data:",
        "interactive": "Open the interactive {section} database",
        "meta_tpl": "{name} in {place}: documented attacks, casualties and sources. {n} recorded incident(s).",
        'close': 'Close',
        'incident': 'Incident',
        'view_incident': 'View full incident',
        'full_description': 'Full description',
        'summary_label': 'Summary',
        'watch_video': 'Watch video',
        'archived_video': 'Archived video',
        'video_evidence': 'Video evidence',
        'recorded_by': 'Recorded by',
        'prev_incident': 'Previous',
        'next_incident': 'Next',
        'ch_over_time': 'Attacks over time',
        'ch_over_time_cap': 'Documented incidents per month, {i} in total',
        'ch_by_type_cap': 'Documented incidents by type of attack',
        'ch_by_gov_cap': 'Documented incidents by governorate',
        'tab_overview': 'Overview',
        'tab_incidents': 'Incidents',
        'tab_timeline': 'Timeline',
        'tab_statistics': 'Statistics',
        'tab_resources': 'Resources',
        'tabpage_h1_overview': '{section} in Gaza — overview',
        'tabpage_h1_incidents': 'Every documented incident at {section}',
        'tabpage_h1_timeline': '{section}: chronology of attacks',
        'tabpage_h1_statistics': '{section}: statistics',
        'tabpage_h1_resources': '{section}: sources and reports',
        'tabpage_title_overview': '{section} attacked in Gaza — overview | {site}',
        'tabpage_title_incidents': 'Documented incidents at {section} in Gaza | {site}',
        'tabpage_title_timeline': 'Timeline of attacks on {section} in Gaza | {site}',
        'tabpage_title_statistics': '{section} attack statistics, Gaza | {site}',
        'tabpage_title_resources': 'Sources and reports on {section} in Gaza | {site}',
        'tabpage_desc_overview': '{n} documented {section} with {i} recorded incidents. Key figures, the most heavily targeted facilities, and where to read the underlying records.',
        'tabpage_desc_incidents': 'The complete register of {i} documented incidents at {section} in Gaza, grouped by type of attack, each linked to the facility it struck.',
        'tabpage_desc_timeline': 'All {i} documented attacks on {section} in Gaza in chronological order, year by year, with casualties and sources.',
        'tabpage_desc_statistics': 'Aggregate figures for {i} documented incidents at {n} {section}: totals by governorate, by type of attack, by year, and casualties.',
        'tabpage_desc_resources': 'Reports, investigations and primary sources documenting attacks on {section} in Gaza.',
        'ov_summary': 'Summary',
        'ov_most_targeted': 'Most heavily targeted',
        'st_by_governorate': 'Incidents by governorate',
        'st_by_type': 'Incidents by type of attack',
        'st_by_year': 'Incidents by year',
        'st_casualties': 'Casualties',
        'st_year': 'Year',
        'st_measure': 'Measure',
        'st_total': 'Total',
        'undated': 'Undated',
        'no_resources': 'No sources are catalogued for this section yet.',
        'type_labels': {'airstrike': 'Airstrike', 'direct': 'Direct attack', 'siege': 'Siege', 'invasion': 'Invasion / ground assault', 'indirect': 'Nearby / indirect', 'access': 'Access restricted', 'unidentified': 'Unspecified'},
        'nav': {'nav.warCrimes': '⚖️ War Crimes', 'nav.hungerCrisis': '🍽️ Hunger Crisis', 'nav.historical': '📜 History', 'nav.timeline': '📋 Timeline', 'nav.joinUs': '🤝 Join Us'},
        'total_incidents': 'Total incidents',
        'civilians_injured': 'Civilians injured',
        'hw_killed_short': 'Health workers killed',
        'facility_information': 'Facility information',
        'incident_types': 'Incident types',
        'unidentified': 'Unidentified',
        'full_account': 'Read the full account',
        'back_to': '← {section} database',
        'tab_overview': 'Overview',
        'tab_incidents': 'Incidents',
        'tab_timeline': 'Timeline',
        'tab_statistics': 'Statistics',
        'interactive_short': '← Interactive database',
        'data': 'Data',
        'all_of': 'All {section}',
        'all_records': 'All documented facilities',
        'index_title': '{section} attacked in Gaza — documented record | {site}',
        'index_desc': '{n} documented {section} with {i} recorded incidents. Each entry lists attacks, casualties and sources.',
        'pending': 'no incidents yet',
    },
    "de": {
        "site_tag": "Dokumentierte Kriegsverbrechen, Massaker und humanitäre Völkerrechtsverletzungen in Palästina",
        "back": "← Zurück zu allen {section}",
        "home": "Startseite",
        "incidents_recorded": "Erfasste Vorfälle",
        "civilians_killed": "Getötete Zivilisten",
        "capacity": "Kapazität (Vorkriegszeit)",
        "specialization": "Fachrichtung",
        "overview": "Überblick",
        "details": "Angaben zur Einrichtung",
        "incident_history": "Chronik der Vorfälle",
        "no_incidents": "Für diese Einrichtung sind bislang keine Vorfälle dokumentiert.",
        "sources": "Quellen",
        "arch_some": "{k} von {n} Web-Quellen unabhängig archiviert",
        "arch_pending": "Archivierung ausstehend",
        "arch_copy": "archiviert",
        "killed": "getötet", "injured": "verletzt",
        "hw_killed": "getötete Beschäftigte im Gesundheitswesen",
        "hw_injured": "verletzte Beschäftigte im Gesundheitswesen",
        "type": "Typ", "subtype": "Untertyp", "governorate": "Gouvernement",
        "area": "Gebiet", "beds": "Betten vor dem Krieg",
        "pre_status": "Zustand vor dem Krieg", "post_status": "Zustand nach den Angriffen",
        "notes": "Anmerkungen", "coords": "Koordinaten",
        "all": "Alle",
        "provenance": "Diese Seite wird aus dem offenen Datensatz des Projekts erzeugt. Jede Zahl ist mit einer Quelle belegt.",
        "data_links": "Maschinenlesbare Daten:",
        "interactive": "Interaktive Datenbank der {section} öffnen",
        "meta_tpl": "{name} in {place}: dokumentierte Angriffe, Opferzahlen und Quellen. {n} erfasste(r) Vorfall/Vorfälle.",
        'close': 'Schließen',
        'incident': 'Vorfall',
        'view_incident': 'Vollständigen Vorfall ansehen',
        'full_description': 'Ausführliche Darstellung',
        'summary_label': 'Zusammenfassung',
        'watch_video': 'Video ansehen',
        'archived_video': 'Archiviertes Video',
        'video_evidence': 'Videobelege',
        'recorded_by': 'Erfasst von',
        'prev_incident': 'Zurück',
        'next_incident': 'Weiter',
        'ch_over_time': 'Angriffe im Zeitverlauf',
        'ch_over_time_cap': 'Dokumentierte Vorfälle pro Monat, insgesamt {i}',
        'ch_by_type_cap': 'Dokumentierte Vorfälle nach Angriffsart',
        'ch_by_gov_cap': 'Dokumentierte Vorfälle nach Gouvernement',
        'tab_overview': 'Überblick',
        'tab_incidents': 'Vorfälle',
        'tab_timeline': 'Zeitleiste',
        'tab_statistics': 'Statistik',
        'tab_resources': 'Quellen',
        'tabpage_h1_overview': '{section} in Gaza — Überblick',
        'tabpage_h1_incidents': 'Alle dokumentierten Vorfälle an {section}',
        'tabpage_h1_timeline': '{section}: Chronologie der Angriffe',
        'tabpage_h1_statistics': '{section}: Statistik',
        'tabpage_h1_resources': '{section}: Quellen und Berichte',
        'tabpage_title_overview': 'Angegriffene {section} in Gaza — Überblick | {site}',
        'tabpage_title_incidents': 'Dokumentierte Vorfälle an {section} in Gaza | {site}',
        'tabpage_title_timeline': 'Chronologie der Angriffe auf {section} in Gaza | {site}',
        'tabpage_title_statistics': 'Angriffsstatistik {section}, Gaza | {site}',
        'tabpage_title_resources': 'Quellen und Berichte zu {section} in Gaza | {site}',
        'tabpage_desc_overview': '{n} dokumentierte {section} mit {i} erfassten Vorfällen. Kennzahlen, die am stärksten betroffenen Einrichtungen und der Weg zu den Einzelnachweisen.',
        'tabpage_desc_incidents': 'Das vollständige Verzeichnis von {i} dokumentierten Vorfällen an {section} in Gaza, nach Angriffsart gegliedert und jeweils mit der betroffenen Einrichtung verknüpft.',
        'tabpage_desc_timeline': 'Alle {i} dokumentierten Angriffe auf {section} in Gaza in chronologischer Reihenfolge, Jahr für Jahr, mit Opferzahlen und Quellen.',
        'tabpage_desc_statistics': 'Aggregierte Zahlen zu {i} dokumentierten Vorfällen an {n} {section}: nach Gouvernement, nach Angriffsart, nach Jahr sowie Opferzahlen.',
        'tabpage_desc_resources': 'Berichte, Untersuchungen und Primärquellen zu Angriffen auf {section} in Gaza.',
        'ov_summary': 'Zusammenfassung',
        'ov_most_targeted': 'Am stärksten betroffen',
        'st_by_governorate': 'Vorfälle nach Gouvernement',
        'st_by_type': 'Vorfälle nach Angriffsart',
        'st_by_year': 'Vorfälle nach Jahr',
        'st_casualties': 'Opferzahlen',
        'st_year': 'Jahr',
        'st_measure': 'Kennzahl',
        'st_total': 'Gesamt',
        'undated': 'Ohne Datum',
        'no_resources': 'Für diesen Bereich sind noch keine Quellen erfasst.',
        'type_labels': {'airstrike': 'Luftangriff', 'direct': 'Direkter Angriff', 'siege': 'Belagerung', 'invasion': 'Invasion / Bodenangriff', 'indirect': 'Umfeld / indirekt', 'access': 'Zugang verwehrt', 'unidentified': 'Nicht angegeben'},
        'nav': {'nav.warCrimes': '⚖️ Kriegsverbrechen', 'nav.hungerCrisis': '🍽️ Hungerkrise', 'nav.historical': '📜 Geschichte', 'nav.timeline': '📋 Zeitleiste', 'nav.joinUs': '🤝 Mitmachen'},
        'total_incidents': 'Vorfälle insgesamt',
        'civilians_injured': 'Verletzte Zivilisten',
        'hw_killed_short': 'Getötete Gesundheitskräfte',
        'facility_information': 'Angaben zur Einrichtung',
        'incident_types': 'Art der Vorfälle',
        'unidentified': 'Nicht bestimmt',
        'full_account': 'Ausführliche Darstellung lesen',
        'back_to': '← Datenbank: {section}',
        'tab_overview': 'Überblick',
        'tab_incidents': 'Vorfälle',
        'tab_timeline': 'Zeitleiste',
        'tab_statistics': 'Statistik',
        'interactive_short': '← Interaktive Datenbank',
        'data': 'Daten',
        'all_of': 'Alle {section}',
        'all_records': 'Alle dokumentierten Einrichtungen',
        'index_title': 'Angegriffene {section} in Gaza — dokumentierte Belege | {site}',
        'index_desc': '{n} dokumentierte {section} mit {i} erfassten Vorfällen. Jeder Eintrag nennt Angriffe, Opferzahlen und Quellen.',
        'pending': 'noch keine Vorfälle',
    },
    "ar": {
        "site_tag": "جرائم حرب ومجازر وانتهاكات إنسانية موثّقة في فلسطين",
        "back": "← العودة إلى جميع {section}",
        "home": "الرئيسية",
        "incidents_recorded": "الحوادث الموثّقة",
        "civilians_killed": "المدنيون القتلى",
        "capacity": "الطاقة الاستيعابية (قبل الحرب)",
        "specialization": "التخصص",
        "overview": "نظرة عامة",
        "details": "بيانات المنشأة",
        "incident_history": "سجل الحوادث",
        "no_incidents": "لا توجد حوادث موثّقة لهذه المنشأة حتى الآن.",
        "sources": "المصادر",
        "arch_some": "تمت أرشفة {k} من {n} من مصادر الويب بشكل مستقل",
        "arch_pending": "الأرشفة قيد الانتظار",
        "arch_copy": "نسخة مؤرشفة",
        "killed": "قتيلاً", "injured": "جريحاً",
        "hw_killed": "من الكوادر الصحية قتلى",
        "hw_injured": "من الكوادر الصحية جرحى",
        "type": "النوع", "subtype": "النوع الفرعي",
        "governorate": "المحافظة", "area": "المنطقة",
        "beds": "عدد الأسرّة قبل الحرب",
        "pre_status": "الوضع قبل الحرب",
        "post_status": "الوضع بعد الهجمات",
        "notes": "ملاحظات", "coords": "الإحداثيات",
        "all": "الكل",
        "provenance": "أُنشئت هذه الصفحة من مجموعة البيانات المفتوحة للمشروع، وكل رقم مقترن بمصدره.",
        "data_links": "بيانات قابلة للقراءة آلياً:",
        "interactive": "فتح قاعدة بيانات {section} التفاعلية",
        "meta_tpl": "{name} في {place}: الهجمات الموثّقة والضحايا والمصادر. {n} حادثة مسجلة.",
        'close': 'إغلاق',
        'incident': 'حادثة',
        'view_incident': 'عرض الحادثة كاملة',
        'full_description': 'السرد الكامل',
        'summary_label': 'ملخّص',
        'watch_video': 'مشاهدة الفيديو',
        'archived_video': 'فيديو مؤرشف',
        'video_evidence': 'أدلة مصورة',
        'recorded_by': 'وثّقها',
        'prev_incident': 'السابق',
        'next_incident': 'التالي',
        'ch_over_time': 'الهجمات عبر الزمن',
        'ch_over_time_cap': 'الحوادث الموثّقة شهرياً، ومجموعها {i}',
        'ch_by_type_cap': 'الحوادث الموثّقة حسب نوع الهجوم',
        'ch_by_gov_cap': 'الحوادث الموثّقة حسب المحافظة',
        'tab_overview': 'نظرة عامة',
        'tab_incidents': 'الحوادث',
        'tab_timeline': 'الجدول الزمني',
        'tab_statistics': 'إحصاءات',
        'tab_resources': 'المصادر',
        'tabpage_h1_overview': '{section} في غزة — نظرة عامة',
        'tabpage_h1_incidents': 'جميع الحوادث الموثّقة في {section}',
        'tabpage_h1_timeline': '{section}: التسلسل الزمني للهجمات',
        'tabpage_h1_statistics': '{section}: إحصاءات',
        'tabpage_h1_resources': '{section}: المصادر والتقارير',
        'tabpage_title_overview': '{section} المستهدفة في غزة — نظرة عامة | {site}',
        'tabpage_title_incidents': 'الحوادث الموثّقة في {section} بغزة | {site}',
        'tabpage_title_timeline': 'التسلسل الزمني للهجمات على {section} في غزة | {site}',
        'tabpage_title_statistics': 'إحصاءات الهجمات على {section} في غزة | {site}',
        'tabpage_title_resources': 'مصادر وتقارير عن {section} في غزة | {site}',
        'tabpage_desc_overview': '{n} من {section} الموثّقة مع {i} حادثة مسجلة: المؤشرات الرئيسية، والمنشآت الأكثر استهدافاً، ومواضع السجلات التفصيلية.',
        'tabpage_desc_incidents': 'السجل الكامل لـ {i} حادثة موثّقة في {section} بغزة، مصنّفة حسب نوع الهجوم ومرتبطة بالمنشأة المستهدفة.',
        'tabpage_desc_timeline': 'جميع الهجمات الموثّقة على {section} في غزة، البالغ عددها {i}، مرتبة زمنياً سنة بسنة مع الضحايا والمصادر.',
        'tabpage_desc_statistics': 'أرقام مجمّعة لـ {i} حادثة موثّقة في {n} من {section}: حسب المحافظة ونوع الهجوم والسنة، إضافة إلى الضحايا.',
        'tabpage_desc_resources': 'تقارير وتحقيقات ومصادر أولية توثّق الهجمات على {section} في غزة.',
        'ov_summary': 'ملخّص',
        'ov_most_targeted': 'الأكثر استهدافاً',
        'st_by_governorate': 'الحوادث حسب المحافظة',
        'st_by_type': 'الحوادث حسب نوع الهجوم',
        'st_by_year': 'الحوادث حسب السنة',
        'st_casualties': 'الضحايا',
        'st_year': 'السنة',
        'st_measure': 'المؤشر',
        'st_total': 'الإجمالي',
        'undated': 'بلا تاريخ',
        'no_resources': 'لم تُسجَّل مصادر لهذا القسم بعد.',
        'type_labels': {'airstrike': 'غارة جوية', 'direct': 'استهداف مباشر', 'siege': 'حصار', 'invasion': 'اجتياح / هجوم بري', 'indirect': 'محيط / غير مباشر', 'access': 'منع الوصول', 'unidentified': 'غير محدد'},
        'nav': {'nav.warCrimes': '⚖️ جرائم حرب', 'nav.hungerCrisis': '🍽️ أزمة الجوع', 'nav.historical': '📜 التاريخ', 'nav.timeline': '📋 الجدول الزمني', 'nav.joinUs': '🤝 انضم إلينا'},
        'total_incidents': 'إجمالي الحوادث',
        'civilians_injured': 'المدنيون الجرحى',
        'hw_killed_short': 'الكوادر الصحية القتلى',
        'facility_information': 'بيانات المنشأة',
        'incident_types': 'أنواع الحوادث',
        'unidentified': 'غير محدد',
        'full_account': 'قراءة السرد الكامل',
        'back_to': '← قاعدة بيانات {section}',
        'tab_overview': 'نظرة عامة',
        'tab_incidents': 'الحوادث',
        'tab_timeline': 'الجدول الزمني',
        'tab_statistics': 'إحصاءات',
        'interactive_short': '← قاعدة البيانات التفاعلية',
        'data': 'البيانات',
        'all_of': 'جميع {section}',
        'all_records': 'جميع المنشآت الموثّقة',
        'index_title': '{section} المستهدفة في غزة — سجل موثّق | {site}',
        'index_desc': '{n} من {section} الموثّقة مع {i} حادثة مسجلة، وكل مدخل يورد الهجمات والضحايا والمصادر.',
        'pending': 'لا حوادث بعد',
    },
}

BLANK = ("", "none", "null", "n/a", "-", "—")


# A cell whose formula broke reads back as one of these literal strings, not
# as empty. Google Sheets error tokens - not this project's own placeholder
# text. Treated as blank everywhere is_blank/clean/get_field are used, so a
# broken translation cell falls back to the English column instead of
# publishing "#REF!" to a reader. Found live in details_de.csv/details_ar.csv
# for the first four historical events - a row-shifted formula, not a
# generator bug - but the guard belongs here regardless of which sheet trips
# it next.
SHEET_ERRORS = {"#ref!", "#n/a", "#value!", "#name?", "#div/0!", "#null!",
                "#num!", "#error!"}


def is_blank(v):
    if not v:
        return True
    s = str(v).strip()
    return s.lower() in BLANK or s.lower() in SHEET_ERRORS


def clean(v):
    return "" if is_blank(v) else str(v).strip()


def get_field(rec, field, lang):
    """<field>_<lang> when present and non-blank, else the English column."""
    if lang != "en":
        v = rec.get("%s_%s" % (field, lang))
        if not is_blank(v):
            return str(v).strip()
    return clean(rec.get(field))


UMLAUT = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
          "Ä": "Ae", "Ö": "Oe", "Ü": "Ue"}
# Arabic diacritics + tatweel, stripped so the slug is stable regardless of
# whether the source text is vocalised.
AR_STRIP = re.compile("[ؐ-ًؚ-ٰٟـ]")


def slugify(text):
    """Latin slug. Mirrors slugify() in Pages/War_Crimes_Stats/shared.js so an
    English URL matches the existing #hospital/<slug> route exactly."""
    s = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def slugify_lang(text, lang):
    """Localised slug.

    Localised URLs are a real ranking and click-through signal in the target
    language, which is why these are not just the English slug repeated.

      de  umlauts transliterated the conventional German way (ae/oe/ue/ss)
          before the ASCII fold, so "Al-Shifa Medizinkomplex" does not lose
          characters silently.
      ar  Arabic script is kept. Google indexes UTF-8 paths and shows them
          decoded in Arabic results, which reads natively to an Arabic
          searcher; percent-encoding is applied only where a URL has to sit
          inside an HTML attribute.
    """
    s = str(text or "").strip()
    if not s:
        return ""
    if lang == "de":
        for k, v in UMLAUT.items():
            s = s.replace(k, v)
        return slugify(s)
    if lang == "ar":
        s = AR_STRIP.sub("", s)
        # keep Arabic letters, Latin letters and digits; everything else joins
        s = re.sub(r"[^\wء-ي]+", "-", s, flags=re.UNICODE)
        return s.strip("-").lower()
    return slugify(s)


def url_quote(path):
    """Percent-encode a path for use in href/canonical/hreflang attributes.
    Leaves ASCII path characters alone so English URLs stay readable."""
    out = []
    for ch in path:
        if ch in "/-_.~" or ch.isalnum() and ord(ch) < 128:
            out.append(ch)
        else:
            out.extend("%%%02X" % b for b in ch.encode("utf-8"))
    return "".join(out)


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        return [r for r in csv.DictReader(fh)]


def merge_translations(base, trans, key, trans_key=None):
    """Copy _de/_ar suffixed columns from the delta CSV onto the base rows.

    trans_key lets the delta CSV be joined on a different column than the base
    (e.g. base row keyed on `detail_id`, delta keyed on `_anchor` which holds
    the base id verbatim — the delta's own `detail_id` is a row-count formula
    that drifts once the row counts diverge)."""
    if not trans:
        return
    tk = trans_key or key
    idx = {}
    for r in trans:
        k = (r.get(tk) or "").strip() or (r.get(key) or "").strip()
        if k:
            idx[k] = r
    for rec in base:
        t = idx.get((rec.get(key) or "").strip())
        if not t:
            continue
        for col, val in t.items():
            if col and (col.endswith("_de") or col.endswith("_ar")) and not is_blank(val):
                rec[col] = val


def num(v):
    try:
        return int(float(str(v).replace(",", "").strip()))
    except Exception:
        return 0


def e(s):
    return html.escape(str(s or ""), quote=True)


def source_entries(inc):
    """(kind, value) pairs from source_url_1/source_url_2 - "link" when a
    comma-separated piece is a real URL, "text" when it's a source note that
    isn't one (a name, an outlet with no link). Both columns can hold a
    comma-joined list, not just source_url_2 - some source_url_1 cells are
    "Outlet name , https://...", so both are split the same way. 59 of 662
    source cells across the four sections are text-only; rendering nothing for
    them makes a sourced incident look unsourced. A "text" entry is shown as
    attributed text, never as a href."""
    out = []
    for col in ("source_url_1", "source_url_2"):
        for s in clean(inc.get(col)).split(","):
            s = s.strip()
            if not s:
                continue
            out.append(("link", s) if s.startswith("http") else ("text", s))
    return out


def archived_link(url, t):
    """Inline marker shown right after a source link in the modal: a 🕰 link to
    our Wayback snapshot, or a greyed ⏳ 'archiving pending' when the capture is
    queued but hasn't landed. '' when the URL isn't tracked."""
    snap, pending = archive_of(url)
    if snap:
        return (' <a class="inc-src-arch" href="%s" rel="nofollow noopener" target="_blank">'
                '&#128368;&#65039; %s</a>' % (e(snap), e(t["arch_copy"])))
    if pending:
        return (' <span class="inc-src-arch inc-src-arch--pending">&#8987; %s</span>'
                % e(t["arch_pending"]))
    return ""


def archive_bar(srcs, t):
    """One-line caption under the Sources list: how many of the cited web pages
    we hold an independent Wayback copy of. The per-source 🕰 links (see
    archived_link) carry the detail. Text-only sources have no URL and aren't
    counted. '' until at least one source URL is tracked."""
    links = [s for k, s in srcs if k == "link"]
    if not links:
        return ""
    n_arch = sum(1 for u in links if archive_of(u)[0])
    n_track = sum(1 for u in links if any(archive_of(u)))
    if not n_track:
        return ""
    summary = t["arch_some"].format(k=n_arch, n=len(links))
    return ('<div class="inc-archive-bar"><span class="iab-h">&#128368;&#65039; %s</span></div>'
            % e(summary))


def fmt_date(inc):
    s = clean(inc.get("starting_date"))
    t = clean(inc.get("ending_date"))
    if s and t and t != s:
        return "%s – %s" % (s, t)
    return s or ""


def load_section(cfg):
    d = os.path.join(ROOT, cfg["dir"])
    fac = [r for r in read_csv(os.path.join(d, cfg["facilities"] + ".csv"))
           if not is_blank(r.get("id"))]
    allow = cfg.get("types")
    if allow:
        kept, skipped = [], []
        for r in fac:
            (kept if clean(r.get("type")).lower() in allow else skipped).append(r)
        if skipped:
            print("  skipped %d record(s) whose type is outside this section: %s"
                  % (len(skipped), ", ".join(sorted({clean(r.get("type")) for r in skipped}))))
        fac = kept
    # Whether the section uses the capacity field, decided from the data so a
    # section need not be re-configured when it starts recording one.
    cfg["has_capacity"] = any(clean(r.get("beds_pre_war")) for r in fac)
    inc = [r for r in read_csv(os.path.join(d, cfg["incidents"] + ".csv"))
           if not is_blank(r.get("incident_id"))]
    for lang in ("de", "ar"):
        merge_translations(fac, read_csv(os.path.join(d, "%s_%s.csv" % (cfg["facilities"], lang))), "id")
        merge_translations(inc, read_csv(os.path.join(d, "%s_%s.csv" % (cfg["incidents"], lang))), "incident_id")
    by_fac = {}
    for i in inc:
        k = (i.get("facility_id") or "").strip()
        by_fac.setdefault(k, []).append(i)
    assign_incident_anchors(by_fac)
    warn_orphan_incidents(cfg, fac, inc, by_fac)
    return fac, by_fac


def warn_orphan_incidents(cfg, facilities, incidents, by_fac):
    """Report incidents whose facility_id matches no facility in the sheet.

    Such rows are dropped: every incident is rendered through its facility's
    page, so one with no facility has nowhere to appear. That is the right
    behaviour but the wrong silence - a lookup that failed in the spreadsheet
    writes the literal string "ID Not Found" into the column, and without this
    the record simply disappears from the site with nothing said.

    Incidents pointing at a facility that exists but was filtered out by the
    type allow-list are expected, not errors, so they are not counted here."""
    known = {(f.get("id") or "").strip() for f in facilities}
    all_ids = set(by_fac) - {""}
    # ids present in the incidents sheet but in no facility row at all
    real = {(r.get("id") or "").strip()
            for r in read_csv(os.path.join(ROOT, cfg["dir"], cfg["facilities"] + ".csv"))
            if not is_blank(r.get("id"))}
    orphan_ids = sorted(i for i in all_ids if i not in real)
    dropped = sum(len(by_fac[i]) for i in orphan_ids) + len(by_fac.get("", []))
    if dropped:
        detail = ", ".join('"%s"' % i for i in orphan_ids[:4]) or "blank facility_id"
        print("  WARNING: %d of %d incident(s) dropped - facility_id matches no"
              % (dropped, len(incidents)))
        print("           facility in %s.csv: %s" % (cfg["facilities"], detail))
    filtered = sorted(i for i in all_ids if i in real and i not in known)
    if filtered:
        print("  (%d incident(s) belong to facilities filtered out by type)"
              % sum(len(by_fac[i]) for i in filtered))


def load_previous_slugs():
    """Slugs already published, keyed by section/uid/lang.

    A live URL that changes is a broken URL. Once a record has been published
    its slug is reused even if the name is later edited, unless --reslug is
    passed explicitly.

    Keyed on `uid`, never on `id`. The spreadsheet's FAC-### is a formula that
    recounts rows, so deleting one facility slides every id below it onto a
    different hospital. That is not hypothetical: between the 2026-07-04 export
    and the 2026-08-23 sheet, two facilities were deleted mid-list and 25 of 49
    ids came to name a different hospital. Keying the memory on id would have
    handed 25 hospitals another hospital's published URL and, because the slug
    is sticky, kept it that way permanently.

    `uid` is written once into the sheet by tools/apps-script/assign-uids.gs
    and never reassigned, so it identifies a record rather than a row position.

    Records published before the uid column existed have no entry here. They
    fall through to slug-from-name in assign_slugs(), which reproduces the
    published slug for every facility that has not been renamed - 46 of 49 at
    the time of the migration."""
    if not os.path.exists(MANIFEST):
        return {}
    try:
        old = json.load(open(MANIFEST, encoding="utf-8"))
    except Exception:
        return {}
    out = {}
    for p in old.get("pages", []):
        if p.get("uid"):
            out[(p["section"], p["uid"], p["lang"])] = p["slug"]
    return out


def assign_slugs(cfg, facilities, previous, reslug):
    """{record_id: {lang: slug}} - unique within a section and language."""
    out, taken = {}, {lang: set() for lang in LANGS}
    for f in facilities:
        fid = (f.get("id") or "").strip()
        uid = (f.get("uid") or "").strip()
        out[fid] = {}
        for lang in LANGS:
            prev = previous.get((cfg["key"], uid, lang)) if uid else None
            if prev and not reslug:
                out[fid][lang] = prev
                taken[lang].add(prev)
                continue
            base = slugify_lang(get_field(f, "name", lang) or f.get("name"), lang) or slugify(uid or fid)
            s = base
            # A facility must never take a path segment a tab page owns, or the
            # two would fight for the same URL.
            if s in taken[lang] or s in RESERVED_SLUGS:
                # Disambiguated with the uid, not the id - a suffix built from
                # FAC-### would be baked into the URL and then renumber.
                s = "%s-%s" % (base, slugify(uid or fid))
            taken[lang].add(s)
            out[fid][lang] = s
    return out


def warn_missing_uids(cfg, facilities):
    """Report a section where only SOME records carry a uid.

    No uid anywhere is a deliberate configuration, not a fault: slugs are then
    derived from names on every build, which is stable against the source
    sheet renumbering because a name identifies a facility and a row number
    does not. The only thing it gives up is renaming a facility without
    moving its URL. Silent, because it is the chosen mode.

    A mix is the dangerous state. Records with a uid keep their slug through a
    rename while records without one do not, so the same edit produces
    different behaviour depending on which row it lands on. That is worth
    stopping to look at."""
    missing = [(f.get("id") or "?").strip() for f in facilities
               if not (f.get("uid") or "").strip()]
    if missing and len(missing) != len(facilities):
        print("  WARNING: %d of %d %s records have a uid and the rest do not."
              % (len(facilities) - len(missing), len(facilities), cfg["key"]))
        print("           Renaming one of these will move its URL while the")
        print("           others hold: %s" % ", ".join(missing[:8]))
    return missing


def rel_url(cfg, slugs, lang):
    """Directory-style URL - no .html in the link, tidy folders on disk.
    GitHub Pages serves <dir>/index.html for a request ending in a slash.

        /war-crimes/hospitals/<slug>/            en
        /war-crimes/hospitals/de/<slug-de>/      de
        /war-crimes/hospitals/ar/<slug-ar>/      ar

    The section segment stays English so one folder holds every language of a
    section; only the record slug is localised. English sits at the section
    root rather than under /en/, so the canonical URL is the shortest one."""
    base = "/%s/%s/" % (cfg["group"], cfg["seg"])
    if lang == "en":
        return base + slugs[lang] + "/"
    return base + lang + "/" + slugs[lang] + "/"


def abs_url(cfg, slugs, lang):
    return BASE_URL + url_quote(rel_url(cfg, slugs, lang))


def build_jsonld(cfg, fac, incidents, lang, slugs, name, intro, t):
    url = abs_url(cfg, slugs, lang)
    place = ", ".join([x for x in [clean(fac.get("area")), clean(fac.get("governorate"))] if x])
    node = {
        "@context": "https://schema.org",
        "@type": cfg["schema_type"],
        "@id": url + "#record",
        "name": name,
        "url": url,
        "inLanguage": lang,
    }
    if intro:
        node["description"] = intro[:600]
    addr = {"@type": "PostalAddress", "addressRegion": clean(fac.get("governorate")), "addressCountry": "PS"}
    if clean(fac.get("area")):
        addr["addressLocality"] = clean(fac.get("area"))
    node["address"] = addr
    try:
        lat, lng = float(fac.get("lat")), float(fac.get("lng"))
        node["geo"] = {"@type": "GeoCoordinates", "latitude": lat, "longitude": lng}
    except Exception:
        pass
    img = clean(fac.get("Image_url")) or clean(fac.get("image_url"))
    if img.startswith("http"):
        node["image"] = img
    if place:
        node["areaServed"] = place

    events = []
    for i in incidents:
        d = clean(i.get("starting_date"))
        if not d:
            continue
        ev = {
            "@type": "Event",
            "name": "%s — %s" % (get_field(i, "attack_type", lang) or "Attack", name),
            "startDate": d,
            "eventStatus": "https://schema.org/EventHappened",
            "location": {"@type": "Place", "name": name},
        }
        desc = get_field(i, "description", lang)
        if desc:
            ev["description"] = desc[:500]
        events.append(ev)
    if events:
        node["subjectOf"] = events

    crumbs = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": t["home"],
             "item": BASE_URL + ("/" if lang == "en" else "/%s/" % lang)},
            # The section's own index, not cfg["hub"]. "hub" is the interactive
            # database - the developers' view - and a crawler walking this
            # trail should land on the static section that is meant to be
            # indexed, which is also where the tab row and every card point.
            {"@type": "ListItem", "position": 2, "name": cfg["label"][lang],
             "item": BASE_URL + url_quote(section_index_path(cfg, lang))},
            {"@type": "ListItem", "position": 3, "name": name, "item": url},
        ],
    }
    return [node, crumbs]


ATTACK_CLASSES = (
    ("direct", "direct"), ("airstrike", "airstrike"), ("siege", "siege"),
    ("invasion", "invasion"), ("ground", "invasion"),
    ("access", "access"), ("restricted", "access"),
    ("indirect", "indirect"), ("vicinity", "indirect"),
)


def attack_class(attack_type):
    """Mirrors incTypeKey() in Pages/War_Crimes_Stats/shared.js so a generated
    incident card is colour-coded exactly like the same incident in the
    interactive database."""
    tp = (attack_type or "").lower()
    for needle, cls in ATTACK_CLASSES:
        if needle in tp:
            return cls
    return "unidentified"


def head_common(title, desc, canonical, alts, img, robots, lang):
    L = []
    a = L.append
    a("<!DOCTYPE html>")
    a('<html lang="%s"%s>' % (lang, ' dir="rtl"' if lang in RTL else ""))
    a("<head>")
    a('<meta charset="UTF-8">')
    a('<meta name="viewport" content="width=device-width, initial-scale=1.0">')
    a("<!-- Generated by tools/build_records.py from the project CSVs. Do not edit by hand. -->")
    a("<title>%s</title>" % e(title))
    a('<meta name="description" content="%s">' % e(desc))
    a('<link rel="canonical" href="%s">' % canonical)
    for l2, href in alts:
        a('<link rel="alternate" hreflang="%s" href="%s">' % (l2, href))
    a('<meta name="robots" content="%s">' % robots)
    a('<meta property="og:type" content="article">')
    a('<meta property="og:site_name" content="%s">' % SITE)
    a('<meta property="og:title" content="%s">' % e(title))
    a('<meta property="og:description" content="%s">' % e(desc))
    a('<meta property="og:url" content="%s">' % canonical)
    a('<meta property="og:image" content="%s">' % img)
    a('<meta name="twitter:card" content="summary_large_image">')
    a('<meta name="twitter:title" content="%s">' % e(title))
    a('<meta name="twitter:description" content="%s">' % e(desc))
    # The hub's own stylesheet carries the detail layout - hero, stats strip,
    # two-column body, sidebar, incident cards. Loading it rather than copying
    # it means the generated pages cannot drift from the interactive view.
    a('<link rel="stylesheet" href="/Pages/War_Crimes_Stats/shared.css?v=4">')
    a('<link rel="stylesheet" href="/Styles/record-page.css?v=24">')
    return L


def topbar(cfg, lang, t, up_href, up_label, alts_rel):
    L = []
    a = L.append
    a('<div class="rp-top">')
    a('<a class="rp-brand" href="%s">%s</a>' % ("/" if lang == "en" else "/", SITE))
    a('<div class="rp-nav">')
    a('<a class="rp-up" href="%s">%s</a>' % (up_href, e(up_label)))
    a('<nav class="rp-langs" aria-label="Language">')
    for l2, href in alts_rel:
        cur = ' aria-current="true"' if l2 == lang else ""
        a('<a href="%s" hreflang="%s"%s>%s</a>' % (href, l2, cur, l2.upper()))
    a("</nav>")
    a("</div>")
    a("</div>")
    return L


ATTACK_CLASSES = (
    ("direct", "direct"), ("airstrike", "airstrike"), ("siege", "siege"),
    ("invasion", "invasion"), ("ground", "invasion"),
    ("access", "access"), ("restricted", "access"),
    ("indirect", "indirect"), ("vicinity", "indirect"),
)

# Root-absolute so the same markup works at every depth
# (/war-crimes/hospitals/x/ and /war-crimes/hospitals/de/x/).
SITE_NAV = (
    ("/war-crimes/", "nav.warCrimes", "\u2696\ufe0f War Crimes", True),
    ("/hunger-crisis-stats.html", "nav.hungerCrisis", "\U0001F37D\ufe0f Hunger Crisis", False),
    ("/historical-events/", "nav.historical", "\U0001F4DC History", False),
    ("/historical-events/massacres/", "nav.timeline", "\U0001F4CB Timeline", False),
    ("/volunteer.html", "nav.joinUs", "\U0001F91D Join Us", False),
)
LANG_NAMES = {"en": ("EN", "English"), "de": ("DE", "Deutsch"), "ar": ("AR", "\u0627\u0644\u0639\u0631\u0628\u064a\u0629")}


def attack_class(attack_type):
    """Port of incTypeKey() in Pages/War_Crimes_Stats/shared.js, so a generated
    incident card is colour-coded exactly like the same incident in the
    interactive database."""
    tp = (attack_type or "").lower()
    for needle, cls in ATTACK_CLASSES:
        if needle in tp:
            return cls
    return "unidentified"


def site_header(lang, alts_rel, nav_labels, active_href="/war-crimes/"):
    """Static copy of what js/header-component.js injects at runtime.

    Emitted as markup rather than loaded from the component because these pages
    must be complete without JavaScript. The classes are the hub's own, so it
    inherits the site styling from shared.css and cannot drift from it.
    The theme toggle is deliberately absent: it cannot work without JS, and a
    dead control is worse than none. Both themes still resolve through
    prefers-color-scheme.
    """
    L = []
    a = L.append
    a('<header class="header" dir="ltr">')
    a('<div class="container" dir="ltr">')
    a('<div class="logo"><a href="/">%s</a></div>' % SITE)
    a('<nav class="nav" dir="ltr">')
    for href, key, label, _default in SITE_NAV:
        # Which tab is lit depends on the page being rendered, not on a flag in
        # the table. build_history.py renders pages under /historical-events/
        # through this same header and must not light War Crimes.
        active = href == active_href
        cls = "nav-btn active" if active else ("nav-btn join-us-btn" if "joinUs" in key else "nav-btn")
        # These four targets are hand-authored, client-translated pages with
        # no /de/ or /ar/ URL of their own - unlike this page, which is one of
        # several real per-language URLs. Without a hint they default to
        # English, so a reader following this nav off a German or Arabic
        # record loses the language they were reading in. The target has no
        # JS-free way to know the language on arrival other than the URL
        # itself, so it travels as a query param; translation-system.js reads
        # it on load (see js/translation-system.js).
        dest = href + ("?lang=%s" % lang if lang != "en" else "")
        a('<a href="%s" class="%s">%s</a>' % (dest, cls, nav_labels.get(key, label)))
    a("</nav>")
    a('<div class="header-controls" dir="ltr">')
    # Language switcher as real links - works with JS off, and each is a
    # crawlable URL rather than a button that rewrites the page.
    a('<div class="language-selector">')
    for l2, href in alts_rel:
        code, name = LANG_NAMES[l2]
        cur = " active" if l2 == lang else ""
        aria = ' aria-current="true"' if l2 == lang else ""
        # aria-label carries the language name even where the CSS hides the
        # visible name on narrow screens, so the control never degrades to a
        # bare two-letter code for a screen reader.
        a('<a class="lang-btn%s" href="%s" hreflang="%s" lang="%s" aria-label="%s"%s>'
          '<span class="lang-code">%s</span> <span class="lang-name">%s</span></a>'
          % (cur, href, l2, l2, e(name), aria, code, name))
    a("</div>")
    a("</div>")
    a("</div>")
    a("</header>")
    return L


def page_subheader(title, subtitle, back_href, back_label, tabs):
    L = []
    a = L.append
    a('<div class="page-subheader">')
    a('<div class="container">')
    a('<div class="page-subheader-top">')
    a('<div class="page-subheader-title">')
    a("<h1>%s</h1>" % e(title))
    if subtitle:
        a('<p class="header-subtitle">%s</p>' % e(subtitle))
    a("</div>")
    # back_href is None on tab and section-index pages: those used to link
    # back to the interactive Pages/ database, which is no longer part of the
    # public site's link graph (it stays reachable by direct URL for
    # reference, just not linked to). The record-detail page still passes a
    # real index_href, because that back link points at this site's own
    # generated section index, not at Pages/.
    if back_href:
        a('<a href="%s" class="btn-back-warcimes">%s</a>' % (back_href, e(back_label)))
    a("</div>")
    if tabs:
        a('<nav class="nav-tabs" aria-label="Section">')
        a('<div class="nav-row-primary">')
        for href, label, primary, active in tabs:
            if not primary:
                continue
            cls = "tab-btn tab-primary" + (" active" if active else "")
            a('<a href="%s" class="%s">%s</a>' % (href, cls, e(label)))
        a("</div>")
        rest = [x for x in tabs if not x[2]]
        if rest:
            a('<div class="nav-row-secondary">')
            for href, label, _p, active in rest:
                a('<a href="%s" class="tab-btn%s">%s</a>' % (href, " active" if active else "", e(label)))
            a("</div>")
        a("</nav>")
    a("</div>")
    a("</div>")
    return L


# Tab pages own these path segments, so a facility must never be given one as
# a slug. assign_slugs() checks this list.
TAB_KINDS = ("overview", "incidents", "timeline", "statistics", "resources")
RESERVED_SLUGS = set(TAB_KINDS) | set(LANGS)


def tab_path(cfg, kind, lang):
    """/war-crimes/hospitals/incidents/  and  .../de/incidents/"""
    return section_index_path(cfg, lang) + kind + "/"


def section_tabs(cfg, lang, t, active):
    """The tab row, shared by every page in a section.

    These are real links to real pages now, not hash routes into the
    interactive hub - which is the whole point of generating them.
    `active` is one of TAB_KINDS, "records", or None.
    """
    out = [(url_quote(section_index_path(cfg, lang)), cfg["label"][lang], True, active == "records")]
    for kind in TAB_KINDS:
        out.append((url_quote(tab_path(cfg, kind, lang)),
                    t["tab_" + kind], kind == "overview", active == kind))
    return out


INDEXABLE = "index, follow, max-image-preview:large, max-snippet:-1"
NOINDEX = "noindex, follow"


def page_shell(cfg, lang, t, title, desc, canonical, alts, active, h1, subtitle,
               jsonld, robots=INDEXABLE):
    """Head + header + sub-header, identical across every generated page."""
    alts_rel = [(l2, url_quote(tab_path(cfg, active, l2) if active in TAB_KINDS
                               else section_index_path(cfg, l2))) for l2 in LANGS]
    L = head_common(title, desc, canonical, alts, OG_IMAGE, robots, lang)
    for block in jsonld:
        L.append('<script type="application/ld+json">')
        L.append(json.dumps(block, ensure_ascii=False, indent=2))
        L.append("</script>")
    L.append("</head>")
    L.append('<body%s>' % (' dir="rtl"' if lang in RTL else ""))
    L.extend(site_header(lang, alts_rel, t["nav"]))
    L.extend(page_subheader(h1, subtitle, None, None,
                            section_tabs(cfg, lang, t, active)))
    return L


def page_footer(cfg, lang, t):
    L = []
    a = L.append
    a('<div class="container" style="padding-bottom:3rem">')
    a('<div class="sidebar-box" style="margin-top:2rem">')
    a("<h3>%s</h3>" % e(t["data"]))
    a('<p style="font-size:0.85rem;color:var(--text-secondary);margin:0 0 0.6rem">%s</p>' % e(t["provenance"]))
    a('<p style="font-size:0.85rem;margin:0"><a href="/data/events.json">events.json</a> &middot; '
      '<a href="/data/events.csv">events.csv</a> &middot; <a href="/llms.txt">llms.txt</a></p>')
    a("</div>")
    a("</div>")
    a('<script src="/js/record-page.js?v=5" defer></script>')
    a("</body>")
    a("</html>")
    return L


def stats_strip(items):
    L = ['<div class="detail-stats-strip"><div class="detail-stats-strip-inner">']
    for val, lbl in items:
        L.append('<div class="dss-item"><div class="dss-num">%s</div>'
                 '<div class="dss-label">%s</div></div>'
                 % (val if val else "\u2014", e(lbl)))
    L.append("</div></div>")
    return L


def collect(cfg, facilities, by_fac, lang):
    """Flatten every incident in the section, with its facility attached."""
    rows = []
    for fac in facilities:
        fid = (fac.get("id") or "").strip()
        fname = get_field(fac, "name", lang) or clean(fac.get("name"))
        for i in by_fac.get(fid, []):
            rows.append({
                "fac": fac, "fid": fid, "fname": fname,
                "date": clean(i.get("starting_date")),
                "attack": get_field(i, "attack_type", lang),
                "cls": attack_class(clean(i.get("attack_type"))),
                "result": get_field(i, "result", lang),
                "desc": get_field(i, "description", lang),
                "killed": num(i.get("civilians_killed")),
                "injured": num(i.get("civilians_injured")),
                "hw": num(i.get("hw_killed")),
                "id": clean(i.get("incident_id")),
                "gov": clean(fac.get("governorate")),
                "inc": i,
            })
    return rows


def year_of(d):
    m = re.match(r"(\d{4})", d or "")
    if m:
        return m.group(1)
    m = re.search(r"(\d{4})", d or "")
    return m.group(1) if m else ""


def inc_line(r, slug_map, cfg, lang, mode="register"):
    """One incident row, linking back to its facility page.

    mode="register"  the incidents page - a trimmed summary line for context
    mode="compact"   the timeline - facts only, no prose

    Both section pages hold the same 308 records, so they are deliberately
    organised and written differently: the register groups by type of attack
    and carries a summary line; the timeline groups by year and carries none.
    Rendering them the same way produced two near-identical 173 KB pages
    competing with each other.
    """
    # Deep-links into the facility page's incident dialog, so a row on the
    # register or the timeline opens the same detail view.
    href = url_quote(rel_url(cfg, slug_map[r["fid"]], lang)) + "#" + incident_anchor(r["inc"], lang)
    # is-link: on the register and timeline the whole card is the link to the
    # facility's dialog, stretched over the card in CSS.
    L = ['<article class="detail-inc-card is-link type-%s"><div class="detail-inc-body">' % r["cls"]]
    a = L.append
    a('<div class="detail-inc-meta">')
    if r["date"]:
        a('<span class="inc-date-chip">&#128197; %s</span>' % e(r["date"]))
    if r["attack"]:
        a('<span class="inc-attack-badge iab-%s">%s</span>' % (r["cls"], e(r["attack"])))
    if r["id"]:
        a('<span class="inc-id-chip">%s</span>' % e(r["id"]))
    a("</div>")
    a('<div class="detail-inc-result"><a href="%s">%s</a></div>' % (href, e(r["fname"])))
    if mode != "compact":
        body = r["result"] or r["desc"]
        if body:
            a('<p class="detail-inc-desc">%s</p>'
              % e(body[:180] + ("…" if len(body) > 180 else "")))
    cas = []
    for v, lbl, k in ((r["killed"], "killed", ""), (r["injured"], "injured", " injured"), (r["hw"], "hw_killed", " hw")):
        pass
    chips = []
    if r["killed"]:
        chips.append('<span class="cas-chip">%d</span>' % r["killed"])
    if r["injured"]:
        chips.append('<span class="cas-chip injured">%d</span>' % r["injured"])
    if r["hw"]:
        chips.append('<span class="cas-chip hw">%d</span>' % r["hw"])
    if chips:
        a('<div class="detail-inc-cas">%s</div>' % "".join(chips))
    a("</div></article>")
    return "".join(L)


# ── charts ───────────────────────────────────────────────────────────────
# Drawn as inline SVG at build time rather than handed to Chart.js. These
# pages are JS-free by design, and a build-time chart is also crawlable, needs
# no CDN, and cannot fail to render. Colours come from CSS custom properties
# so both themes work; every chart carries a text summary for screen readers
# and for anything that does not paint SVG.

MONTHS_SHORT = {
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "de": ["Jan", "Feb", "M\u00e4r", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
    "ar": ["\u064a\u0646\u0627", "\u0641\u0628\u0631", "\u0645\u0627\u0631", "\u0623\u0628\u0631", "\u0645\u0627\u064a", "\u064a\u0648\u0646",
           "\u064a\u0648\u0644", "\u0623\u063a\u0633", "\u0633\u0628\u062a", "\u0623\u0643\u062a", "\u0646\u0648\u0641", "\u062f\u064a\u0633"],
}


def svg_columns(pairs, lang, caption, max_labels=12):
    """Monthly column chart. pairs = [(YYYY-MM, count), ...] in date order."""
    if not pairs:
        return ""
    W, H = 720, 210
    padL, padR, padT, padB = 34, 8, 12, 30
    plotW, plotH = W - padL - padR, H - padT - padB
    top = max(v for _, v in pairs) or 1
    n = len(pairs)
    gap = 2
    bw = max(3.0, (plotW - gap * (n - 1)) / n)
    step = max(1, round(n / float(max_labels)))

    L = ['<figure class="rp-chart">']
    L.append('<svg viewBox="0 0 %d %d" role="img" aria-label="%s" preserveAspectRatio="xMidYMid meet">'
             % (W, H, e(caption)))
    L.append("<title>%s</title>" % e(caption))
    # y gridlines at 0 / half / max
    for frac in (0, 0.5, 1.0):
        y = padT + plotH - plotH * frac
        L.append('<line class="cg" x1="%d" y1="%.1f" x2="%d" y2="%.1f"/>' % (padL, y, W - padR, y))
        L.append('<text class="cy" x="%d" y="%.1f">%d</text>' % (padL - 6, y + 3.5, round(top * frac)))
    for idx, (key, val) in enumerate(pairs):
        x = padL + idx * (bw + gap)
        h = (plotH * val / float(top)) if top else 0
        y = padT + plotH - h
        L.append('<rect class="cb" x="%.1f" y="%.1f" width="%.1f" height="%.1f"><title>%s: %d</title></rect>'
                 % (x, y, bw, max(h, 1), e(key), val))
        if idx % step == 0:
            yr, mo = key.split("-")[0], int(key.split("-")[1])
            lbl = "%s %s" % (MONTHS_SHORT[lang][mo - 1], yr[2:])
            L.append('<text class="cx" x="%.1f" y="%d">%s</text>' % (x + bw / 2, H - 10, e(lbl)))
    L.append("</svg>")
    L.append("<figcaption>%s</figcaption>" % e(caption))
    L.append("</figure>")
    return "".join(L)


def svg_hbars(rows, caption, unit=""):
    """Horizontal bars. rows = [(label, value, css_class_or_None), ...]."""
    rows = [r for r in rows if r[1]]
    if not rows:
        return ""
    top = max(v for _, v, _ in rows) or 1
    rowH, gap = 26, 6
    W = 720
    labelW = 210
    barMax = W - labelW - 54
    H = len(rows) * (rowH + gap)

    L = ['<figure class="rp-chart">']
    L.append('<svg viewBox="0 0 %d %d" role="img" aria-label="%s" preserveAspectRatio="xMidYMid meet">'
             % (W, H, e(caption)))
    L.append("<title>%s</title>" % e(caption))
    for i, (label, val, cls) in enumerate(rows):
        y = i * (rowH + gap)
        bw = barMax * val / float(top)
        L.append('<text class="cl" x="0" y="%d">%s</text>' % (y + 17, e(label[:34])))
        L.append('<rect class="cb%s" x="%d" y="%d" width="%.1f" height="%d" rx="3"><title>%s: %d</title></rect>'
                 % ((" tf-" + cls) if cls else "", labelW, y + 4, max(bw, 2), rowH - 8, e(label), val))
        L.append('<text class="cv" x="%.1f" y="%d">%d%s</text>'
                 % (labelW + max(bw, 2) + 7, y + 17, val, e(unit)))
    L.append("</svg>")
    L.append("<figcaption>%s</figcaption>" % e(caption))
    L.append("</figure>")
    return "".join(L)


def section_resources(cfg):
    """Rows of <section>-resources.csv, or [] when the section has no such file.

    A section is configured with a "resources" key only once the CSV exists;
    universities has none yet."""
    if not cfg.get("resources"):
        return []
    path = os.path.join(ROOT, cfg["dir"], cfg["resources"] + ".csv")
    if not os.path.exists(path):
        return []
    return [r for r in read_csv(path) if clean(r.get("resource_title"))]


def render_tab(cfg, kind, facilities, by_fac, slug_map, lang, t):
    """One of the five section tab pages."""
    label = cfg["label"][lang]
    rows = collect(cfg, facilities, by_fac, lang)
    canonical = BASE_URL + url_quote(tab_path(cfg, kind, lang))
    alts = [(l2, BASE_URL + url_quote(tab_path(cfg, kind, l2))) for l2 in LANGS]
    alts.append(("x-default", BASE_URL + url_quote(tab_path(cfg, kind, "en"))))

    tot_inc = len(rows)
    tot_killed = sum(r["killed"] for r in rows)
    tot_injured = sum(r["injured"] for r in rows)
    tot_hw = sum(r["hw"] for r in rows)

    title = t["tabpage_title_" + kind].format(section=label, site=SITE)
    desc = t["tabpage_desc_" + kind].format(section=label.lower(), n=len(facilities), i=tot_inc)
    h1 = t["tabpage_h1_" + kind].format(section=label)

    jsonld = [{
        "@context": "https://schema.org", "@type": "CollectionPage",
        "@id": canonical + "#page", "url": canonical, "name": title,
        "description": desc, "inLanguage": lang,
        "isPartOf": {"@id": BASE_URL + "/#website"},
    }, {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": t["home"], "item": BASE_URL + "/"},
            {"@type": "ListItem", "position": 2, "name": label,
             "item": BASE_URL + url_quote(section_index_path(cfg, lang))},
            {"@type": "ListItem", "position": 3, "name": h1, "item": canonical},
        ]},
    ]

    # A tab with nothing in it is a thin page. The resources tab renders an
    # empty state until a <section>-resources.csv exists, and asking Google to
    # index three languages of "nothing catalogued yet" spends crawl budget to
    # publish an apology. It stays linked and followable, just not indexed.
    empty = kind == "resources" and not section_resources(cfg)
    L = page_shell(cfg, lang, t, title, desc, canonical, alts, kind, h1, desc,
                   jsonld, NOINDEX if empty else INDEXABLE)
    a = L.append
    L.extend(stats_strip([(len(facilities), label), (tot_inc, t["total_incidents"]),
                          (tot_killed, t["civilians_killed"]), (tot_injured, t["civilians_injured"])]))
    a('<div class="container" style="padding-top:1.75rem">')

    if kind == "overview":
        a('<h2 class="detail-section-title">%s</h2>' % e(t["ov_summary"]))
        a('<p class="rp-lede">%s</p>' % e(desc))

        # attacks over time, by month
        months = {}
        for r in rows:
            m = re.match(r"(\d{4})-(\d{2})", r["date"] or "")
            if m:
                months[m.group(0)] = months.get(m.group(0), 0) + 1
        if months:
            a('<h2 class="detail-section-title">%s</h2>' % e(t["ch_over_time"]))
            a(svg_columns(sorted(months.items()), lang, t["ch_over_time_cap"].format(i=sum(months.values()))))

        # by type of attack
        cls_counts = {}
        for r in rows:
            cls_counts[r["cls"]] = cls_counts.get(r["cls"], 0) + 1
        if cls_counts:
            a('<h2 class="detail-section-title">%s</h2>' % e(t["st_by_type"]))
            a(svg_hbars([(t["type_labels"].get(k, k), v, k)
                         for k, v in sorted(cls_counts.items(), key=lambda x: -x[1])],
                        t["ch_by_type_cap"]))

        # by governorate
        gov_counts = {}
        for r in rows:
            gov_counts[r["gov"] or "\u2014"] = gov_counts.get(r["gov"] or "\u2014", 0) + 1
        if gov_counts:
            a('<h2 class="detail-section-title">%s</h2>' % e(t["st_by_governorate"]))
            a(svg_hbars([(k, v, None) for k, v in sorted(gov_counts.items(), key=lambda x: -x[1])],
                        t["ch_by_gov_cap"]))
        # most targeted
        top = sorted(facilities, key=lambda f: -len(by_fac.get((f.get("id") or "").strip(), [])))[:15]
        a('<h2 class="detail-section-title">%s</h2>' % e(t["ov_most_targeted"]))
        a('<div class="rp-table-wrap"><table class="rp-table"><thead><tr>'
          '<th>%s</th><th>%s</th><th>%s</th><th>%s</th></tr></thead><tbody>'
          % (e(label), e(t["governorate"]), e(t["total_incidents"]), e(t["civilians_killed"])))
        for f in top:
            fid = (f.get("id") or "").strip()
            incs = by_fac.get(fid, [])
            if not incs:
                continue
            a('<tr><td><a href="%s">%s</a></td><td>%s</td><td>%d</td><td>%s</td></tr>'
              % (url_quote(rel_url(cfg, slug_map[fid], lang)),
                 e(get_field(f, "name", lang) or clean(f.get("name"))),
                 e(clean(f.get("governorate"))), len(incs),
                 sum(num(x.get("civilians_killed")) for x in incs) or "\u2014"))
        a("</tbody></table></div>")

    elif kind == "incidents":
        a('<p class="rp-lede" style="max-width:70ch;color:var(--text-secondary);margin-bottom:1.5rem">%s</p>' % e(desc))
        by_cls = {}
        for r in rows:
            by_cls.setdefault(r["cls"], []).append(r)
        for cls, group in sorted(by_cls.items(), key=lambda x: -len(x[1])):
            a('<h2 class="detail-section-title">%s (%d)</h2>'
              % (e(t["type_labels"].get(cls, cls)), len(group)))
            a('<div class="detail-incidents">')
            for r in sorted(group, key=lambda x: x["date"], reverse=True):
                a(inc_line(r, slug_map, cfg, lang))
            a("</div>")

    elif kind == "timeline":
        a('<p class="rp-lede" style="max-width:70ch;color:var(--text-secondary);margin-bottom:1.5rem">%s</p>' % e(desc))
        by_year = {}
        for r in rows:
            by_year.setdefault(year_of(r["date"]) or t["undated"], []).append(r)
        for yr in sorted(by_year, reverse=True):
            group = by_year[yr]
            a('<h2 class="detail-section-title">%s (%d)</h2>' % (e(yr), len(group)))
            a('<div class="detail-incidents">')
            for r in sorted(group, key=lambda x: x["date"], reverse=True):
                a(inc_line(r, slug_map, cfg, lang, mode="compact"))
            a("</div>")

    elif kind == "statistics":
        a('<p class="rp-lede" style="max-width:70ch;color:var(--text-secondary);margin-bottom:1.5rem">%s</p>' % e(desc))

        def table(heading, pairs, col1, col2):
            a('<h2 class="detail-section-title">%s</h2>' % e(heading))
            a('<div class="rp-table-wrap"><table class="rp-table"><thead><tr><th>%s</th><th>%s</th></tr></thead><tbody>'
              % (e(col1), e(col2)))
            for k, v in pairs:
                a("<tr><td>%s</td><td>%s</td></tr>" % (e(k), v))
            a("</tbody></table></div>")

        gov = {}
        for r in rows:
            gov[r["gov"] or "\u2014"] = gov.get(r["gov"] or "\u2014", 0) + 1
        table(t["st_by_governorate"], sorted(gov.items(), key=lambda x: -x[1]),
              t["governorate"], t["total_incidents"])

        cls = {}
        for r in rows:
            cls[r["cls"]] = cls.get(r["cls"], 0) + 1
        table(t["st_by_type"],
              [(t["type_labels"].get(k, k), v) for k, v in sorted(cls.items(), key=lambda x: -x[1])],
              t["incident_types"], t["total_incidents"])

        yr = {}
        for r in rows:
            yr[year_of(r["date"]) or t["undated"]] = yr.get(year_of(r["date"]) or t["undated"], 0) + 1
        table(t["st_by_year"], sorted(yr.items(), reverse=True), t["st_year"], t["total_incidents"])

        table(t["st_casualties"], [
            (t["civilians_killed"], tot_killed), (t["civilians_injured"], tot_injured),
            (t["hw_killed_short"], tot_hw), (t["total_incidents"], tot_inc),
        ], t["st_measure"], t["st_total"])

    elif kind == "resources":
        res = section_resources(cfg)
        a('<p class="rp-lede" style="max-width:70ch;color:var(--text-secondary);margin-bottom:1.5rem">%s</p>' % e(desc))
        if not res:
            a('<div class="empty-detail"><strong>%s</strong></div>' % e(t["no_resources"]))
        else:
            a('<div class="detail-incidents">')
            for r in res:
                url = clean(r.get("url"))
                a('<article class="detail-inc-card type-access"><div class="detail-inc-body">')
                a('<div class="detail-inc-meta">')
                if clean(r.get("resource_type")):
                    a('<span class="inc-attack-badge iab-access">%s</span>' % e(clean(r.get("resource_type"))))
                if clean(r.get("organization")):
                    a('<span class="inc-id-chip">%s</span>' % e(clean(r.get("organization"))))
                a("</div>")
                ttl = e(clean(r.get("resource_title")))
                a('<div class="detail-inc-result">%s</div>'
                  % ('<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (e(url), ttl)
                     if url.startswith("http") else ttl))
                if clean(r.get("relevance")):
                    a('<p class="detail-inc-desc">%s</p>' % e(clean(r.get("relevance"))))
                a("</div></article>")
            a("</div>")

    a("</div>")
    L.extend(page_footer(cfg, lang, t))
    return CRLF.join(L) + CRLF


def assign_incident_anchors(by_fac):
    """Give every incident a fragment id built from its date and attack type.

        #incident-2025-08-02-artillery-shelling

    Assigned once, per facility, and stored on the row, because two places
    need the identical string: the dialog's id on the facility page, and the
    deep link to it from the register and the timeline. Computing it twice
    from the same inputs would work until the collision rule fired.

    The attack type comes from the base English column rather than the
    translated one, so an incident keeps one fragment in all three languages -
    fragments are never indexed, so there is nothing to gain from localising
    them, and a stable id means a shared link survives a language switch.

    Collisions - the same facility hit the same way on the same day - take the
    record id as a suffix, which is unique by construction.
    """
    for fid, rows in by_fac.items():
        used = {}
        # deterministic order so the suffixed form never depends on how the
        # page happens to be sorted at render time
        # Ordered by content, not by incident_id: that column is a sequential
        # key regenerated by the source spreadsheet and shifts when rows are
        # deleted, so anything derived from it would silently repoint.
        for inc in sorted(rows, key=lambda x: (clean(x.get("starting_date")),
                                               clean(x.get("result")),
                                               clean(x.get("description")))):
            date = clean(inc.get("starting_date"))
            m = re.match(r"(\d{4}-\d{2}-\d{2})", date)
            if not m:
                m = re.match(r"(\d{4}-\d{2})", date)
            datepart = m.group(1) if m else ""

            attack = slugify(clean(inc.get("attack_type")))
            if not attack:
                attack = attack_class(clean(inc.get("attack_type")))
            attack = "-".join(attack.split("-")[:5])

            base = "-".join([p for p in ("incident", datepart, attack) if p])
            key = base
            if key in used:
                # Same facility, same attack type, same day. Disambiguated by a
                # short digest of the incident's own text rather than by its
                # incident_id, which is not stable across spreadsheet edits.
                seed = "|".join([clean(inc.get("result")),
                                 clean(inc.get("description")),
                                 clean(inc.get("full_discription"))])
                key = "%s-%s" % (base, hashlib.sha1(seed.encode("utf-8")).hexdigest()[:4])
            n = 2
            while key in used:
                key = "%s-%d" % (base, n)
                n += 1
            used[key] = True
            inc["__anchor"] = key[:80].strip("-")


def incident_anchor(inc, lang=None):
    """The fragment assigned by assign_incident_anchors()."""
    return inc.get("__anchor") or "incident"


def incident_modal(inc, fac, lang, t, anchor, prev_a, next_a, pos, total, close_href):
    """A dialog rendered as static markup and revealed by :target.

    No JavaScript: the card links to #<anchor>, CSS shows the panel while it is
    the target, and the scrim and close control are links back to close_href.
    That also means every incident has a real, shareable URL, and the browser
    Back button steps out of the dialog the way a reader expects.
    """
    L = []
    a = L.append
    attack = get_field(inc, "attack_type", lang)
    cls = attack_class(clean(inc.get("attack_type")))
    result = get_field(inc, "result", lang)
    desc = get_field(inc, "description", lang)
    full = get_field(inc, "full_discription", lang)
    iid = clean(inc.get("incident_id"))
    fname = get_field(fac, "name", lang) or clean(fac.get("name"))
    place = ", ".join([x for x in [clean(fac.get("area")), clean(fac.get("governorate"))] if x])
    img = clean(inc.get("image_url")) or clean(inc.get("archived_image"))

    a('<div class="inc-modal" id="%s" role="dialog" aria-labelledby="%s-t" tabindex="-1">' % (anchor, anchor))
    a('<a class="inc-modal-scrim" href="%s" aria-label="%s" tabindex="-1"></a>' % (close_href, e(t["close"])))
    a('<div class="inc-modal-panel">')

    a('<div class="inc-modal-head">')
    a('<div class="inc-modal-meta">')
    if iid:
        a('<span class="inc-id-chip">%s</span>' % e(iid))
    dt = fmt_date(inc)
    if dt:
        a('<span class="inc-date-chip">&#128197; %s</span>' % e(dt))
    if attack:
        a('<span class="inc-attack-badge iab-%s">%s</span>' % (cls, e(attack)))
    a("</div>")
    a('<a class="inc-modal-close" href="%s" aria-label="%s">&times;</a>' % (close_href, e(t["close"])))
    a("</div>")

    a('<div class="inc-modal-body">')
    a('<h2 class="inc-modal-title" id="%s-t">%s</h2>' % (anchor, e(result or attack or t["incident"])))
    a('<p class="inc-modal-where">&#128205; %s%s</p>'
      % (e(fname), (" \u2014 " + e(place)) if place else ""))

    if img.startswith("http"):
        a('<img class="inc-modal-img" src="%s" alt="%s" loading="lazy" referrerpolicy="no-referrer">'
          % (e(img), e(result or fname)))

    if full and full != desc:
        a('<h3 class="inc-modal-h">%s</h3><p>%s</p>' % (e(t["full_description"]), e(full)))
        if desc:
            a('<h3 class="inc-modal-h">%s</h3><p>%s</p>' % (e(t["summary_label"]), e(desc)))
    elif desc:
        a('<h3 class="inc-modal-h">%s</h3><p>%s</p>' % (e(t["summary_label"]), e(desc)))

    cas = [(num(inc.get("civilians_killed")), t["civilians_killed"], "killed"),
           (num(inc.get("civilians_injured")), t["civilians_injured"], "injured"),
           (num(inc.get("hw_killed")), t["hw_killed"], "hw"),
           (num(inc.get("hw_injured")), t["hw_injured"], "hw")]
    cas = [c for c in cas if c[0]]
    if cas:
        a('<h3 class="inc-modal-h">%s</h3>' % e(t["st_casualties"]))
        a('<div class="inc-modal-cas">')
        for v, lbl, kind in cas:
            a('<div><span class="v %s">%d</span><span class="l">%s</span></div>' % (kind, v, e(lbl)))
        a("</div>")

    srcs = source_entries(inc)
    if srcs:
        a('<h3 class="inc-modal-h">%s</h3><div class="inc-modal-links">' % e(t["sources"]))
        for kind, s in srcs:
            if kind == "link":
                a('<span class="inc-src-pair"><a href="%s" rel="nofollow noopener" target="_blank">'
                  '&#128279; %s</a>%s</span>'
                  % (e(s), e(re.sub(r"^https?://(www\.)?", "", s).split("/")[0]),
                     archived_link(s, t)))
            else:
                a('<span class="inc-src-text">&#128220; %s</span>' % e(s))
        a("</div>")
        bar = archive_bar(srcs, t)
        if bar:
            a(bar)

    vids = [(clean(inc.get("video_url")), t["watch_video"]),
            (clean(inc.get("archived_video")), t["archived_video"])]
    vids = [v for v in vids if v[0].startswith("http")]
    if vids:
        a('<h3 class="inc-modal-h">%s</h3><div class="inc-modal-links">' % e(t["video_evidence"]))
        for url, lbl in vids:
            a('<a href="%s" rel="nofollow noopener" target="_blank">&#127909; %s</a>' % (e(url), e(lbl)))
        a("</div>")

    prov = [x for x in [clean(inc.get("added_by")), clean(inc.get("reviewed_by"))] if x]
    if prov:
        a('<p class="inc-modal-prov">%s: %s</p>' % (e(t["recorded_by"]), e(" \u00b7 ".join(prov))))
    a("</div>")

    a('<nav class="inc-modal-nav" aria-label="%s">' % e(t["incident"]))
    if prev_a:
        a('<a href="#%s" rel="prev">&larr; %s</a>' % (prev_a, e(t["prev_incident"])))
    else:
        a("<span></span>")
    a('<span class="inc-modal-pos">%d / %d</span>' % (pos, total))
    if next_a:
        a('<a href="#%s" rel="next">%s &rarr;</a>' % (next_a, e(t["next_incident"])))
    else:
        a("<span></span>")
    a("</nav>")

    a("</div>")
    a("</div>")
    return "".join(L)


def render(cfg, fac, incidents, lang, slugs, t):
    name = get_field(fac, "name", lang) or clean(fac.get("name")) or slugs[lang]
    spec = get_field(fac, "specialization", lang)
    intro = get_field(fac, "introduction", lang)
    notes = get_field(fac, "notes", lang)
    post = get_field(fac, "post_war_status", lang)
    pre = clean(fac.get("pre_war_status"))
    place = ", ".join([x for x in [clean(fac.get("area")), clean(fac.get("governorate"))] if x])
    img = clean(fac.get("Image_url")) or clean(fac.get("image_url"))
    beds = clean(fac.get("beds_pre_war"))

    killed = sum(num(i.get("civilians_killed")) for i in incidents)
    injured = sum(num(i.get("civilians_injured")) for i in incidents)
    hw_killed = sum(num(i.get("hw_killed")) for i in incidents)

    # incident-type breakdown for the sidebar, computed at build time
    # Group by the normalised attack class, not the raw attack_type string.
    # That column holds 104 distinct spellings across 308 incidents
    # ("hit", "strikes-vicinity", "unidentified" vs "Unidentified"), which
    # rendered as a long list of near-duplicate rows. Seven classes match the
    # card colour coding and the incident filter.
    types = {}
    for i in incidents:
        cls = attack_class(clean(i.get("attack_type")))
        types[cls] = types.get(cls, 0) + 1
    top_type = max(types.values()) if types else 0

    substantive = bool(incidents) or len(intro) + len(notes) >= 200
    robots = ("index, follow, max-image-preview:large, max-snippet:-1"
              if substantive else "noindex, follow")

    section_label = cfg["label"][lang]
    canonical = abs_url(cfg, slugs, lang)
    alts = [(l2, abs_url(cfg, slugs, l2)) for l2 in LANGS]
    alts.append(("x-default", abs_url(cfg, slugs, "en")))
    alts_rel = [(l2, url_quote(rel_url(cfg, slugs, l2))) for l2 in LANGS]
    index_href = url_quote(section_index_path(cfg, lang))

    title = "%s \u2014 %s | %s" % (name, section_label, SITE)
    desc = intro[:150].rstrip() + ("\u2026" if len(intro) > 150 else "") if intro else \
        t["meta_tpl"].format(name=name, place=place or "Gaza", n=len(incidents))

    L = head_common(title, desc, canonical, alts,
                    img if img.startswith("http") else OG_IMAGE, robots, lang)
    a = L.append
    for block in build_jsonld(cfg, fac, incidents, lang, slugs, name, intro, t):
        a('<script type="application/ld+json">')
        a(json.dumps(block, ensure_ascii=False, indent=2))
        a("</script>")
    a("</head>")
    a('<body%s>' % (' dir="rtl"' if lang in RTL else ""))

    L.extend(site_header(lang, alts_rel, t["nav"]))

    eyebrow = " \u00b7 ".join([x for x in [clean(fac.get("type")), clean(fac.get("sub_type"))] if x])
    subtitle = " \u2014 ".join([x for x in [eyebrow, place] if x])
    # Tabs now navigate to the generated section pages instead of hash routes
    # into the interactive hub. "records" marks the section index active,
    # since a record page sits inside it.
    L.extend(page_subheader(name, subtitle, index_href,
                            t["back_to"].format(section=section_label),
                            section_tabs(cfg, lang, t, "records")))

    # ── hero ──
    a('<div class="detail-hero"><div class="detail-hero-inner">')
    a('<div class="detail-hero-text">')
    a('<div class="detail-eyebrow">%s</div>' % e(eyebrow or section_label))
    a("<h2>%s</h2>" % e(name))
    if place:
        a('<div class="detail-hero-sub">&#128205; %s</div>' % e(place))
    a('<div class="detail-hero-badges">')
    if clean(fac.get("type")):
        a('<span class="detail-hero-badge dhb-type">%s</span>' % e(clean(fac.get("type"))))
    if clean(fac.get("governorate")):
        a('<span class="detail-hero-badge dhb-gov">%s</span>' % e(clean(fac.get("governorate"))))
    if pre:
        a('<span class="detail-hero-badge dhb-status">%s</span>' % e(pre))
    if post:
        a('<span class="detail-hero-badge dhb-post">%s</span>' % e(post))
    a("</div>")
    if intro:
        a('<p class="detail-hero-intro">%s</p>' % e(intro))
    a("</div>")
    if img.startswith("http"):
        a('<div class="detail-fac-img-wrap">')
        a('<img class="detail-fac-img" src="%s" alt="%s" loading="lazy" referrerpolicy="no-referrer">' % (e(img), e(name)))
        a('<div class="detail-fac-img-caption">&#128247; %s</div>' % e(name))
        a("</div>")
    a('<div class="detail-hero-facts">')
    a('<div><div class="dhf-label">%s</div><div class="dhf-value">%d</div></div>' % (e(t["incidents_recorded"]), len(incidents)))
    a('<div><div class="dhf-label">%s</div><div class="dhf-value red">%s</div></div>' % (e(t["civilians_killed"]), killed if killed else "\u2014"))
    # Capacity is a hospital measure. No university records one at all, so
    # the field appears only in a section that actually uses it - otherwise
    # every page in the section carries an em-dash saying nothing. Inside a
    # section that does use it a blank still renders as a dash, which reads
    # as "unknown" against neighbours that carry a number.
    if cfg.get("has_capacity"):
        a('<div><div class="dhf-label">%s</div><div class="dhf-value">%s</div></div>' % (e(t["capacity"]), e(beds) if beds else "\u2014"))
    if spec:
        a('<div><div class="dhf-label">%s</div><div class="dhf-value" style="font-size:0.8rem">%s</div></div>' % (e(t["specialization"]), e(spec[:40])))
    a("</div>")
    a("</div></div>")

    # ── sticky stats strip ──
    a('<div class="detail-stats-strip"><div class="detail-stats-strip-inner">')
    for val, lbl in ((len(incidents), t["total_incidents"]),
                     (killed, t["civilians_killed"]),
                     (injured, t["civilians_injured"]),
                     (hw_killed, t["hw_killed_short"])):
        a('<div class="dss-item"><div class="dss-num">%s</div><div class="dss-label">%s</div></div>'
          % (val if val else "\u2014", e(lbl)))
    a("</div></div>")

    # ── two-column body ──
    a('<div class="container"><div class="detail-body">')

    a("<div>")
    a('<h2 class="detail-section-title">%s (%d)</h2>' % (e(t["incident_history"]), len(incidents)))
    if not incidents:
        a('<div class="empty-detail"><strong>%s</strong></div>' % e(t["no_incidents"]))
    else:
        ordered = sorted(incidents, key=lambda x: clean(x.get("starting_date")), reverse=True)
        anchors = [incident_anchor(x, lang) for x in ordered]
        a('<div class="detail-incidents">')
        for _n, i in enumerate(ordered):
            attack = get_field(i, "attack_type", lang)
            cls = attack_class(clean(i.get("attack_type")))
            result = get_field(i, "result", lang)
            d_short = get_field(i, "description", lang)
            d_full = get_field(i, "full_discription", lang)
            a('<article class="detail-inc-card type-%s">' % cls)
            iimg = clean(i.get("image_url")) or clean(i.get("archived_image"))
            if iimg.startswith("http"):
                a('<img class="detail-inc-img" src="%s" alt="%s" loading="lazy" referrerpolicy="no-referrer">' % (e(iimg), e(result or attack or name)))
            a('<div class="detail-inc-body">')
            a('<div class="detail-inc-meta">')
            dt = fmt_date(i)
            if dt:
                a('<span class="inc-date-chip">&#128197; %s</span>' % e(dt))
            if attack:
                a('<span class="inc-attack-badge iab-%s">%s</span>' % (cls, e(attack)))
            iid = clean(i.get("incident_id"))
            if iid:
                a('<span class="inc-id-chip">%s</span>' % e(iid))
            a("</div>")
            if result:
                a('<div class="detail-inc-result">%s</div>' % e(result))
            if d_short:
                a('<p class="detail-inc-desc">%s</p>' % e(d_short))
            cas = []
            for val, lbl, kind in ((num(i.get("civilians_killed")), t["killed"], "killed"),
                                   (num(i.get("civilians_injured")), t["injured"], "injured"),
                                   (num(i.get("hw_killed")), t["hw_killed"], "hw"),
                                   (num(i.get("hw_injured")), t["hw_injured"], "hw")):
                if val:
                    cas.append('<span class="cas-chip %s">%d %s</span>' % (kind, val, e(lbl)))
            if cas:
                a('<div class="detail-inc-cas">%s</div>' % "".join(cas))
            srcs = source_entries(i)
            if srcs:
                links = " ".join(
                    '<a class="inc-src-link" href="%s" rel="nofollow noopener" target="_blank">&#128279; %s</a>'
                    % (e(s), e(re.sub(r"^https?://(www\.)?", "", s).split("/")[0].split(".")[0][:22]))
                    if kind == "link" else
                    '<span class="inc-src-text">&#128220; %s</span>' % e(s[:40])
                    for kind, s in srcs[:8])
                a('<div class="detail-inc-src"><strong>%s:</strong> %s</div>' % (e(t["sources"]), links))
            # Opens the :target dialog below. A link, not a handler, so it works
            # without scripting and the incident gets a shareable URL.
            a('<a class="inc-open" href="#%s">%s &rarr;</a>' % (anchors[_n], e(t["view_incident"])))
            a("</div>")
            a("</article>")
        a("</div>")
    a("</div>")

    # ── sidebar ──
    a('<aside class="detail-sidebar">')
    a('<div class="sidebar-box">')
    a("<h3>%s</h3>" % e(t["facility_information"]))
    rows = [
        ("ID", clean(fac.get("id"))),
        (t["type"], clean(fac.get("type"))), (t["subtype"], clean(fac.get("sub_type"))),
        (t["governorate"], clean(fac.get("governorate"))), (t["area"], clean(fac.get("area"))),
        (t["specialization"], spec), (t["beds"], beds),
        (t["pre_status"], pre), (t["post_status"], post),
    ]
    for k, v in rows:
        if v:
            a('<div class="info-row"><span class="info-key">%s</span><span class="info-val">%s</span></div>' % (e(k), e(v)))
    a("</div>")

    if types:
        a('<div class="sidebar-box">')
        a("<h3>%s</h3>" % e(t["incident_types"]))
        for cls, n in sorted(types.items(), key=lambda x: -x[1]):
            pct = int(round(100.0 * n / top_type)) if top_type else 0
            lbl = t["type_labels"].get(cls, cls)
            a('<div class="type-bar-row">')
            a('<div class="type-bar-lbl"><span class="n">%s</span><span class="c">%d</span></div>' % (e(lbl), n))
            a('<div class="type-bar-bg"><div class="type-bar-fill tf-%s" style="width:%d%%"></div></div>' % (cls, pct))
            a("</div>")
        a("</div>")

    if notes:
        a('<div class="sidebar-box"><h3>%s</h3><div class="notes-box">%s</div></div>' % (e(t["notes"]), e(notes)))

    a('<div class="sidebar-box">')
    a("<h3>%s</h3>" % e(t["data"]))
    a('<p style="font-size:0.82rem;line-height:1.55;color:var(--text-secondary);margin:0 0 0.75rem">%s</p>' % e(t["provenance"]))
    a('<p style="font-size:0.82rem;margin:0"><a href="/data/events.json">events.json</a> &middot; <a href="/data/events.csv">events.csv</a> &middot; <a href="/llms.txt">llms.txt</a></p>')
    a("</div>")
    a("</aside>")

    a("</div></div>")

    # Incident dialogs. Kept at the end of the document because they are
    # display:none until targeted and must not affect the flow of the page.
    if incidents:
        for _n, i in enumerate(ordered):
            a(incident_modal(i, fac, lang, t, anchors[_n],
                             anchors[_n - 1] if _n > 0 else "",
                             anchors[_n + 1] if _n + 1 < len(anchors) else "",
                             _n + 1, len(ordered), "#incidents"))

    # Label for the optional incident filter record-page.js may add. The page
    # is complete without it; this only saves the script hard-coding English.
    a('<script>window.RP_LABELS=%s;</script>'
      % json.dumps({"all": t["all"], "types": t["type_labels"]}, ensure_ascii=False))
    a('<script src="/js/record-page.js?v=4" defer></script>')
    a("</body>")
    a("</html>")
    return CRLF.join(L) + CRLF, substantive


def section_index_path(cfg, lang):
    """/war-crimes/hospitals/  and  /war-crimes/hospitals/{de,ar}/"""
    base = "/%s/%s/" % (cfg["group"], cfg["seg"])
    return base if lang == "en" else base + lang + "/"


def render_index(cfg, entries, lang, t):
    """Section landing page - /war-crimes/hospitals/ and its language variants."""
    section_label = cfg["label"][lang]
    path = section_index_path(cfg, lang)
    canonical = BASE_URL + url_quote(path)
    alts = [(l2, BASE_URL + url_quote(section_index_path(cfg, l2))) for l2 in LANGS]
    alts.append(("x-default", BASE_URL + url_quote(section_index_path(cfg, "en"))))
    alts_rel = [(l2, url_quote(section_index_path(cfg, l2))) for l2 in LANGS]

    total_inc = sum(x["incidents"] for x in entries)
    total_killed = sum(x["killed"] for x in entries)
    title = t["index_title"].format(section=section_label, site=SITE)
    desc = t["index_desc"].format(n=len(entries), section=section_label.lower(), i=total_inc)

    L = head_common(title, desc, canonical, alts, OG_IMAGE,
                    "index, follow, max-image-preview:large, max-snippet:-1", lang)
    a = L.append
    items = []
    for pos, x in enumerate(sorted(entries, key=lambda z: -z["incidents"]), 1):
        items.append({"@type": "ListItem", "position": pos,
                      "item": {"@type": cfg["schema_type"], "name": x["name"],
                               "url": BASE_URL + url_quote(x["path"])}})
    a('<script type="application/ld+json">')
    a(json.dumps({"@context": "https://schema.org", "@type": "CollectionPage",
                  "@id": canonical + "#page", "url": canonical, "name": title,
                  "description": desc, "inLanguage": lang,
                  "isPartOf": {"@id": BASE_URL + "/#website"},
                  "mainEntity": {"@type": "ItemList", "numberOfItems": len(items),
                                 "itemListElement": items}},
                 ensure_ascii=False, indent=2))
    a("</script>")
    a("</head>")
    a('<body%s>' % (' dir="rtl"' if lang in RTL else ""))

    L.extend(site_header(lang, alts_rel, t["nav"]))
    L.extend(page_subheader(section_label, desc, None,
                            None,
                            section_tabs(cfg, lang, t, "records")))

    a('<div class="detail-stats-strip"><div class="detail-stats-strip-inner">')
    for val, lbl in ((len(entries), section_label),
                     (total_inc, t["total_incidents"]),
                     (total_killed, t["civilians_killed"])):
        a('<div class="dss-item"><div class="dss-num">%s</div><div class="dss-label">%s</div></div>'
          % (val if val else "\u2014", e(lbl)))
    a("</div></div>")

    a('<div class="container" style="padding-top:2rem;padding-bottom:4rem">')
    a('<h2 class="detail-section-title">%s</h2>' % e(t["all_records"]))
    a('<div class="cards-grid">')
    for x in sorted(entries, key=lambda z: (-z["incidents"], z["name"])):
        a('<a class="card rec-card%s" href="%s">' % ("" if x["indexable"] else " is-stub", url_quote(x["path"])))
        if x["img"].startswith("http"):
            a('<img class="fac-card-img" src="%s" alt="%s" loading="lazy" referrerpolicy="no-referrer">' % (e(x["img"]), e(x["name"])))
        a('<div class="card-header"><h3 class="card-title">%s</h3></div>' % e(x["name"]))
        if x["place"]:
            a('<div class="card-sub">&#128205; %s</div>' % e(x["place"]))
        # university-quick-facts is the generic auto-fit grid in shared.css;
        # "hospital-quick-facts" was never declared anywhere, so these figures
        # were stacking instead of sitting side by side.
        a('<div class="university-quick-facts">')
        a('<div class="quick-fact"><div class="quick-fact-value">%d</div><div class="quick-fact-label">%s</div></div>'
          % (x["incidents"], e(t["total_incidents"])))
        a('<div class="quick-fact"><div class="quick-fact-value">%s</div><div class="quick-fact-label">%s</div></div>'
          % (x["killed"] if x["killed"] else "\u2014", e(t["civilians_killed"])))
        a("</div>")
        if not x["indexable"]:
            a('<div class="card-sub" style="opacity:.75">%s</div>' % e(t["pending"]))
        a("</a>")
    a("</div>")
    a("</div>")

    a('<script src="/js/record-page.js?v=4" defer></script>')
    a("</body>")
    a("</html>")
    return CRLF.join(L) + CRLF


def main():
    check = "--check" in sys.argv
    reslug = "--reslug" in sys.argv
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None

    previous = load_previous_slugs()
    manifest, written, removed = [], 0, 0
    index_urls = []

    for key, cfg in SECTIONS.items():
        if only and key != only:
            continue
        cfg = dict(cfg, key=key)
        facilities, by_fac = load_section(cfg)
        slug_map = assign_slugs(cfg, facilities, previous, reslug)
        print("\n%s: %d records x %d languages" % (key, len(facilities), len(LANGS)))
        warn_missing_uids(cfg, facilities)

        expected = set()
        for fac in facilities:
            fid = (fac.get("id") or "").strip()
            slugs = slug_map[fid]
            incidents = by_fac.get(fid, [])
            for lang in LANGS:
                rel = rel_url(cfg, slugs, lang)
                # directory-style: /hospitals/<slug>/index.html
                out = os.path.join(ROOT, *(rel.strip("/").split("/") + ["index.html"]))
                expected.add(os.path.normpath(out))
                rec = {
                    "url": abs_url(cfg, slugs, lang), "path": rel, "lang": lang,
                    "section": key, "id": fid, "slug": slugs[lang],
                    "incidents": len(incidents),
                }
                # Written only once the source sheet actually carries the
                # column, so the manifest does not fill with empty strings in
                # the meantime. load_previous_slugs() treats absent and empty
                # the same way.
                if (fac.get("uid") or "").strip():
                    rec["uid"] = (fac.get("uid") or "").strip()
                manifest.append(rec)
                if check:
                    continue
                os.makedirs(os.path.dirname(out), exist_ok=True)
                page, indexable = render(cfg, fac, incidents, lang, slugs, T[lang])
                # json.dumps() emits LF inside the JSON-LD blocks while the
                # surrounding markup is joined with CRLF. Normalise the whole
                # file so generated pages match the repo's CRLF convention
                # instead of shipping mixed endings.
                page = page.replace(CRLF, LF).replace(LF, CRLF)
                with open(out, "wb") as fh:
                    fh.write(page.encode("utf-8"))
                manifest[-1]["indexable"] = indexable
                written += 1

        # ── section tab pages: overview / incidents / timeline / statistics
        #    / resources, in every language. Real pages, so the tab row is
        #    navigation rather than a hash route into the interactive hub.
        if not check:
            for lang in LANGS:
                for kind in TAB_KINDS:
                    tp = tab_path(cfg, kind, lang)
                    tout = os.path.join(ROOT, *(tp.strip("/").split("/") + ["index.html"]))
                    expected.add(os.path.normpath(tout))
                    os.makedirs(os.path.dirname(tout), exist_ok=True)
                    page = render_tab(cfg, kind, facilities, by_fac, slug_map, lang, T[lang])
                    page = page.replace(CRLF, LF).replace(LF, CRLF)
                    with open(tout, "wb") as fh:
                        fh.write(page.encode("utf-8"))
                    written += 1
                    manifest.append({"url": BASE_URL + url_quote(tp), "path": tp,
                                     "lang": lang, "section": key, "id": "",
                                     "slug": kind, "incidents": 0,
                                     "indexable": not (kind == "resources"
                                                       and not section_resources(cfg)),
                                     "kind": "tab"})

        # ── section index: /hospitals/ and its language variants ──
        # The generated leaves are unreachable by browsing without this, and a
        # crawler has no section hub to follow.
        if not check:
            for lang in LANGS:
                entries = []
                for fac in facilities:
                    fid = (fac.get("id") or "").strip()
                    slugs = slug_map[fid]
                    incs = by_fac.get(fid, [])
                    entries.append({
                        "name": get_field(fac, "name", lang) or clean(fac.get("name")) or slugs[lang],
                        "place": ", ".join([x for x in [clean(fac.get("area")),
                                                        clean(fac.get("governorate"))] if x]),
                        "img": clean(fac.get("Image_url")) or clean(fac.get("image_url")),
                        "incidents": len(incs),
                        "killed": sum(num(i.get("civilians_killed")) for i in incs),
                        "path": rel_url(cfg, slugs, lang),
                        "indexable": bool(incs) or len(get_field(fac, "introduction", lang)) >= 200,
                    })
                ipath = section_index_path(cfg, lang)
                iout = os.path.join(ROOT, *(ipath.strip("/").split("/") + ["index.html"]))
                expected.add(os.path.normpath(iout))
                os.makedirs(os.path.dirname(iout), exist_ok=True)
                page = render_index(cfg, entries, lang, T[lang])
                page = page.replace(CRLF, LF).replace(LF, CRLF)
                with open(iout, "wb") as fh:
                    fh.write(page.encode("utf-8"))
                written += 1
                # keep the RAW path here: it must compare equal to the path on
                # disk, which is unencoded UTF-8. Only the absolute URL is
                # percent-encoded.
                index_urls.append((BASE_URL + url_quote(ipath), ipath))

        # remove pages for records that no longer exist
        if not check:
            for lang in LANGS:
                d = section_index_path(cfg, lang).strip("/").split("/")
                root_dir = os.path.join(ROOT, *d)
                if not os.path.isdir(root_dir):
                    continue
                for entry in os.listdir(root_dir):
                    # the language folders live beside the English records;
                    # they are swept on their own pass, not as stale records
                    if lang == "en" and entry in LANGS:
                        continue
                    if entry in TAB_KINDS:
                        continue      # tab page, written above
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
        print("\n--check: would write %d pages" % len(manifest))
        for m in manifest[:6]:
            print("    %s" % m["path"])
        return

    for u, raw in index_urls:
        manifest.append({"url": u, "path": raw, "lang": "",
                         "section": "_index", "id": "", "slug": "",
                         "incidents": 0, "indexable": True})

    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"generated": datetime.date.today().isoformat(),
                   "count": len(manifest), "pages": manifest},
                  fh, ensure_ascii=False, indent=2)
    print("\nwrote %d pages, removed %d stale" % (written, removed))
    print("manifest -> %s" % os.path.relpath(MANIFEST, ROOT))

    # Public lookup the hub pages use to decide which facility cards can link
    # to a generated page. Not every row in a facilities CSV gets one - the
    # type allow-list filters some out - so the hubs must ask rather than
    # assume, or they would link to a URL that does not exist.
    lookup = {}
    for m in manifest:
        if m["section"] == "_index" or m.get("kind") == "tab" or not m["id"]:
            continue          # section landing pages are not facility records
        lookup.setdefault(m["section"], {}).setdefault(m["id"], {})[m["lang"]] = m["path"]
    out = os.path.join(ROOT, "data", "record-pages.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="") as fh:
        json.dump({"generated": datetime.date.today().isoformat(), "sections": lookup},
                  fh, ensure_ascii=False, indent=1)
    print("lookup   -> data/record-pages.json (%d sections)" % len(lookup))


if __name__ == "__main__":
    main()
