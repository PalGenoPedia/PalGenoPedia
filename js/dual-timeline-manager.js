// Dual Timeline Manager for Gaza Crisis Documentation
// Handles both Historical Massacres (1948-2023) and Current Genocide (2023-Present)
// Author: aliattia02
// With multilingual support
//
// ─────────────────────────────────────────────────────────────────────────
// Historical data source (1948-2023):
//   Primary:  events.csv + details.csv, parsed with PapaParse and transformed
//             into the internal data model (see transformCsvEventToInternal).
//   Fallback: timeline-data/historical-massacres.json — used automatically
//             if PapaParse isn't loaded, or if the CSV files fail to load.
//   Detail page: all historical events link to the single
//             Pages/Historical_Massacres/massacres.html page, using
//             #event/<id> hash routing instead of one HTML file per event.
// ─────────────────────────────────────────────────────────────────────────

class DualTimelineManager {
    constructor() {
        this.currentMode = 'historical'; // Default to historical view
        this.historicalData = [];
        this.currentData = [];
        this.combinedData = [];
        this.filteredData = [];
        this.config = null;
        this.sources = null;
        this.map = null;
        this.markers = [];
        this.filters = {
            dateRange: '',
            eventType: '',
            search: '',
            verification: '',
            casualtyScale: 'all'
        };

        // Paths for the CSV-based historical data source and its JSON fallback.
        // Root-absolute so they resolve the same from every page that embeds the
        // timeline (the timeline page under /historical-events/massacres/ and the
        // home page at /). Override via timeline-config.json if the CSVs move.
        this.dataPaths = {
            eventsCSV: '/Pages/Historical_Massacres/events.csv',
            detailsCSV: '/Pages/Historical_Massacres/details.csv',
            historicalJSON: null,  // retired — events.csv is the only source
            // Per-field translation "delta" CSVs — same folder as events.csv/details.csv.
            // Each row only carries the translated columns (e.g. brief_summary_de,
            // heading_label_ar) for the matching id / detail_id. Missing files are
            // tolerated — parseCSVFile() resolves to [] on a load error.
            eventsTranslationsCSV: {
                de: '/Pages/Historical_Massacres/events_de.csv',
                ar: '/Pages/Historical_Massacres/events_ar.csv'
            },
            detailsTranslationsCSV: {
                de: '/Pages/Historical_Massacres/details_de.csv',
                ar: '/Pages/Historical_Massacres/details_ar.csv'
            }
        };

        // Languages with field-level CSV translations (in addition to English,
        // which lives in events.csv/details.csv directly). This is separate
        // from the site-wide data-i18n UI translation system (translations/*.json)
        // — it only affects historical-event *content* (titles, summaries, etc.).
        this.translationLangs = ['de', 'ar'];

        // Current content language for CSV-translated fields. Synced from
        // window.TranslationSystem.currentLanguage at init and on 'languageChanged'.
        this.currentLang = 'en';

        // Historical events each have their own generated record page at
        // `${detailPageBase}<slug>/` where <slug> = slugify(event_name), matching
        // tools/build_history.py. Override via timeline-config.json.
        this.detailPageBase = '/historical-events/massacres/';

        // The timeline page itself — current-genocide incidents have no record
        // page yet, so they resolve here via #event/<id> hash routing.
        this.timelinePage = '/historical-events/massacres/timeline.html';

        // Approximate region centroids for broad, multi-location historical
        // events that don't have a single location_lat/location_lng in
        // events.csv (e.g. "West Bank, Gaza Strip") — used so they still get
        // a marker on the map view, matching the old historical-massacres.json.
        this.regionFallbackCoordinates = {
            hist006: [35.2137, 31.9466], // Six-Day War — West Bank, Gaza Strip, Golan Heights
            hist010: [35.2137, 31.9466], // Second Intifada — West Bank and Gaza Strip
            hist014: [34.4668, 31.5204], // Operation Protective Edge — Gaza Strip
            hist017: [35.2137, 31.9466]  // West Bank Raids 2022-2023 — West Bank
        };

        // event_id → array of details.csv rows, populated while loading historical data
        this.eventDetailsMap = new Map();

        // Event type colors
        this.eventColors = {
            massacre: '#dc3545',
            military_operation: '#fd7e14',
            forced_displacement: '#6f42c1',
            hospital_attack: '#e83e8c',
            protected_site_attack: '#d63384',
            starvation_warfare: '#6c757d',
            protest_suppression: '#0d6efd',
            civil_uprising_suppression: '#0dcaf0',
            refugee_camp_attack: '#e74c3c',
            hospital_siege: '#c0392b',
            mass_graves: '#8b0000',
            aid_workers_killing: '#dc143c',
            urban_destruction: '#a9a9a9',
            military_raids: '#ff6b6b'
        };
    }

    // Initialize the dual timeline system with multilingual support
    async init() {
        console.log('🚀 Initializing Dual Timeline System with multilingual support...');
        console.log('📅 Default Mode: Historical Massacres (1948-2023)');

        try {
            // Show loading state
            this.showLoading('Initializing timeline system...');

            // Load configuration first
            await this.loadConfiguration();

            // Let timeline-config.json override the default events.csv /
            // details.csv / massacres.html / JSON-fallback paths if it
            // specifies them under timeline_modes.historical
            this.applyDataPathsFromConfig();

            // Adopt whatever language the site is already in, so a reader who
            // arrives with de/ar persisted gets translated content on first paint
            this.syncContentLanguage();

            // Load sources metadata
            await this.loadSources();

            // One load — events.csv covers 1948→present, split by date inside
            await this.loadHistoricalData();

            // Combine data
            this.combineData();

            // Initialize UI
            this.initializeUI();

            // Add language change listener
            this.initLanguageChangeListener();

            // Set default mode to HISTORICAL and ensure timeline view is active
            this.switchMode('historical');

            // Make sure timeline view is the active view
            this.switchView('timeline');

            // Hide loading status
            const statusContainer = document.getElementById('timelineStatus');
            if (statusContainer) {
                statusContainer.style.display = 'none';
            }

            console.log('✅ Dual Timeline Manager initialized successfully');
            console.log('📅 Default view: Historical Massacres Timeline (1948-2023)');

        } catch (error) {
            console.error('❌ Error initializing Dual Timeline Manager:', error);
            this.showError('Failed to initialize timeline. Please refresh the page.');
        }
    }

    // Load configuration from JSON
    async loadConfiguration() {
        try {
            console.log('📋 Loading timeline configuration...');
            const response = await fetch('/timeline-data/timeline-config.json');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.config = await response.json();
            console.log('✅ Configuration loaded:', this.config);

        } catch (error) {
            console.error('❌ Error loading configuration:', error);
            // Use default config
            this.config = this.getDefaultConfig();
            console.log('Using default configuration');
        }
    }

    // Allow timeline-config.json to override where the CSV-based historical
    // data lives, without requiring a code change for a different folder
    // layout. Falls back to the defaults set in the constructor if a field
    // is missing — e.g. an older timeline-config.json that predates the CSV
    // migration will simply use the built-in defaults.
    //
    // Recognised fields under timeline_modes.historical:
    //   events_csv        → this.dataPaths.eventsCSV
    //   details_csv       → this.dataPaths.detailsCSV
    //   data_source       → this.dataPaths.historicalJSON (legacy JSON fallback)
    //   detail_page_base  → this.detailPageBase
    applyDataPathsFromConfig() {
        const hist = this.config?.timeline_modes?.historical;
        if (!hist) return;

        if (hist.events_csv) this.dataPaths.eventsCSV = hist.events_csv;
        if (hist.details_csv) this.dataPaths.detailsCSV = hist.details_csv;
        if (hist.data_source) this.dataPaths.historicalJSON = hist.data_source;
        if (hist.detail_page_base) this.detailPageBase = hist.detail_page_base;

        console.log('📂 Historical data paths:', {
            eventsCSV: this.dataPaths.eventsCSV,
            detailsCSV: this.dataPaths.detailsCSV,
            historicalJSON: this.dataPaths.historicalJSON,
            detailPageBase: this.detailPageBase
        });
    }

    // Load sources metadata
    async loadSources() {
        try {
            console.log('📰 Loading sources metadata...');
            const response = await fetch('/timeline-data/timeline-sources.json');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.sources = await response.json();
            console.log('✅ Sources loaded:', this.sources);

        } catch (error) {
            console.error('❌ Error loading sources:', error);
            this.sources = { primary_sources: [] };
        }
    }

    // Load historical massacres data
    // Primary source: events.csv + details.csv (parsed with PapaParse)
    // Fallback: timeline-data/historical-massacres.json (legacy per-event JSON)
    // The single load: events.csv carries every documented event (1948→present).
    // Split into historical / current by date for the mode selector.
    async loadHistoricalData() {
        try {
            console.log('📜 Loading documented events (events.csv)…');
            this.showLoading('Loading documented events (1948–present)…');

            let all = [];
            if (typeof Papa !== 'undefined') {
                all = await this.loadHistoricalFromCSV();
            }
            if (!all.length) {
                console.warn('⚠️ events.csv returned no rows — no data source available');
                await this.loadHistoricalFromJSON();
                all = this.historicalData;
            }

            this.historicalData = all.filter(e => (e.date || '') < DualTimelineManager.CURRENT_FROM);
            this.currentData    = all.filter(e => (e.date || '') >= DualTimelineManager.CURRENT_FROM)
                                     .map(e => ({ ...e, period: 'current' }));
            console.log(`✅ ${all.length} events — ${this.historicalData.length} historical, ${this.currentData.length} current`);
        } catch (error) {
            console.error('❌ Error loading events:', error);
            this.historicalData = [];
            this.currentData = [];
            throw error;
        }
    }

    // events.csv split point — anything on/after this date is "current genocide".
    static get CURRENT_FROM() { return '2023-10-07'; }

    // ── CSV-based historical data loading ──────────────────────────────

    // Load and transform events.csv + details.csv into the internal data model.
    // Returns [] if events.csv can't be loaded/parsed (triggers JSON fallback).
    async loadHistoricalFromCSV() {
        // Build the list of translation CSV paths to load alongside the base files
        const translationLoads = [];
        this.translationLangs.forEach(lang => {
            translationLoads.push({ lang, type: 'events', path: this.dataPaths.eventsTranslationsCSV?.[lang] });
            translationLoads.push({ lang, type: 'details', path: this.dataPaths.detailsTranslationsCSV?.[lang] });
        });

        const [eventRows, detailRows, ...translationRows] = await Promise.all([
            this.parseCSVFile(this.dataPaths.eventsCSV),
            this.parseCSVFile(this.dataPaths.detailsCSV),
            ...translationLoads.map(t => t.path ? this.parseCSVFile(t.path) : Promise.resolve([]))
        ]);

        if (!eventRows.length) return [];

        // Merge each translation delta CSV onto the matching base rows. This
        // mutates eventRows/detailRows in place, adding columns like
        // event_type_de, brief_summary_ar, heading_label_de, content_ar, etc.
        translationLoads.forEach((t, i) => {
            const rows = translationRows[i];
            if (!rows || !rows.length) return;
            if (t.type === 'events') {
                this.mergeTranslationRows(eventRows, rows, 'id');
            } else {
                this.mergeTranslationRows(detailRows, rows, 'detail_id');
            }
        });

        // Group details.csv rows by event_id for fast lookup during transform
        this.eventDetailsMap = new Map();
        detailRows.forEach(row => {
            const eventId = (row.event_id || '').trim();
            if (!eventId) return; // skip blank rows
            if (!this.eventDetailsMap.has(eventId)) this.eventDetailsMap.set(eventId, []);
            this.eventDetailsMap.get(eventId).push(row);
        });

        return eventRows
            .filter(row => row.id && row.id.trim())
            .map(row => this.transformCsvEventToInternal(row, this.eventDetailsMap.get(row.id.trim()) || []))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    // Merge a translation "delta" CSV (e.g. events_de.csv, details_ar.csv) onto
    // its matching base rows by `keyField` (id / detail_id). Only non-empty
    // translated columns are copied — `keyField` and `_anchor` are skipped.
    // Mutates `baseRows` in place.
    mergeTranslationRows(baseRows, translationRows, keyField) {
        const byKey = new Map();
        translationRows.forEach(r => {
            const key = (r[keyField] || '').trim();
            if (key) byKey.set(key, r);
        });
        if (!byKey.size) return;

        baseRows.forEach(base => {
            const key = (base[keyField] || '').trim();
            const translation = byKey.get(key);
            if (!translation) return;

            Object.keys(translation).forEach(col => {
                if (col === keyField || col === '_anchor') return;
                const val = (translation[col] || '').trim();
                if (val) base[col] = val;
            });
        });
    }

    // Parse a CSV file via PapaParse (download mode), stripping BOM/whitespace
    // from header keys. Resolves to [] on any load/parse error.
    parseCSVFile(path) {
        return new Promise(resolve => {
            Papa.parse(path, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: results => resolve(this.stripCsvBOM(results.data || [])),
                error: err => {
                    console.warn(`⚠️ Could not load ${path}:`, err);
                    resolve([]);
                }
            });
        });
    }

    // Strip a leading UTF-8 BOM (and surrounding whitespace) from CSV header keys
    stripCsvBOM(records) {
        return records.map(r => {
            const clean = {};
            Object.keys(r).forEach(k => {
                clean[k.replace(/^\uFEFF/, '').trim()] = r[k];
            });
            return clean;
        });
    }

    // Latin slug — mirrors slugify() in tools/build_history.py / build_records.py
    // so a timeline card links to the exact generated record-page URL.
    slugify(text) {
        return (text || '')
            .normalize('NFKD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    // Transform a single events.csv row (+ its matching details.csv rows) into
    // the internal data model used throughout the timeline manager (the same
    // shape previously read from historical-massacres.json's "massacres" array).
    transformCsvEventToInternal(row, details) {
        const id = (row.id || '').trim();
        const title = (row.event_name || '').trim() || id;

        const startDate = this.normalizeCsvDate(row.date_start);
        const endDate = row.date_end ? this.normalizeCsvDate(row.date_end) : startDate;

        const lat = parseFloat(row.location_lat);
        const lng = parseFloat(row.location_lng);

        // war_crime category rows → kept as raw rows so the modal can render
        // localized heading_label_<lang> at render time (see getLocalizedField)
        const warCrimeRows = details
            .filter(d => d.category === 'war_crime')
            .sort((a, b) => (parseInt(a.order, 10) || 0) - (parseInt(b.order, 10) || 0));

        // Collect every unique, non-empty source citation across all detail rows
        const sourcesSet = new Set();
        details.forEach(d => {
            if (d.source && d.source.trim()) sourcesSet.add(d.source.trim());
        });

        // Per-language overlay of translatable event-level fields, built from
        // the <field>_<lang> columns merged in by mergeTranslationRows() (e.g.
        // events_de.csv → event_type_de, brief_summary_de, location_historical_de...).
        // Empty per-language object = "no translation available for this event".
        const i18n = {};
        this.translationLangs.forEach(lang => {
            const eventTypeLabel = (row[`event_type_${lang}`] || '').trim();
            const dateContext = (row[`date_context_${lang}`] || '').trim();
            const briefSummary = (row[`brief_summary_${lang}`] || '').trim(); // aliases summary_para_1
            const locationHistorical = (row[`location_historical_${lang}`] || '').trim();
            const locationCurrent = (row[`location_current_${lang}`] || '').trim();
            const classification = (row[`classification_${lang}`] || '').trim();

            if (eventTypeLabel || dateContext || briefSummary || locationHistorical || locationCurrent || classification) {
                i18n[lang] = {
                    event_type_label: eventTypeLabel,
                    date_context: dateContext,
                    brief_summary: briefSummary,
                    location_historical: locationHistorical,
                    location_current: locationCurrent,
                    location_name: this.shortenLocation(locationHistorical) || locationCurrent,
                    classification
                };
            }
        });

        return {
            id,
            title,
            date: startDate,
            date_end: endDate,
            date_context: (row.date_context || '').trim(),
            location: {
                name: this.shortenLocation(row.location_historical) || (row.location_current || '').trim() || 'Unknown',
                historical_name: (row.location_historical || '').trim(),
                current_name: (row.location_current || '').trim(),
                coordinates: (!isNaN(lng) && !isNaN(lat)) ? [lng, lat] : (this.regionFallbackCoordinates[id] || null)
            },
            event_type: this.mapCsvEventType(id, row.event_type),
            event_type_raw: (row.event_type || '').trim(),
            classification: (row.classification || '').trim(),
            casualties: {
                deaths: this.parseCasualtyNumber(row.deaths),
                injured: this.parseCasualtyNumber(row.injured),
                forced_displacement: this.parseCasualtyNumber(row.forced_displacement)
            },
            // Original descriptive strings (e.g. "≈107–250") for display in the modal
            casualties_display: {
                deaths: (row.deaths || '').trim(),
                injured: (row.injured || '').trim(),
                forced_displacement: (row.forced_displacement || '').trim()
            },
            perpetrators: this.splitDelimited(row.perpetrators, ';'),
            // Per-language overlay built above. Read via getLocalizedField()
            // at render time so a language switch does not require a reload.
            i18n,
            brief_summary: (row.summary_para_1 || '').trim(),
            summary_paragraphs: [row.summary_para_1, row.summary_para_2, row.summary_para_3]
                .map(p => (p || '').trim())
                .filter(Boolean),
            war_crimes: warCrimeRows
                .map(d => (d.heading_label || '').trim())
                .filter(Boolean),
            // events.csv doesn't carry a verification field of its own; every
            // documented historical event in this archive is treated as verified.
            verification_status: 'verified',
            sources: Array.from(sourcesSet),
            detail_page: `${this.detailPageBase}${this.slugify(title)}/`,
            hero_facts: this.extractHeroFacts(row),
            last_updated: (row.last_updated || '').trim(),
            author: (row.author || '').trim(),
            // Raw details.csv rows for this event — used to enrich the modal
            // with testimonies, legal analysis, timelines, commanders, etc.
            details,
            period: 'historical'
        };
    }

    /**
     * Read a translatable event field in the current content language.
     *
     * Falls back to the English value whenever there is no overlay for the
     * language, no entry for this event, or the translated cell is blank -
     * the same contract as getField() in the War Crimes / Historical
     * Massacres pages.
     *
     * Recognised fields: event_type_label, date_context, brief_summary,
     * location_historical, location_current, location_name, classification.
     */
    getLocalizedField(event, field, fallback = '') {
        if (!event) return fallback;

        const lang = this.currentLang;
        if (lang && lang !== 'en') {
            const translated = event.i18n && event.i18n[lang] && event.i18n[lang][field];
            if (translated && String(translated).trim()) return String(translated).trim();
        }

        // English source-of-truth, by field
        switch (field) {
            case 'brief_summary':      return event.brief_summary || fallback;
            case 'classification':     return event.classification || fallback;
            case 'date_context':       return event.date_context || fallback;
            case 'location_name':      return (event.location && event.location.name) || fallback;
            case 'location_historical':return (event.location && event.location.historical_name) || fallback;
            case 'location_current':   return (event.location && event.location.current_name) || fallback;
            case 'event_type_label':
                return event.event_type
                    ? this.capitalizeWords(event.event_type.replace(/_/g, ' '))
                    : fallback;
            default:
                return event[field] || fallback;
        }
    }

    /**
     * Point the manager's content language at whatever the site-wide
     * translation system currently has selected. Content fields come from the
     * delta CSVs; this is separate from the data-i18n chrome translations.
     */
    syncContentLanguage() {
        const lang = (window.TranslationSystem && window.TranslationSystem.currentLanguage)
            || document.documentElement.lang
            || 'en';
        const supported = lang === 'en' || this.translationLangs.includes(lang);
        this.currentLang = supported ? lang : 'en';
        return this.currentLang;
    }

    // "1948-04-09 00:00:00" → "1948-04-09" (also passes through plain dates unchanged)
    normalizeCsvDate(dateStr) {
        if (!dateStr) return '';
        return String(dateStr).trim().split(' ')[0];
    }

    // Extract the first numeric value from descriptive casualty strings like
    // "≈107–250", "≈1,500", "Dozens (not systematically recorded)" → 107, 1500, 0
    parseCasualtyNumber(str) {
        if (!str || str === '—' || str === 'None') return 0;
        const cleaned = String(str).replace(/[≈≤≥~,\s]/g, '');
        const m = cleaned.match(/(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : 0;
    }

    // Split a delimited string ("Irgun (Etzel); Lehi (Stern Gang)") into a
    // trimmed array, filtering out empty entries.
    splitDelimited(str, delimiter = ';') {
        if (!str) return [];
        return String(str).split(delimiter).map(s => s.trim()).filter(Boolean);
    }

    // "Deir Yassin (Dayr Yasin), Jerusalem, British Mandate of Palestine"
    //   → "Deir Yassin (Dayr Yasin), Jerusalem"  (first two comma-separated parts)
    shortenLocation(str) {
        if (!str) return '';
        return String(str).split(',').slice(0, 2).join(',').trim();
    }

    // Map events.csv's free-text event_type to the internal type slugs used
    // for colours/icons/filters (this.eventColors, getEventIcon, timeline-config
    // event type filter). Known hist001-hist017 ids use an explicit lookup that
    // mirrors the original historical-massacres.json classification; any other
    // event id falls back to a keyword-based guess.
    mapCsvEventType(id, csvType) {
        const knownTypes = {
            hist001: 'massacre',
            hist002: 'massacre',
            hist003: 'forced_displacement',
            hist004: 'massacre',
            hist005: 'massacre',
            hist006: 'military_operation',
            hist007: 'massacre',
            hist008: 'civil_uprising_suppression',
            hist009: 'massacre',
            hist010: 'civil_uprising_suppression',
            hist011: 'military_operation',
            hist012: 'military_operation',
            hist013: 'military_operation',
            hist014: 'military_operation',
            hist015: 'protest_suppression',
            hist016: 'military_operation',
            hist017: 'military_raids'
        };

        if (knownTypes[id]) return knownTypes[id];

        // Fallback keyword classifier for any future events not in the table above
        const t = (csvType || '').toLowerCase();
        if (t.includes('hospital')) return 'hospital_attack';
        if (t.includes('starvation') || t.includes('hunger')) return 'starvation_warfare';
        if (t.includes('displacement') || t.includes('expulsion') || t.includes('death march')) return 'forced_displacement';
        if (t.includes('protest')) return 'protest_suppression';
        if (t.includes('uprising') || t.includes('intifada')) return 'civil_uprising_suppression';
        if (t.includes('raid')) return 'military_raids';
        if (t.includes('operation') || t.includes('military')) return 'military_operation';
        return 'massacre';
    }

    // The modal's "Key Facts" — computed from the row's own fields (the sheet
    // no longer carries hero_1..4 columns). Mirrors hero_pairs() in
    // tools/build_history.py: Date / Location / Deaths / (Displaced or Injured).
    extractHeroFacts(row) {
        const facts = [];
        const push = (label, value) => {
            value = (value || '').trim();
            if (value && value !== '0') facts.push({ label, value });
        };
        const start = (row.date_start || '').trim().slice(0, 10);
        const end = (row.date_end || '').trim().slice(0, 10);
        const dateStr = (end && end !== start && /^\d{4}-\d{2}-\d{2}$/.test(end))
            ? `${start} – ${end}` : start;
        push(this.getTranslation('detail.fact.date', 'Date'), dateStr);
        const loc = (row.location_historical || '')
            .replace(/\s*\([^)]*\)/g, '')
            .split(',').map(s => s.trim()).filter(Boolean).slice(0, 2).join(', ');
        push(this.getTranslation('detail.fact.location', 'Location'), loc);
        push(this.getTranslation('detail.fact.deaths', 'Deaths'), row.deaths);
        if ((row.forced_displacement || '').trim())
            push(this.getTranslation('detail.fact.displaced', 'Displaced'), row.forced_displacement);
        else
            push(this.getTranslation('detail.fact.injured', 'Injured'), row.injured);
        return facts;
    }

    // events.csv is the only source now. If PapaParse fails to load, there is
    // nothing to fall back to — degrade to an empty timeline rather than the
    // stale, drifted historical-massacres.json that used to live here.
    async loadHistoricalFromJSON() {
        console.error('❌ PapaParse unavailable and events.csv could not be parsed — no data to show.');
        this.historicalData = [];
    }

    // Current-genocide events now come from events.csv too (split out by date in
    // loadHistoricalData). Kept as a no-op so nothing that calls it breaks.
    async loadCurrentData() { /* handled in loadHistoricalData() */ }

    // Combine historical and current data
    combineData() {
        this.combinedData = [
            ...this.historicalData.map(item => ({ ...item, period: 'historical' })),
            ...this.currentData.map(item => ({ ...item, period: 'current' }))
        ].sort((a, b) => new Date(a.date) - new Date(b.date));

        console.log(`📊 Combined ${this.combinedData.length} total events`);
    }

    // Listen for language change events
    initLanguageChangeListener() {
        document.addEventListener('languageChanged', (e) => {
            console.log('🌐 Language changed in timeline to:', e.detail.language, 'with direction:', e.detail.direction);

            // Point content lookups at the new language before anything
            // re-renders. Without this the delta-CSV columns loaded from
            // events_<lang>.csv / details_<lang>.csv are never selected and
            // every event stays in English.
            this.syncContentLanguage();

            // Update stats with new language
            this.updateStatistics();

            // Update comparison if visible
            if (this.currentMode === 'both') {
                this.updateComparison();
            }

            // Refresh current view
            const activeView = document.querySelector('.view-section.active');
            if (activeView) {
                const viewId = activeView.id;
                if (viewId === 'timelineView') {
                    this.renderTimeline();
                } else if (viewId === 'mapView') {
                    this.renderMap();
                } else if (viewId === 'listView') {
                    this.renderListView();
                }
            }
        });
    }

    // Get translated text
    getTranslation(key, defaultText) {
        if (window.TranslationSystem && typeof window.TranslationSystem.getTranslation === 'function') {
            const translation = window.TranslationSystem.getTranslation(key);
            return translation || defaultText;
        }
        return defaultText;
    }

    // Initialize UI components
    initializeUI() {
        console.log('🎨 Initializing UI components...');

        // Mode selector buttons
        const modeButtons = document.querySelectorAll('.mode-btn');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.switchMode(mode);
            });
        });

        // Filter controls
        document.getElementById('dateRangeFilter')?.addEventListener('change', (e) => {
            this.filters.dateRange = e.target.value;
            this.applyFilters();
        });

        document.getElementById('eventTypeFilter')?.addEventListener('change', (e) => {
            this.filters.eventType = e.target.value;
            this.applyFilters();
        });

        document.getElementById('searchFilter')?.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            this.debounce(() => this.applyFilters(), 300)();
        });

        document.getElementById('verificationFilter')?.addEventListener('change', (e) => {
            this.filters.verification = e.target.value;
            this.applyFilters();
        });

        // Casualty scale chips
        const scaleChips = document.querySelectorAll('.scale-chip');
        scaleChips.forEach(chip => {
            chip.addEventListener('click', () => {
                scaleChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.filters.casualtyScale = chip.dataset.scale;
                this.applyFilters();
            });
        });

        // Clear filters button
        document.getElementById('clearAllFilters')?.addEventListener('click', () => {
            this.clearAllFilters();
        });

        // View switcher — supports both the legacy .view-btn (old inline header)
        // and .sub-nav-btn (injected by header-component.js sub-header).
        const viewButtons = document.querySelectorAll('.view-btn, .sub-nav-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                if (view) this.switchView(view);
            });
        });

        // Sort select
        document.getElementById('sortSelect')?.addEventListener('change', (e) => {
            this.sortData(e.target.value);
            this.renderListView();
        });

        // Modal close
        const modalClose = document.querySelector('.modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', () => this.closeModal());
        }

        const modal = document.getElementById('incidentModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal();
            });
        }

        // Theme toggle
        const themeToggle = document.querySelector('.theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Initialize theme
        this.initializeTheme();

        console.log('✅ UI components initialized');
    }

    // Switch between timeline modes
    switchMode(mode) {
        console.log(`🔄 Switching to mode: ${mode}`);

        this.currentMode = mode;

        // Update active button
        const modeButtons = document.querySelectorAll('.mode-btn');
        modeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Get data based on mode
        let data;
        let modeDescription;

        switch (mode) {
            case 'historical':
                data = this.historicalData;
                modeDescription = 'Historical Massacres (1948-2023)';
                break;
            case 'current':
                data = this.currentData;
                modeDescription = 'Current Genocide (Oct 2023-Present)';
                break;
            case 'both':
                data = this.combinedData;
                modeDescription = 'Complete Timeline (1948-Present)';
                // Show comparison section
                const comparisonEl = document.getElementById('periodComparison');
                if (comparisonEl) {
                    comparisonEl.style.display = 'block';
                    this.updateComparison();
                }
                break;
            default:
                data = this.historicalData;
                modeDescription = 'Historical Massacres (1948-2023)';
        }

        console.log(`📊 Loaded ${data.length} events for: ${modeDescription}`);

        // Hide comparison if not in 'both' mode
        if (mode !== 'both') {
            const comparisonEl = document.getElementById('periodComparison');
            if (comparisonEl) {
                comparisonEl.style.display = 'none';
            }
        }

        this.filteredData = [...data];

        // Update statistics
        this.updateStatistics();

        // Apply any existing filters
        this.applyFilters();

        // Render current view
        const activeView = document.querySelector('.view-section.active');
        if (activeView) {
            const viewId = activeView.id;
            if (viewId === 'timelineView') {
                this.renderTimeline();
            } else if (viewId === 'mapView') {
                this.renderMap();
            } else if (viewId === 'listView') {
                this.renderListView();
            }
        }
    }

    // Apply filters to data
    applyFilters() {
        console.log('🔍 Applying filters:', this.filters);

        let data;
        switch (this.currentMode) {
            case 'historical':
                data = [...this.historicalData];
                break;
            case 'current':
                data = [...this.currentData];
                break;
            case 'both':
                data = [...this.combinedData];
                break;
            default:
                data = [...this.historicalData];
        }

        // Apply date range filter
        if (this.filters.dateRange) {
            data = this.filterByDateRange(data, this.filters.dateRange);
        }

        // Apply event type filter
        if (this.filters.eventType) {
            data = data.filter(item => item.event_type === this.filters.eventType);
        }

        // Apply search filter
        if (this.filters.search) {
            const searchTerm = this.filters.search.toLowerCase();
            data = data.filter(item =>
                item.title?.toLowerCase().includes(searchTerm) ||
                this.getLocalizedField(item, 'location_name').toLowerCase().includes(searchTerm) ||
                this.getLocalizedField(item, 'brief_summary').toLowerCase().includes(searchTerm)
            );
        }

        // Apply verification filter
        if (this.filters.verification) {
            data = data.filter(item => item.verification_status === this.filters.verification);
        }

        // Apply casualty scale filter
        if (this.filters.casualtyScale !== 'all') {
            data = this.filterByCasualtyScale(data, this.filters.casualtyScale);
        }

        this.filteredData = data;

        // Update statistics
        this.updateStatistics();

        // Re-render current view
        const activeView = document.querySelector('.view-section.active');
        if (activeView) {
            const viewId = activeView.id;
            if (viewId === 'timelineView') {
                this.renderTimeline();
            } else if (viewId === 'mapView') {
                this.renderMap();
            } else if (viewId === 'listView') {
                this.renderListView();
            }
        }

        console.log(`✅ Filtered to ${this.filteredData.length} events`);
    }

    // Filter by date range preset
    filterByDateRange(data, range) {
        const ranges = {
            nakba: { start: '1948-01-01', end: '1948-12-31' },
            first_intifada: { start: '1987-12-09', end: '1993-09-13' },
            second_intifada: { start: '2000-09-28', end: '2005-02-08' },
            gaza_operations: { start: '2008-12-27', end: '2021-05-21' },
            current_genocide: { start: '2023-10-07', end: null }
        };

        const preset = ranges[range];
        if (!preset) return data;

        return data.filter(item => {
            const itemDate = new Date(item.date);
            const startDate = new Date(preset.start);
            const endDate = preset.end ? new Date(preset.end) : new Date();

            return itemDate >= startDate && itemDate <= endDate;
        });
    }

    // Filter by casualty scale
    filterByCasualtyScale(data, scale) {
        const ranges = {
            low: { min: 1, max: 50 },
            medium: { min: 51, max: 500 },
            high: { min: 501, max: 2000 },
            massive: { min: 2001, max: Infinity }
        };

        const range = ranges[scale];
        if (!range) return data;

        return data.filter(item => {
            const deaths = item.casualties?.deaths || 0;
            return deaths >= range.min && deaths <= range.max;
        });
    }

    // Clear all filters
    clearAllFilters() {
        console.log('🔄 Clearing all filters');

        this.filters = {
            dateRange: '',
            eventType: '',
            search: '',
            verification: '',
            casualtyScale: 'all'
        };

        // Reset UI elements
        const dateRangeFilter = document.getElementById('dateRangeFilter');
        const eventTypeFilter = document.getElementById('eventTypeFilter');
        const searchFilter = document.getElementById('searchFilter');
        const verificationFilter = document.getElementById('verificationFilter');

        if (dateRangeFilter) dateRangeFilter.value = '';
        if (eventTypeFilter) eventTypeFilter.value = '';
        if (searchFilter) searchFilter.value = '';
        if (verificationFilter) verificationFilter.value = '';

        // Reset scale chips
        const scaleChips = document.querySelectorAll('.scale-chip');
        scaleChips.forEach(chip => {
            chip.classList.toggle('active', chip.dataset.scale === 'all');
        });

        // Reapply filters (which are now empty)
        this.applyFilters();
    }

    // Update statistics dashboard
    updateStatistics() {
        const data = this.filteredData;

        // Calculate totals
        const totalEvents = data.length;
        const totalDeaths = data.reduce((sum, item) => sum + (item.casualties?.deaths || 0), 0);
        const totalInjured = data.reduce((sum, item) => sum + (item.casualties?.injured || 0), 0);
        const totalDisplaced = data.reduce((sum, item) => sum + (item.casualties?.forced_displacement || 0), 0);

        // Update header stats
        const totalEventsEl = document.getElementById('totalEvents');
        const totalDeathsEl = document.getElementById('totalDeaths');
        const lastUpdateEl = document.getElementById('lastUpdate');

        if (totalEventsEl) totalEventsEl.textContent = totalEvents.toLocaleString();
        if (totalDeathsEl) totalDeathsEl.textContent = this.formatNumber(totalDeaths);

        // Update dashboard stats
        const massacresCountEl = document.getElementById('massacresCount');
        const deathsCountEl = document.getElementById('deathsCount');
        const injuredCountEl = document.getElementById('injuredCount');
        const displacedCountEl = document.getElementById('displacedCount');

        if (massacresCountEl) massacresCountEl.textContent = totalEvents.toLocaleString();
        if (deathsCountEl) deathsCountEl.textContent = this.formatNumber(totalDeaths);
        if (injuredCountEl) injuredCountEl.textContent = this.formatNumber(totalInjured);
        if (displacedCountEl) displacedCountEl.textContent = this.formatNumber(totalDisplaced);

        // Update mode counts
        const historicalCountEl = document.getElementById('historicalCount');
        const historicalDeathsEl = document.getElementById('historicalDeaths');
        const currentCountEl = document.getElementById('currentCount');
        const currentDeathsEl = document.getElementById('currentDeaths');
        const bothCountEl = document.getElementById('bothCount');
        const bothDeathsEl = document.getElementById('bothDeaths');

        if (historicalCountEl) historicalCountEl.textContent = this.historicalData.length;
        if (historicalDeathsEl) {
            historicalDeathsEl.textContent = this.formatNumber(
                this.historicalData.reduce((sum, item) => sum + (item.casualties?.deaths || 0), 0)
            );
        }

        if (currentCountEl) currentCountEl.textContent = this.currentData.length;
        if (currentDeathsEl) {
            currentDeathsEl.textContent = this.formatNumber(
                this.currentData.reduce((sum, item) => sum + (item.casualties?.deaths || 0), 0)
            );
        }

        if (bothCountEl) bothCountEl.textContent = this.combinedData.length;
        if (bothDeathsEl) {
            bothDeathsEl.textContent = this.formatNumber(
                this.combinedData.reduce((sum, item) => sum + (item.casualties?.deaths || 0), 0)
            );
        }
    }

    // Update period comparison
    updateComparison() {
        const histDeaths = this.historicalData.reduce((sum, item) => sum + (item.casualties?.deaths || 0), 0);
        const currDeaths = this.currentData.reduce((sum, item) => sum + (item.casualties?.deaths || 0), 0);

        const histYears = 75; // 1948 to 2023
        const histAvgPerYear = Math.round(histDeaths / histYears);

        // Calculate current genocide duration
        const genocideStart = new Date('2023-10-07');
        const now = new Date('2025-10-05');
        const daysDiff = Math.floor((now - genocideStart) / (1000 * 60 * 60 * 24));
        const monthsDiff = Math.floor(daysDiff / 30);
        const currAvgPerDay = Math.round(currDeaths / daysDiff);

        const compHistEventsEl = document.getElementById('compHistEvents');
        const compHistDeathsEl = document.getElementById('compHistDeaths');
        const compHistAvgEl = document.getElementById('compHistAvg');
        const genocideDurationEl = document.getElementById('genocideDuration');
        const compCurrEventsEl = document.getElementById('compCurrEvents');
        const compCurrDeathsEl = document.getElementById('compCurrDeaths');
        const compCurrAvgEl = document.getElementById('compCurrAvg');

        if (compHistEventsEl) compHistEventsEl.textContent = this.historicalData.length;
        if (compHistDeathsEl) compHistDeathsEl.textContent = this.formatNumber(histDeaths);
        if (compHistAvgEl) compHistAvgEl.textContent = histAvgPerYear.toLocaleString();

        if (genocideDurationEl) genocideDurationEl.textContent = `${monthsDiff} months`;
        if (compCurrEventsEl) compCurrEventsEl.textContent = this.currentData.length;
        if (compCurrDeathsEl) compCurrDeathsEl.textContent = this.formatNumber(currDeaths);
        if (compCurrAvgEl) compCurrAvgEl.textContent = currAvgPerDay.toLocaleString();
    }

    // Render timeline view - UPDATED TO HORIZONTAL CARDS
    renderTimeline() {
        console.log('📅 Rendering timeline view...');

        const container = document.getElementById('timeline-embed');
        if (!container) return;

        const data = this.filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));

        if (data.length === 0) {
            container.innerHTML = this.getEmptyStateHTML();
            return;
        }

        const scrollHintText = this.getTranslation('timeline.scrollHint', 'Scroll horizontally to view');

        container.innerHTML = `
            <div class="horizontal-timeline">
                <div class="timeline-header">
                    <h2>${this.getTimelineTitle()}</h2>
                    <p>${scrollHintText} ${data.length} ${this.getTranslation('timeline.documentedEvents', 'documented events')}</p>
                </div>
                <div class="timeline-scroll-container">
                    <div class="timeline-cards-wrapper">
                        ${data.map((item, index) => this.createTimelineItemHTML(item, index)).join('')}
                    </div>
                </div>
                <div class="scroll-hint">← ${this.getTranslation('timeline.scrollMore', 'Scroll to see more')} →</div>
            </div>
        `;

        this.addHorizontalTimelineStyles();
        this.attachTimelineEventListeners();
    }

    // Get timeline title based on mode
    getTimelineTitle() {
        switch (this.currentMode) {
            case 'historical':
                return this.getTranslation('timeline.titles.historical', 'Historical Massacres & War Crimes (1948-2023)');
            case 'current':
                return this.getTranslation('timeline.titles.current', 'Current Genocide Documentation (Oct 2023-Present)');
            case 'both':
                return this.getTranslation('timeline.titles.complete', 'Complete Historical Timeline (1948-Present)');
            default:
                return this.getTranslation('timeline.titles.default', 'Gaza Crisis Timeline');
        }
    }

    // Create timeline item HTML - UPDATED TO HORIZONTAL CARD
    createTimelineItemHTML(item, index) {
        const casualties = item.casualties || {};
        const deaths = casualties.deaths || 0;
        const injured = casualties.injured || 0;

        const color = this.eventColors[item.event_type] || '#6c757d';
        const periodBadge = item.period === 'current' ?
            '<span class="period-badge current">🚨</span>' :
            '<span class="period-badge historical">📜</span>';

        const viewDetailsText = this.getTranslation('common.buttons.viewDetails', 'View');

        return `
            <div class="timeline-card" data-event-id="${item.id}" data-index="${index}">
                <div class="card-header" style="background: linear-gradient(135deg, ${color}, ${this.adjustColor(color, -20)});">
                    <div class="card-date">${this.formatDateShort(item.date)}</div>
                    ${periodBadge}
                </div>
                <div class="card-body">
                    <h4 class="card-title">${this.escapeHtml(this.truncate(item.title, 60))}</h4>
                    <div class="card-location">📍 ${this.escapeHtml(this.getLocalizedField(item, 'location_name', 'Unknown'))}</div>
                    <p class="card-description">${this.escapeHtml(this.truncate(this.getLocalizedField(item, 'brief_summary'), 100))}</p>
                    <div class="card-casualties">
                        ${deaths > 0 ? `<span class="casualty-pill">💀 ${this.formatNumber(deaths)}</span>` : ''}
                        ${injured > 0 ? `<span class="casualty-pill injured">🏥 ${this.formatNumber(injured)}</span>` : ''}
                    </div>
                </div>
                <div class="card-footer">
                    <span class="verification-mini ${item.verification_status}">
                        ${this.getVerificationIcon(item.verification_status)}
                    </span>
                    <button class="view-details-mini" data-event-id="${item.id}">${viewDetailsText} →</button>
                </div>
            </div>
        `;
    }

    // Attach event listeners to timeline items - UPDATED FOR HORIZONTAL CARDS
    attachTimelineEventListeners() {
        const timelineCards = document.querySelectorAll('.timeline-card');

        timelineCards.forEach(card => {
            // Click handler for entire card
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('view-details-mini')) {
                    const eventId = card.dataset.eventId;
                    this.showEventModal(eventId);
                }
            });
        });

        // Click handlers for detail buttons
        const detailButtons = document.querySelectorAll('.view-details-mini');
        detailButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventId = btn.dataset.eventId;
                this.showEventModal(eventId);
            });
        });

        // Add keyboard navigation for horizontal scrolling
        const scrollContainer = document.querySelector('.timeline-scroll-container');
        if (scrollContainer) {
            scrollContainer.setAttribute('tabindex', '0');

            scrollContainer.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') {
                    scrollContainer.scrollBy({ left: -300, behavior: 'smooth' });
                } else if (e.key === 'ArrowRight') {
                    scrollContainer.scrollBy({ left: 300, behavior: 'smooth' });
                }
            });

            // Make scrollable with mouse wheel
            scrollContainer.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    scrollContainer.scrollBy({ left: e.deltaY, behavior: 'smooth' });
                }
            });
        }
    }

    // Show event modal
    showEventModal(eventId) {
        const event = this.filteredData.find(e => e.id === eventId);
        if (!event) {
            console.error('Event not found:', eventId);
            return;
        }
        console.log('📖 Opening modal for:', event.title);

        const modal = document.getElementById('incidentModal');

        // Populate modal content
        const modalTitle = document.getElementById('modalTitle');
        const modalDate = document.getElementById('modalDate');
        const modalLocation = document.getElementById('modalLocation');
        const modalType = document.getElementById('modalType');
        const modalSummary = document.getElementById('modalSummary');

        if (modalTitle) modalTitle.textContent = event.title;
        if (modalDate) modalDate.textContent = this.formatDate(event.date);
        if (modalLocation) modalLocation.textContent = this.getLocalizedField(event, 'location_name', 'Unknown');
        if (modalType) modalType.textContent = this.capitalizeWords(event.event_type?.replace(/_/g, ' ') || 'Unknown');
        if (modalSummary) modalSummary.textContent = this.getLocalizedField(event, 'brief_summary');

        // Verification status
        const verificationEl = document.getElementById('modalVerification');
        if (verificationEl) {
            verificationEl.className = `verification-badge ${event.verification_status}`;
            verificationEl.textContent = `${this.getVerificationIcon(event.verification_status)} ${this.capitalizeWords(event.verification_status)}`;
        }

        // Casualties
        const casualties = event.casualties || {};
        const deathsLabel = this.getTranslation('casualties.deaths', 'Deaths');
        const injuredLabel = this.getTranslation('casualties.injured', 'Injured');
        const displacedLabel = this.getTranslation('casualties.displaced', 'Displaced');
        const criticalLabel = this.getTranslation('casualties.critical', 'Critical');

        const casualtiesHTML = `
            <div class="casualties-grid">
                ${casualties.deaths ? `<div class="casualty-stat"><strong>💀 ${deathsLabel}:</strong> ${casualties.deaths.toLocaleString()}</div>` : ''}
                ${casualties.injured ? `<div class="casualty-stat"><strong>🏥 ${injuredLabel}:</strong> ${casualties.injured.toLocaleString()}</div>` : ''}
                ${casualties.forced_displacement ? `<div class="casualty-stat"><strong>🏠 ${displacedLabel}:</strong> ${this.formatNumber(casualties.forced_displacement)}</div>` : ''}
                ${casualties.critical ? `<div class="casualty-stat"><strong>⚠️ ${criticalLabel}:</strong> ${casualties.critical.toLocaleString()}</div>` : ''}
            </div>
        `;
        const modalCasualties = document.getElementById('modalCasualties');
        if (modalCasualties) modalCasualties.innerHTML = casualtiesHTML;

        // War crimes
        const modalWarCrimesSection = document.getElementById('modalWarCrimesSection');
        if (event.war_crimes && event.war_crimes.length > 0) {
            if (modalWarCrimesSection) modalWarCrimesSection.style.display = 'block';
            const warCrimesHTML = `
                <ul class="war-crimes-list">
                    ${event.war_crimes.map(crime => `<li>⚖️ ${this.escapeHtml(crime)}</li>`).join('')}
                </ul>
            `;
            const modalWarCrimes = document.getElementById('modalWarCrimes');
            if (modalWarCrimes) modalWarCrimes.innerHTML = warCrimesHTML;
        } else {
            if (modalWarCrimesSection) modalWarCrimesSection.style.display = 'none';
        }

        // Sources
        const noSourcesText = this.getTranslation('modal.noSources', 'No sources available');
        const sourcesHTML = event.sources && event.sources.length > 0 ?
            event.sources.map(source => `
                <div class="source-item">
                    📰 ${this.escapeHtml(source)}
                </div>
            `).join('') :
            `<p>${noSourcesText}</p>`;
        const modalSources = document.getElementById('modalSources');
        if (modalSources) modalSources.innerHTML = sourcesHTML;

        // Detail page link
        const detailPageLink = document.getElementById('modalDetailPage');
        if (detailPageLink) {
            if (event.detail_page) {
                detailPageLink.href = event.detail_page;
                detailPageLink.style.display = 'inline-block';
            } else {
                detailPageLink.style.display = 'none';
            }
        }

        // Enrich modal with richer details.csv data (testimonies, legal,
        // timeline, commanders, etc.) — only present for CSV-sourced events
        this.renderModalEnrichment(event);

        // Show modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // ── Modal enrichment from details.csv ───────────────────────────────
    // Dynamically injects extra sections into the modal (between "Verified
    // Sources" and the "View Full Documentation" button) using the raw
    // details.csv rows attached to the event during transformCsvEventToInternal.
    // Safe no-op for events without a `details` array (e.g. current-genocide
    // data, or historical data loaded via the JSON fallback).
    renderModalEnrichment(event) {
        const container = document.querySelector('#incidentModal .incident-details');
        if (!container) return;

        // Clear any enrichment sections injected for a previously-viewed event
        container.querySelectorAll('.dtm-enrichment').forEach(el => el.remove());

        if (!event.details || !event.details.length) return;

        // Insert new sections right before the "Verified Sources" section so
        // the "View Full Documentation" action button stays last.
        const sourcesSection = document.getElementById('modalSources')?.closest('.detail-section');
        const anchor = sourcesSection || container.lastElementChild;
        if (!anchor) return;

        const testimonyLabel = this.getTranslation('detail.section.testimonies', '💬 Witness Testimonies');
        const legalLabel = this.getTranslation('detail.section.legalFramework', '⚖️ Legal Framework');
        const timelineLabel = this.getTranslation('detail.section.eventTimeline', '📅 Event Timeline');
        const commandersLabel = this.getTranslation('detail.section.commanders', '👤 Commanders & Accountability');
        const personalitiesLabel = this.getTranslation('detail.section.personalities', '👤 Key Personalities');
        const impactLabel = this.getTranslation('detail.section.historicalImpact', '🌍 Historical Impact');
        const casualtyLabel = this.getTranslation('detail.section.casualties', '💀 Casualties Documentation');
        const factsLabel = this.getTranslation('detail.section.keyFacts', '📊 Key Facts');
        const moreLabel = this.getTranslation('detail.section.moreSummary', '📄 Further Details');

        const sections = [
            event.hero_facts && event.hero_facts.length ? this.buildHeroFactsSection(factsLabel, event.hero_facts) : null,
            event.summary_paragraphs && event.summary_paragraphs.length > 1
                ? this.buildExtraSummarySection(moreLabel, event.summary_paragraphs) : null,
            this.buildDetailCategorySection(event, 'casualty', casualtyLabel, d => `
                <div class="dtm-detail-row">
                    <strong>${this.escapeHtml(d.heading_label || '')}</strong>${d.value ? `: ${this.escapeHtml(d.value)}` : ''}
                    ${d.content ? `<div class="dtm-detail-content">${this.escapeHtml(d.content)}</div>` : ''}
                    ${this.buildSourceLink(d)}
                </div>
            `),
            this.buildDetailCategorySection(event, 'legal', legalLabel, d => `
                <div class="dtm-detail-row">
                    <strong>${this.escapeHtml(d.heading_label || '')}</strong>
                    ${d.content ? `<div class="dtm-detail-content">${this.escapeHtml(d.content)}</div>` : ''}
                </div>
            `),
            this.buildTimelineSection(event, timelineLabel),
            this.buildDetailCategorySection(event, 'testimony', testimonyLabel, d => `
                <div class="dtm-testimony">
                    <div class="dtm-testimony-author">${this.escapeHtml(d.heading_label || 'Witness')}</div>
                    <div class="dtm-testimony-content">"${this.escapeHtml(d.content || '')}"</div>
                    ${this.buildSourceLink(d)}
                </div>
            `),
            this.buildDetailCategorySection(event, 'commander', commandersLabel, d => `
                <div class="dtm-detail-row">
                    <strong>${this.escapeHtml(d.heading_label || '')}</strong>
                    ${d.content ? `<div class="dtm-detail-content">${this.escapeHtml(d.content)}</div>` : ''}
                    ${this.buildSourceLink(d)}
                </div>
            `),
            this.buildDetailCategorySection(event, 'personality', personalitiesLabel, d => `
                <div class="dtm-detail-row">
                    <strong>${this.escapeHtml(d.heading_label || '')}</strong>${d.value ? ` — ${this.escapeHtml(d.value)}` : ''}
                    ${d.content ? `<div class="dtm-detail-content">${this.escapeHtml(d.content)}</div>` : ''}
                    ${this.buildSourceLink(d)}
                </div>
            `),
            this.buildDetailCategorySection(event, 'historical_impact', impactLabel, d => `
                <div class="dtm-detail-row">
                    <strong>${this.escapeHtml(d.heading_label || '')}</strong>
                    ${d.content ? `<div class="dtm-detail-content">${this.escapeHtml(d.content)}</div>` : ''}
                </div>
            `)
        ];

        sections.filter(Boolean).forEach(sectionEl => {
            anchor.parentNode.insertBefore(sectionEl, anchor);
        });

        this.addModalEnrichmentStyles();
    }

    // Generic builder: renders all details.csv rows for `category` (ordered by
    // the `order` column) into a new `.detail-section`. Returns null if there
    // are no matching rows so the caller can skip empty sections.
    buildDetailCategorySection(event, category, titleText, rowRenderer) {
        const rows = (event.details || [])
            .filter(d => d.category === category)
            .sort((a, b) => (parseInt(a.order, 10) || 0) - (parseInt(b.order, 10) || 0));

        if (!rows.length) return null;

        const section = document.createElement('div');
        section.className = 'detail-section dtm-enrichment';
        section.innerHTML = `
            <h4>${titleText}</h4>
            <div class="dtm-detail-list">
                ${rows.map(rowRenderer.bind(this)).join('')}
            </div>
        `;
        return section;
    }

    // Event timeline (category=timeline) — uses the `time` column as a label
    // for each step.
    buildTimelineSection(event, titleText) {
        const rows = (event.details || [])
            .filter(d => d.category === 'timeline')
            .sort((a, b) => (parseInt(a.order, 10) || 0) - (parseInt(b.order, 10) || 0));

        if (!rows.length) return null;

        const section = document.createElement('div');
        section.className = 'detail-section dtm-enrichment';
        section.innerHTML = `
            <h4>${titleText}</h4>
            <div class="dtm-timeline-list">
                ${rows.map(d => `
                    <div class="dtm-timeline-row">
                        <div class="dtm-timeline-time">${this.escapeHtml(d.time || '')}</div>
                        <div class="dtm-timeline-body">
                            <strong>${this.escapeHtml(d.heading_label || '')}</strong>
                            ${d.content ? `<div class="dtm-detail-content">${this.escapeHtml(d.content)}</div>` : ''}
                            ${this.buildSourceLink(d)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        return section;
    }

    // "Key Facts" hero strip, built from events.csv hero_1..4 label/value pairs
    buildHeroFactsSection(titleText, facts) {
        const section = document.createElement('div');
        section.className = 'detail-section dtm-enrichment';
        section.innerHTML = `
            <h4>${titleText}</h4>
            <div class="dtm-hero-facts">
                ${facts.map(f => `
                    <div class="dtm-hero-fact">
                        <div class="dtm-hero-value">${this.escapeHtml(f.value)}</div>
                        <div class="dtm-hero-label">${this.escapeHtml(f.label)}</div>
                    </div>
                `).join('')}
            </div>
        `;
        return section;
    }

    // Renders summary_para_2 / summary_para_3 (anything beyond the primary
    // brief_summary, which is already shown in the "Summary" section).
    buildExtraSummarySection(titleText, paragraphs) {
        const extra = paragraphs.slice(1);
        if (!extra.length) return null;

        const section = document.createElement('div');
        section.className = 'detail-section dtm-enrichment';
        section.innerHTML = `
            <h4>${titleText}</h4>
            ${extra.map(p => `<p>${this.escapeHtml(p)}</p>`).join('')}
        `;
        return section;
    }

    // Renders a small "📰 Source (link)" line for a details.csv row, if present
    buildSourceLink(d) {
        if (!d.source) return '';
        const label = this.escapeHtml(d.source);
        if (d.source_link) {
            return `<div class="dtm-source-link">📰 <a href="${this.escapeHtml(d.source_link)}" target="_blank" rel="noopener noreferrer">${label}</a></div>`;
        }
        return `<div class="dtm-source-link">📰 ${label}</div>`;
    }

    // Inject CSS for the enrichment sections once
    addModalEnrichmentStyles() {
        if (document.getElementById('dtm-enrichment-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'dtm-enrichment-styles';
        styles.textContent = `
            .dtm-enrichment h4 {
                margin-bottom: 10px;
            }

            .dtm-detail-list, .dtm-timeline-list {
                display: flex;
                flex-direction: column;
                gap: 14px;
            }

            .dtm-detail-row {
                padding: 10px 12px;
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                font-size: 13px;
                line-height: 1.5;
            }

            .dtm-detail-row strong {
                color: var(--text-primary);
            }

            .dtm-detail-content {
                margin-top: 6px;
                color: var(--text-secondary);
            }

            .dtm-source-link {
                margin-top: 6px;
                font-size: 12px;
                color: var(--text-secondary);
            }

            .dtm-source-link a {
                color: var(--accent-color);
                text-decoration: none;
            }

            .dtm-source-link a:hover {
                text-decoration: underline;
            }

            .dtm-testimony {
                padding: 10px 12px;
                background: var(--bg-secondary);
                border-left: 3px solid var(--accent-color);
                border-radius: 8px;
                font-size: 13px;
                line-height: 1.5;
            }

            .dtm-testimony-author {
                font-weight: 700;
                color: var(--text-primary);
                margin-bottom: 4px;
            }

            .dtm-testimony-content {
                color: var(--text-secondary);
                font-style: italic;
            }

            .dtm-timeline-row {
                display: flex;
                gap: 14px;
                padding-bottom: 12px;
                border-bottom: 1px solid var(--border-light);
            }

            .dtm-timeline-row:last-child {
                border-bottom: none;
                padding-bottom: 0;
            }

            .dtm-timeline-time {
                flex: 0 0 130px;
                font-size: 12px;
                font-weight: 600;
                color: var(--accent-color);
                text-transform: uppercase;
                letter-spacing: 0.4px;
            }

            .dtm-timeline-body {
                flex: 1;
                font-size: 13px;
                line-height: 1.5;
            }

            .dtm-hero-facts {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 12px;
            }

            .dtm-hero-fact {
                padding: 12px;
                text-align: center;
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 8px;
            }

            .dtm-hero-value {
                font-size: 16px;
                font-weight: 700;
                color: var(--accent-color);
                word-break: break-word;
            }

            .dtm-hero-label {
                margin-top: 4px;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--text-secondary);
            }

            @media (max-width: 600px) {
                .dtm-timeline-row {
                    flex-direction: column;
                    gap: 4px;
                }

                .dtm-timeline-time {
                    flex: none;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    // Close modal
    closeModal() {
        const modal = document.getElementById('incidentModal');
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    // Render map view
    renderMap() {
        console.log('🗺️ Rendering map view...');

        if (!this.map) {
            this.initializeMap();
        }

        // Clear existing markers
        this.markers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.markers = [];

        // Add markers for filtered data
        const markerCluster = L.markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 50
        });

        this.filteredData.forEach(event => {
            if (!event.location?.coordinates || event.location.coordinates.length < 2) {
                return;
            }

            const color = this.eventColors[event.event_type] || '#6c757d';
            const deaths = event.casualties?.deaths || 0;

            const icon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div class="marker-icon" style="background-color: ${color}; width: ${this.getMarkerSize(deaths)}px; height: ${this.getMarkerSize(deaths)}px;">
                        ${this.getEventIcon(event.event_type)}
                       </div>`,
                iconSize: [this.getMarkerSize(deaths), this.getMarkerSize(deaths)],
                iconAnchor: [this.getMarkerSize(deaths) / 2, this.getMarkerSize(deaths) / 2]
            });

            const marker = L.marker(
                [event.location.coordinates[1], event.location.coordinates[0]],
                { icon }
            );

            const dateLabel = this.getTranslation('modal.date', 'Date');
            const locationLabel = this.getTranslation('modal.location', 'Location');
            const deathsLabel = this.getTranslation('casualties.deaths', 'Deaths');
            const viewDetailsText = this.getTranslation('common.buttons.viewDetails', 'View Details');

            const popupContent = `
                <div class="map-popup">
                    <h3>${this.escapeHtml(event.title)}</h3>
                    <p><strong>📅 ${dateLabel}:</strong> ${this.formatDate(event.date)}</p>
                    <p><strong>📍 ${locationLabel}:</strong> ${this.escapeHtml(this.getLocalizedField(event, 'location_name', 'Unknown'))}</p>
                    <p><strong>💀 ${deathsLabel}:</strong> ${(event.casualties?.deaths || 0).toLocaleString()}</p>
                    <p class="popup-summary">${this.escapeHtml(this.truncate(this.getLocalizedField(event, 'brief_summary'), 100))}</p>
                    <button onclick="window.dualTimeline.showEventModal('${event.id}')" class="popup-details-btn">
                        ${viewDetailsText}
                    </button>
                </div>
            `;

            marker.bindPopup(popupContent, { maxWidth: 300 });
            markerCluster.addLayer(marker);
            this.markers.push(marker);
        });

        this.map.addLayer(markerCluster);

        // Fit bounds if we have markers
        if (this.markers.length > 0) {
            const group = new L.featureGroup(this.markers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        }
    }

    // Initialize map
    initializeMap() {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        console.log('🗺️ Initializing map...');

        this.map = L.map('map').setView([31.5204, 34.4668], 9);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(this.map);

        console.log('✅ Map initialized');
    }

    // Get marker size based on casualty count
    getMarkerSize(deaths) {
        if (deaths < 50) return 25;
        if (deaths < 500) return 35;
        if (deaths < 2000) return 50;
        return 65;
    }

    // Render list view
    renderListView() {
        console.log('📋 Rendering list view...');

        const container = document.getElementById('incidentGrid');
        const loading = document.getElementById('loading');
        const noResults = document.getElementById('noResults');

        if (!container) return;

        if (loading) loading.style.display = 'none';

        if (this.filteredData.length === 0) {
            container.innerHTML = '';
            if (noResults) noResults.style.display = 'block';
            return;
        }

        if (noResults) noResults.style.display = 'none';

        container.innerHTML = this.filteredData.map(event => this.createEventCardHTML(event)).join('');

        // Attach click handlers
        const cards = container.querySelectorAll('.incident-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const eventId = card.dataset.eventId;
                this.showEventModal(eventId);
            });
        });
    }

    // Create event card HTML
    createEventCardHTML(event) {
        const casualties = event.casualties || {};
        const deaths = casualties.deaths || 0;
        const injured = casualties.injured || 0;
        const displaced = casualties.forced_displacement || 0;

        const color = this.eventColors[event.event_type] || '#6c757d';

        const deathsLabel = this.getTranslation('casualties.deaths', 'deaths');
        const injuredLabel = this.getTranslation('casualties.injured', 'injured');
        const displacedLabel = this.getTranslation('casualties.displaced', 'displaced');
        const sourcesLabel = this.getTranslation('modal.sources', 'sources');

        return `
            <div class="incident-card" data-event-id="${event.id}">
                <div class="incident-header">
                    <div>
                        <div class="incident-title">${this.escapeHtml(event.title)}</div>
                        <div class="incident-meta">
                            📅 ${this.formatDate(event.date)}
                        </div>
                        <div class="incident-meta">
                            📍 ${this.escapeHtml(this.getLocalizedField(event, 'location_name', 'Unknown'))}
                        </div>
                    </div>
                    <span class="incident-type" style="background-color: ${color}">
                        ${this.escapeHtml(this.getLocalizedField(event, 'event_type_label', 'Unknown'))}
                    </span>
                </div>
                <div class="incident-description">
                    ${this.escapeHtml(this.truncate(this.getLocalizedField(event, 'brief_summary'), 150))}
                </div>
                <div class="incident-casualties">
                    ${deaths > 0 ? `<div>💀 ${deaths.toLocaleString()} ${deathsLabel}</div>` : ''}
                    ${injured > 0 ? `<div>🏥 ${injured.toLocaleString()} ${injuredLabel}</div>` : ''}
                    ${displaced > 0 ? `<div>🏠 ${this.formatNumber(displaced)} ${displacedLabel}</div>` : ''}
                </div>
                <div class="incident-footer">
                    <span class="verification-badge ${event.verification_status}">
                        ${this.getVerificationIcon(event.verification_status)} ${this.capitalizeWords(event.verification_status)}
                    </span>
                    ${event.sources && event.sources.length > 0 ? `
                        <span class="sources-count">📰 ${event.sources.length} ${sourcesLabel}</span>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Sort data
    sortData(sortBy) {
        switch (sortBy) {
            case 'date-desc':
                this.filteredData.sort((a, b) => new Date(b.date) - new Date(a.date));
                break;
            case 'date-asc':
                this.filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
                break;
            case 'deaths-desc':
                this.filteredData.sort((a, b) => (b.casualties?.deaths || 0) - (a.casualties?.deaths || 0));
                break;
            case 'type':
                this.filteredData.sort((a, b) => (a.event_type || '').localeCompare(b.event_type || ''));
                break;
            case 'location':
                this.filteredData.sort((a, b) => (a.location?.name || '').localeCompare(b.location?.name || ''));
                break;
        }
    }

    // Switch view
    switchView(view) {
        console.log(`🔄 Switching to view: ${view}`);

        // Update active button — covers both legacy .view-btn and .sub-nav-btn
        const viewButtons = document.querySelectorAll('.view-btn, .sub-nav-btn');
        viewButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Update active section
        const viewSections = document.querySelectorAll('.view-section');
        viewSections.forEach(section => {
            section.classList.toggle('active', section.id === `${view}View`);
        });

        // Render the view
        switch (view) {
            case 'timeline':
                this.renderTimeline();
                break;
            case 'map':
                this.renderMap();
                if (this.map) {
                    setTimeout(() => this.map.invalidateSize(), 100);
                }
                break;
            case 'list':
                this.renderListView();
                break;
        }
    }

    // Add horizontal timeline styles - WITH LARGER SCROLLBAR
    addHorizontalTimelineStyles() {
        if (document.getElementById('horizontal-timeline-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'horizontal-timeline-styles';
        styles.textContent = `
            .horizontal-timeline {
                max-width: 100%;
                margin: 0 auto;
                padding: 20px 0;
            }

            .timeline-header {
                text-align: center;
                margin-bottom: 30px;
            }

            .timeline-header h2 {
                color: var(--text-primary);
                margin-bottom: 10px;
                font-size: 28px;
                font-weight: 700;
            }

            .timeline-header p {
                color: var(--text-secondary);
                font-size: 14px;
            }

            .timeline-scroll-container {
                position: relative;
                width: 100%;
                overflow-x: auto;
                overflow-y: hidden;
                padding: 20px 0 30px 0;
                margin-bottom: 10px;
                
                /* Custom scrollbar - LARGER SIZE */
                scrollbar-width: auto;
                scrollbar-color: var(--accent-color) var(--bg-secondary);
            }

            .timeline-scroll-container::-webkit-scrollbar {
                height: 20px; /* INCREASED SIZE */
            }

            .timeline-scroll-container::-webkit-scrollbar-track {
                background: var(--bg-secondary);
                border-radius: 12px;
                border: 2px solid var(--border-color);
                margin: 0 20px;
                box-shadow: inset 0 0 4px rgba(0,0,0,0.05);
            }

            .timeline-scroll-container::-webkit-scrollbar-thumb {
                background: linear-gradient(135deg, var(--accent-color), var(--accent-color-dark, #c0392b));
                border-radius: 12px;
                border: 3px solid var(--bg-secondary);
                min-width: 60px;
                box-shadow: 0 2px 6px rgba(220, 53, 69, 0.2);
                transition: all 0.2s ease;
            }

            .timeline-scroll-container::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(135deg, var(--accent-color-dark, #c0392b), #a02516);
                box-shadow: 0 3px 10px rgba(220, 53, 69, 0.4);
                cursor: grab;
            }

            .timeline-scroll-container::-webkit-scrollbar-thumb:active {
                cursor: grabbing;
                background: linear-gradient(135deg, #a02516, #8b1f14);
                box-shadow: 0 1px 4px rgba(220, 53, 69, 0.3);
            }

            .timeline-cards-wrapper {
                display: flex;
                gap: 20px;
                padding: 10px 20px;
                min-width: min-content;
            }

            .timeline-card {
                flex: 0 0 280px;
                width: 280px;
                background: var(--surface-color);
                border: 2px solid var(--border-color);
                border-radius: 12px;
                overflow: hidden;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: var(--shadow-sm);
                display: flex;
                flex-direction: column;
            }

            .timeline-card:hover {
                transform: translateY(-5px);
                box-shadow: var(--shadow-lg);
                border-color: var(--accent-color);
            }

            .card-header {
                padding: 12px 15px;
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-weight: 600;
            }

            .card-date {
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .period-badge {
                font-size: 14px;
                padding: 2px 6px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 8px;
            }

            .card-body {
                padding: 15px;
                flex: 1;
                display: flex;
                flex-direction: column;
            }

            .card-title {
                color: var(--text-primary);
                font-size: 16px;
                font-weight: 700;
                margin: 0 0 8px 0;
                line-height: 1.3;
                min-height: 40px;
            }

            .card-location {
                color: var(--text-secondary);
                font-size: 11px;
                margin-bottom: 10px;
            }

            .card-description {
                color: var(--text-primary);
                font-size: 13px;
                line-height: 1.5;
                margin-bottom: 12px;
                flex: 1;
            }

            .card-casualties {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                margin-top: auto;
            }

            .casualty-pill {
                background: rgba(220, 53, 69, 0.1);
                color: #dc3545;
                border: 1px solid #dc3545;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                white-space: nowrap;
            }

            .casualty-pill.injured {
                background: rgba(255, 193, 7, 0.1);
                color: #ffc107;
                border-color: #ffc107;
            }

            .card-footer {
                padding: 10px 15px;
                border-top: 1px solid var(--border-light);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: var(--bg-secondary);
            }

            .verification-mini {
                font-size: 16px;
            }

            .view-details-mini {
                background: var(--secondary-color);
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .view-details-mini:hover {
                background: var(--accent-color);
                transform: scale(1.05);
            }

            .scroll-hint {
                text-align: center;
                color: var(--text-secondary);
                font-size: 12px;
                font-style: italic;
                margin-top: 10px;
                animation: pulse 2s infinite;
            }

            @keyframes pulse {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }

            /* Responsive adjustments */
            @media (max-width: 768px) {
                .timeline-card {
                    flex: 0 0 260px;
                    width: 260px;
                }

                .timeline-cards-wrapper {
                    padding: 10px;
                    gap: 15px;
                }

                .card-title {
                    font-size: 14px;
                    min-height: 35px;
                }

                .card-description {
                    font-size: 12px;
                }

                /* Slightly smaller scrollbar on mobile */
                .timeline-scroll-container::-webkit-scrollbar {
                    height: 16px;
                }
            }

            /* Empty state styling */
            .timeline-empty-state {
                text-align: center;
                padding: 60px 20px;
                color: var(--text-secondary);
            }

            .empty-icon {
                font-size: 64px;
                margin-bottom: 20px;
                opacity: 0.5;
            }

            .timeline-empty-state h3 {
                color: var(--text-primary);
                margin-bottom: 10px;
            }

            .clear-all-btn {
                background: var(--secondary-color);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
                margin-top: 20px;
                transition: all 0.2s ease;
            }

            .clear-all-btn:hover {
                background: var(--accent-color);
                transform: translateY(-2px);
            }
        `;
        document.head.appendChild(styles);
    }

    // Format date with translation system support
    formatDate(dateString) {
        const date = new Date(dateString);
        if (isNaN(date)) return 'Unknown date';

        // Use TranslationSystem's date formatter if available
        if (window.TranslationSystem && typeof window.TranslationSystem.formatDate === 'function') {
            return window.TranslationSystem.formatDate(dateString);
        }

        // Fallback to default formatting
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Format date in short format with translation support
    formatDateShort(dateString) {
        const date = new Date(dateString);
        if (isNaN(date)) return 'Unknown';

        // Use TranslationSystem's date formatter if available
        if (window.TranslationSystem && typeof window.TranslationSystem.formatDateShort === 'function') {
            return window.TranslationSystem.formatDateShort(dateString);
        }

        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const day = date.getDate();
        const year = date.getFullYear();

        return `${month} ${day}, ${year}`;
    }

    // Adjust color brightness
    adjustColor(color, amount) {
        const num = parseInt(color.replace('#', ''), 16);
        const r = Math.max(0, Math.min(255, (num >> 16) + amount));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
        const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }

    // Format number with translation system support
    formatNumber(num) {
        // Use TranslationSystem's number formatter if available
        if (window.TranslationSystem && typeof window.TranslationSystem.formatNumber === 'function') {
            return window.TranslationSystem.formatNumber(num);
        }

        // Fallback to default formatting
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncate(text, length) {
        if (!text || text.length <= length) return text;
        return text.substring(0, length) + '...';
    }

    capitalizeWords(str) {
        if (!str) return '';
        return str.split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }

    getEventIcon(eventType) {
        const icons = {
            massacre: '⚠️',
            military_operation: '🎯',
            forced_displacement: '🏠',
            hospital_attack: '🏥',
            protected_site_attack: '🏛️',
            starvation_warfare: '🍽️',
            protest_suppression: '✊',
            civil_uprising_suppression: '🛡️',
            refugee_camp_attack: '⛺',
            hospital_siege: '🚑',
            mass_graves: '⚰️',
            aid_workers_killing: '🚨',
            urban_destruction: '💥',
            military_raids: '🔫'
        };
        return icons[eventType] || '📍';
    }

    getVerificationIcon(status) {
        const icons = {
            verified: '✅',
            disputed: '⚠️',
            under_investigation: '🔍'
        };
        return icons[status] || '❓';
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Show loading message with translation
    showLoading(message) {
        const statusEl = document.getElementById('timelineStatusContent');
        const statusContainer = document.getElementById('timelineStatus');

        // Try to get translated message
        const translatedMessage = this.getTranslation('timeline.loading.status', `📊 ${message}`);

        if (statusEl && statusContainer) {
            statusEl.textContent = translatedMessage;
            statusContainer.style.display = 'block';
        }
    }

    // Show error with translation
    showError(message) {
        console.error(message);

        // Try to get translated error text
        const reloadText = this.getTranslation('common.buttons.reload', '🔄 Retry');
        const errorLoadingText = this.getTranslation('timeline.loading.error', 'Error Loading Timeline');

        const container = document.getElementById('timeline-embed');
        if (container) {
            container.innerHTML = `
                <div class="timeline-error">
                    <div class="error-icon">⚠️</div>
                    <h3>${errorLoadingText}</h3>
                    <p>${message}</p>
                    <button onclick="location.reload()" class="retry-btn">${reloadText}</button>
                </div>
            `;
        }
    }

    // Get empty state HTML with translation support
    getEmptyStateHTML() {
        const noEventsText = this.getTranslation('timeline.list.noResults', 'No Events Found');
        const noMatchText = this.getTranslation('timeline.list.adjustFilters', 'No events match your current filters.');
        const clearAllText = this.getTranslation('timeline.list.clearAllFilters', 'Clear All Filters');

        return `
            <div class="timeline-empty-state">
                <div class="empty-icon">📅</div>
                <h3>${noEventsText}</h3>
                <p>${noMatchText}</p>
                <button onclick="window.dualTimeline.clearAllFilters()" class="clear-all-btn">
                    🔄 ${clearAllText}
                </button>
            </div>
        `;
    }

    // Initialize theme
    initializeTheme() {
        const savedTheme = localStorage.getItem('gaza-docs-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }

    // Toggle theme
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('gaza-docs-theme', newTheme);
        this.updateThemeIcon(newTheme);

        // Refresh map if active
        if (this.map) {
            setTimeout(() => this.map.invalidateSize(), 100);
        }
    }

    // Update theme icon
    updateThemeIcon(theme) {
        const themeToggle = document.querySelector('.theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }

    // Get default configuration
    getDefaultConfig() {
        return {
            default_view: "historical",
            display_settings: {
                items_per_page: 20,
                animation_enabled: true
            },
            filters: {
                date_range: { enabled: true },
                event_types: { enabled: true },
                casualty_scale: { enabled: true },
                verification_status: { enabled: true }
            },
            timeline_modes: {
                historical: {
                    label: "Historical Massacres (1948-2023)",
                    data_source: "/timeline-data/historical-massacres.json",
                    events_csv: "/Pages/Historical_Massacres/events.csv",
                    details_csv: "/Pages/Historical_Massacres/details.csv",
                    detail_page_base: "/historical-events/massacres/",
                    color_theme: "#6c757d",
                    icon: "📜"
                }
            }
        };
    }
}

// Prevent timeline.js from interfering
if (window.initializeTimeline) {
    console.warn('⚠️ Overriding timeline.js functions with dual-timeline-manager');
    window.initializeTimeline = function() {
        console.log('📋 timeline.js disabled - using dual-timeline-manager instead');
    };
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Dual Timeline System...');
    console.log('📅 Default Mode: Historical Massacres (1948-2023)');

    window.dualTimeline = new DualTimelineManager();
    window.dualTimeline.init();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DualTimelineManager;
}