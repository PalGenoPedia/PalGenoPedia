/**
 * Gaza Crisis Documentation - Translation System
 * Handles multilingual functionality across the website
 * Author: aliattia02
 * Last Updated: 2025-10-11
 */

// Global translation system
const TranslationSystem = {
    // Current language (default to browser preference or English)
    currentLang: 'en',
    
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
    
    // Initialize the translation system
    init: async function() {
        console.log('🌐 Initializing translation system...');
        
        // Get stored language preference or detect from browser
        this.currentLang = localStorage.getItem('gaza-docs-lang') || 
                          this.detectBrowserLanguage() || 
                          'en';
        
        // Ensure we have a supported language
        if (!this.languages[this.currentLang]) {
            console.log(`Language ${this.currentLang} not supported, falling back to English`);
            this.currentLang = 'en';
        }
        
        // Load translations for current language
        await this.loadTranslations(this.currentLang);
        
        // Apply initial translations
        this.updatePageLanguage();
        
        // Initialize language selector in UI
        this.initLanguageSelector();
        
        console.log(`🌐 Translation system initialized with language: ${this.currentLang}`);
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
    
    // Load translations for a language
    loadTranslations: async function(lang) {
        try {
            console.log(`🌐 Loading translations for: ${lang}`);
            
            // Add cache busting
            const timestamp = new Date().getTime();
            const response = await fetch(`./translations/${lang}.json?v=${timestamp}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.translations = await response.json();
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
    
    // Change the current language
    changeLanguage: async function(lang) {
        // Validate language
        if (!this.languages[lang]) {
            console.error(`❌ Unsupported language: ${lang}`);
            return false;
        }
        
        // If same language, no need to change
        if (this.currentLang === lang) {
            return true;
        }
        
        console.log(`🌐 Changing language to: ${lang}`);
        
        // Load translations
        const success = await this.loadTranslations(lang);
        
        if (success) {
            // Update current language
            this.currentLang = lang;
            
            // Save preference
            localStorage.setItem('gaza-docs-lang', lang);
            
            // Update the page
            this.updatePageLanguage();
            
            // Update language selector UI
            this.updateLanguageSelectorUI();
            
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
            button.className = `lang-btn ${langCode === this.currentLang ? 'active' : ''}`;
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
            if (langCode === this.currentLang) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    },
    
    // Apply translations to the page
    updatePageLanguage: function() {
        console.log(`🌐 Updating page to language: ${this.currentLang}`);
        
        // Update HTML dir and lang attributes
        document.documentElement.lang = this.currentLang;
        document.documentElement.dir = this.languages[this.currentLang].dir;
        
        // Add/remove RTL class based on direction
        if (this.languages[this.currentLang].dir === 'rtl') {
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
        
        console.log(`✅ Page updated to ${this.currentLang}`);
        
        // Trigger custom event so other scripts can react
        document.dispatchEvent(new CustomEvent('languageChanged', {
            detail: { 
                language: this.currentLang,
                direction: this.languages[this.currentLang].dir
            }
        }));
    },
    
    // Translate a specific element based on key
    translateElement: function(element, key) {
        const translation = this.getTranslation(key);
        
        if (translation) {
            // Check if the element has children that are not supposed to be translated
            const hasPreserveChildren = element.querySelector('.no-translate, [data-no-translate]');
            
            if (hasPreserveChildren) {
                // Save the non-translatable content
                const preservedElements = [];
                const noTranslate = element.querySelectorAll('.no-translate, [data-no-translate]');
                
                noTranslate.forEach(preserveEl => {
                    preservedElements.push({
                        placeholder: `%%PRESERVE_${preservedElements.length}%%`,
                        content: preserveEl.outerHTML
                    });
                });
                
                // Replace non-translatable elements with placeholders
                let tempHtml = element.innerHTML;
                noTranslate.forEach((el, i) => {
                    tempHtml = tempHtml.replace(el.outerHTML, preservedElements[i].placeholder);
                });
                
                // Apply translation
                let translatedHtml = translation;
                
                // Restore preserved elements
                preservedElements.forEach(item => {
                    translatedHtml = translatedHtml.replace(item.placeholder, item.content);
                });
                
                element.innerHTML = translatedHtml;
            } else {
                // Simple translation without preserved elements
                element.innerHTML = translation;
            }
        }
    },
    
    // Get a translation by key
    getTranslation: function(key) {
        // Handle nested keys with dot notation (e.g., "common.buttons.save")
        const keys = key.split('.');
        let value = this.translations;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                console.warn(`⚠️ Missing translation for key: ${key} in ${this.currentLang}`);
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
            
            return new Intl.DateTimeFormat(this.currentLang, {
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
            return new Intl.NumberFormat(this.currentLang).format(number);
        } catch (e) {
            console.warn('⚠️ Error formatting number:', e);
            return number.toString();
        }
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    TranslationSystem.init();
});

// Export for global access
window.TranslationSystem = TranslationSystem;