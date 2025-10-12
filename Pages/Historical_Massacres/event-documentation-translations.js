// ===================================================================
// TRANSLATION SUPPORT FOR EVENT DOCUMENTATION
// Version: 1.4.0 - Added hyperlinked sources support
// Last Updated: 2025-10-12 20:00:00 UTC
// Author: aliattia02
// ===================================================================

console.log('🔍 Event documentation translations loading...');

let eventData = null;
let translations = null;
let currentLang = 'en';

async function loadEventData() {
    try {
        const baseJsonFilename = window.location.pathname.split('/').pop().replace('.html', '');
        const mainJsonPath = `${baseJsonFilename}.json`;
        const translationsPath = `${baseJsonFilename}.translations.json`;

        console.log(`📂 Attempting to load: ${mainJsonPath} and ${translationsPath}`);

        const mainResponse = await fetch(mainJsonPath);
        if (!mainResponse.ok) throw new Error(`HTTP error! status: ${mainResponse.status}`);

        eventData = await mainResponse.json();
        console.log(`✅ Loaded main JSON data for: ${mainJsonPath}`);

        try {
            const transResponse = await fetch(translationsPath);
            if (transResponse.ok) {
                translations = await transResponse.json();
                console.log('✅ Page-specific translations loaded');
                await loadAndMergeCommonTranslations();
            } else {
                console.log('⚠️ No page-specific translations file found');
                translations = {};
                await loadAndMergeCommonTranslations();
            }
        } catch (transError) {
            console.log('⚠️ Error loading page-specific translations:', transError);
            translations = {};
            await loadAndMergeCommonTranslations();
        }

        if (window.TranslationSystem) {
            currentLang = window.TranslationSystem.currentLanguage || 'en';
            console.log(`🌐 Using language: ${currentLang}`);
        }

        renderPage(eventData);

    } catch (error) {
        console.error('❌ Error loading event data:', error);
    }
}

async function loadAndMergeCommonTranslations() {
    try {
        const rootPath = getPathToRoot();
        const timestamp = new Date().getTime();
        const languages = ['en', 'ar', 'de'];

        for (const lang of languages) {
            const commonPath = `${rootPath}translations/${lang}.json?v=${timestamp}`;
            console.log(`📂 Loading common translations for ${lang} from: ${commonPath}`);

            try {
                const response = await fetch(commonPath);
                if (!response.ok) continue;

                const commonData = await response.json();
                console.log(`✅ Loaded common translations for ${lang}`);

                if (!translations[lang]) {
                    translations[lang] = {};
                }

                if (commonData.common) {
                    translations[lang].common = {
                        ...commonData.common,
                        ...translations[lang].common
                    };
                }

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

function getTranslatedContent(path, defaultContent) {
    if (!translations || !currentLang || currentLang === 'en') return defaultContent;

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

function setupLanguageChangeListener() {
    document.addEventListener('languageChanged', function(e) {
        console.log('🌐 Language changed to:', e.detail.language, 'with direction:', e.detail.direction);
        currentLang = e.detail.language;
        if (eventData) {
            renderPage(eventData);
        }
    });
}

function overrideTranslationSystem() {
    if (window.TranslationSystem) {
        console.log('🔄 Setting up custom translation handling');

        if (translations && Object.keys(translations).length > 0) {
            window.TranslationSystem.translations = translations;
        }

        const originalUpdatePageLanguage = window.TranslationSystem.updatePageLanguage;
        const originalChangeLanguage = window.TranslationSystem.changeLanguage;

        window.TranslationSystem.updatePageLanguage = function() {
            console.log('🔄 Custom translation update including footer');

            document.documentElement.lang = currentLang;
            document.documentElement.dir = window.TranslationSystem.languages[currentLang]?.dir || 'ltr';

            if (window.TranslationSystem.languages[currentLang]?.dir === 'rtl') {
                document.body.classList.add('rtl');
            } else {
                document.body.classList.remove('rtl');
            }

            updateCommonTranslations();
        };

        window.TranslationSystem.currentLanguage = currentLang;

        window.TranslationSystem.changeLanguage = async function(lang) {
            currentLang = lang;
            window.TranslationSystem.currentLanguage = lang;
            localStorage.setItem('gaza-docs-lang', lang);

            window.TranslationSystem.updateLanguageSelectorUI();
            window.TranslationSystem.updatePageLanguage();

            if (eventData) {
                renderPage(eventData);
            }

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

function renderPage(data) {
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

    const isRTL = currentLang === 'ar';
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';

    updateCommonTranslations();
}

function updateCommonTranslations() {
    if (!window.TranslationSystem || !translations || !translations[currentLang]) return;

    console.log('🔄 Updating common translations (footer, header, etc.)');

    const elements = document.querySelectorAll('[data-i18n]');

    for (const element of elements) {
        const key = element.getAttribute('data-i18n');
        if (!key) continue;

        try {
            const parts = key.split('.');
            let value = translations[currentLang];

            for (const part of parts) {
                if (!value || typeof value !== 'object') break;
                value = value[part];
            }

            if (value && typeof value === 'string') {
                element.innerHTML = value;
            }
        } catch (e) {
        }
    }

    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (const element of placeholders) {
        const key = element.getAttribute('data-i18n-placeholder');
        const translation = getTranslationFromSystem(key);
        if (translation) {
            element.placeholder = translation;
        }
    }

    const titles = document.querySelectorAll('[data-i18n-title]');
    for (const element of titles) {
        const key = element.getAttribute('data-i18n-title');
        const translation = getTranslationFromSystem(key);
        if (translation) {
            element.title = translation;
        }
    }

    console.log('✅ Common translations updated');
}

function getTranslationFromSystem(key) {
    if (!translations || !translations[currentLang]) return null;

    try {
        const parts = key.split('.');
        let value = translations[currentLang];

        for (const part of parts) {
            if (!value || typeof value !== 'object') return null;
            value = value[part];
        }

        return value && typeof value === 'string' ? value : null;
    } catch (e) {
        return null;
    }
}

function renderHero(hero) {
    const categoryText = getTranslatedContent('hero.category', hero.category);
    const titleText = getTranslatedContent('hero.title', hero.title);
    const subtitleText = getTranslatedContent('hero.subtitle', hero.subtitle);

    const fieldsToHide = ['Coordinates'];
    const filteredMetaCards = hero.metaCards.filter(card => !fieldsToHide.includes(card.label));

    document.getElementById('hero-section').innerHTML = `
        <div class="event-category">${categoryText}</div>
        <h1 class="event-title">${titleText}</h1>
        <p class="event-subtitle">${subtitleText}</p>
        <div class="event-meta-grid">
            ${filteredMetaCards.map((card, index) => {
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
    const titleText = getTranslatedContent('quickFacts.title', quickFacts.title);

    const fieldsToHide = ['Coordinates', 'Event ID', 'Injured'];
    const filteredItems = quickFacts.items.filter(item => !fieldsToHide.includes(item.label));

    document.getElementById('quick-info').innerHTML = `
        <div class="quick-info-title">${titleText}</div>
        <div class="quick-info-grid">
            ${filteredItems.map(item => {
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

    const localImages = media.images?.local || [];
    const remoteImages = media.images?.remote || [];
    const allImages = [
        ...localImages.map(img => ({ src: `images/${img}`, type: 'local', original: img })),
        ...remoteImages.map(img => ({ src: img, type: 'remote', original: img }))
    ];

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

    if (hasImages) {
        window.galleryImages = allImages.map(img => ({
            src: img.src,
            caption: img.original.replace(/\.[^/.]+$/, "").replace(/-/g, ' ').replace(/_/g, ' ').split('/').pop(),
            type: img.type
        }));
    }

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
                    const translatedLabel = getTranslatedContent(`casualties.breakdown.${index}.label`, item.label);
                    const translatedDetail = getTranslatedContent(`casualties.breakdown.${index}.detail`, item.detail);
                    
                    let sourcesHTML = '';
                    if (item.sources && item.sources.length > 0) {
                        sourcesHTML = `
                            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-light);">
                                <div style="font-size: 0.75rem; font-weight: 600; margin-bottom: 0.5rem; opacity: 0.8;">📚 Sources:</div>
                                ${item.sources.map(source => `
                                    <a href="${source.link}" class="source-link" target="_blank" rel="noopener" style="display: flex; align-items: center; gap: 0.25rem; font-size: 0.7rem; margin-bottom: 0.25rem;">
                                        <span>${source.icon}</span>
                                        <span>${source.name}</span>
                                    </a>
                                `).join('')}
                            </div>
                        `;
                    }
                    
                    return `
                        <div class="casualty-card ${item.type}">
                            <div class="casualty-number">${item.number}</div>
                            <div class="casualty-label">${translatedLabel}</div>
                            <div class="casualty-detail">${translatedDetail}</div>
                            ${sourcesHTML}
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
                    const translatedTitle = getTranslatedContent(`timeline.events.${index}.title`, event.title);
                    const translatedDesc = getTranslatedContent(`timeline.events.${index}.description`, event.description);
                    
                    let sourceHTML = '';
                    if (event.sourceLinks && event.sourceLinks.length > 0) {
                        const links = event.sourceLinks.map(link => 
                            `<a href="${link.url}" target="_blank" rel="noopener" style="color: #2563eb; text-decoration: none; border-bottom: 1px dotted #2563eb;">${link.name}</a>`
                        ).join('; ');
                        sourceHTML = `<div style="margin-top: 0.5rem; font-size: 0.85rem; opacity: 0.8;"><em>${sourcePrefixText}</em> ${links}</div>`;
                    } else if (event.source) {
                        sourceHTML = `<div style="margin-top: 0.5rem; font-size: 0.85rem; opacity: 0.8;"><em>${sourcePrefixText}</em> ${event.source}</div>`;
                    }
                    
                    return `
                        <div class="timeline-item">
                            <div class="timeline-time">${event.time}</div>
                            <div class="timeline-content">
                                <strong>${translatedTitle}:</strong>
                                <span>${translatedDesc}</span>
                                ${sourceHTML}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderWarCrimes(warCrimes) {
    if (Array.isArray(warCrimes)) {
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

    const titleText = getTranslatedContent('warCrimes.title', warCrimes.title);
    const alertText = warCrimes.alert ? getTranslatedContent('warCrimes.alert', warCrimes.alert.text) : '';

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
                    const translatedTitle = getTranslatedContent(`warCrimes.crimes.${index}.title`, crime.title);
                    const translatedDesc = getTranslatedContent(`warCrimes.crimes.${index}.description`, crime.description);
                    const translatedSourceText = crime.sourceLink ? 
                        getTranslatedContent(`warCrimes.crimes.${index}.sourceText`, crime.sourceText || '📄 View Source ↗') : '';
                    
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
                const heading = getTranslatedContent(`internationalLaw.sections.${sIndex}.heading`, section.heading);
                
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
                
                return `
                    <h4 style="margin-top: 1.5rem; margin-bottom: 0.75rem;">${heading}</h4>
                    ${violationsHTML}
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
                                    📄 View Source →
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

    // Create commanders HTML
    const commandersHTML = personalities.commanders && personalities.commanders.length > 0 ? `
        <h4 style="margin-bottom: 1rem;">${commandersTitleText}</h4>
        ${personalities.commanders.map((person, pIndex) => {
            const translatedResponsibility = getTranslatedContent(`personalities.commanders.${pIndex}.responsibility`, person.responsibility);
            
            return `
                <div class="testimony-card" style="margin-bottom: 1.5rem;">
                    <div class="testimony-header">
                        <div class="witness-avatar">${person.name.split(' ').map(n => n[0]).join('')}</div>
                        <div class="witness-info">
                            <div class="witness-name">${person.name}</div>
                            <div class="witness-role">${person.role} • ${person.birth_death}</div>
                        </div>
                    </div>
                    <div class="testimony-text">
                        <strong>Responsibility:</strong>
                        <span>${translatedResponsibility}</span>
                    </div>
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
        </div>
    `;

    // Insert after testimonies section
    const testimoniesSection = document.getElementById('testimonies-section');
    if (testimoniesSection) {
        testimoniesSection.after(container);
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

    document.getElementById('sources-section').innerHTML = `
        <div class="section-header">
            <span class="section-icon">${sources.icon}</span>
            <h2 class="section-title">${titleText}</h2>
        </div>
        <div class="section-content">
            <p style="margin-bottom: 1rem; font-size: 0.9rem;">${introText}</p>
            <div class="sources-compact">
                ${sources.list.map((source, sIndex) => {
                    const translatedType = getTranslatedContent(`sources.list.${sIndex}.type`, source.type);
                    const translatedDesc = getTranslatedContent(`sources.list.${sIndex}.description`, source.description || '');
                    
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
                                    📄 View Source →
                                </a>
                            ` : ''}
                            ${source.verified ? `<span class="source-verification">✅ Verified</span>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
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

// Helper function for document icons
function getDocumentIcon(extension) {
    const icons = {
        'PDF': '📕', 'DOC': '📘', 'DOCX': '📘', 'TXT': '📄',
        'XLS': '📗', 'XLSX': '📗', 'PPT': '📙', 'PPTX': '📙',
        'ZIP': '📦', 'RAR': '📦'
    };
    return icons[extension] || '📄';
}

// Helper to get path to root
function getPathToRoot() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(p => p.length > 0);
    const dirDepth = path.endsWith('.html') ? parts.length - 1 : parts.length;
    return dirDepth <= 0 ? './' : Array(dirDepth).fill('..').join('/') + '/';
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
    console.log('🌐 Supports English, Arabic, and German translations with footer integration');
});
