/* =============================================================
   shared.js  —  Gaza Infrastructure Documentation
   Used by: stat-universities-damaged.html, stat-hospitals-damaged.html,
            stat-schools-damaged.html, stat-religious-damaged.html

   CONTRACT — each page must define before this file runs:
     window.PAGE_CONFIG = {
       entitySingular:  'University',       // used in UI copy
       entityPlural:    'Universities',
       facilityIdKey:   'id',               // PK field in facilities CSV
       incidentFacKey:  'facility_id',      // FK field in incidents CSV
       detailSectionId: 'university-detail',
       facilitiesTabId: 'universities',
       facilitySearchId:'university-search',
       statusFilterId:  'status-filter',
       districtFilterId:'district-filter',
       incidentSearchId:'incident-search',
       attackFilterId:  'attack-filter',
       backBtnId:       'detail-back-btn',
       breadcrumbId:    'detail-breadcrumb-name',
       permalinkSlugId: 'detail-permalink-slug',
       copyLinkBtnId:   'detail-copy-link',
       gridId:          'universities-grid',
       incGridId:       'incidents-grid',
       timelineId:      'timeline-container',
       statisticsId:    'statistics-table',
       resourcesId:     'resources-grid',
       urlPrefix:       'university',        // hash routing prefix e.g. #university/FAC-001
       pendingKey:      '_pendingUniversity',
       pendingIncKey:   '_pendingUniversity_incident',
       // Callbacks — implemented per-page:
       renderFacilities:  renderFacilities,
       updateDashboard:   updateDashboard,
       buildIntro:        buildIntro,        // optional; falls back to shared default
     };

   Each page also calls  mergePageTranslations({ en:{}, de:{}, ar:{} })
   BEFORE DOMContentLoaded to inject its strings into TRANSLATIONS.
   ============================================================= */

// ─────────────────────────────────────────────────────────────
//  Global data (written by loadAllData; read by render fns)
// ─────────────────────────────────────────────────────────────
let facilitiesData = [];
let incidentsData  = [];
let timelineData   = [];
let resourcesData  = [];

// ─────────────────────────────────────────────────────────────
//  Language state
//  Read the preference persisted by either translation system
//  so every page (main OR sub-page) starts in the right language.
// ─────────────────────────────────────────────────────────────
window.currentLang = (function () {
    var saved = localStorage.getItem('gaza-docs-lang') || 'en';
    return ['en', 'de', 'ar'].includes(saved) ? saved : 'en';
}());

// ─────────────────────────────────────────────────────────────
//  Base translations (UI chrome only — no page-specific text)
//  Pages call mergePageTranslations() to inject their strings.
// ─────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    'nav.overview':   'Overview',
    'nav.incidents':  'Incidents',
    'nav.timeline':   'Timeline',
    'nav.statistics': 'Statistics',
    'nav.resources':  'Resources',
    'stat.incidents': 'Attack Incidents',
    'stat.killed':    'Civilians Killed',
    'section.incidents.title': 'Attack Incidents',
    'section.incidents.desc':  'Documented incidents of attacks on facilities',
    'section.timeline.title':  'Major Events Timeline',
    'section.timeline.desc':   'Key milestones in the systematic destruction',
    'section.statistics.title':'Statistical Analysis',
    'section.statistics.desc': 'Data-driven insights into targeting patterns',
    'section.resources.title': 'Sources & Documentation',
    'section.resources.desc':  'Official reports, investigations, and verified evidence',
    'filter.searchIncidents':  'Search incidents…',
    'filter.allAttackTypes':   'All Attack Types',
    'filter.allStatuses':      'All Statuses',
    'filter.allGovernorates':  'All Governorates',
    'detail.back':             '← Back',
    'detail.incidentHistory':  'Incident History',
    'detail.facilityInfo':     'Facility Information',
    'detail.incidentTypes':    'Incident Types',
    'detail.notes':            'Notes',
    'detail.totalIncidents':   'Total Incidents',
    'detail.civiliansKilled':  'Civilians Killed',
    'detail.civiliansInjured': 'Civilians Injured',
    'detail.staffKilled':      'Staff Killed',
    'detail.copyLink':         '🔗 Copy Link',
    'detail.copied':           '✓ Copied!',
    'modal.back':              '← Back',
    'modal.copyLink':          '🔗 Copy Link',
    'loading.facilities':      'Loading data…',
    'loading.incidents':       'Loading incident data…',
    'loading.timeline':        'Loading timeline…',
    'loading.statistics':      'Loading statistics…',
    'loading.resources':       'Loading resources…',
    'noMatch.facilities':      'No facilities match your filters.',
    'noMatch.incidents':       'No incidents match your filters.',
    'chart.attacksOverTime':   'Attacks Over Time',
    'chart.mostTargeted':      'Most Targeted Facilities',
    'chart.byAttackType':      'Incidents by Attack Type',
  },
  de: {
    'nav.overview':   'Übersicht',
    'nav.incidents':  'Vorfälle',
    'nav.timeline':   'Chronologie',
    'nav.statistics': 'Statistiken',
    'nav.resources':  'Quellen',
    'stat.incidents': 'Angriffsvorfälle',
    'stat.killed':    'Getötete Zivilisten',
    'section.incidents.title': 'Angriffsvorfälle',
    'section.incidents.desc':  'Dokumentierte Angriffe auf Einrichtungen',
    'section.timeline.title':  'Chronologie der wichtigsten Ereignisse',
    'section.timeline.desc':   'Wichtige Meilensteine der systematischen Zerstörung',
    'section.statistics.title':'Statistische Analyse',
    'section.statistics.desc': 'Datenbasierte Einblicke in Angriffsmuster',
    'section.resources.title': 'Quellen & Dokumentation',
    'section.resources.desc':  'Offizielle Berichte, Untersuchungen und verifizierte Beweise',
    'filter.searchIncidents':  'Vorfälle durchsuchen…',
    'filter.allAttackTypes':   'Alle Angriffstypen',
    'filter.allStatuses':      'Alle Status',
    'filter.allGovernorates':  'Alle Gouvernorate',
    'detail.back':             '← Zurück',
    'detail.incidentHistory':  'Vorfallschronik',
    'detail.facilityInfo':     'Einrichtungsinformationen',
    'detail.incidentTypes':    'Vorfallsarten',
    'detail.notes':            'Anmerkungen',
    'detail.totalIncidents':   'Vorfälle gesamt',
    'detail.civiliansKilled':  'Getötete Zivilisten',
    'detail.civiliansInjured': 'Verletzte Zivilisten',
    'detail.staffKilled':      'Getötetes Personal',
    'detail.copyLink':         '🔗 Link kopieren',
    'detail.copied':           '✓ Kopiert!',
    'modal.back':              '← Zurück',
    'modal.copyLink':          '🔗 Link kopieren',
    'loading.facilities':      'Daten werden geladen…',
    'loading.incidents':       'Vorfallsdaten werden geladen…',
    'loading.timeline':        'Chronologie wird geladen…',
    'loading.statistics':      'Statistiken werden geladen…',
    'loading.resources':       'Ressourcen werden geladen…',
    'noMatch.facilities':      'Keine Einrichtungen entsprechen Ihren Filtern.',
    'noMatch.incidents':       'Keine Vorfälle entsprechen Ihren Filtern.',
    'chart.attacksOverTime':   'Angriffe über die Zeit',
    'chart.mostTargeted':      'Am häufigsten angegriffene Einrichtungen',
    'chart.byAttackType':      'Vorfälle nach Angriffsart',
  },
  ar: {
    'nav.overview':   'نظرة عامة',
    'nav.incidents':  'الحوادث',
    'nav.timeline':   'الجدول الزمني',
    'nav.statistics': 'الإحصائيات',
    'nav.resources':  'المصادر',
    'stat.incidents': 'حوادث الهجوم',
    'stat.killed':    'المدنيون القتلى',
    'section.incidents.title': 'حوادث الهجوم',
    'section.incidents.desc':  'الحوادث الموثقة للهجمات على المنشآت',
    'section.timeline.title':  'الجدول الزمني للأحداث الرئيسية',
    'section.timeline.desc':   'المعالم الرئيسية في الدمار الممنهج',
    'section.statistics.title':'التحليل الإحصائي',
    'section.statistics.desc': 'رؤى مستندة إلى البيانات حول أنماط الاستهداف',
    'section.resources.title': 'المصادر والتوثيق',
    'section.resources.desc':  'التقارير الرسمية والتحقيقات والأدلة الموثقة',
    'filter.searchIncidents':  'البحث في الحوادث…',
    'filter.allAttackTypes':   'جميع أنواع الهجمات',
    'filter.allStatuses':      'جميع الحالات',
    'filter.allGovernorates':  'جميع المحافظات',
    'detail.back':             '→ رجوع',
    'detail.incidentHistory':  'سجل الحوادث',
    'detail.facilityInfo':     'معلومات المنشأة',
    'detail.incidentTypes':    'أنواع الحوادث',
    'detail.notes':            'ملاحظات',
    'detail.totalIncidents':   'إجمالي الحوادث',
    'detail.civiliansKilled':  'المدنيون القتلى',
    'detail.civiliansInjured': 'المدنيون الجرحى',
    'detail.staffKilled':      'الموظفون القتلى',
    'detail.copyLink':         '🔗 نسخ الرابط',
    'detail.copied':           '✓ تم النسخ!',
    'modal.back':              '→ رجوع',
    'modal.copyLink':          '🔗 نسخ الرابط',
    'loading.facilities':      'جارٍ تحميل البيانات…',
    'loading.incidents':       'جارٍ تحميل بيانات الحوادث…',
    'loading.timeline':        'جارٍ تحميل الجدول الزمني…',
    'loading.statistics':      'جارٍ تحميل الإحصائيات…',
    'loading.resources':       'جارٍ تحميل الموارد…',
    'noMatch.facilities':      'لا توجد منشآت تطابق عوامل التصفية.',
    'noMatch.incidents':       'لا توجد حوادث تطابق عوامل التصفية.',
    'chart.attacksOverTime':   'الهجمات عبر الزمن',
    'chart.mostTargeted':      'أكثر المنشآت استهدافاً',
    'chart.byAttackType':      'الحوادث حسب نوع الهجوم',
  }
};

/**
 * Called by each page to inject its own strings into TRANSLATIONS.
 * pageStrings shape: { en: { 'header.title': '...', ... }, de: {...}, ar: {...} }
 */
function mergePageTranslations(pageStrings) {
    Object.keys(pageStrings).forEach(lang => {
        if (!TRANSLATIONS[lang]) TRANSLATIONS[lang] = {};
        Object.assign(TRANSLATIONS[lang], pageStrings[lang]);
    });
}

function t(key) {
    return (TRANSLATIONS[currentLang] || TRANSLATIONS.en)[key]
        || (TRANSLATIONS.en[key])
        || key;
}

function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        // Skip the shared header / sub-header — those elements use
        // dot-namespaced keys (e.g. "common.nav.warCrimes") resolved by
        // TranslationSystem against translations/<lang>.json. Running them
        // through this page's flat TRANSLATIONS table would miss every key
        // and overwrite the header's translated text with the raw key name.
        if (el.closest('.header, .sub-header, .mobile-nav-drawer, #language-selector')) return;

        const key = el.dataset.i18n;

        // Belt and braces: the selector above only covers chrome we can name,
        // and .mobile-nav-drawer sits outside .header so it used to slip
        // through. Anything in the "common." namespace belongs to
        // TranslationSystem (translations/*.json), never to this page's flat
        // TRANSLATIONS table - t() would fall back to the raw key and render
        // it as visible text. Same rule as Historical_Massacres/shared.js.
        if (key.startsWith('common.')) return;
        if (el.dataset.i18nAttr === 'placeholder') {
            el.placeholder = t(key);
        } else {
            setTranslatedText(el, t(key));
        }
    });
}

/**
 * Replace an element's label text while keeping any .no-translate children
 * (status badges, icons, counters). A bare `el.textContent = ...` deletes
 * them - that is what used to strip every badge out of the site footer.
 */
function setTranslatedText(el, text) {
    const preserved = Array.from(el.querySelectorAll(':scope > .no-translate, :scope > [data-no-translate]'));
    el.textContent = text;
    preserved.forEach(node => {
        el.appendChild(document.createTextNode(' '));
        el.appendChild(node);
    });
}

function setLang(lang) {
    currentLang = lang;

    // ── Persist so the other translation system picks it up on any page ──
    localStorage.setItem('gaza-docs-lang', lang);

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    // Update any standalone .lang-btn elements on the page
    document.querySelectorAll('.lang-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.lang === lang)
    );

    // If the shared header component is present, keep its selector in sync
    // without triggering another languageChanged loop
    if (window.TranslationSystem && window.TranslationSystem.isInitialized
            && window.TranslationSystem.currentLanguage !== lang) {
        window.TranslationSystem.currentLanguage = lang;
        window.TranslationSystem.updateLanguageSelectorUI();
        window.TranslationSystem.updatePageLanguage();   // translates header nav items
    }

    renderForLang();
}

/**
 * Re-render this page's own i18n strings + data-driven sections for
 * whatever `currentLang` currently is. Shared by setLang() (page-local
 * language buttons) and syncLangFromHeader() (the shared header's
 * #language-selector).
 */
function renderForLang() {
    applyI18n();
    const cfg = window.PAGE_CONFIG;
    if (!cfg) return;
    cfg.updateDashboard();
    cfg.renderFacilities();
    renderIncidents();
    renderTimeline();
    renderStatistics();
    renderResources();
    chartsRendered = false;
    renderCharts();
}

/**
 * Bridge: react to language changes driven by the shared header
 * (header-component.js + translation-system.js), which knows nothing about
 * this page's own TRANSLATIONS table or PAGE_CONFIG render functions.
 *
 *  - 'languageChanged' fires when the visitor clicks a button in the shared
 *    header's #language-selector. TranslationSystem has already persisted
 *    the choice to localStorage, set document dir/lang, and translated the
 *    header's own data-i18n elements.
 *  - 'translationsLoaded' fires once after TranslationSystem.init() on
 *    first load — covers the case where no 'gaza-docs-lang' is saved yet
 *    and TranslationSystem falls back to the browser language, which can
 *    differ from the 'en' default this page started with at script-load
 *    time.
 *
 * Either way, adopt the language the header settled on and re-render this
 * page's own strings/content to match — don't write localStorage or touch
 * TranslationSystem again, it already did its part.
 */
function syncLangFromHeader(lang) {
    if (!lang || !['en', 'de', 'ar'].includes(lang) || lang === currentLang) return;

    currentLang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    document.querySelectorAll('.lang-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.lang === lang)
    );

    // If page data hasn't loaded yet, just translate the static chrome —
    // loadAllData() will call renderForLang() in the right language once
    // it finishes either way.
    if (facilitiesData.length || incidentsData.length) {
        renderForLang();
    } else {
        applyI18n();
    }
}

document.addEventListener('languageChanged',    e => syncLangFromHeader(e.detail && e.detail.language));
document.addEventListener('translationsLoaded', e => syncLangFromHeader(e.detail && e.detail.language));

// ─────────────────────────────────────────────────────────────
//  Translation field helper
// ─────────────────────────────────────────────────────────────
function getField(record, fieldName, lang) {
    if (lang && lang !== 'en') {
        const val = record[fieldName + '_' + lang];
        if (val !== undefined && val !== null && String(val).trim() !== '') return val;
    }
    return record[fieldName];
}

// ─────────────────────────────────────────────────────────────
//  Facility URL slugs — human-readable names in #hash links,
//  e.g. #hospital/al-shifa-medical-complex instead of #hospital/FAC-000
// ─────────────────────────────────────────────────────────────

/** Convert arbitrary text into a URL-friendly slug. */
function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip accents
        .replace(/[^a-z0-9]+/g, '-')                        // non-alphanumeric → hyphen
        .replace(/^-+|-+$/g, '');                           // trim leading/trailing hyphens
}

/** Slug used in URLs for a given facility — based on its (English) name,
 *  falling back to its internal facility ID if no usable name exists. */
function getFacilitySlug(fac) {
    const cfg = window.PAGE_CONFIG;
    if (!fac) return '';
    return slugify(fac.name) || fac[cfg.facilityIdKey];
}

/** Find a facility record from a #hash reference, which may be either a
 *  human-readable slug (new-style links) or a raw facility ID such as
 *  "FAC-000" (old-style / bookmarked links). */
function findFacilityBySlug(ref) {
    const cfg = window.PAGE_CONFIG;
    if (!ref) return null;

    const target = ref.toLowerCase();
    const bySlug = facilitiesData.find(f => slugify(f.name) === target);
    if (bySlug) return bySlug;

    return facilitiesData.find(f => f[cfg.facilityIdKey] === ref) || null;
}

/** Resolve a #hash reference (slug or raw ID) to the facility's canonical
 *  internal ID (the value used to join incidents, sidebar, etc). Returns
 *  the input unchanged if no matching facility can be found. */
function resolveFacilityId(ref) {
    const cfg = window.PAGE_CONFIG;
    if (facilitiesData.some(f => f[cfg.facilityIdKey] === ref)) return ref;
    const fac = findFacilityBySlug(ref);
    return fac ? fac[cfg.facilityIdKey] : ref;
}

// ─────────────────────────────────────────────────────────────
//  CSV loader
// ─────────────────────────────────────────────────────────────
function loadCSV(path, required = true) {
    // No path declared for this dataset on this page - nothing to fetch.
    if (!path) return Promise.resolve([]);
    return new Promise(resolve => {
        Papa.parse(path, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: r => resolve(r.data),
            error: () => {
                if (required) console.warn(`Could not load: ${path}`);
                resolve([]);
            }
        });
    });
}

// ─────────────────────────────────────────────────────────────
//  Data loading — called from each page's loadAllData()
//  Returns { facilities, incidents, timeline, statistics,
//            resources, facDe, facAr, incDe, incAr }
// ─────────────────────────────────────────────────────────────
async function loadSharedData(paths) {
    const [
        facilities, incidents, timeline, statistics, resources,
        facDe, facAr, incDe, incAr
    ] = await Promise.all([
        loadCSV(paths.facilities),
        loadCSV(paths.incidents),
        loadCSV(paths.timeline,        false),
        loadCSV(paths.statistics,      false),
        loadCSV(paths.resources,       false),
        loadCSV(paths.facilitiesDe,    false),
        loadCSV(paths.facilitiesAr,    false),
        loadCSV(paths.incidentsDe,     false),
        loadCSV(paths.incidentsAr,     false),
    ]);
    return { facilities, incidents, timeline, statistics, resources,
             facDe, facAr, incDe, incAr };
}

/**
 * Merges _de / _ar translation columns from a translation CSV
 * into the matching base records.
 */
function mergeTransRow(baseArr, transArr, keyField) {
    if (!transArr || !transArr.length) return;
    const map = new Map(
        transArr
            .filter(r => r[keyField] && r[keyField].trim())
            .map(r => [r[keyField].trim(), r])
    );
    baseArr.forEach(rec => {
        const tr = map.get((rec[keyField] || '').trim());
        if (!tr) return;
        Object.keys(tr).forEach(col => {
            if ((col.endsWith('_de') || col.endsWith('_ar')) && !(col in rec)) {
                rec[col] = tr[col];
            }
        });
    });
}

// ─────────────────────────────────────────────────────────────
//  Shared render: Incidents tab
// ─────────────────────────────────────────────────────────────
function renderIncidents() {
    const cfg = window.PAGE_CONFIG;
    const container  = document.getElementById(cfg.incGridId);
    if (!container) return;
    const searchTerm = (document.getElementById(cfg.incidentSearchId)?.value || '').toLowerCase();
    const attackFilt = document.getElementById(cfg.attackFilterId)?.value || '';

    const filtered = incidentsData.filter(i => {
        const nm = (i.facility_name || '').toLowerCase();
        const ds = (getField(i, 'description', currentLang) || i.description || '').toLowerCase();
        const matchSearch = nm.includes(searchTerm) || ds.includes(searchTerm);
        const matchAttack = !attackFilt || (i.attack_type || '').includes(attackFilt);
        return matchSearch && matchAttack;
    });

    if (!filtered.length) {
        container.innerHTML = `<div class="loading">${t('noMatch.incidents')}</div>`;
        return;
    }

    container.innerHTML = filtered.slice(0, 100).map(i => {
        const killed   = parseFloat(i.civilians_killed)  || 0;
        const injured  = parseFloat(i.civilians_injured) || 0;
        const hwKilled = parseFloat(i.hw_killed) || 0;

        const iAttack   = getField(i, 'attack_type',      currentLang) || i.attack_type      || '';
        const iResult   = getField(i, 'result',           currentLang) || i.result           || '';
        const iFullDesc = getField(i, 'full_discription', currentLang) || i.full_discription  || '';
        const iDesc     = getField(i, 'description',      currentLang) || i.description      || '';

        const src1    = i.source_url_1 && i.source_url_1 !== 'None' ? i.source_url_1.trim() : '';
        const src2Lst = (i.source_url_2 && i.source_url_2 !== 'None')
            ? i.source_url_2.split(',').map(s => s.trim()).filter(s => s && s !== 'None') : [];
        const allSrc  = [src1, ...src2Lst].filter(Boolean);
        const vid     = (i.video_url && i.video_url !== 'None') ? i.video_url.trim() : '';
        const aVid    = (i.archived_video && i.archived_video !== 'None') ? i.archived_video.trim() : '';
        const hasExtra = allSrc.length || vid || aVid;

        const cfg = window.PAGE_CONFIG;
        const facId = i[cfg.incidentFacKey] || '';
        const facRecord = facId ? facilitiesData.find(f => f[cfg.facilityIdKey] === facId) : null;
        const hasFacility = !!facRecord;
        const facSlug = facRecord ? encodeURIComponent(getFacilitySlug(facRecord)) : '';

        return `
        <div class="card${hasFacility ? ' clickable' : ''}"${hasFacility ? ` onclick="openFacilityDetail('${facId}')"` : ''}>
            <div class="card-header">
                <div class="card-title">${i.facility_name || 'Multiple Facilities'}</div>
                <div class="card-subtitle">📅 ${formatIncidentDate(i)}</div>
                <div style="margin-top:0.5rem;">
                    ${iAttack ? `<span class="badge" style="background:#fef2f2;color:#dc2626;">${iAttack}</span>` : ''}
                    ${i.incident_id ? `<span style="font-size:0.72rem;color:#94a3b8;font-family:monospace;">${i.incident_id}</span>` : ''}
                </div>
            </div>
            <div class="card-body">
                ${iResult ? `<p style="font-weight:600;margin-bottom:0.4rem">${iResult}</p>` : ''}
                ${(iFullDesc && iFullDesc !== 'None') ? `<p>${iFullDesc}</p>` : (iDesc ? `<p>${iDesc}</p>` : '')}
                ${(killed || injured || hwKilled) ? `
                <div class="incident-details" style="margin-top:0.75rem">
                    ${killed   ? `<span style="color:#dc2626;font-weight:700">💀 ${killed} killed</span>&nbsp;&nbsp;` : ''}
                    ${injured  ? `<span style="color:#ea580c;font-weight:700">🩹 ${injured} injured</span>&nbsp;&nbsp;` : ''}
                    ${hwKilled ? `<span style="color:#16a34a;font-weight:700">⚕️ ${hwKilled} health workers killed</span>` : ''}
                </div>` : ''}
            </div>
            ${hasExtra ? `
            <div style="margin-top:0.75rem;font-size:0.8125rem;color:var(--text-secondary);display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center;">
                ${allSrc.length ? `<strong>Sources:</strong> ${allSrc.map(url => `<a href="${url}" target="_blank" rel="noopener" style="color:var(--accent-blue);" onclick="event.stopPropagation()">🔗 ${urlDomain(url)}</a>`).join('')}` : ''}
                ${vid  ? `<a href="${vid}"  target="_blank" rel="noopener" style="color:#7c3aed;" onclick="event.stopPropagation()">🎥 ${urlDomain(vid)}</a>`  : ''}
                ${aVid ? `<a href="${aVid}" target="_blank" rel="noopener" style="color:#7c3aed;" onclick="event.stopPropagation()">📼 ${urlDomain(aVid)}</a>` : ''}
            </div>` : ''}
            ${hasFacility ? `
            <a class="btn-profile" href="#${cfg.urlPrefix}/${facSlug}" onclick="event.stopPropagation(); openFacilityDetail('${facId}')">
                <span>View Facility Profile</span>
                <span class="arrow">→</span>
            </a>` : ''}
        </div>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────
//  Shared render: Timeline tab
// ─────────────────────────────────────────────────────────────
function renderTimeline() {
    const cfg = window.PAGE_CONFIG;
    const container = document.getElementById(cfg.timelineId);
    if (!container) return;

    if (!timelineData.length) {
        const sorted = [...incidentsData]
            .filter(i => i.starting_date || i.date)
            .sort((a, b) => {
                const da = parseDateFirst(a.starting_date || a.date);
                const db = parseDateFirst(b.starting_date || b.date);
                return (da || 0) - (db || 0);
            })
            .slice(0, 40);

        container.innerHTML = sorted.map(i => {
            const iAttack = getField(i, 'attack_type', currentLang) || i.attack_type || '';
            const iResult = getField(i, 'result',      currentLang) || i.result      || '';
            const iDesc   = getField(i, 'description', currentLang) || i.description || '';
            const bodyText = iResult || iDesc;
            const s1 = i.source_url_1 && i.source_url_1 !== 'None' ? i.source_url_1.trim() : '';
            const s2List = (i.source_url_2 && i.source_url_2 !== 'None')
                ? i.source_url_2.split(',').map(s => s.trim()).filter(s => s && s !== 'None') : [];
            const allSources = [s1, ...s2List].filter(Boolean);

            return `
            <div class="timeline-item">
                <div class="timeline-date">${formatIncidentDate(i)}</div>
                <div class="timeline-title">${i.facility_name || 'Facility'}</div>
                <div class="timeline-content">
                    ${iAttack ? `<p>${iAttack}</p>` : ''}
                    ${bodyText ? `<p>${bodyText}</p>` : ''}
                    ${allSources.length ? `<p style="margin-top:0.5rem;font-size:0.8125rem;color:#94a3b8;">
                        ${allSources.map((url, idx) =>
                            `<a href="${url}" target="_blank" style="color:#60a5fa;margin-right:0.5rem;">Source ${idx + 1} →</a>`
                        ).join('')}
                      </p>` : ''}
                </div>
            </div>`;
        }).join('');
        return;
    }

    container.innerHTML = timelineData.map(item => `
        <div class="timeline-item">
            <div class="timeline-date">${formatDate(item.date)}</div>
            <div class="timeline-title">${item.event_title || ''}</div>
            <div class="timeline-content">
                <p><strong>${item.facility_name || item.hospital_name || ''}</strong></p>
                <p>${item.description || ''}</p>
                ${item.significance ? `<p style="margin-top:0.5rem"><em>Significance: ${item.significance}</em></p>` : ''}
                ${item.sources ? `<p style="margin-top:0.5rem;font-size:0.8125rem;color:#94a3b8;"><strong>Sources:</strong> ${item.sources}</p>` : ''}
            </div>
        </div>`).join('');
}

// ─────────────────────────────────────────────────────────────
//  Shared render: Statistics tab
// ─────────────────────────────────────────────────────────────
function renderStatistics() {
    const cfg = window.PAGE_CONFIG;
    const container = document.getElementById(cfg.statisticsId);
    if (!container) return;

    const counts = {};
    incidentsData.forEach(i => {
        const fid = i[cfg.incidentFacKey] || i.facility_name;
        if (fid) counts[fid] = (counts[fid] || 0) + 1;
    });

    const rows = facilitiesData.map(h => ({
        name:  getField(h, 'name', currentLang) || h.name || h[cfg.facilityIdKey],
        id:    h[cfg.facilityIdKey],
        count: counts[h[cfg.facilityIdKey]] || 0,
        beds:  h.beds_pre_war || h.capacity || '—',
        gov:   h.governorate  || '—',
        type:  h.type         || '—'
    })).sort((a, b) => b.count - a.count);

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Facility Name</th>
                    <th>Governorate</th>
                    <th>Type</th>
                    <th>Capacity (Pre-War)</th>
                    <th>Recorded Incidents</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                <tr style="cursor:pointer" onclick="openFacilityDetail('${r.id}')">
                    <td><strong>${r.name}</strong></td>
                    <td>${r.gov}</td>
                    <td>${r.type}</td>
                    <td>${r.beds}</td>
                    <td style="font-weight:700;color:var(--primary-red)">${r.count}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

// ─────────────────────────────────────────────────────────────
//  Shared render: Resources tab
// ─────────────────────────────────────────────────────────────
function renderResources() {
    const cfg = window.PAGE_CONFIG;
    const container = document.getElementById(cfg.resourcesId);
    if (!container) return;
    if (!resourcesData.length) {
        container.innerHTML = '<div class="loading">No resources file found. Add a resources CSV to populate this section.</div>';
        return;
    }
    container.innerHTML = resourcesData.map(r => {
        const link = r.source_url_1 || r.source_url || r.url || '';
        const validLink = link && link !== 'None' && link !== 'nan' ? link : '';
        return `
        <div class="resource-card">
            <div class="resource-type">${r.resource_type || 'Resource'}</div>
            <div class="resource-title">${r.resource_title || r.title || ''}</div>
            <div class="resource-org">📋 ${r.organization || r.org || ''}</div>
            ${validLink ? `<a href="${validLink}" target="_blank" rel="noopener" class="resource-link">View Resource →</a>` : ''}
        </div>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────
//  Shared render: Charts (overview tab)
// ─────────────────────────────────────────────────────────────
let chartsRendered = false;

function renderCharts() {
    if (chartsRendered) return;
    chartsRendered = true;

    const cfg = window.PAGE_CONFIG;

    // 1. Most targeted facilities (top 10)
    const facCounts = {};
    incidentsData.forEach(i => {
        const fid = i[cfg.incidentFacKey];
        if (fid) facCounts[fid] = (facCounts[fid] || 0) + 1;
    });
    const top10 = Object.entries(facCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([fid, cnt]) => {
            const fac = facilitiesData.find(f => f[cfg.facilityIdKey] === fid);
            return { name: fac ? (getField(fac, 'name', currentLang) || fac.name) : fid, count: cnt };
        });

    const targetedEl = document.getElementById('targetedChart');
    if (targetedEl) {
        new Chart(targetedEl, {
            type: 'bar',
            data: {
                labels: top10.map(f => f.name),
                datasets: [{ label: 'Incidents', data: top10.map(f => f.count), backgroundColor: '#dc2626' }]
            },
            options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
        });
    }

    // 2. Attacks over time (month buckets)
    const monthCounts = {};
    incidentsData.forEach(i => {
        const dateVal = i.starting_date || i.date;
        if (!dateVal) return;
        const d = parseDateFirst(dateVal);
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthCounts[key] = (monthCounts[key] || 0) + 1;
    });
    const sortedMonths = Object.keys(monthCounts).sort();
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const prettyLabels = sortedMonths.map(key => {
        const [y, m] = key.split('-');
        return `${monthNames[+m - 1]} ${y}`;
    });

    const timelineEl = document.getElementById('timelineChart');
    if (timelineEl) {
        new Chart(timelineEl, {
            type: 'line',
            data: {
                labels: prettyLabels,
                datasets: [{
                    label: 'Attacks',
                    data: sortedMonths.map(m => monthCounts[m]),
                    borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.08)',
                    fill: true, tension: 0.35, pointRadius: 3,
                    pointBackgroundColor: '#dc2626', pointHoverRadius: 6, borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: {
                        title: ctx => ctx[0].label,
                        label: ctx => ` ${ctx.raw} attack${ctx.raw !== 1 ? 's' : ''}`
                    }}
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Incidents', color: '#64748b', font: { size: 12 } }, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { ticks: { maxRotation: 45, minRotation: 30, font: { size: 11 }, color: '#64748b', maxTicksLimit: 18 }, grid: { display: false } }
                }
            }
        });
    }

    // 3. Attack type distribution
    const typeCounts = {};
    incidentsData.forEach(i => {
        const tp = i.attack_type || 'Unidentified';
        typeCounts[tp] = (typeCounts[tp] || 0) + 1;
    });
    const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const attackTypeEl = document.getElementById('attackTypeChart');
    if (attackTypeEl) {
        new Chart(attackTypeEl, {
            type: 'bar',
            data: {
                labels: sortedTypes.map(tp => tp[0]),
                datasets: [{ label: 'Incidents', data: sortedTypes.map(tp => tp[1]), backgroundColor: '#ea580c' }]
            },
            options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
        });
    }
}

// ─────────────────────────────────────────────────────────────
//  Detail panel
// ─────────────────────────────────────────────────────────────

/**
 * openFacilityDetail — generic entry point called by card clicks
 * and hash routing. Works for any entity type.
 */
function openFacilityDetail(facilityId) {
    const cfg = window.PAGE_CONFIG;
    let fac = facilitiesData.find(f => f[cfg.facilityIdKey] === facilityId);
    if (!fac) fac = findFacilityBySlug(facilityId);
    if (!fac) { console.warn('Facility not found:', facilityId); return; }

    const realId = fac[cfg.facilityIdKey];
    const relInc = incidentsData.filter(i => i[cfg.incidentFacKey] === realId);

    const slug = encodeURIComponent(getFacilitySlug(fac));
    history.pushState({ facility: realId }, '', `#${cfg.urlPrefix}/${slug}`);

    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(cfg.detailSectionId).classList.add('active');

    const facName = getField(fac, 'name', currentLang) || fac.name || realId;
    document.getElementById(cfg.breadcrumbId).textContent = facName;
    const slugEl = document.getElementById(cfg.permalinkSlugId);
    if (slugEl) slugEl.textContent = `#${cfg.urlPrefix}/${slug}`;

    renderDetailHero(fac, relInc);

    document.getElementById('dss-incidents').textContent = relInc.length || '—';
    document.getElementById('dss-killed').textContent    = sumField(relInc, 'civilians_killed')  || '—';
    document.getElementById('dss-injured').textContent   = sumField(relInc, 'civilians_injured') || '—';
    document.getElementById('dss-hw').textContent        = sumField(relInc, 'hw_killed')         || '—';

    renderDetailSidebar(fac, relInc);
    renderDetailIncidents(fac, relInc);

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderDetailHero(fac, incidents) {
    const cfg = window.PAGE_CONFIG;
    const totalKilled = sumField(incidents, 'civilians_killed');
    const facImg = (fac.Image_url || fac.image_url) && (fac.Image_url || fac.image_url) !== 'None'
        ? (fac.Image_url || fac.image_url).trim() : '';

    const facName       = getField(fac, 'name',            currentLang) || fac.name            || '—';
    const facSpec       = getField(fac, 'specialization',  currentLang) || fac.specialization   || '';
    const facPostStatus = getField(fac, 'post_war_status', currentLang) || fac.post_war_status  || '';

    const introFn = (cfg.buildIntro || defaultBuildIntro);

    document.getElementById('detail-hero-wrap').innerHTML = `
        <div class="detail-hero">
            <div class="detail-hero-inner">
                <div class="detail-hero-text">
                    <div class="detail-eyebrow">${[fac.type, fac.sub_type].filter(v => v && v !== 'None').join(' · ') || 'Facility'}</div>
                    <h2>${facName}</h2>
                    <div class="detail-hero-sub">📍 ${[fac.area, fac.governorate].filter(v => v && v !== 'None').join(', ') || '—'}</div>
                    <div class="detail-hero-badges">
                        ${fac.type           ? `<span class="detail-hero-badge dhb-type">${fac.type}</span>`            : ''}
                        ${fac.governorate    ? `<span class="detail-hero-badge dhb-gov">${fac.governorate}</span>`      : ''}
                        ${fac.pre_war_status ? `<span class="detail-hero-badge dhb-status">${fac.pre_war_status}</span>` : ''}
                        ${facPostStatus && facPostStatus !== 'None'
                            ? `<span class="detail-hero-badge" style="background:rgba(124,58,237,0.2);color:#c4b5fd;border:1px solid rgba(124,58,237,0.35);">${facPostStatus}</span>`
                            : ''}
                    </div>
                    <p class="detail-hero-intro">${introFn(fac)}</p>
                </div>
                ${facImg ? `
                <div class="detail-fac-img-wrap">
                    <img class="detail-fac-img" src="${facImg}" alt="${facName}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none'">
                    <div class="detail-fac-img-caption">📷 ${facName}</div>
                </div>` : ''}
                <div class="detail-hero-facts">
                    ${cfg.heroFacts ? cfg.heroFacts(fac, incidents) : defaultHeroFacts(fac, incidents)}
                </div>
            </div>
        </div>`;
}

/** Default hero facts — pages can override via PAGE_CONFIG.heroFacts(fac, incidents) */
function defaultHeroFacts(fac, incidents) {
    const totalKilled = sumField(incidents, 'civilians_killed');
    const facSpec = getField(fac, 'specialization', currentLang) || fac.specialization || '';
    return `
        <div><div class="dhf-label">Incidents Recorded</div><div class="dhf-value">${incidents.length}</div></div>
        <div><div class="dhf-label">Civilians Killed</div><div class="dhf-value red">${totalKilled || '—'}</div></div>
        <div><div class="dhf-label">Capacity (Pre-War)</div><div class="dhf-value">${fac.beds_pre_war || fac.capacity || '—'}</div></div>
        <div><div class="dhf-label">Specialization</div><div class="dhf-value" style="font-size:0.8rem">${facSpec || '—'}</div></div>`;
}

/** Default intro builder — pages can override via PAGE_CONFIG.buildIntro(fac) */
function defaultBuildIntro(fac) {
    const intro   = getField(fac, 'introduction', currentLang);
    const facName = getField(fac, 'name',         currentLang) || fac.name;
    const facSpec = getField(fac, 'specialization',currentLang) || fac.specialization;

    if (intro && intro !== 'None' && intro !== 'null') return intro;

    let txt = `${facName} is a ${(fac.type || 'facility').toLowerCase()} located in ${fac.area || fac.governorate || 'Gaza'}.`;
    if ((fac.beds_pre_war || fac.capacity) && (fac.beds_pre_war || fac.capacity) !== 'None')
        txt += ` It had ${fac.beds_pre_war || fac.capacity} capacity before the war.`;
    if (facSpec && facSpec !== 'None') txt += ` Specialization: ${facSpec}.`;
    return txt;
}

function renderDetailSidebar(fac, incidents) {
    const facSpec       = getField(fac, 'specialization',  currentLang) || fac.specialization  || '';
    const facNotes      = getField(fac, 'notes',           currentLang) || fac.notes           || '';
    const facPostStatus = getField(fac, 'post_war_status', currentLang) || fac.post_war_status || '';

    const cfg = window.PAGE_CONFIG;
    const baseRows = [
        ['ID',              fac[cfg.facilityIdKey]],
        ['Type',            fac.type],
        ['Sub-Type',        fac.sub_type],
        ['Governorate',     fac.governorate],
        ['Area',            fac.area],
        ['Specialization',  facSpec],
        ['Capacity (Pre-War)', fac.beds_pre_war || fac.capacity],
        ['Pre-War Status',  fac.pre_war_status],
        ['Post-War Status', facPostStatus && facPostStatus !== 'None' ? facPostStatus : ''],
    ];
    // Pages can inject extra rows via PAGE_CONFIG.extraSidebarRows(fac)
    const extraRows = cfg.extraSidebarRows ? cfg.extraSidebarRows(fac) : [];
    const rows = [...baseRows, ...extraRows]
        .filter(([, v]) => v && v !== 'None' && v !== 'null' && v !== 'nan' && String(v).trim() !== '');

    document.getElementById('detail-sidebar-info').innerHTML = rows.map(([k, v]) => `
        <div class="info-row">
            <span class="info-key">${k}</span>
            <span class="info-val">${v}</span>
        </div>`).join('');

    const notesBox = document.getElementById('detail-notes-box');
    if (facNotes && facNotes !== 'None' && facNotes !== 'null') {
        notesBox.style.display = '';
        document.getElementById('detail-notes-text').textContent = facNotes;
    } else {
        notesBox.style.display = 'none';
    }

    const typeDist   = document.getElementById('detail-type-dist-box');
    const typeCounts = {};
    incidents.forEach(i => {
        const tp = getField(i, 'attack_type', currentLang) || i.attack_type || 'Unspecified';
        typeCounts[tp] = (typeCounts[tp] || 0) + 1;
    });
    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] || 1;

    if (sorted.length) {
        typeDist.style.display = '';
        document.getElementById('detail-type-dist').innerHTML = sorted.map(([type, count]) => `
            <div class="type-bar-row">
                <div class="type-bar-lbl"><span class="n">${type}</span><span class="c">${count}</span></div>
                <div class="type-bar-bg"><div class="type-bar-fill" style="width:${(count / max * 100).toFixed(1)}%"></div></div>
            </div>`).join('');
    } else {
        typeDist.style.display = 'none';
    }
}

function renderDetailIncidents(fac, incidents) {
    const cfg  = window.PAGE_CONFIG;
    const list = document.getElementById('detail-incidents-list');
    document.getElementById('detail-incidents-title').textContent =
        `Incident History (${incidents.length} records)`;

    if (!incidents.length) {
        list.innerHTML = `<div class="empty-detail"><div style="font-size:2rem;margin-bottom:0.75rem">📭</div><strong>No incidents recorded</strong><p>This facility has no documented incidents in the database.</p></div>`;
        return;
    }

    const sorted = [...incidents].sort((a, b) => {
        const da = parseDateFirst(a.starting_date || a.date);
        const db = parseDateFirst(b.starting_date || b.date);
        if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
        return db - da;
    });

    list.innerHTML = sorted.map(inc => {
        const typeKey  = incTypeKey(inc.attack_type);
        const badgeKey = incBadgeKey(inc.attack_type);
        const killed  = parseFloat(inc.civilians_killed)  || 0;
        const injured = parseFloat(inc.civilians_injured) || 0;
        const hwK     = parseFloat(inc.hw_killed)  || 0;
        const hwI     = parseFloat(inc.hw_injured) || 0;

        const imgSrc = (inc.image_url && inc.image_url !== 'None' && inc.image_url.trim())
            ? inc.image_url.trim()
            : (inc.archived_image && inc.archived_image !== 'None' && inc.archived_image.trim()
                ? inc.archived_image.trim() : '');

        const incAttack = getField(inc, 'attack_type', currentLang) || inc.attack_type || '';
        const incResult = getField(inc, 'result',      currentLang) || inc.result      || '';
        const incDesc   = getField(inc, 'description', currentLang) || inc.description || '';

        const cas = [
            killed  ? `<span class="cas-chip killed">💀 ${killed} killed</span>`    : '',
            injured ? `<span class="cas-chip injured">🩹 ${injured} injured</span>`  : '',
            hwK     ? `<span class="cas-chip hw">⚕️ ${hwK} HW killed</span>`         : '',
            hwI     ? `<span class="cas-chip hw">⚕️ ${hwI} HW injured</span>`        : '',
        ].filter(Boolean).join('');

        const src1 = inc.source_url_1 && inc.source_url_1 !== 'None' ? inc.source_url_1.trim() : '';
        const src2List = (inc.source_url_2 && inc.source_url_2 !== 'None')
            ? inc.source_url_2.split(',').map(s => s.trim()).filter(s => s && s !== 'None') : [];
        const allSources = [src1, ...src2List].filter(Boolean);

        return `
        <article class="detail-inc-card type-${typeKey}"
                 onclick="openIncidentModal('${inc.incident_id}', '${inc[cfg.incidentFacKey]}')"
                 title="Click to view full incident">
            ${imgSrc ? `<img class="detail-inc-img" src="${imgSrc}" alt="Incident image" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
            <div class="detail-inc-body">
                <div class="detail-inc-meta">
                    <span class="inc-date-chip">📅 ${formatIncidentDate(inc)}</span>
                    ${incAttack ? `<span class="inc-attack-badge ${badgeKey}">${incAttack}</span>` : ''}
                    ${inc.incident_id ? `<span class="inc-id-chip">${inc.incident_id}</span>` : ''}
                </div>
                ${incResult && incResult !== 'None' ? `<div class="detail-inc-result">${incResult}</div>` : ''}
                ${incDesc   && incDesc   !== 'None' ? `<p class="detail-inc-desc">${incDesc}</p>` : ''}
                ${cas ? `<div class="detail-inc-casualties">${cas}</div>` : ''}
                ${allSources.length ? `
                <div class="detail-inc-sources">
                    <strong>Sources:</strong>
                    ${allSources.map(url =>
                        `<a href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 ${urlDomain(url)}</a>`
                    ).join('')}
                </div>` : ''}
                <div class="inc-open-hint">↗ Click to view full incident</div>
            </div>
        </article>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────
//  Incident modal
// ─────────────────────────────────────────────────────────────
let _currentFacilityId = null;

function openIncidentModal(incidentId, facilityId) {
    const cfg = window.PAGE_CONFIG;
    const inc = incidentsData.find(i => i.incident_id === incidentId);
    if (!inc) return;
    _currentFacilityId = resolveFacilityId(facilityId || inc[cfg.incidentFacKey]);

    const facForSlug = facilitiesData.find(f => f[cfg.facilityIdKey] === _currentFacilityId);
    const facSlug = facForSlug ? encodeURIComponent(getFacilitySlug(facForSlug)) : encodeURIComponent(_currentFacilityId);
    const hash = `${cfg.urlPrefix}/${facSlug}/incident/${encodeURIComponent(incidentId)}`;
    history.pushState({ incident: incidentId, facility: _currentFacilityId }, '', `#${hash}`);
    document.getElementById('inc-modal-slug').textContent = `#${hash}`;

    const imgSrc = (inc.image_url && inc.image_url !== 'None' && inc.image_url.trim())
        ? inc.image_url.trim()
        : (inc.archived_image && inc.archived_image !== 'None' ? inc.archived_image.trim() : '');

    const src1 = inc.source_url_1 && inc.source_url_1 !== 'None' ? inc.source_url_1.trim() : '';
    const src2List = (inc.source_url_2 && inc.source_url_2 !== 'None')
        ? inc.source_url_2.split(',').map(s => s.trim()).filter(s => s && s !== 'None') : [];
    const allSources = [src1, ...src2List].filter(Boolean);

    const casItems = [
        [inc.civilians_killed,  'Civilians Killed',       'cas-killed-val'],
        [inc.civilians_injured, 'Civilians Injured',      'cas-injured-val'],
        [inc.hw_killed,         'Health Workers Killed',  'cas-hw-val'],
        [inc.hw_injured,        'Health Workers Injured', 'cas-hw-val'],
    ].filter(([v]) => v && parseFloat(v) > 0);

    const fac = facilitiesData.find(f => f[cfg.facilityIdKey] === _currentFacilityId);
    const incAttack   = getField(inc, 'attack_type',      currentLang) || inc.attack_type      || '';
    const incResult   = getField(inc, 'result',           currentLang) || inc.result           || '';
    const incFullDesc = getField(inc, 'full_discription', currentLang) || inc.full_discription  || '';
    const incDesc     = getField(inc, 'description',      currentLang) || inc.description      || '';

    document.getElementById('inc-modal-body').innerHTML = `
        <div class="inc-modal-hero">
            <div class="inc-modal-id">${inc.incident_id || ''}</div>
            <div class="inc-modal-date">📅 ${formatIncidentDate(inc)}</div>
            <div class="inc-modal-facility">📍 ${inc.facility_name || ''}${fac ? ` — ${[fac.area, fac.governorate].filter(Boolean).join(', ')}` : ''}</div>
            ${incAttack ? `<span class="inc-modal-badge">${incAttack}</span>` : ''}
        </div>

        ${imgSrc ? `<img class="inc-modal-img" src="${imgSrc}" alt="Incident image" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}

        ${incResult && incResult !== 'None' ? `
        <div class="inc-modal-section">
            <div class="inc-modal-section-title">Result</div>
            <p class="result-text">${incResult}</p>
        </div>` : ''}

        ${(incFullDesc && incFullDesc !== 'None') ? `
        <div class="inc-modal-section">
            <div class="inc-modal-section-title">Full Description</div>
            <p>${incFullDesc}</p>
        </div>` : (incDesc && incDesc !== 'None' ? `
        <div class="inc-modal-section">
            <div class="inc-modal-section-title">Description</div>
            <p>${incDesc}</p>
        </div>` : '')}

        ${(incDesc && incDesc !== 'None' && incFullDesc && incFullDesc !== 'None' && incDesc !== incFullDesc) ? `
        <div class="inc-modal-section">
            <div class="inc-modal-section-title">Summary</div>
            <p>${incDesc}</p>
        </div>` : ''}

        ${casItems.length ? `
        <div class="inc-modal-section">
            <div class="inc-modal-section-title">Casualties</div>
            <div class="inc-modal-cas-grid">
                ${casItems.map(([v, lbl, cls]) => `
                <div class="inc-modal-cas-item">
                    <div class="inc-modal-cas-val ${cls}">${parseFloat(v)}</div>
                    <div class="inc-modal-cas-lbl">${lbl}</div>
                </div>`).join('')}
            </div>
        </div>` : ''}

        ${allSources.length ? `
        <div class="inc-modal-section">
            <div class="inc-modal-section-title">Sources</div>
            <div class="inc-modal-sources">
                ${allSources.map(url =>
                    `<a class="inc-modal-src-link" href="${url}" target="_blank" rel="noopener">🔗 ${urlDomain(url)}</a>`
                ).join('')}
            </div>
        </div>` : ''}

        ${(() => {
            const vid  = (inc.video_url && inc.video_url !== 'None' && inc.video_url.trim()) ? inc.video_url.trim() : '';
            const aVid = (inc.archived_video && inc.archived_video !== 'None' && inc.archived_video.trim()) ? inc.archived_video.trim() : '';
            const links = [
                vid  && `<a class="inc-modal-src-link" href="${vid}"  target="_blank" rel="noopener">🎥 Watch Video</a>`,
                aVid && `<a class="inc-modal-src-link" href="${aVid}" target="_blank" rel="noopener">📼 Archived Video</a>`,
            ].filter(Boolean);
            return links.length ? `
        <div class="inc-modal-section">
            <div class="inc-modal-section-title">Video Evidence</div>
            <div class="inc-modal-sources">${links.join('')}</div>
        </div>` : '';
        })()}

        ${inc.archived_resources && inc.archived_resources !== 'None' ? `
        <div class="inc-modal-section">
            <div class="inc-modal-section-title">Archived Resources</div>
            <div class="inc-modal-sources">
                <a class="inc-modal-src-link" href="${inc.archived_resources}" target="_blank" rel="noopener">📦 View Archive</a>
            </div>
        </div>` : ''}

        ${((inc.added_by && inc.added_by !== 'None' && inc.added_by.trim()) ||
           (inc.reviewed_by && inc.reviewed_by !== 'None' && inc.reviewed_by.trim())) ? `
        <div class="inc-modal-section" style="background:#f8fafc;border:1px solid var(--border-color);">
            <div class="inc-modal-section-title">Record Metadata</div>
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:0.85rem;color:var(--text-secondary);">
                ${inc.added_by    && inc.added_by    !== 'None' ? `<span>✏️ Added by: <strong style="color:var(--text-primary)">${inc.added_by}</strong></span>`    : ''}
                ${inc.reviewed_by && inc.reviewed_by !== 'None' ? `<span>✅ Reviewed by: <strong style="color:var(--text-primary)">${inc.reviewed_by}</strong></span>` : ''}
            </div>
        </div>` : ''}
    `;

    document.getElementById('incident-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeIncidentModal() {
    document.getElementById('incident-modal').classList.remove('open');
    document.body.style.overflow = '';
    if (_currentFacilityId) {
        const cfg = window.PAGE_CONFIG;
        const fac = facilitiesData.find(f => f[cfg.facilityIdKey] === _currentFacilityId);
        const slug = encodeURIComponent(fac ? getFacilitySlug(fac) : _currentFacilityId);
        history.pushState({ facility: _currentFacilityId }, '', `#${cfg.urlPrefix}/${slug}`);
    }
}

// ─────────────────────────────────────────────────────────────
//  Hash-based routing
// ─────────────────────────────────────────────────────────────
function routeFromHash() {
    const cfg  = window.PAGE_CONFIG;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;

    // Pattern: <prefix>/<facility-name-slug>/incident/INC-001
    //          (facilityId here may be a slug or, for old links, a raw ID —
    //           openFacilityDetail/openIncidentModal resolve either form)
    const incMatch = hash.match(new RegExp(`^${cfg.urlPrefix}/(.+)/incident/(.+)$`));
    if (incMatch) {
        const facilityId  = decodeURIComponent(incMatch[1]);
        const incidentId  = decodeURIComponent(incMatch[2]);
        if (incidentsData.length) {
            if (!document.getElementById(cfg.detailSectionId).classList.contains('active')) {
                openFacilityDetail(facilityId);
            }
            openIncidentModal(incidentId, facilityId);
        } else {
            window[cfg.pendingIncKey] = { incidentId, facilityId };
        }
        return;
    }

    // Pattern: <prefix>/<facility-name-slug>  (e.g. #hospital/al-shifa-medical-complex)
    if (hash.startsWith(`${cfg.urlPrefix}/`)) {
        const facilityId = decodeURIComponent(hash.slice(cfg.urlPrefix.length + 1));
        if (facilitiesData.length) {
            openFacilityDetail(facilityId);
        } else {
            window[cfg.pendingKey] = facilityId;
        }
        return;
    }

    // Regular tab
    const section = document.getElementById(hash);
    if (section) {
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        section.classList.add('active');
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === hash);
        });
    }
}

// ─────────────────────────────────────────────────────────────
//  Shared event wiring — call once after DOM is ready
// ─────────────────────────────────────────────────────────────
function wireSharedEvents() {
    const cfg = window.PAGE_CONFIG;

    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            history.pushState({}, '', `#${tab}`);
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
        });
    });

    // Language switcher — only for standalone, page-local .lang-btn elements
    // (older pages with their own inline language switcher). The shared
    // header's #language-selector buttons are wired by TranslationSystem
    // itself (changeLanguage), which dispatches 'languageChanged' — handled
    // by syncLangFromHeader() above, instead of duplicating a click handler
    // here that would call setLang() a second time on the same click.
    document.querySelectorAll('.lang-btn').forEach(b => {
        if (b.closest('#language-selector')) return;
        b.addEventListener('click', () => setLang(b.dataset.lang));
    });

    // Back button in detail panel
    document.getElementById(cfg.backBtnId)?.addEventListener('click', () => {
        history.pushState({}, '', `#${cfg.facilitiesTabId}`);
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.getElementById(cfg.facilitiesTabId).classList.add('active');
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === cfg.facilitiesTabId);
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Permalink copy button
    document.getElementById(cfg.copyLinkBtnId)?.addEventListener('click', () => {
        const btn = document.getElementById(cfg.copyLinkBtnId);
        navigator.clipboard.writeText(window.location.href).then(() => {
            btn.textContent = t('detail.copied');
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = t('detail.copyLink'); btn.classList.remove('copied'); }, 2000);
        }).catch(() => prompt('Copy this link:', window.location.href));
    });

    // Modal copy button
    document.getElementById('inc-modal-copy')?.addEventListener('click', () => {
        const btn = document.getElementById('inc-modal-copy');
        navigator.clipboard.writeText(window.location.href).then(() => {
            btn.textContent = t('detail.copied');
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = t('modal.copyLink'); btn.classList.remove('copied'); }, 2000);
        }).catch(() => prompt('Copy this link:', window.location.href));
    });

    // Filter events
    document.getElementById(cfg.facilitySearchId)?.addEventListener('input',  () => cfg.renderFacilities());
    document.getElementById(cfg.statusFilterId)?.addEventListener('change',    () => cfg.renderFacilities());
    document.getElementById(cfg.districtFilterId)?.addEventListener('change',  () => cfg.renderFacilities());
    document.getElementById(cfg.incidentSearchId)?.addEventListener('input',   renderIncidents);
    document.getElementById(cfg.attackFilterId)?.addEventListener('change',    renderIncidents);

    // Escape closes modal
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeIncidentModal(); });

    // Popstate
    window.addEventListener('popstate', routeFromHash);
}

// ─────────────────────────────────────────────────────────────
//  Utility functions
// ─────────────────────────────────────────────────────────────
function urlDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').replace(/\.[a-z]{2,}(\.[a-z]{2})?$/, ''); }
    catch { return url; }
}

function sumField(arr, key) {
    const total = arr.reduce((s, r) => s + (parseFloat(r[key]) || 0), 0);
    return total || null;
}

function parseDateFirst(str) {
    if (!str) return null;
    const raw = String(str).trim();
    const rangePart = raw.split(/\s*-\s*/)[0].trim();
    const dmy = rangePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
    const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
    const num = Number(rangePart);
    if (!isNaN(num) && num > 40000 && num < 60000) return new Date((num - 25569) * 86400000);
    const d = new Date(raw);
    return isNaN(d) ? null : d;
}

function formatDate(str) {
    if (!str || str === 'None') return 'Date unknown';
    if (String(str).includes('/') && String(str).includes('-')) {
        return String(str).split('-').map(p => {
            const d = parseDateFirst(p.trim());
            return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : p;
        }).join(' – ');
    }
    const d = parseDateFirst(String(str));
    return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : String(str);
}

function formatIncidentDate(inc) {
    const start = (inc.starting_date && inc.starting_date !== 'None' && inc.starting_date.trim())
        ? inc.starting_date.trim()
        : (inc.date && inc.date !== 'None' ? inc.date.trim() : '');
    const end = (inc.ending_date && inc.ending_date !== 'None' && inc.ending_date.trim())
        ? inc.ending_date.trim() : '';
    if (!start) return 'Date unknown';
    const startFmt = formatDate(start);
    if (!end || end === start) return startFmt;
    const endFmt = formatDate(end);
    return startFmt === endFmt ? startFmt : `${startFmt} – ${endFmt}`;
}

function statusBadgeClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('operational') && !s.includes('partially')) return 'operational';
    if (s.includes('partially'))  return 'partial';
    if (s.includes('out'))        return 'out-of-service';
    if (s.includes('restricted')) return 'restricted';
    if (s.includes('occupied'))   return 'occupied';
    return '';
}

function incTypeKey(type) {
    if (!type) return 'unidentified';
    const tp = type.toLowerCase();
    if (tp.includes('direct'))                             return 'direct';
    if (tp.includes('airstrike'))                          return 'airstrike';
    if (tp.includes('siege'))                              return 'siege';
    if (tp.includes('invasion') || tp.includes('ground'))  return 'invasion';
    if (tp.includes('access')   || tp.includes('restricted')) return 'access';
    if (tp.includes('indirect') || tp.includes('vicinity'))   return 'indirect';
    return 'unidentified';
}

function incBadgeKey(type) {
    return 'iab-' + incTypeKey(type);
}