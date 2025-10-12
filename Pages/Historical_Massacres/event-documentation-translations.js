// ===================================================================
// TRANSLATION SUPPORT FOR EVENT DOCUMENTATION
// Version: 1.2.0 - Improved integration with main translation system
// Last Updated: 2025-10-12 13:42:29 UTC
// Author: aliattia02
// ===================================================================

console.log('🔍 Event documentation translations loading...');

let eventData = null;      // Main JSON data (English)
let translations = null;   // Translation object for all languages
let currentLang = 'en';    // Default language

async function loadEventData() {
    try {
        const baseJsonFilename = window.location.pathname.split('/').pop().replace('.html', '');
        const mainJsonPath = `${baseJsonFilename}.json`;
        const translationsPath = `${baseJsonFilename}.translations.json`;

        console.log(`📂 Attempting to load: ${mainJsonPath} and ${translationsPath}`);

        // First load main data
        const mainResponse = await fetch(mainJsonPath);
        if (!mainResponse.ok) throw new Error(`HTTP error! status: ${mainResponse.status}`);

        eventData = await mainResponse.json();
        console.log(`✅ Loaded main JSON data for: ${mainJsonPath}`);

        // Then try to load page-specific translations
        try {
            const transResponse = await fetch(translationsPath);
            if (transResponse.ok) {
                translations = await transResponse.json();
                console.log('✅ Page-specific translations loaded');

                // CRITICAL: Now load and merge common translations
                await loadAndMergeCommonTranslations();

            } else {
                console.log('⚠️ No page-specific translations file found');
                translations = {};

                // Still load common translations
                await loadAndMergeCommonTranslations();
            }
        } catch (transError) {
            console.log('⚠️ Error loading page-specific translations:', transError);
            translations = {};

            // Still load common translations
            await loadAndMergeCommonTranslations();
        }

        // Get current language from TranslationSystem if available
        if (window.TranslationSystem) {
            currentLang = window.TranslationSystem.currentLanguage || 'en';
            console.log(`🌍 Using language: ${currentLang}`);
        }

        // Render page with translations if available
        renderPage(eventData);

    } catch (error) {
        console.error('❌ Error loading event data:', error);
    }
}

// Updated function to load and merge common translations
async function loadAndMergeCommonTranslations() {
    try {
        const rootPath = getPathToRoot();
        const timestamp = new Date().getTime();

        // Load all language files from root
        const languages = ['en', 'ar', 'de'];

        for (const lang of languages) {
            const commonPath = `${rootPath}translations/${lang}.json?v=${timestamp}`;
            console.log(`📂 Loading common translations for ${lang} from: ${commonPath}`);

            try {
                const response = await fetch(commonPath);
                if (!response.ok) continue;

                const commonData = await response.json();
                console.log(`✅ Loaded common translations for ${lang}`);

                // Initialize translations object if needed
                if (!translations[lang]) {
                    translations[lang] = {};
                }

                // Merge common translations (common translations should NOT override page-specific)
                if (commonData.common) {
                    translations[lang].common = {
                        ...commonData.common,
                        ...translations[lang].common
                    };
                }

                // Also merge any other root-level keys from common translations
                for (const key in commonData) {
                    if (key !== 'common' && commonData.hasOwnProperty(key)) {
                        if (!translations[lang][key]) {
                            translations[lang][key] = commonData[key];
                        }
                    }
                }

            } catch (error) {
                console.warn(`⚠️ Could not load common translations for ${lang}:`, error);
            }
        }

        // Make translations available to TranslationSystem
        if (window.TranslationSystem) {
            window.TranslationSystem.translations = translations;
            console.log('✅ Common translations merged and made available to TranslationSystem');
        }

        return true;
    } catch (error) {
        console.warn(`⚠️ Error in loadAndMergeCommonTranslations:`, error);
        return false;
    }
}

// Get translated content if available, otherwise use default
function getTranslatedContent(path, defaultContent) {
    if (!translations || !currentLang || currentLang === 'en') return defaultContent;

    // Navigate through the translations object based on the dot-notation path
    try {
        const pathParts = path.split('.');
        let result = translations[currentLang];

        for (const part of pathParts) {
            if (result === undefined || result === null) return defaultContent;
            result = result[part];
        }

        return result !== undefined && result !== null ? result : defaultContent;
    } catch (e) {
        console.log(`Translation not found for ${path}`);
        return defaultContent;
    }
}

// Handle language change events
function setupLanguageChangeListener() {
    document.addEventListener('languageChanged', function(e) {
        console.log('🌐 Language changed to:', e.detail.language, 'with direction:', e.detail.direction);

        // Update current language
        currentLang = e.detail.language;

        // Re-render the page with the new language
        if (eventData) {
            renderPage(eventData);
        }
    });
}

// Override the main translation system's functionality to integrate properly
function overrideTranslationSystem() {
    if (window.TranslationSystem) {
        console.log('🔄 Setting up custom translation handling');

        // Make sure TranslationSystem uses our translations
        if (translations && Object.keys(translations).length > 0) {
            window.TranslationSystem.translations = translations;
        }

        // Override it to avoid infinite loops
        const originalUpdatePageLanguage = window.TranslationSystem.updatePageLanguage;
        window.TranslationSystem.updatePageLanguage = function() {
            console.log('🛑 Preventing standard translation update to avoid recursion');
            // Only update direction attributes
            document.documentElement.lang = currentLang;
            document.documentElement.dir = window.TranslationSystem.languages[currentLang]?.dir || 'ltr';

            // Update RTL class
            if (window.TranslationSystem.languages[currentLang]?.dir === 'rtl') {
                document.body.classList.add('rtl');
            } else {
                document.body.classList.remove('rtl');
            }
        };

        // Set current language for both systems
        window.TranslationSystem.currentLanguage = currentLang;

        // Ensure language change in main system updates our system
        const originalChangeLanguage = window.TranslationSystem.changeLanguage;
        window.TranslationSystem.changeLanguage = async function(lang) {
            currentLang = lang;
            window.TranslationSystem.currentLanguage = lang;
            localStorage.setItem('gaza-docs-lang', lang);

            // Update the UI without recursive calls
            window.TranslationSystem.updateLanguageSelectorUI();
            window.TranslationSystem.updatePageLanguage();

            // Re-render our content with the new language
            if (eventData) {
                renderPage(eventData);
            }

            // Trigger event
            document.dispatchEvent(new CustomEvent('languageChanged', {
                detail: {
                    language: lang,
                    direction: window.TranslationSystem.languages[lang]?.dir || 'ltr'
                }
            }));

            return true;
        };
    }
}

// Update the original renderPage function to use translations
function renderPage(data) {
    // Set page metadata with translations
    document.getElementById('page-title').textContent = getTranslatedContent('metadata.pageTitle', data.metadata.pageTitle);
    document.getElementById('page-description').setAttribute('content', getTranslatedContent('metadata.description', data.metadata.description));
    document.getElementById('page-keywords').setAttribute('content', getTranslatedContent('metadata.keywords', data.metadata.keywords || ''));

    renderHero(data.hero);
    renderQuickFacts(data.quickFacts);
    if (data.media) renderMediaGallery(data.media);
    renderExecutiveSummary(data.executiveSummary);
    renderCasualties(data.casualties);
    renderTimeline(data.timeline);
    if (data.warCrimes) renderWarCrimes(data.warCrimes);
    renderInternationalLaw(data.international_law || data.internationalLaw);
    renderTestimonies(data.testimonies);
    if (data.personalities) renderPersonalities(data.personalities);
    renderHistoricalImpact(data.historicalImpact);
    renderSources(data.sources);
    if (data.cta) renderCTA(data.cta);
    initializeAnimations();

    // Set RTL/LTR direction based on language
    const isRTL = currentLang === 'ar';
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';

    // IMPORTANT FIX: Don't call updatePageLanguage() which causes infinite loop
    // Instead, manually update data-i18n attributes that were not handled by our renderer
    updateRemainingTranslations();
}

// New function to update remaining translations for elements that have data-i18n attributes
function updateRemainingTranslations() {
    // Only do this if TranslationSystem exists but do not call its updatePageLanguage method
    if (!window.TranslationSystem || !translations || !translations[currentLang]) return;

    // Get all elements with data-i18n attributes that we didn't explicitly handle
    const elements = document.querySelectorAll('[data-i18n]');

    for (const element of elements) {
        const key = element.getAttribute('data-i18n');
        if (!key) continue;

        // Try to find this key in our translations
        try {
            const parts = key.split('.');
            let value = translations[currentLang];

            // Navigate to the value
            for (const part of parts) {
                if (!value || typeof value !== 'object') break;
                value = value[part];
            }

            // If we have a valid translation string, apply it
            if (value && typeof value === 'string') {
                element.textContent = value;
            }
        } catch (e) {
            // Silently fail for missing translations
        }
    }
}

// Update each specific render function to use translations
function renderHero(hero) {
    // Get translated content for hero section
    const categoryText = getTranslatedContent('hero.category', hero.category);
    const titleText = getTranslatedContent('hero.title', hero.title);
    const subtitleText = getTranslatedContent('hero.subtitle', hero.subtitle);

    // Filter out Coordinates from hero metaCards
    const fieldsToHide = ['Coordinates'];
    const filteredMetaCards = hero.metaCards.filter(card => !fieldsToHide.includes(card.label));

    document.getElementById('hero-section').innerHTML = `
        <div class="event-category">${categoryText}</div>
        <h1 class="event-title">${titleText}</h1>
        <p class="event-subtitle">${subtitleText}</p>
        <div class="event-meta-grid">
            ${filteredMetaCards.map((card, index) => {
                // Try to get translated content for each meta card
                let cardLabel = card.label.toLowerCase().replace(/\s+/g, '');
                const translatedLabel = getTranslatedContent(`hero.metaCards.${cardLabel}.label`, card.label);
                const translatedValue = getTranslatedContent(`hero.metaCards.${cardLabel}.value`, card.value);
                const translatedDetail = getTranslatedContent(`hero.metaCards.${cardLabel}.detail`, card.detail);

                return `
                    <div class="meta-card">
                        <div class="meta-label">${card.icon} ${translatedLabel}</div>
                        <div class="meta-value">${translatedValue}</div>
                        ${translatedDetail ? `<div class="meta-detail">${translatedDetail}</div>` : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderQuickFacts(quickFacts) {
    // Get translated title
    const titleText = getTranslatedContent('quickFacts.title', quickFacts.title);

    // Filter out specific fields: Coordinates, Event ID, Injured
    const fieldsToHide = ['Coordinates', 'Event ID', 'Injured'];
    const filteredItems = quickFacts.items.filter(item => !fieldsToHide.includes(item.label));

    document.getElementById('quick-info').innerHTML = `
        <div class="quick-info-title">${titleText}</div>
        <div class="quick-info-grid">
            ${filteredItems.map(item => {
                // Determine translation key based on label
                const labelKey = getQuickFactLabelKey(item.label);
                const translatedLabel = labelKey ? 
                    getTranslatedContent(`quickFacts.${labelKey}`, item.label) : 
                    item.label;

                return `
                    <div class="quick-info-item">
                        <span class="info-label">${translatedLabel}</span>
                        <span class="info-value">${item.value}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Helper to get translation keys for quick fact labels
function getQuickFactLabelKey(label) {
    const keyMap = {
        'Event Type': 'eventType',
        'Perpetrators': 'perpetrators',
        'Verification': 'verification',
        'Classification': 'classification'
    };

    return keyMap[label] || null;
}

function renderMediaGallery(media) {
    const container = document.getElementById('media-gallery-section');

    // Combine local and remote images
    const localImages = media.images?.local || [];
    const remoteImages = media.images?.remote || [];
    const allImages = [
        ...localImages.map(img => ({ src: `images/${img}`, type: 'local', original: img })),
        ...remoteImages.map(img => ({ src: img, type: 'remote', original: img }))
    ];

    // Combine local and remote documents
    const localDocuments = media.documents?.local || [];
    const remoteDocuments = media.documents?.remote || [];
    const allDocuments = [
        ...localDocuments.map(doc => ({ src: `documents/${doc}`, type: 'local', original: doc })),
        ...remoteDocuments.map(doc => ({ src: doc, type: 'remote', original: doc }))
    ];

    const hasImages = allImages.length > 0;
    const hasDocuments = allDocuments.length > 0;

    if (!hasImages && !hasDocuments) {
        container.style.display = 'none';
        return;
    }

    // Prepare gallery images for lightbox
    if (hasImages) {
        window.galleryImages = allImages.map(img => ({
            src: img.src,
            caption: img.original.replace(/\.[^/.]+$/, "").replace(/-/g, ' ').replace(/_/g, ' ').split('/').pop(),
            type: img.type
        }));
    }

    // Get translated text
    const galleryTitle = getTranslatedContent('media.title', 'Media & Documentation');
    const imagesTabText = getTranslatedContent('media.imagesTab', 'Images');
    const documentsTabText = getTranslatedContent('media.documentsTab', 'Documents');
    const externalSourceText = getTranslatedContent('media.externalSource', '🌐 External Source');
    const localSourceText = getTranslatedContent('media.localSource', '📁 Local Source');
    const localFileText = getTranslatedContent('media.localFile', '📁 Local File');

    let html = `
        <div class="media-gallery-section">
            <div class="media-gallery-header">
                <span style="font-size: 1.5rem;">📸</span>
                <h2>${galleryTitle}</h2>
            </div>
    `;

    if (hasImages && hasDocuments) {
        html += `
            <div class="media-tabs">
                <button class="media-tab active" onclick="switchMediaTab('images')">
                    🖼️ <span>${imagesTabText}</span> (${allImages.length})
                </button>
                <button class="media-tab" onclick="switchMediaTab('documents')">
                    📄 <span>${documentsTabText}</span> (${allDocuments.length})
                </button>
            </div>
        `;
    }

    if (hasImages) {
        html += `
            <div id="media-images" class="media-content active">
                <div class="image-gallery">
                    ${allImages.map((image, index) => {
                        const imgName = image.original.replace(/\.[^/.]+$/, "").replace(/-/g, ' ').replace(/_/g, ' ').split('/').pop();
                        const sourceLabel = image.type === 'remote' ? externalSourceText : localSourceText;

                        return `
                            <div class="gallery-item" onclick="openLightbox(${index})">
                                <img src="${image.src}" alt="${imgName}" loading="lazy" 
                                     onerror="this.style.display='none'; console.log('Image not found:', '${image.src}');">
                                <div class="gallery-item-overlay">
                                    <div>${imgName}</div>
                                    <div style="font-size: 0.75rem; opacity: 0.8; margin-top: 0.25rem;">${sourceLabel}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    if (hasDocuments) {
        html += `
            <div id="media-documents" class="media-content ${!hasImages ? 'active' : ''}">
                <div class="documents-list">
                    ${allDocuments.map(doc => {
                        const extension = doc.original.split('.').pop().toUpperCase();
                        const icon = getDocumentIcon(extension);
                        const name = doc.original.replace(/\.[^/.]+$/, "").replace(/-/g, ' ').replace(/_/g, ' ').split('/').pop();
                        const sourceLabel = doc.type === 'remote' ? externalSourceText : localFileText;

                        return `
                            <a href="${doc.src}" class="document-item" target="_blank" rel="noopener" 
                               onerror="console.log('Document not found:', '${doc.src}');">
                                <div class="document-icon">${icon}</div>
                                <div class="document-info">
                                    <div class="document-name">${name}</div>
                                    <div class="document-type">
                                        <span>${extension} Document</span> •
                                        <span>${sourceLabel}</span>
                                    </div>
                                </div>
                                <span style="font-size: 1.5rem;">⬇️</span>
                            </a>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;
}

function renderExecutiveSummary(summary) {
    // Get translated content
    const titleText = getTranslatedContent('executiveSummary.title', summary.title);
    const alertText = getTranslatedContent('executiveSummary.alert', summary.alert.text);

    const paragraphs = summary.paragraphs.map((p, index) => {
        return getTranslatedContent(`executiveSummary.paragraph${index + 1}`, p);
    });

    document.getElementById('executive-summary').innerHTML = `
        <div class="section-header">
            <span class="section-icon">${summary.icon}</span>
            <h2 class="section-title">${titleText}</h2>
        </div>
        <div class="section-content">
            <div class="alert-box ${summary.alert.type}">
                <span class="alert-icon">${summary.alert.icon}</span>
                <span>${alertText}</span>
            </div>
            ${paragraphs.map(p => `<p>${p}</p>`).join('')}
        </div>
    `;
}

function renderCasualties(casualties) {
    // Get translated title
    const titleText = getTranslatedContent('casualties.title', casualties.title);
    const alertText = getTranslatedContent('casualties.alert', casualties.alert.text);

    document.getElementById('casualties-section').innerHTML = `
        <div class="section-header">
            <span class="section-icon">${casualties.icon}</span>
            <h2 class="section-title">${titleText}</h2>
        </div>
        <div class="section-content">
            <div class="casualties-breakdown">
                ${casualties.breakdown.map((item, index) => {
                    // Get translated content for each item
                    const translatedLabel = getTranslatedContent(`casualties.breakdown.${index}.label`, item.label);
                    const translatedDetail = getTranslatedContent(`casualties.breakdown.${index}.detail`, item.detail);
                    
                    return `
                        <div class="casualty-card ${item.type}">
                            <div class="casualty-number">${item.number}</div>
                            <div class="casualty-label">${translatedLabel}</div>
                            <div class="casualty-detail">${translatedDetail}</div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="alert-box ${casualties.alert.type}">
                <span class="alert-icon">${casualties.alert.icon}</span>
                <span>${alertText}</span>
            </div>
        </div>
    `;
}

function renderTimeline(timeline) {
    // Get translated title
    const titleText = getTranslatedContent('timeline.title', timeline.title);
    const sourcePrefixText = getTranslatedContent('timeline.sourcePrefix', 'Source:');

    document.getElementById('timeline-section').innerHTML = `
        <div class="section-header">
            <span class="section-icon">${timeline.icon}</span>
            <h2 class="section-title">${titleText}</h2>
        </div>
        <div class="section-content">
            <div class="event-timeline">
                ${timeline.events.map((event, index) => {
                    // Get translated content for each timeline event
                    const translatedTitle = getTranslatedContent(`timeline.events.${index}.title`, event.title);
                    const translatedDesc = getTranslatedContent(`timeline.events.${index}.description`, event.description);
                    
                    return `
                        <div class="timeline-item">
                            <div class="timeline-time">${event.time}</div>
                            <div class="timeline-content">
                                <strong>${translatedTitle}:</strong>
                                <span>${translatedDesc}</span>
                                ${event.source ? `<div style="margin-top: 0.5rem; font-size: 0.85rem; opacity: 0.8;"><em>${sourcePrefixText}</em> ${event.source}</div>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderWarCrimes(warCrimes) {
    // Handle both array format and object format
    if (Array.isArray(warCrimes)) {
        // Simple array format - create basic list
        document.getElementById('war-crimes-section').innerHTML = `
            <div class="section-header">
                <span class="section-icon">⚠️</span>
                <h2 class="section-title">${getTranslatedContent('warCrimes.title', 'Documented War Crimes')}</h2>
            </div>
            <div class="section-content">
                <ul class="war-crimes-list">
                    ${warCrimes.map((crime, index) =>
                        `<li>${getTranslatedContent(`warCrimes.list.${index}`, crime)}</li>`
                    ).join('')}
                </ul>
            </div>
        `;
        return;
    }

    // Get translated title and alert
    const titleText = getTranslatedContent('warCrimes.title', warCrimes.title);
    const alertText = warCrimes.alert ? getTranslatedContent('warCrimes.alert', warCrimes.alert.text) : '';

    // Object format with detailed crimes
    document.getElementById('war-crimes-section').innerHTML = `
        <div class="section-header">
            <span class="section-icon">${warCrimes.icon}</span>
            <h2 class="section-title">${titleText}</h2>
        </div>
        <div class="section-content">
            ${warCrimes.alert ? `
                <div class="alert-box ${warCrimes.alert.type}">
                    <span class="alert-icon">${warCrimes.alert.icon}</span>
                    <span>${alertText}</span>
                </div>
            ` : ''}
            <ul class="war-crimes-list">
                ${warCrimes.crimes.map((crime, index) => {
                    // Get translated content for each crime
                    const translatedTitle = getTranslatedContent(`warCrimes.crimes.${index}.title`, crime.title);
                    const translatedDesc = getTranslatedContent(`warCrimes.crimes.${index}.description`, crime.description);
                    const translatedSourceText = crime.sourceLink ? 
                        getTranslatedContent(`warCrimes.crimes.${index}.sourceText`, crime.sourceText || '📄 View Source →') : '';
                    
                    return `
                        <li>
                            <div class="war-crime-title">
                                <span>${crime.icon}</span>
                                <span>${translatedTitle}</span>
                            </div>
                            <div class="war-crime-description">${translatedDesc}</div>
                            ${crime.sourceLink ? `
                                <a href="${crime.sourceLink}" class="source-link" target="_blank" rel="noopener">
                                    <span>${translatedSourceText}</span>
                                </a>
                            ` : ''}
                        </li>
                    `;
                }).join('')}
            </ul>
        </div>
    `;
}

function renderInternationalLaw(law) {
    if (!law) return;

    // Get translated content
    const titleText = getTranslatedContent('internationalLaw.title', law.title);
    const introText = law.introduction ? getTranslatedContent('internationalLaw.introduction', law.introduction) : '';
    const alertText = law.alert ? getTranslatedContent('internationalLaw.alert', law.alert.text) : '';

    document.getElementById('international-law-section').innerHTML = `
        <div class="section-header">
            <span class="section-icon">${law.icon}</span>
            <h2 class="section-title">${titleText}</h2>
        </div>
        <div class="section-content">
            ${introText ? `<p style="margin-bottom: 1.5rem;">${introText}</p>` : ''}
            ${law.sections.map((section, sIndex) => {
                // Get translated heading
                const heading = getTranslatedContent(`internationalLaw.sections.${sIndex}.heading`, section.heading);
                
                // Translate violations if present
                let violationsHTML = '';
                if (section.violations) {
                    violationsHTML = `
                        <ul style="margin: 0.5rem 0 1rem 1.5rem; line-height: 1.7;">
                            ${section.violations.map((v, vIndex) => {
                                const translatedViolation = getTranslatedContent(
                                    `internationalLaw.sections.${sIndex}.violations.${vIndex}`, v
                                );
                                return `<li>${translatedViolation}</li>`;
                            }).join('')}
                        </ul>
                    `;
                }
                
                // Translate notes if present
                let notesHTML = '';
                if (section.notes) {
                    notesHTML = `
                        <ul style="margin: 0.5rem 0 1rem 1.5rem; line-height: 1.7;">
                            ${section.notes.map((n, nIndex) => {
                                const translatedNote = getTranslatedContent(
                                    `internationalLaw.sections.${sIndex}.notes.${nIndex}`, n
                                );
                                return `<li>${translatedNote}</li>`;
                            }).join('')}
                        </ul>
                    `;
                }
                
                // Translate violation examples if present
                let violationExamplesHTML = '';
                if (section.violations_examples) {
                    const specificViolationsText = getTranslatedContent('internationalLaw.specificViolations', 'Specific Violations:');
                    violationExamplesHTML = `
                        <div style="margin: 0.5rem 0 1rem 1.5rem; padding: 0.75rem; background: var(--card-bg); border-radius: 4px; border-left: 3px solid var(--primary-color);">
                            <strong>${specificViolationsText}</strong>
                            <ul style="margin: 0.5rem 0 0 1.5rem; line-height: 1.7;">
                                ${section.violations_examples.map((v, vIndex) => {
                                    const translatedExample = getTranslatedContent(
                                        `internationalLaw.sections.${sIndex}.violations_examples.${vIndex}`, v
                                    );
                                    return `<li>${translatedExample}</li>`;
                                }).join('')}
                            </ul>
                        </div>
                    `;
                }
                
                return `
                    <h4 style="margin-top: 1.5rem; margin-bottom: 0.75rem;">${heading}</h4>
                    ${violationsHTML}
                    ${notesHTML}
                    ${violationExamplesHTML}
                `;
            }).join('')}
            ${law.alert ? `
                <div class="alert-box ${law.alert.type}" style="margin-top: 1.5rem;">
                    <span class="alert-icon">${law.alert.icon}</span>
                    <span>${alertText}</span>
                </div>
            ` : ''}
        </div>
    `;
}

function renderTestimonies(testimonies) {
    // Get translated content
    const titleText = getTranslatedContent('testimonies.title', testimonies.title);
    const alertText = testimonies.alert ? getTranslatedContent('testimonies.alert', testimonies.alert.text) : '';
    const sourceLabelText = getTranslatedContent('testimonies.sourceLabel', 'Source:');

    document.getElementById('testimonies-section').innerHTML = `
        <div class="section-header">
            <span class="section-icon">${testimonies.icon}</span>
            <h2 class="section-title">${titleText}</h2>
        </div>
        <div class="section-content">
            ${testimonies.alert ? `
                <div class="alert-box ${testimonies.alert.type}">
                    <span class="alert-icon">${testimonies.alert.icon}</span>
                    <span>${alertText}</span>
                </div>
            ` : ''}
            ${testimonies.witnesses.map((witness, wIndex) => {
                // Get translated content for each witness
                const translatedRole = getTranslatedContent(`testimonies.witnesses.${wIndex}.role`, witness.role);
                const translatedTestimony = getTranslatedContent(`testimonies.witnesses.${wIndex}.testimony`, witness.testimony);
                const translatedSourceText = witness.sourceLink ? 
                    getTranslatedContent(`testimonies.witnesses.${wIndex}.sourceText`, witness.sourceText || '📄 View Source →') : '';
                
                return `
                    <div class="testimony-card">
                        <div class="testimony-header">
                            <div class="witness-avatar">${witness.initials}</div>
                            <div class="witness-info">
                                <div class="witness-name">${witness.name}</div>
                                <div class="witness-role">${translatedRole}</div>
                            </div>
                        </div>
                        <div class="testimony-text">"${translatedTestimony}"</div>
                        <div class="testimony-source">
                            <strong>${sourceLabelText}</strong> ${witness.source}
                            ${witness.sourceLink ? `
                                <a href="${witness.sourceLink}" class="source-link" target="_blank" rel="noopener">
                                    <span>${translatedSourceText}</span>
                                </a>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderPersonalities(personalities) {
    if (!personalities || (!personalities.commanders && !personalities.witnesses_critics)) return;

    // Get translated content
    const titleText = getTranslatedContent('personalities.title', personalities.title || 'Key Individuals Involved');
    const commandersTitleText = getTranslatedContent('personalities.commandersTitle', 'Commanders & Perpetrators');
    const witnessesTitleText = getTranslatedContent('personalities.witnessesTitle', 'Witnesses & Critics');
    const responsibilityText = getTranslatedContent('personalities.responsibility', 'Responsibility:');
    const laterPositionsText = getTranslatedContent('personalities.laterPositions', 'Later Positions:');
    const accountabilityText = getTranslatedContent('personalities.accountability', 'Accountability:');
    const roleText = getTranslatedContent('personalities.role', 'Role:');
    const organizationalContextText = getTranslatedContent('personalities.organizationalContext', 'Organizational Context:');

    // Create organizational context HTML
    const organizationalContextHTML = personalities.organizational_context ? `
        <div class="alert-box info" style="margin-top: 1.5rem;">
            <span class="alert-icon">ℹ️</span>
            <strong>${organizationalContextText}</strong>
            <ul style="margin: 0.5rem 0 0 1.5rem; line-height: 1.6;">
                ${personalities.organizational_context.irgun ? 
                    `<li><strong>Irgun:</strong> <span>${getTranslatedContent('personalities.context.irgun', personalities.organizational_context.irgun)}</span></li>` : ''}
                ${personalities.organizational_context.lehi ? 
                    `<li><strong>Lehi:</strong> <span>${getTranslatedContent('personalities.context.lehi', personalities.organizational_context.lehi)}</span></li>` : ''}
                ${personalities.organizational_context.haganah ? 
                    `<li><strong>Haganah:</strong> <span>${getTranslatedContent('personalities.context.haganah', personalities.organizational_context.haganah)}</span></li>` : ''}
            </ul>
        </div>
    ` : '';

    // Create commanders HTML
    const commandersHTML = personalities.commanders && personalities.commanders.length > 0 ? `
        <h4 style="margin-bottom: 1rem;">${commandersTitleText}</h4>
        ${personalities.commanders.map((person, pIndex) => {
            // Get translated content for each person
            const translatedResponsibility = getTranslatedContent(`personalities.commanders.${pIndex}.responsibility`, person.responsibility);
            const translatedAccountability = getTranslatedContent(`personalities.commanders.${pIndex}.accountability`, person.accountability);
            const translatedNotes = person.notes ? getTranslatedContent(`personalities.commanders.${pIndex}.notes`, person.notes) : '';
            
            // Create later positions HTML
            const laterPositionsHTML = person.later_positions && person.later_positions.length > 0 ? `
                <div style="margin: 0.75rem 0; padding: 0.75rem; background: var(--card-bg); border-radius: 4px;">
                    <strong>${laterPositionsText}</strong>
                    <ul style="margin: 0.5rem 0 0 1.5rem; line-height: 1.6;">
                        ${person.later_positions.map((pos, lIndex) => {
                            const translatedPosition = getTranslatedContent(
                                `personalities.commanders.${pIndex}.later_positions.${lIndex}`, pos
                            );
                            return `<li>${translatedPosition}</li>`;
                        }).join('')}
                    </ul>
                </div>
            ` : '';
            
            return `
                <div class="testimony-card" style="margin-bottom: 1.5rem;">
                    <div class="testimony-header">
                        <div class="witness-avatar">${person.name.split(' ').map(n => n[0]).join('')}</div>
                        <div class="witness-info">
                            <div class="witness-name">${person.name} ${person.name_hebrew ? `<span style="opacity: 0.7;">(${person.name_hebrew})</span>` : ''}</div>
                            <div class="witness-role">${person.role} • ${person.birth_death}</div>
                        </div>
                    </div>
                    <div class="testimony-text">
                        <strong>${responsibilityText}</strong>
                        <span>${translatedResponsibility}</span>
                    </div>
                    ${laterPositionsHTML}
                    <div style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(255, 193, 7, 0.1); border-left: 3px solid #ffc107; border-radius: 4px;">
                        <strong>⚖️ ${accountabilityText}</strong>
                        <span>${translatedAccountability}</span>
                    </div>
                    ${translatedNotes ? `<div style="margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.8;"><em>${translatedNotes}</em></div>` : ''}
                </div>
            `;
        }).join('')}
    ` : '';

    // Create witnesses/critics HTML
    const witnessesHTML = personalities.witnesses_critics && personalities.witnesses_critics.length > 0 ? `
        <h4 style="margin-top: 2rem; margin-bottom: 1rem;">${witnessesTitleText}</h4>
        ${personalities.witnesses_critics.map((person, pIndex) => {
            // Get translated content for each person
            const translatedResponsibility = getTranslatedContent(`personalities.witnesses.${pIndex}.responsibility`, person.responsibility);
            const translatedLaterPositions = person.later_positions ? 
                getTranslatedContent(`personalities.witnesses.${pIndex}.laterPositions`, person.later_positions.join('; ')) : '';
            const translatedNotes = person.notes ? 
                getTranslatedContent(`personalities.witnesses.${pIndex}.notes`, person.notes) : '';
            
            return `
                <div class="testimony-card" style="margin-bottom: 1.5rem;">
                    <div class="testimony-header">
                        <div class="witness-avatar">${person.name.split(' ').map(n => n[0]).join('')}</div>
                        <div class="witness-info">
                            <div class="witness-name">${person.name} ${person.name_hebrew ? `<span style="opacity: 0.7;">(${person.name_hebrew})</span>` : ''}</div>
                            <div class="witness-role">${person.role} • ${person.birth_death}</div>
                        </div>
                    </div>
                    <div class="testimony-text">
                        <strong>${roleText}</strong>
                        <span>${translatedResponsibility}</span>
                    </div>
                    ${person.later_positions && person.later_positions.length > 0 ? `
                        <div style="margin: 0.75rem 0;">
                            <strong>${laterPositionsText}</strong>
                            <span>${translatedLaterPositions}</span>
                        </div>
                    ` : ''}
                    ${translatedNotes ? `<div style="margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.8;"><em>${translatedNotes}</em></div>` : ''}
                </div>
            `;
        }).join('')}
    ` : '';

    // Create and insert complete personalities section
    const container = document.createElement('section');
    container.className = 'content-section';
    container.id = 'personalities-section';

    container.innerHTML = `
        <div class="section-header">
            <span class="section-icon">👤</span>
            <h2 class="section-title">${titleText}</h2>
        </div>
        <div class="section-content">
            ${commandersHTML}
            ${witnessesHTML}
            ${organizationalContextHTML}
        </div>
    `;

    // Insert after testimonies section
    const testimoniesSection = document.getElementById('testimonies-section');
    if (testimoniesSection) {
        testimoniesSection.after(container);
    } else {
        // Fallback: insert before historical impact
        const historicalSection = document.getElementById('historical-impact-section');
        if (historicalSection) {
            historicalSection.before(container);
        }
    }
}

function renderHistoricalImpact(impact) {
    // Get translated title
    const titleText = getTranslatedContent('historicalImpact.title', impact.title);

    document.getElementById('historical-impact-section').innerHTML = `
        <div class="section-header">
            <span class="section-icon">${impact.icon}</span>
            <h2 class="section-title">${titleText}</h2>
        </div>
        <div class="section-content">
            ${impact.sections.map((section, sIndex) => {
                // Get translated heading
                const heading = getTranslatedContent(`historicalImpact.sections.${sIndex}.heading`, section.heading);
                
                return `
                    <h3>${heading}</h3>
                    <ul style="margin: 0.5rem 0 1.5rem; padding-left: 1.5rem; line-height: 1.7;">
                        ${section.items.map((item, iIndex) => {
                            const translatedItem = getTranslatedContent(
                                `historicalImpact.sections.${sIndex}.items.${iIndex}`, item
                            );
                            return `<li>${translatedItem}</li>`;
                        }).join('')}
                    </ul>
                `;
            }).join('')}
        </div>
    `;
}

function renderSources(sources) {
    // Get translated content
    const titleText = getTranslatedContent('sources.title', sources.title);
    const introText = getTranslatedContent('sources.introduction', sources.introduction);
    const alertText = sources.alert ? getTranslatedContent('sources.alert', sources.alert.text) : '';
    const viewSourceText = getTranslatedContent('sources.viewSource', '📄 View Source →');
    const verifiedText = getTranslatedContent('sources.verified', '✅ Verified');

    document.getElementById('sources-section').innerHTML = `
        <div class="section-header">
            <span class="section-icon">${sources.icon}</span>
            <h2 class="section-title">${titleText}</h2>
        </div>
        <div class="section-content">
            <p style="margin-bottom: 1rem; font-size: 0.9rem;">${introText}</p>
            <div class="sources-compact">
                ${sources.list.map((source, sIndex) => {
                    // Get translated source type and description
                    const translatedType = getTranslatedContent(`sources.list.${sIndex}.type`, source.type);
                    const translatedDesc = getTranslatedContent(`sources.list.${sIndex}.description`, source.description || source.notes || '');
                    
                    return `
                        <div class="source-item-compact">
                            <div class="source-header-compact">
                                ${source.icon ? `<div class="source-icon-compact">${source.icon}</div>` : ''}
                                <div>
                                    <div class="source-name-compact">${source.name}</div>
                                    <div class="source-type-compact">${translatedType}</div>
                                </div>
                            </div>
                            <div class="source-description-compact">${translatedDesc}</div>
                            ${source.link ? `
                                <a href="${source.link}" class="source-link" target="_blank" rel="noopener">
                                    <span>${source.linkText || viewSourceText}</span>
                                </a>
                            ` : ''}
                            ${source.verified ? `<span class="source-verification">${verifiedText}</span>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
            ${sources.alert ? `
                <div class="alert-box ${sources.alert.type}" style="margin-top: 1.5rem;">
                    <span class="alert-icon">${sources.alert.icon}</span>
                    <span>${alertText}</span>
                </div>
            ` : ''}
        </div>
    `;
}

function renderCTA(cta) {
    if (!cta || !cta.buttons) return;

    // Get translated content
    const titleText = getTranslatedContent('cta.title', cta.title);
    const descText = getTranslatedContent('cta.description', cta.description);

    document.getElementById('cta-section').innerHTML = `
        <h2 class="cta-title">${titleText}</h2>
        <p class="cta-description">${descText}</p>
        <div class="cta-buttons">
            ${cta.buttons.map((button, index) => {
                // Get translated button text
                const btnText = getTranslatedContent(`cta.buttons.${index}`, button.text);
                
                return `
                    <a href="${button.link}"
                       class="cta-btn ${button.type === 'secondary' ? 'secondary' : ''}"
                       ${button.action === 'print' ? 'onclick="window.print(); return false;"' : ''}
                       ${button.link.startsWith('http') || button.link.startsWith('mailto') ? 'target="_blank" rel="noopener"' : ''}>
                        <span>${btnText}</span>
                    </a>
                `;
            }).join('')}
        </div>
    `;
}

// Helper function for document icons - referenced in the code
function getDocumentIcon(extension) {
    const icons = {
        'PDF': '📕', 'DOC': '📘', 'DOCX': '📘', 'TXT': '📄',
        'XLS': '📗', 'XLSX': '📗', 'PPT': '📙', 'PPTX': '📙',
        'ZIP': '📦', 'RAR': '📦'
    };
    return icons[extension] || '📄';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set up language change listener
    setupLanguageChangeListener();

    // Override the translation system to avoid conflicts
    overrideTranslationSystem();

    // Load event data with translations
    loadEventData();
    
    console.log('✅ Event documentation translation system initialized');
    console.log('🌐 Supports English, Arabic, and German translations');
});