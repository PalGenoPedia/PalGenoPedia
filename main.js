// Gaza Crisis Documentation Platform - Updated Main JavaScript with CSV and Multilingual Support
// Now supports translations via the TranslationSystem module

// Global variables
let map;
let incidents = [];
let filteredIncidents = [];
let currentView = 'timeline';
let currentUser = 'aliattia02';
let lastUpdated = '2025-10-12 08:14:25';

// Detect which page we're on
const isMainPage = document.querySelector('.main') && document.querySelector('.crisis-banner');
const isMajorIncidentsPage = document.querySelector('.page-header') && document.querySelector('#incidentGrid');

console.log('Page detection:', { isMainPage, isMajorIncidentsPage });

// Color mapping for incident types
const typeColors = {
    hunger: '#e53e3e',
    water: '#3182ce',
    aid: '#d69e2e',
    casualties: '#805ad5',
    infrastructure: '#38a169'
};

// DOM Elements - with proper null checks
const elements = {
    navBtns: document.querySelectorAll('.view-btn'),
    viewSections: document.querySelectorAll('.view-section'),
    searchInput: document.getElementById('searchInput'),
    typeFilter: document.getElementById('typeFilter'),
    dateFilter: document.getElementById('dateFilter'),
    clearFilters: document.getElementById('clearFilters'),
    incidentCount: document.getElementById('incidentCount'),
    lastUpdated: document.getElementById('lastUpdated'),
    incidentGrid: document.getElementById('incidentGrid'),
    loading: document.getElementById('loading'),
    noResults: document.getElementById('noResults'),
    modal: document.getElementById('incidentModal'),
    modalClose: document.querySelector('.modal-close'),
    themeToggle: document.querySelector('.theme-toggle')
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Gaza Crisis Documentation Platform initializing with CSV and multilingual support...');
    initializeApp();
});

async function initializeApp() {
    try {
        await loadIncidentsFromCSV();
        setupEventListeners();
        initializeTheme();

        // Initialize map only if we're on major incidents page and map container exists
        if (isMajorIncidentsPage && document.getElementById('map')) {
            initializeMap();
        }

        // Set initial view based on page
        if (isMajorIncidentsPage) {
            switchView('timeline');

            setTimeout(() => {
                console.log('Auto-initializing timeline for major incidents page');
                if (window.timelineManager && typeof window.timelineManager.init === 'function') {
                    window.timelineManager.init(filteredIncidents);
                } else if (typeof window.initializeTimeline === 'function') {
                    window.initializeTimeline();
                }
            }, 200);
        } else if (isMainPage) {
            console.log('Main page detected - timeline handled by page-specific script');
        }

        console.log('Application initialized successfully with CSV data and multilingual support');
    } catch (error) {
        console.error('Error initializing app:', error);
        if (typeof showError === 'function' && isMajorIncidentsPage) {
            showError('Failed to load crisis data. Please refresh the page.');
        }
    }
}

// Load incidents from CSV files using Papa Parse
async function loadIncidentsFromCSV() {
    try {
        if (elements.loading) {
            elements.loading.style.display = 'block';
            console.log('Showing loading indicator');
        }

        console.log('Loading incidents from CSV files...');

        // Load main incidents CSV
        const incidentsCSV = await loadCSVFile('incidents.csv');

        // Load casualties details CSV
        const casualtiesDetailsCSV = await loadCSVFile('casualties-details.csv');

        // Process and combine the data
        incidents = processIncidentsData(incidentsCSV, casualtiesDetailsCSV);
        filteredIncidents = [...incidents];

        console.log(`✅ Loaded ${incidents.length} incidents from CSV files`);

        // Update global references
        window.incidents = incidents;
        window.filteredIncidents = filteredIncidents;

        if (!window.GazaDocsPlatform) {
            window.GazaDocsPlatform = {};
        }
        window.GazaDocsPlatform.incidents = incidents;
        window.GazaDocsPlatform.typeColors = typeColors;

        // Update displays
        updateStats();
        updateHeaderStats();

        if (elements.loading) {
            elements.loading.style.display = 'none';
            console.log('Hiding loading indicator');
        }

        console.log('CSV data loaded successfully');

    } catch (error) {
        console.error('❌ Error loading incidents from CSV:', error);

        if (elements.loading) {
            elements.loading.style.display = 'none';
        }

        if (isMajorIncidentsPage && typeof showError === 'function') {
            showError('Failed to load crisis data from CSV files. Please refresh the page.');
        }

        // Set empty arrays as fallback
        incidents = [];
        filteredIncidents = [];
        window.incidents = incidents;
        window.filteredIncidents = filteredIncidents;
    }
}

// Load CSV file using Papa Parse
async function loadCSVFile(filename) {
    return new Promise((resolve, reject) => {
        // Add cache busting
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const url = `${filename}?v=${timestamp}&r=${random}`;

        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            delimitersToGuess: [',', '\t', '|', ';'],
            transformHeader: function(header) {
                // Clean and normalize headers
                return header.trim().toLowerCase().replace(/\s+/g, '_');
            },
            complete: function(results) {
                if (results.errors && results.errors.length > 0) {
                    console.warn(`CSV parsing warnings for ${filename}:`, results.errors);
                }
                console.log(`✅ Loaded ${results.data.length} rows from ${filename}`);
                resolve(results.data);
            },
            error: function(error) {
                console.error(`❌ Error loading ${filename}:`, error);
                reject(error);
            }
        });
    });
}

// Process and combine incidents data from CSV files
function processIncidentsData(incidentsData, casualtiesDetailsData) {
    console.log('Processing incidents data...', {
        incidents: incidentsData.length,
        casualties: casualtiesDetailsData.length
    });

    return incidentsData.map(row => {
        // Build coordinates array
        const coordinates = [];
        if (row.location_coordinates_lng && row.location_coordinates_lat) {
            coordinates.push(parseFloat(row.location_coordinates_lng));
            coordinates.push(parseFloat(row.location_coordinates_lat));
        }

        // Parse casualties data
        const casualties = {};
        if (row.casualties_affected) casualties.affected = parseInt(row.casualties_affected) || 0;
        if (row.casualties_critical) casualties.critical = parseInt(row.casualties_critical) || 0;
        if (row.casualties_deaths) casualties.deaths = parseInt(row.casualties_deaths) || 0;
        if (row.casualties_injured) casualties.injured = parseInt(row.casualties_injured) || 0;
        if (row.casualties_hospitalized) casualties.hospitalized = parseInt(row.casualties_hospitalized) || 0;

        // Parse evidence data
        const evidence = [];
        if (row.evidence_types && row.evidence_urls) {
            const types = parseDelimitedField(row.evidence_types);
            const urls = parseDelimitedField(row.evidence_urls);
            const descriptions = parseDelimitedField(row.evidence_descriptions || '');

            types.forEach((type, index) => {
                if (urls[index]) {
                    evidence.push({
                        type: type.trim(),
                        url: urls[index].trim(),
                        description: descriptions[index] ? descriptions[index].trim() : ''
                    });
                }
            });
        }

        // Parse sources
        const sources = parseDelimitedField(row.sources || '');

        // Parse tags
        const tags = parseDelimitedField(row.tags || '');

        // Find related casualties details
        let casualtiesDetails = [];
        if (row.casualties_details_ids) {
            const detailIds = parseDelimitedField(row.casualties_details_ids);
            casualtiesDetails = casualtiesDetailsData.filter(detail =>
                detailIds.includes(detail.reference_id) ||
                detail.incident_id === row.id
            ).map(detail => ({
                reference_id: detail.reference_id,
                name: detail.name,
                age: parseInt(detail.age) || 0,
                date: detail.date,
                cause: detail.cause,
                location_details: detail.location_details,
                medical_facility: detail.medical_facility,
                condition: detail.condition,
                sources: parseDelimitedField(detail.sources || ''),
                public_identifiers: {
                    published_name: parseBooleanField(detail.published_name),
                    published_image: parseBooleanField(detail.published_image),
                    consent_verified: parseBooleanField(detail.consent_verified)
                },
                ethical_notes: {
                    content_warning: detail.content_warning,
                    privacy_status: detail.privacy_status,
                    documentation_purpose: detail.documentation_purpose
                }
            }));
        }

        // Build the incident object
        const incident = {
            id: row.id,
            title: row.title,
            date: row.date,
            time: row.time || null,
            location: {
                name: row.location_name,
                coordinates: coordinates
            },
            type: row.type,
            description: row.description,
            casualties: Object.keys(casualties).length > 0 ? casualties : null,
            casualties_details: casualtiesDetails.length > 0 ? casualtiesDetails : null,
            evidence: evidence.length > 0 ? evidence : null,
            sources: sources.length > 0 ? sources : [],
            verified: row.verified || 'pending',
            tags: tags.length > 0 ? tags : []
        };

        return incident;
    }).filter(incident => incident.id); // Filter out any rows without valid IDs
}

// Helper function to parse delimited fields (supports | and , delimiters)
function parseDelimitedField(field) {
    if (!field || typeof field !== 'string') return [];

    // Try pipe delimiter first, then comma
    let delimiter = '|';
    if (field.includes('|')) {
        delimiter = '|';
    } else if (field.includes(',')) {
        delimiter = ',';
    } else {
        return [field.trim()];
    }

    return field.split(delimiter)
        .map(item => item.trim())
        .filter(item => item.length > 0);
}

// Helper function to parse boolean fields
function parseBooleanField(field) {
    if (typeof field === 'boolean') return field;
    if (typeof field === 'string') {
        const lower = field.toLowerCase().trim();
        return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return false;
}

// Update header statistics - with null checks and translation support
function updateHeaderStats() {
    const totalIncidentsEl = document.getElementById('totalIncidents');
    const verifiedIncidentsEl = document.getElementById('verifiedIncidents');
    const lastUpdateStatEl = document.getElementById('lastUpdateStat');

    if (totalIncidentsEl) {
        totalIncidentsEl.textContent = incidents.length;
    }

    if (verifiedIncidentsEl) {
        const verified = incidents.filter(i => i.verified === 'verified').length;
        verifiedIncidentsEl.textContent = verified;
    }

    if (lastUpdateStatEl && lastUpdated) {
        // Use TranslationSystem to format date if available
        if (window.TranslationSystem && typeof window.TranslationSystem.formatDate === 'function') {
            lastUpdateStatEl.textContent = window.TranslationSystem.formatDate(lastUpdated);
        } else {
            const date = new Date(lastUpdated);
            lastUpdateStatEl.textContent = date.toLocaleDateString();
        }
    }
}

// Setup event listeners - with null checks
function setupEventListeners() {
    // Navigation - only if elements exist
    elements.navBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                const view = btn.getAttribute('data-view');
                if (view) {
                    switchView(view);
                }
            });
        }
    });

    // Search and filters - only if elements exist
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', debounce(applyFilters, 300));
    }
    if (elements.typeFilter) {
        elements.typeFilter.addEventListener('change', applyFilters);
    }
    if (elements.dateFilter) {
        elements.dateFilter.addEventListener('change', applyFilters);
    }
    if (elements.clearFilters) {
        elements.clearFilters.addEventListener('click', clearFilters);
    }

    // Modal - only if elements exist
    if (elements.modalClose) {
        elements.modalClose.addEventListener('click', closeModal);
    }
    if (elements.modal) {
        elements.modal.addEventListener('click', (e) => {
            if (e.target === elements.modal) closeModal();
        });
    }

    // Theme toggle - only if element exists
    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', toggleTheme);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Listen for language change events
    document.addEventListener('languageChanged', handleLanguageChange);
}

// Handle keyboard shortcuts
function handleKeyboard(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
}

// Handle language change event
function handleLanguageChange(e) {
    console.log('🌐 Language changed to:', e.detail.language, 'with direction:', e.detail.direction);

    // Re-render incident list if we're on that view
    if (currentView === 'list' && isMajorIncidentsPage) {
        renderIncidentList();
    }

    // Update the map if we're on that view
    if (currentView === 'map' && map) {
        addIncidentsToMap();
    }

    // Update stats with proper number formatting
    updateStats();
    updateHeaderStats();
}

// Initialize theme
function initializeTheme() {
    const savedTheme = localStorage.getItem('gaza-docs-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

// Toggle theme
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('gaza-docs-theme', newTheme);
    updateThemeIcon(newTheme);

    // Update timeline only if we're on the right page and view
    if (isMajorIncidentsPage && currentView === 'timeline' && window.timelineManager) {
        setTimeout(() => {
            window.timelineManager.update(filteredIncidents);
        }, 100);
    }
}

// Update theme icon
function updateThemeIcon(theme) {
    if (elements.themeToggle) {
        elements.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

// Initialize Leaflet map - only for major incidents page
function initializeMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer || !isMajorIncidentsPage) {
        console.log('Map container not found or not on major incidents page, skipping map initialization');
        return;
    }

    // Check if Leaflet is available
    if (typeof L === 'undefined') {
        console.warn('Leaflet not loaded, skipping map initialization');
        return;
    }

    try {
        map = L.map('map').setView([31.5204, 34.4668], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18
        }).addTo(map);

        console.log('Leaflet map loaded successfully');
        addIncidentsToMap();
    } catch (error) {
        console.error('Error initializing map:', error);
    }
}

// Add incidents to Leaflet map with translation support
function addIncidentsToMap() {
    if (!map || typeof L === 'undefined') return;

    // Clear existing markers
    if (window.incidentMarkers) {
        window.incidentMarkers.forEach(marker => {
            try {
                map.removeLayer(marker);
            } catch (e) {
                console.log('Error removing marker:', e);
            }
        });
    }
    window.incidentMarkers = [];

    try {
        const markers = L.markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 50
        });

        filteredIncidents.forEach(incident => {
            if (!incident.location?.coordinates || incident.location.coordinates.length < 2) {
                console.warn('Invalid coordinates for incident:', incident.id);
                return;
            }

            const icon = L.divIcon({
                className: 'custom-incident-marker',
                html: `<div class="marker-icon marker-${incident.type}" style="background-color: ${typeColors[incident.type] || typeColors.casualties}">
                         ${getIncidentIcon(incident.type)}
                       </div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15],
                popupAnchor: [0, -15]
            });

            const marker = L.marker([incident.location.coordinates[1], incident.location.coordinates[0]], {
                icon: icon
            });

            // Prepare translatable content for popup
            const dateText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.date') || 'Date' : 'Date';
            const locationText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.location') || 'Location' : 'Location';
            const typeText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.type') || 'Type' : 'Type';
            const detailedDocText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.detailedDocumentation') || 'Detailed Documentation' : 'Detailed Documentation';
            const viewDetailsText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.buttons.viewDetails') || 'View Full Details' : 'View Full Details';

            // Format date using TranslationSystem if available
            const formattedDate = window.TranslationSystem && typeof window.TranslationSystem.formatDate === 'function' ?
                window.TranslationSystem.formatDate(incident.date) : formatDate(incident.date);

            const popupContent = `
                <div class="map-popup">
                    <h3>${escapeHtml(incident.title)}</h3>
                    <p><strong>${dateText}:</strong> ${formattedDate}</p>
                    <p><strong>${locationText}:</strong> ${escapeHtml(incident.location.name)}</p>
                    <p><strong>${typeText}:</strong> ${capitalizeFirst(incident.type)}</p>
                    <p class="popup-description">${truncateText(escapeHtml(incident.description), 100)}</p>
                    ${incident.casualties_details && incident.casualties_details.length > 0 ? 
                        `<p><strong>${detailedDocText}: ${incident.casualties_details.length} cases</strong></p>` : ''}
                    <button onclick="showIncidentModal(incidents.find(i => i.id === '${incident.id}'))" class="popup-details-btn">
                        ${viewDetailsText}
                    </button>
                </div>
            `;

            marker.bindPopup(popupContent, {
                maxWidth: 300,
                className: 'custom-popup'
            });

            marker.on('click', () => {
                showIncidentModal(incident);
            });

            markers.addLayer(marker);
            window.incidentMarkers.push(marker);
        });

        map.addLayer(markers);
    } catch (error) {
        console.error('Error adding incidents to map:', error);
    }
}

// Switch between views - only for major incidents page
function switchView(view) {
    if (!isMajorIncidentsPage) {
        console.log('switchView called but not on major incidents page');
        return;
    }

    console.log('Switching to view:', view);
    currentView = view;

    // Update navigation buttons
    elements.navBtns.forEach(btn => {
        if (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-view') === view);
        }
    });

    // Update view sections
    elements.viewSections.forEach(section => {
        if (section) {
            section.classList.toggle('active', section.id === `${view}View`);
        }
    });

    // Show/hide controls
    const showControls = ['map', 'timeline', 'list'].includes(view);
    const controlsEl = document.getElementById('controls');
    if (controlsEl) {
        controlsEl.style.display = showControls ? 'block' : 'none';
    }

    // Initialize specific view
    switch (view) {
        case 'map':
            if (map) {
                setTimeout(() => {
                    map.invalidateSize();
                    addIncidentsToMap();
                }, 100);
            }
            break;
        case 'timeline':
            setTimeout(() => {
                console.log('Initializing timeline with incidents:', filteredIncidents.length);

                if (window.timelineManager && typeof window.timelineManager.init === 'function') {
                    window.timelineManager.init(filteredIncidents);
                } else if (window.initializeTimeline && typeof window.initializeTimeline === 'function') {
                    window.initializeTimeline();
                } else {
                    console.error('Timeline manager not available');
                    const container = document.getElementById('timeline-embed');
                    if (container) {
                        // Translate error message if possible
                        let loadingMessage = 'Timeline Loading...';
                        let waitMessage = 'Please wait while the timeline loads.';
                        let dataAvailableMessage = 'Data available';
                        let reloadPageMessage = '🔄 Reload Page';

                        if (window.TranslationSystem) {
                            loadingMessage = window.TranslationSystem.getTranslation('common.timeline.loading') || loadingMessage;
                            waitMessage = window.TranslationSystem.getTranslation('common.timeline.pleaseWait') || waitMessage;
                            dataAvailableMessage = window.TranslationSystem.getTranslation('common.timeline.dataAvailable') || dataAvailableMessage;
                            reloadPageMessage = window.TranslationSystem.getTranslation('common.buttons.reloadPage') || reloadPageMessage;
                        }

                        container.innerHTML = `
                            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                                <h3>${loadingMessage}</h3>
                                <p>${waitMessage}</p>
                                <p>${dataAvailableMessage}: ${filteredIncidents.length} incidents</p>
                                <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: var(--accent-color); color: white; border: none; border-radius: 6px; cursor: pointer;">
                                    ${reloadPageMessage}
                                </button>
                            </div>
                        `;
                    }
                }
            }, 100);
            break;
        case 'list':
            renderIncidentList();
            break;
    }
}

// Helper function to get icon for incident type
function getIncidentIcon(type) {
    const icons = {
        hunger: '🍽️',
        water: '💧',
        aid: '🚛',
        casualties: '⚠️',
        infrastructure: '🏗️'
    };
    return icons[type] || '📍';
}

// Updated incident card creator with translation support
function createIncidentCard(incident) {
    // Use new function with translation support
    return createTranslatableIncidentCard(incident);
}

// Translatable incident card creation
function createTranslatableIncidentCard(incident) {
    const card = document.createElement('div');
    card.className = 'incident-card';
    card.addEventListener('click', () => showIncidentModal(incident));

    const casualties = incident.casualties || {};
    let casualtyText = '';
    let detailedCasualtyInfo = '';

    // Calculate total affected and casualties
    if (casualties.affected) {
        const affected = window.TranslationSystem ?
            `${formatNumber(casualties.affected)} ${window.TranslationSystem.getTranslation('common.incident.affected') || 'affected'}` :
            `${casualties.affected} affected`;
        casualtyText = affected;
    }
    if (casualties.critical) {
        const critical = window.TranslationSystem ?
            `${formatNumber(casualties.critical)} ${window.TranslationSystem.getTranslation('common.incident.critical') || 'critical'}` :
            `${casualties.critical} critical`;
        casualtyText += casualtyText ? `, ${critical}` : critical;
    }
    if (casualties.hospitalized) {
        const hospitalized = window.TranslationSystem ?
            `${formatNumber(casualties.hospitalized)} ${window.TranslationSystem.getTranslation('common.incident.hospitalized') || 'hospitalized'}` :
            `${casualties.hospitalized} hospitalized`;
        casualtyText += casualtyText ? `, ${hospitalized}` : hospitalized;
    }
    if (casualties.deaths) {
        const deaths = window.TranslationSystem ?
            `${formatNumber(casualties.deaths)} ${window.TranslationSystem.getTranslation('common.incident.deaths') || 'deaths'}` :
            `${casualties.deaths} deaths`;
        casualtyText += casualtyText ? `, ${deaths}` : deaths;
    }

    // Show detailed casualties with names when available
    if (incident.casualties_details && incident.casualties_details.length > 0) {
        const detailedCount = incident.casualties_details.length;
        const namesWithPhotos = incident.casualties_details.filter(d =>
            d.public_identifiers?.published_name && d.public_identifiers?.published_image
        );

        // Get translation for "documented cases"
        let documentedCasesText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation(detailedCount > 1 ? 'common.incident.documentedCasesPlural' : 'common.incident.documentedCasesSingular') ||
            `documented case${detailedCount > 1 ? 's' : ''}` :
            `documented case${detailedCount > 1 ? 's' : ''}`;

        casualtyText += `${casualtyText ? ' | ' : ''}${formatNumber(detailedCount)} ${documentedCasesText}`;

        if (namesWithPhotos.length > 0) {
            // Get translation for "Documented victims"
            const documentedVictimsText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.documentedVictims') || 'Documented victims:' :
                'Documented victims:';

            // Get translation for "Name protected"
            const nameProtectedText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.nameProtected') || 'Name protected' :
                'Name protected';

            // Get translation for "and X more"
            const andMoreText = window.TranslationSystem && incident.casualties_details.length > 3 ?
                window.TranslationSystem.getTranslation('common.incident.andMoreVictims')?.replace('${count}', incident.casualties_details.length - 3) ||
                ` and ${incident.casualties_details.length - 3} more` :
                ` and ${incident.casualties_details.length - 3} more`;

            detailedCasualtyInfo = `
                <div class="casualty-preview">
                    <strong>${documentedVictimsText}</strong>
                    ${incident.casualties_details.slice(0, 3).map(detail => 
                        detail.public_identifiers?.published_name ? 
                            `<span class="victim-name">${escapeHtml(detail.name)}, ${detail.age}</span>` : 
                            `<span class="victim-name">${nameProtectedText}, ${detail.age}</span>`
                    ).join(', ')}
                    ${incident.casualties_details.length > 3 ? andMoreText : ''}
                </div>
            `;
        }
    }

    // If no casualties information available
    if (!casualtyText) {
        casualtyText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.incident.impactAssessing') || 'Impact being assessed' :
            'Impact being assessed';
    }

    // Get translation for "Detailed Documentation"
    const detailedDocText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.detailedDocumentation') || '📋 Detailed Documentation' :
        '📋 Detailed Documentation';

    // Get translations for verification status
    const verifiedText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.verified') || '✓ Verified' :
        '✓ Verified';

    const pendingText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.pending') || '⏳ Pending' :
        '⏳ Pending';

    // Format date using TranslationSystem if available
    const formattedDate = window.TranslationSystem && typeof window.TranslationSystem.formatDate === 'function' ?
        window.TranslationSystem.formatDate(incident.date) : formatDate(incident.date);

    card.innerHTML = `
        <div class="incident-header">
            <div>
                <div class="incident-title">${escapeHtml(incident.title)}</div>
                <div class="incident-meta">
                    ${formattedDate} ${incident.time ? `at ${incident.time}` : ''}
                </div>
                <div class="incident-meta">
                    📍 ${escapeHtml(incident.location.name)}
                </div>
            </div>
            <span class="incident-type" style="background-color: ${typeColors[incident.type] || typeColors.casualties}">
                ${capitalizeFirst(incident.type)}
            </span>
        </div>
        <div class="incident-description">
            ${truncateText(escapeHtml(incident.description), 150)}
            ${detailedCasualtyInfo}
        </div>
        <div class="incident-footer">
            <div class="incident-stats">
                <span class="casualties">
                    ${incident.type === 'casualties' ? '⚠️' : '👥'} ${casualtyText}
                </span>
                ${incident.casualties_details && incident.casualties_details.length > 0 ? 
                    `<span class="detailed-badge">${detailedDocText}</span>` : ''}
            </div>
            <span class="verification-badge ${incident.verified}">
                ${incident.verified === 'verified' ? verifiedText : pendingText}
            </span>
        </div>
    `;

    return card;
}

// Enhanced modal display with proper image handling and translations
function showIncidentModal(incident) {
    if (!incident || !elements.modal) {
        console.error('No incident data provided to modal or modal not available');
        return;
    }

    // Check if modal elements exist
    const modalTitle = document.getElementById('modalTitle');
    const modalDate = document.getElementById('modalDate');
    const modalTime = document.getElementById('modalTime');
    const modalLocation = document.getElementById('modalLocation');
    const modalType = document.getElementById('modalType');
    const modalDescription = document.getElementById('modalDescription');

    if (modalTitle) modalTitle.textContent = incident.title;

    // Format date using TranslationSystem if available
    if (modalDate) {
        modalDate.textContent = window.TranslationSystem && typeof window.TranslationSystem.formatDate === 'function' ?
            window.TranslationSystem.formatDate(incident.date) : formatDate(incident.date);
    }

    if (modalTime) modalTime.textContent = incident.time ||
        (window.TranslationSystem ? window.TranslationSystem.getTranslation('common.incident.unknownTime') || 'Unknown' : 'Unknown');

    if (modalLocation) modalLocation.textContent = incident.location.name;
    if (modalType) modalType.textContent = capitalizeFirst(incident.type);
    if (modalDescription) modalDescription.textContent = incident.description;

    // Enhanced Casualties section with translations
    const casualties = incident.casualties;
    const modalCasualtiesSection = document.getElementById('modalCasualtiesSection');
    const modalCasualties = document.getElementById('modalCasualties');

    if (modalCasualtiesSection && modalCasualties) {
        if (casualties || (incident.casualties_details && incident.casualties_details.length > 0)) {
            let casualtyContent = '';

            // Get translations for casualties section
            const overallImpactText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.overallImpact') || '📊 Overall Impact Summary:' :
                '📊 Overall Impact Summary:';

            const deathsText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.stats.deaths') || 'Deaths' :
                'Deaths';

            const injuredText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.stats.injured') || 'Injured' :
                'Injured';

            const affectedText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.totalAffected') || 'Total Affected' :
                'Total Affected';

            const criticalText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.critical') || 'Critical Condition' :
                'Critical Condition';

            const hospitalizedText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.hospitalized') || 'Hospitalized' :
                'Hospitalized';

            // Aggregate casualties summary
            if (casualties && Object.keys(casualties).length > 0) {
                casualtyContent += `
                    <div class="aggregate-casualties">
                        <h5>${overallImpactText}</h5>
                        <div class="casualty-stats">
                            ${casualties.deaths ? `<div class="stat-item deaths">💀 ${formatNumber(casualties.deaths)} ${deathsText}</div>` : ''}
                            ${casualties.injured ? `<div class="stat-item injured">🏥 ${formatNumber(casualties.injured)} ${injuredText}</div>` : ''}
                            ${casualties.affected ? `<div class="stat-item affected">👥 ${formatNumber(casualties.affected)} ${affectedText}</div>` : ''}
                            ${casualties.critical ? `<div class="stat-item critical">⚠️ ${formatNumber(casualties.critical)} ${criticalText}</div>` : ''}
                            ${casualties.hospitalized ? `<div class="stat-item hospitalized">🏥 ${formatNumber(casualties.hospitalized)} ${hospitalizedText}</div>` : ''}
                        </div>
                    </div>
                `;
            }

            // Get translation for individual documentation
            const individualDocText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.incident.individualDocumentation')?.replace('${count}', incident.casualties_details?.length || 0) ||
                `📋 Individual Documentation (${incident.casualties_details?.length || 0} cases):` :
                `📋 Individual Documentation (${incident.casualties_details?.length || 0} cases):`;

            // Enhanced detailed casualties
            if (incident.casualties_details && incident.casualties_details.length > 0) {
                casualtyContent += `
                    <div class="detailed-casualties">
                        <h5>${individualDocText}</h5>
                        <div class="casualties-grid">
                            ${incident.casualties_details.map(detail => createCasualtyCard(detail, incident)).join('')}
                        </div>
                    </div>
                `;
            }

            modalCasualties.innerHTML = casualtyContent;
            modalCasualtiesSection.style.display = 'block';
        } else {
            modalCasualtiesSection.style.display = 'none';
        }
    }

    // Enhanced Evidence section
    displayEvidenceSection(incident);

    // Sources section
    displaySourcesSection(incident);

    // Verification status
    displayVerificationStatus(incident);

    // Show modal
    elements.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Enhanced casualty card with proper photo matching and display and translation support
function createCasualtyCard(detail, incident) {
    // Better photo matching logic
    let photo = null;
    if (detail.public_identifiers?.published_image && incident.evidence) {
        photo = incident.evidence.find(e => {
            if (e.type !== 'image') return false;

            // Check if description contains the name
            if (e.description && detail.name) {
                const descLower = e.description.toLowerCase();
                const nameLower = detail.name.toLowerCase();
                if (descLower.includes(nameLower) || nameLower.includes(descLower)) {
                    return true;
                }
            }

            // Check if URL/filename contains the name
            if (e.url && detail.name) {
                const urlLower = e.url.toLowerCase();
                const nameForUrl = detail.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                if (urlLower.includes(nameForUrl) || urlLower.includes(detail.name.toLowerCase().replace(/\s+/g, ''))) {
                    return true;
                }
            }

            return false;
        });

        // If no specific match found, use first image if available
        if (!photo && incident.evidence.filter(e => e.type === 'image').length > 0) {
            const imageIndex = incident.casualties_details.indexOf(detail);
            const images = incident.evidence.filter(e => e.type === 'image');
            if (images[imageIndex]) {
                photo = images[imageIndex];
            }
        }
    }

    // Get translations for casualty card
    const photoUnavailableText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.photoUnavailable') || '📷 Photo unavailable' :
        '📷 Photo unavailable';

    const loadingText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.loading') || '📷 Loading...' :
        '📷 Loading...';

    const photoProtectedText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.photoProtected') || '🔒 Photo protected' :
        '🔒 Photo protected';

    const nameProtectedText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.nameProtectedPrivacy') || '👤 Name Protected for Privacy' :
        '👤 Name Protected for Privacy';

    const ageText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.age') || 'Age' :
        'Age';

    const dateText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.date') || '📅 Date' :
        '📅 Date';

    const causeText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.cause') || '💔 Cause' :
        '💔 Cause';

    const locationText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.location') || '📍 Location' :
        '📍 Location';

    const medicalFacilityText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.medicalFacility') || '🏥 Medical Facility' :
        '🏥 Medical Facility';

    const referenceText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.reference') || '🆔 Reference' :
        '🆔 Reference';

    const sourcesText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.sources') || '📰 Sources' :
        '📰 Sources';

    const privacyNotesText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.privacyNotes') || '🔒 Privacy & Documentation Notes' :
        '🔒 Privacy & Documentation Notes';

    const privacyStatusText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.privacyStatus') || 'Privacy Status' :
        'Privacy Status';

    const documentationPurposeText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.documentationPurpose') || 'Documentation Purpose' :
        'Documentation Purpose';

    // Format date using TranslationSystem if available
    const formattedDate = window.TranslationSystem && typeof window.TranslationSystem.formatDate === 'function' ?
        window.TranslationSystem.formatDate(detail.date) : formatDate(detail.date);

    return `
        <div class="casualty-card ${detail.condition?.toLowerCase() === 'deceased' ? 'deceased' : 'injured'}">
            ${detail.ethical_notes?.content_warning ? `
                <div class="content-warning-banner">
                    ⚠️ ${escapeHtml(detail.ethical_notes.content_warning)}
                </div>
            ` : ''}
            
            <div class="casualty-header">
                ${photo && detail.public_identifiers?.published_image ? `
                    <div class="casualty-photo">
                        <img src="${escapeHtml(photo.url)}" 
                             alt="Photo of ${escapeHtml(detail.name)}" 
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" 
                             loading="lazy">
                        <div class="photo-placeholder" style="display: none;">${photoUnavailableText}</div>
                    </div>
                ` : `
                    <div class="casualty-photo">
                        <div class="photo-placeholder">
                            ${detail.public_identifiers?.published_image ? loadingText : photoProtectedText}
                        </div>
                    </div>
                `}
                <div class="casualty-basic-info">
                    <h6 class="casualty-name">
                        ${detail.public_identifiers?.published_name ? 
                            `👤 ${escapeHtml(detail.name)}` : 
                            nameProtectedText}
                    </h6>
                    <div class="casualty-age-status">
                        <span class="age">${ageText}: ${detail.age}</span>
                        <span class="status ${detail.condition?.toLowerCase() || 'unknown'}">${escapeHtml(detail.condition || 'Unknown')}</span>
                    </div>
                </div>
            </div>

            <div class="casualty-details">
                <div class="detail-row">
                    <strong>${dateText}:</strong> ${formattedDate}
                </div>
                <div class="detail-row">
                    <strong>${causeText}:</strong> ${escapeHtml(detail.cause)}
                </div>
                <div class="detail-row">
                    <strong>${locationText}:</strong> ${escapeHtml(detail.location_details)}
                </div>
                <div class="detail-row">
                    <strong>${medicalFacilityText}:</strong> ${escapeHtml(detail.medical_facility)}
                </div>
                <div class="detail-row">
                    <strong>${referenceText}:</strong> <code>${escapeHtml(detail.reference_id)}</code>
                </div>
            </div>

            <div class="casualty-sources">
                <strong>${sourcesText}:</strong>
                <ul class="sources-list">
                    ${detail.sources.map(source => `<li>${escapeHtml(source)}</li>`).join('')}
                </ul>
            </div>

            ${detail.ethical_notes ? `
                <div class="ethical-notes">
                    <details>
                        <summary>${privacyNotesText}</summary>
                        <div class="ethical-details">
                            <p><strong>${privacyStatusText}:</strong> ${escapeHtml(detail.ethical_notes.privacy_status)}</p>
                            <p><strong>${documentationPurposeText}:</strong> ${escapeHtml(detail.ethical_notes.documentation_purpose)}</p>
                        </div>
                    </details>
                </div>
            ` : ''}
        </div>
    `;
}

// Close modal function
function closeModal() {
    if (elements.modal) {
        elements.modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Enhanced evidence display with translation support
function displayEvidenceSection(incident) {
    const evidenceContainer = document.getElementById('modalEvidence');
    const evidenceSection = document.getElementById('modalEvidenceSection');

    if (!evidenceContainer || !evidenceSection) return;

    if (incident.evidence && incident.evidence.length > 0) {
        const images = incident.evidence.filter(e => e.type === 'image');
        const otherEvidence = incident.evidence.filter(e => e.type !== 'image');

        // Get translations for evidence section
        const photosText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.incident.photographic') || '📸 Photographic Evidence:' :
            '📸 Photographic Evidence:';

        const additionalEvidenceText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.incident.additionalEvidence') || '📋 Additional Evidence:' :
            '📋 Additional Evidence:';

        const imagesTabText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.incident.imagesTab') || 'Images' :
            'Images';

        const documentsTabText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.incident.documentsTab') || 'Documents' :
            'Documents';

        const externalSourceText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.incident.externalSource') || '🌐 External' :
            '🌐 External';

        const localSourceText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.incident.localSource') || '📁 Local' :
            '📁 Local';

        const viewEvidenceText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.incident.viewEvidence') || 'View Evidence' :
            'View Evidence';

        let evidenceHTML = '';

        // Display images
        if (images.length > 0) {
            evidenceHTML += `
                <div class="evidence-images">
                    <h6>${photosText}</h6>
                    <div class="image-gallery">
                        ${images.map((evidence, index) => {
                            const imgName = evidence.original ? 
                                evidence.original.replace(/\.[^/.]+$/, "").replace(/-/g, ' ').replace(/_/g, ' ').split('/').pop() :
                                evidence.description || 'Evidence Image';
                                
                            const sourceLabel = evidence.type === 'remote' ? externalSourceText : localSourceText;

                            return `
                                <div class="evidence-image-container">
                                    <img src="${escapeHtml(evidence.url)}" 
                                         alt="${escapeHtml(evidence.description || 'Evidence image')}" 
                                         loading="lazy"
                                         onclick="openImageModal('${escapeHtml(evidence.url)}', '${escapeHtml(evidence.description || 'Evidence image')}')"
                                         onerror="this.parentElement.innerHTML='<div class=\\'broken-image\\'>📷 Image unavailable: ${escapeHtml(evidence.description || evidence.url)}</div>'">
                                    ${evidence.description ? `<div class="image-caption">${escapeHtml(evidence.description)}</div>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        // Display other evidence
        if (otherEvidence.length > 0) {
            evidenceHTML += `
                <div class="other-evidence">
                    <h6>${additionalEvidenceText}</h6>
                    ${otherEvidence.map(evidence => `
                        <div class="evidence-item">
                            <a href="${escapeHtml(evidence.url)}" target="_blank" rel="noopener">
                                ${evidence.type === 'video' ? '📹' : '📄'} 
                                ${escapeHtml(evidence.description || viewEvidenceText)}
                            </a>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        evidenceContainer.innerHTML = evidenceHTML;
        evidenceSection.style.display = 'block';
    } else {
        evidenceSection.style.display = 'none';
    }
}

// Helper function to open image in modal with translation support
function openImageModal(imageUrl, description) {
    const overlay = document.createElement('div');
    overlay.className = 'image-modal-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        cursor: pointer;
    `;

    // Get translation for close button
    const closeText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.buttons.close') || '×' :
        '×';

    overlay.innerHTML = `
        <div class="image-modal-content" style="max-width: 90%; max-height: 90%; position: relative;">
            <img src="${imageUrl}" alt="${description}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
            <div class="image-modal-caption" style="position: absolute; bottom: -40px; left: 0; right: 0; color: white; text-align: center; padding: 10px;">
                ${description}
            </div>
            <button class="image-modal-close" style="position: absolute; top: -40px; right: 0; background: none; border: none; color: white; font-size: 2rem; cursor: pointer;">${closeText}</button>
        </div>
    `;

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('image-modal-close')) {
            document.body.removeChild(overlay);
            document.body.style.overflow = 'auto';
        }
    });

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
}

// Sources display with translation support
function displaySourcesSection(incident) {
    const sourcesContainer = document.getElementById('modalSources');
    if (!sourcesContainer) return;

    if (incident.sources && incident.sources.length > 0) {
        sourcesContainer.innerHTML = incident.sources.map(source =>
            source.startsWith('http') ?
                `<a href="${escapeHtml(source)}" target="_blank" rel="noopener">🔗 ${escapeHtml(source)}</a>` :
                `<p>📰 ${escapeHtml(source)}</p>`
        ).join('');
    } else {
        // Get translation for "No sources available"
        const noSourcesText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.incident.noSources') || 'No sources available' :
            'No sources available';

        sourcesContainer.innerHTML = `<p>${noSourcesText}</p>`;
    }
}

// Verification display with translation support
function displayVerificationStatus(incident) {
    const verificationEl = document.getElementById('modalVerification');
    if (!verificationEl) return;

    // Get translations for verification statuses
    const verifiedText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.verifiedMultiple') || '✅ This incident has been verified through multiple sources' :
        '✅ This incident has been verified through multiple sources';

    const pendingText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.incident.pendingVerification') || '⏳ This incident is pending verification' :
        '⏳ This incident is pending verification';

    verificationEl.className = `verification-badge ${incident.verified}`;
    verificationEl.textContent = incident.verified === 'verified' ? verifiedText : pendingText;
}

// Apply filters
function applyFilters() {
    const searchTerm = elements.searchInput?.value.toLowerCase() || '';
    const typeFilter = elements.typeFilter?.value || '';
    const dateFilter = elements.dateFilter?.value || '';

    filteredIncidents = incidents.filter(incident => {
        const matchesSearch = !searchTerm ||
            incident.title.toLowerCase().includes(searchTerm) ||
            incident.description.toLowerCase().includes(searchTerm) ||
            incident.location.name.toLowerCase().includes(searchTerm) ||
            (incident.casualties_details && incident.casualties_details.some(detail =>
                detail.public_identifiers?.published_name && detail.name.toLowerCase().includes(searchTerm)
            ));

        const matchesType = !typeFilter || incident.type === typeFilter;
        const matchesDate = !dateFilter || filterByDate(incident.date, dateFilter);

        return matchesSearch && matchesType && matchesDate;
    });

    // Update global reference - CRITICAL for timeline
    window.filteredIncidents = filteredIncidents;

    updateStats();

    // Only update views if we're on the major incidents page
    if (isMajorIncidentsPage) {
        switch (currentView) {
            case 'map':
                if (map) addIncidentsToMap();
                break;
            case 'list':
                renderIncidentList();
                break;
            case 'timeline':
                if (window.timelineManager && typeof window.timelineManager.update === 'function') {
                    console.log('Updating timeline with filtered incidents:', filteredIncidents.length);
                    window.timelineManager.update(filteredIncidents);
                }
                break;
        }
    }
}

// Filter by date range
function filterByDate(incidentDate, filter) {
    const date = new Date(incidentDate);
    const now = new Date();

    switch (filter) {
        case 'today':
            return date.toDateString() === now.toDateString();
        case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return date >= weekAgo;
        case 'month':
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            return date >= monthAgo;
        case 'quarter':
            const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            return date >= quarterAgo;
        default:
            return true;
    }
}

// Clear all filters
function clearFilters() {
    if (elements.searchInput) elements.searchInput.value = '';
    if (elements.typeFilter) elements.typeFilter.value = '';
    if (elements.dateFilter) elements.dateFilter.value = '';
    applyFilters();
}

// Update statistics with translation support
function updateStats() {
    const count = filteredIncidents.length;
    if (elements.incidentCount) {
        // Get translation for "incidents documented" with proper pluralization
        const incidentsText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation(count !== 1 ? 'common.stats.incidentsPlural' : 'common.stats.incidentsSingular') ||
            `incident${count !== 1 ? 's' : ''} documented` :
            `incident${count !== 1 ? 's' : ''} documented`;

        elements.incidentCount.textContent = `${count} ${incidentsText}`;
    }

    if (elements.lastUpdated && lastUpdated) {
        // Get translation for "Last updated"
        const lastUpdatedText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.stats.lastUpdated') || 'Last updated:' :
            'Last updated:';

        // Format date using TranslationSystem if available
        const formattedDate = window.TranslationSystem && typeof window.TranslationSystem.formatDate === 'function' ?
            window.TranslationSystem.formatDate(lastUpdated) : formatDate(lastUpdated);

        elements.lastUpdated.textContent = `${lastUpdatedText} ${formattedDate}`;
    }
}

// Render incident list with translation support
function renderIncidentList() {
    if (!elements.incidentGrid || !isMajorIncidentsPage) return;

    elements.incidentGrid.innerHTML = '';

    if (filteredIncidents.length === 0) {
        if (elements.noResults) {
            // Get translation for "No results found"
            const noResultsText = window.TranslationSystem ?
                window.TranslationSystem.getTranslation('common.filters.noResults') ||
                'No results found. Please try different filters.' :
                'No results found. Please try different filters.';

            elements.noResults.innerHTML = `<p>${noResultsText}</p>`;
            elements.noResults.style.display = 'block';
        }
        return;
    }

    if (elements.noResults) {
        elements.noResults.style.display = 'none';
    }

    filteredIncidents.forEach(incident => {
        const card = createTranslatableIncidentCard(incident);
        elements.incidentGrid.appendChild(card);
    });

    // Apply translations to newly created elements
    if (window.TranslationSystem) {
        window.TranslationSystem.updatePageLanguage();
    }
}

// Utility functions
function debounce(func, wait) {
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateText(text, length) {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Updated formatDate with translation support
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (isNaN(date)) return 'Invalid date';

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

// Format numbers with translation support
function formatNumber(value) {
    if (value === null || value === undefined) return 'N/A';

    const num = parseInt(value);
    if (isNaN(num)) return 'N/A';

    // Use TranslationSystem's number formatter if available
    if (window.TranslationSystem && typeof window.TranslationSystem.formatNumber === 'function') {
        return window.TranslationSystem.formatNumber(num);
    }

    // Fallback formatting
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    } else {
        return num.toLocaleString();
    }
}

function showError(message) {
    console.error(message);

    // Get translation for "Reload"
    const reloadText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.buttons.reload') || '×' :
        '×';

    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--danger-color, #dc3545);
        color: white;
        padding: 1rem;
        border-radius: 6px;
        box-shadow: var(--shadow-lg, 0 4px 6px rgba(0,0,0,0.1));
        z-index: 9999;
        max-width: 400px;
    `;

    // Get translation for close button
    const closeText = window.TranslationSystem ?
        window.TranslationSystem.getTranslation('common.buttons.close') || '×' :
        '×';

    errorDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer; margin-left: 1rem;">
                ${closeText}
            </button>
        </div>
    `;

    document.body.appendChild(errorDiv);

    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 5000);
}

// Clear all filters function for global access
function clearAllFilters() {
    clearFilters();
}

// Update the lastUpdated timestamp
function updateLastUpdated(timestamp) {
    lastUpdated = timestamp || '2025-10-12 08:33:31';
    currentUser = 'aliattia02';

    if (elements.lastUpdated) {
        // Get translation for "Last updated"
        const lastUpdatedText = window.TranslationSystem ?
            window.TranslationSystem.getTranslation('common.stats.lastUpdated') || 'Last updated:' :
            'Last updated:';

        // Format date using TranslationSystem if available
        const formattedDate = window.TranslationSystem && typeof window.TranslationSystem.formatDate === 'function' ?
            window.TranslationSystem.formatDate(lastUpdated) : formatDate(lastUpdated);

        elements.lastUpdated.textContent = `${lastUpdatedText} ${formattedDate}`;
    }
}

// Export functions and data for global access and timeline integration
window.incidents = incidents;
window.filteredIncidents = filteredIncidents;
window.showIncidentModal = showIncidentModal;
window.clearAllFilters = clearAllFilters;
window.applyFilters = applyFilters;
window.openImageModal = openImageModal;
window.formatDate = formatDate;
window.formatNumber = formatNumber;
window.updateLastUpdated = updateLastUpdated;

// Full platform export with multilingual support
window.GazaDocsPlatform = {
    incidents,
    filteredIncidents,
    formatDate,
    formatNumber,
    escapeHtml,
    capitalizeFirst,
    typeColors,
    currentUser,
    lastUpdated,

    // Add references to translation functions for external components
    getTranslation: function(key) {
        return window.TranslationSystem ?
            window.TranslationSystem.getTranslation(key) :
            null;
    },

    translateElement: function(element, key) {
        if (window.TranslationSystem) {
            window.TranslationSystem.translateElement(element, key);
        }
    },

    applyTranslations: function() {
        if (window.TranslationSystem) {
            window.TranslationSystem.updatePageLanguage();
        }
    }
};

console.log('✅ Gaza Crisis Documentation Platform main.js initialized with multilingual support - 2025-10-12 08:33:31');
