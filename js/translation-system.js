/**
 * Gaza Crisis Documentation - Translation System
 * Handles multilingual functionality across the website
 * Author: aliattia02
 * Last Updated: 2025-10-12 17:44:52
 * Version: 1.4.0 - Fixed paths for nested pages and added ready event
 */

// Global translation system
const TranslationSystem = {
    // Current language (default to browser preference or English)
    currentLanguage: 'en',

    // Track initialization status
    isInitialized: false,

    // Configuration options
    config: {
        customTranslationPath: null,
        debug: false,
        skipAutoLoad: false
    },

    // Available languages
    languages: {
        'en': {
            name: 'English',
            nativeName: 'English',
            dir: 'ltr',
            dateFormat: 'MM/DD/YYYY'
        },
        'ar': {
            name: 'Arabic',
            nativeName: 'العربية',
            dir: 'rtl',
            dateFormat: 'DD/MM/YYYY'
        },
        'de': {
            name: 'German',
            nativeName: 'Deutsch',
            dir: 'ltr',
            dateFormat: 'DD.MM.YYYY'
        }
    },

    // Loaded translations
    translations: {},

    // URL prefixes of sections build_records.py/build_history.py generate
    // with real per-language pages (/de/, /ar/ - see PIPELINE.md's URL
    // structure). Everything else this system translates is a single
    // hand-authored page whose text it repaints in place; these are the only
    // links where "which language" means "which URL".
    generatedSectionPrefixes: [
        '/war-crimes/hospitals/', '/war-crimes/schools/',
        '/war-crimes/universities/', '/war-crimes/religious-sites/',
        '/historical-events/massacres/'
    ],

    // Initialize the translation system
    init: async function(config) {
        // Prevent multiple initializations
        if (this.isInitialized) {
            console.log('🌐 Translation system already initialized, updating config only');
            if (config) {
                this.config = {...this.config, ...config};
            }
            return;
        }

        console.log('🌐 Initializing translation system...');

        // Apply configuration if provided
        if (config) {
            this.config = {...this.config, ...config};
        }

        // Apply global configuration if available
        if (window.translationConfig) {
            this.config = {...this.config, ...window.translationConfig};
        }

        if (this.config.debug) {
            console.log('🔧 Translation config:', this.config);
        }

        // A generated record/event page (build_records.py's site_header())
        // has no JS-free way to carry its language into a hand-authored hub
        // it links to - those pages have no /de/ or /ar/ URL of their own -
        // so it passes ?lang= on the link instead. Take that over the stored
        // preference (a reader clicked through in that language just now) and
        // persist it, so it also sticks on later navigation with no param.
        const urlLang = new URLSearchParams(window.location.search).get('lang');
        this.currentLanguage = (urlLang && this.languages[urlLang] ? urlLang : null) ||
                          localStorage.getItem('gaza-docs-lang') ||
                          this.detectBrowserLanguage() ||
                          'en';
        if (urlLang && this.languages[urlLang]) {
            localStorage.setItem('gaza-docs-lang', urlLang);
        }

        // Ensure we have a supported language
        if (!this.languages[this.currentLanguage]) {
            console.log(`Language ${this.currentLanguage} not supported, falling back to English`);
            this.currentLanguage = 'en';
        }

        // Skip auto-loading if configured
        if (this.config.skipAutoLoad) {
            console.log('⏭️ Skipping auto-loading of translations as configured');

            // Still initialize the UI
            this.initLanguageSelector();
            this.isInitialized = true;
            return;
        }

        // Load translations for current language
        await this.loadTranslations(this.currentLanguage);

        // Apply initial translations
        this.updatePageLanguage();

        // Initialize language selector in UI
        this.initLanguageSelector();

        // Mark as initialized
        this.isInitialized = true;

        // Notify any page-level listeners that translations are now available.
        // This is needed because dynamic JS-generated content (stat cards, banners,
        // status text) calls t() at render time and may have run before this async
        // init() completed — those callers need a signal to re-render with real strings.
        document.dispatchEvent(new CustomEvent('translationsLoaded', {
            detail: { language: this.currentLanguage }
        }));

        console.log(`🌐 Translation system initialized with language: ${this.currentLanguage}`);
    },

    // Detect browser language
    detectBrowserLanguage: function() {
        const browserLang = navigator.language || navigator.userLanguage;
        if (browserLang) {
            // Get the primary language code (e.g. "en-US" -> "en")
            const primaryLang = browserLang.split('-')[0];

            // Check if we support this language
            if (this.languages[primaryLang]) {
                return primaryLang;
            }
        }
        return null;
    },

    // Get path to root directory based on current page location
    getPathToRoot: function() {
        // Count the number of directory levels and build path to root
        const path = window.location.pathname;
        const parts = path.split('/').filter(p => p.length > 0);

        // Remove the HTML file from the count
        const dirDepth = path.endsWith('.html') ? parts.length - 1 : parts.length;

        if (dirDepth <= 0) return './';

        // Create path with proper number of "../" segments
        return Array(dirDepth).fill('..').join('/') + '/';
    },

    // Load translations for a language
    loadTranslations: async function(lang) {
        try {
            console.log(`🌐 Loading translations for: ${lang}`);

            // Add cache busting
            const timestamp = new Date().getTime();

            // Determine the path to translation file
            let translationPath;
            let commonTranslationsLoaded = false;

            // Check if we have a custom translation path
            if (this.config.customTranslationPath) {
                if (typeof this.config.customTranslationPath === 'function') {
                    translationPath = this.config.customTranslationPath(lang);
                } else {
                    translationPath = this.config.customTranslationPath.replace('{lang}', lang);
                }

                console.log(`🔍 Using custom translation path: ${translationPath}`);
            } else {
                // Default path structure
                const baseFilename = window.location.pathname.split('/').pop().replace('.html', '');

                // First try page-specific translation file
                let specificPath = `${baseFilename}.translations.json?v=${timestamp}`;

                // Check if the specific translation file exists
                try {
                    console.log(`🔍 Looking for page-specific translations at: ${specificPath}`);
                    const specificResponse = await fetch(specificPath);
                    if (specificResponse.ok) {
                        const data = await specificResponse.json();
                        // Check if the data has the language we need
                        if (data && data[lang]) {
                            console.log(`✅ Found page-specific translations at ${specificPath}`);
                            this.translations = data;

                            // IMPORTANT: Now try to load common translations and merge them
                            await this.loadAndMergeCommonTranslations(lang);
                            return true;
                        } else {
                            console.log(`⚠️ Page-specific translations don't contain ${lang}, trying generic file`);
                        }
                    } else {
                        console.log(`⚠️ No page-specific translations found at ${specificPath}`);
                    }
                } catch (specificError) {
                    console.log(`⚠️ Couldn't load page-specific translations: ${specificError.message}`);
                }

                // Calculate path to root directory
                const rootPath = this.getPathToRoot();
                console.log(`🔍 Calculated path to root: ${rootPath}`);

                // Fall back to generic translation file at the ROOT level
                translationPath = `${rootPath}translations/${lang}.json?v=${timestamp}`;
            }

            // Now try to load the determined path
            console.log(`🔍 Attempting to load translations from: ${translationPath}`);
            const response = await fetch(translationPath);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Handle different formats - could be direct or nested under language code
            if (data[lang]) {
                // Format: { "en": {...}, "ar": {...} }
                this.translations = data;
            } else {
                // Format: direct content
                this.translations = { [lang]: data };
            }

            console.log(`✅ Loaded translations for ${lang}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to load translations for ${lang}:`, error);

            // If this isn't English, try loading English as fallback
            if (lang !== 'en') {
                console.log('⚠️ Falling back to English translations');
                return this.loadTranslations('en');
            }

            return false;
        }
    },

    // Load common translations and merge with existing
    loadAndMergeCommonTranslations: async function(lang) {
        try {
            // Calculate path to root directory
            const rootPath = this.getPathToRoot();
            const timestamp = new Date().getTime();

            // Try to load common translations from root
            const commonPath = `${rootPath}translations/${lang}.json?v=${timestamp}`;
            console.log(`🔍 Attempting to load common translations from: ${commonPath}`);

            const response = await fetch(commonPath);
            if (!response.ok) {
                console.log(`⚠️ Common translations not found at ${commonPath}`);
                return false;
            }

            const commonData = await response.json();
            console.log(`✅ Loaded common translations for ${lang}`);

            // Merge with existing translations
            if (commonData[lang]) {
                // If common translations use the language key structure
                if (!this.translations[lang].common) {
                    this.translations[lang].common = commonData[lang].common || {};
                } else {
                    // Deep merge the common translations
                    this.deepMerge(this.translations[lang].common, commonData[lang].common || {});
                }
            } else {
                // If common translations use direct structure
                if (!this.translations[lang].common) {
                    this.translations[lang].common = commonData.common || {};
                } else {
                    // Deep merge the common translations
                    this.deepMerge(this.translations[lang].common, commonData.common || {});
                }
            }

            return true;
        } catch (error) {
            console.warn(`⚠️ Could not load common translations: ${error.message}`);
            return false;
        }
    },

    // Helper method for deep merging objects
    deepMerge: function(target, source) {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
                    this.deepMerge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
        return target;
    },

    // Change the current language
    changeLanguage: async function(lang) {
        // Validate language
        if (!this.languages[lang]) {
            console.error(`❌ Unsupported language: ${lang}`);
            return false;
        }

        // If same language, no need to change
        if (this.currentLanguage === lang) {
            return true;
        }

        console.log(`🌐 Changing language to: ${lang}`);

        let success = true;

        // Skip loading translations if we already have them for this language
        // or if we're configured to skip auto-load
        if (!this.config.skipAutoLoad && (!this.translations || !this.translations[lang])) {
            success = await this.loadTranslations(lang);
        }

        if (success || this.config.skipAutoLoad) {
            // Update current language
            this.currentLanguage = lang;

            // Save preference
            localStorage.setItem('gaza-docs-lang', lang);

            // Update the page
            this.updatePageLanguage();

            // Update language selector UI
            this.updateLanguageSelectorUI();

            // Dispatch event for other components
            document.dispatchEvent(new CustomEvent('languageChanged', {
                detail: {
                    language: this.currentLanguage,
                    direction: this.languages[this.currentLanguage].dir
                }
            }));

            return true;
        }

        return false;
    },

    // Initialize the language selector in the UI
    initLanguageSelector: function() {
        const langSelector = document.getElementById('language-selector');

        if (!langSelector) {
            console.warn('⚠️ Language selector not found in the DOM');
            return;
        }

        // Clear existing content
        langSelector.innerHTML = '';

        // Add each language button
        Object.keys(this.languages).forEach(langCode => {
            const lang = this.languages[langCode];
            const button = document.createElement('button');
            button.className = `lang-btn ${langCode === this.currentLanguage ? 'active' : ''}`;
            button.setAttribute('data-lang', langCode);
            button.innerHTML = `
                <span class="lang-code">${langCode.toUpperCase()}</span>
                <span class="lang-name">${lang.nativeName}</span>
            `;

            button.addEventListener('click', () => {
                this.changeLanguage(langCode);
            });

            langSelector.appendChild(button);
        });

        console.log('✅ Language selector initialized');
    },

    // Update language selector to reflect current language
    updateLanguageSelectorUI: function() {
        const langSelector = document.getElementById('language-selector');

        if (!langSelector) return;

        // Update active class
        const buttons = langSelector.querySelectorAll('.lang-btn');
        buttons.forEach(button => {
            const langCode = button.getAttribute('data-lang');
            if (langCode === this.currentLanguage) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    },

    // Apply translations to the page
    updatePageLanguage: function() {
        if (this.config.debug) {
            console.log(`🌐 Updating page to language: ${this.currentLanguage}`);
        }

        // Don't proceed if skipAutoLoad is enabled
        if (this.config.skipAutoLoad) {
            console.log('⏭️ Skipping page language update as configured');
            return;
        }

        // Update HTML dir and lang attributes
        document.documentElement.lang = this.currentLanguage;
        document.documentElement.dir = this.languages[this.currentLanguage].dir;

        // Add/remove RTL class based on direction
        if (this.languages[this.currentLanguage].dir === 'rtl') {
            document.body.classList.add('rtl');
        } else {
            document.body.classList.remove('rtl');
        }

        // Apply translations to all elements with data-i18n attribute
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            this.translateElement(element, key);
        });

        // Apply translations to all elements with data-i18n-placeholder attribute
        const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
        placeholders.forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = this.getTranslation(key);
            if (translation) {
                element.placeholder = translation;
            }
        });

        // Apply translations to all elements with data-i18n-title attribute
        const titles = document.querySelectorAll('[data-i18n-title]');
        titles.forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = this.getTranslation(key);
            if (translation) {
                element.title = translation;
            }
        });

        // Update page title if we have a translation
        const pageTitleKey = document.body.getAttribute('data-i18n-page-title');
        if (pageTitleKey) {
            const pageTitle = this.getTranslation(pageTitleKey);
            if (pageTitle) {
                document.title = pageTitle;
            }
        }

        // Update meta description if we have a translation
        const metaDescKey = document.body.getAttribute('data-i18n-meta-desc');
        if (metaDescKey) {
            const metaDesc = this.getTranslation(metaDescKey);
            if (metaDesc) {
                const metaDescElement = document.querySelector('meta[name="description"]');
                if (metaDescElement) {
                    metaDescElement.content = metaDesc;
                }
            }
        }

        // Repoint any static link into a generated section (e.g. the
        // war-crimes/historical-events hubs' "Hospitals" / "Massacres" cards)
        // at that section's real page in the current language - the pages
        // this points at don't read localStorage or load this script, so
        // without this a reader who switched language on the hub lands back
        // in English the moment they follow one.
        this.localizeGeneratedLinks();

        if (this.config.debug) {
            console.log(`✅ Page updated to ${this.currentLanguage}`);
        }
    },

    // See generatedSectionPrefixes above. The English href is captured once
    // per element (data-base-href) so switching en -> ar -> en round-trips
    // back to the original URL instead of accumulating language segments.
    localizeGeneratedLinks: function() {
        const lang = this.currentLanguage;
        document.querySelectorAll('a[href]').forEach(a => {
            let base = a.getAttribute('data-base-href');
            if (base === null) {
                const href = a.getAttribute('href');
                if (!this.generatedSectionPrefixes.some(p => href === p || href.indexOf(p) === 0)) {
                    return;
                }
                base = href;
                a.setAttribute('data-base-href', base);
            }
            a.setAttribute('href', lang === 'en' ? base : base + lang + '/');
        });
    },

    // Translate a specific element based on key
    translateElement: function(element, key) {
        const translation = this.getTranslation(key);

        if (translation) {
            // Check if the element has children that are not supposed to be translated
            const hasPreserveChildren = element.querySelector('.no-translate, [data-no-translate]');

            if (hasPreserveChildren) {
                // Swap the element's own text for the translation while keeping
                // any .no-translate children (e.g. the footer's ACTIVE /
                // PLANNED status badges).
                //
                // This previously built a placeholder version of innerHTML and
                // then threw it away - `translatedHtml` was set to the raw
                // translation
                //
                //
                // string, which contains no placeholders, so the
                // restore step matched nothing and the children were destroyed.
                // Re-attaching the live nodes is simpler and actually works.


                const preserved = Array.from(
                    element.querySelectorAll(':scope > .no-translate, :scope > [data-no-translate]')
                );

                element.textContent = translation;

                preserved.forEach(node => {
                    element.appendChild(document.createTextNode(' '));
                    element.appendChild(node);
                });
            } else {
                // Simple translation without preserved elements
                element.innerHTML = translation;
            }
        }
    },

    // Get a translation by key
    getTranslation: function(key) {
        if (!this.translations || !this.translations[this.currentLanguage]) {
            if (this.config.debug) {
                console.warn(`⚠️ No translations loaded for ${this.currentLanguage}`);
            }
            return null;
        }

        // Handle nested keys with dot notation (e.g., "common.buttons.save")
        const keys = key.split('.');
        let value = this.translations[this.currentLanguage];

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                if (this.config.debug) {
                    console.warn(`⚠️ Missing translation for key: ${key} in ${this.currentLanguage}`);
                }
                return null;
            }
        }

        return value;
    },

    // Format dates according to the current language
    formatDate: function(dateString) {
        try {
            const date = new Date(dateString);
            if (isNaN(date)) return dateString;

            return new Intl.DateTimeFormat(this.currentLanguage, {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }).format(date);
        } catch (e) {
            console.warn('⚠️ Error formatting date:', e);
            return dateString;
        }
    },

    // Format numbers according to the current language
    formatNumber: function(number) {
        try {
            return new Intl.NumberFormat(this.currentLanguage).format(number);
        } catch (e) {
            console.warn('⚠️ Error formatting number:', e);
            return number.toString();
        }
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    if (!TranslationSystem.isInitialized) {
        TranslationSystem.init();
    }
});

// Export for global access
window.TranslationSystem = TranslationSystem;

// Dispatch event when translation system is ready
document.dispatchEvent(new CustomEvent('translationSystemReady'));
console.log('🌍 Translation system ready event dispatched');