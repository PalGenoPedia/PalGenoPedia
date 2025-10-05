// Dual Timeline Manager for Gaza Crisis Documentation
// Handles both Historical Massacres (1948-2023) and Current Genocide (2023-Present)
// Author: aliattia02
// Last Updated: 2025-10-05

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
            urban_destruction: '#a9a9a9'
        };
    }

    // Initialize the dual timeline system
    async init() {
        console.log('🚀 Initializing Dual Timeline Manager...');
        
        try {
            // Show loading state
            this.showLoading('Initializing timeline system...');
            
            // Load configuration first
            await this.loadConfiguration();
            
            // Load sources metadata
            await this.loadSources();
            
            // Load both historical and current data
            await Promise.all([
                this.loadHistoricalData(),
                this.loadCurrentData()
            ]);
            
            // Combine data
            this.combineData();
            
            // Initialize UI
            this.initializeUI();
            
            // Set default mode (historical)
            this.switchMode('historical');
            
            // Initialize map if on map view
            if (document.getElementById('map')) {
                this.initializeMap();
            }
            
            console.log('✅ Dual Timeline Manager initialized successfully');
            
        } catch (error) {
            console.error('❌ Error initializing Dual Timeline Manager:', error);
            this.showError('Failed to initialize timeline. Please refresh the page.');
        }
    }

    // Load configuration from JSON
    async loadConfiguration() {
        try {
            console.log('📋 Loading timeline configuration...');
            const response = await fetch('timeline-data/timeline-config.json');
            
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

    // Load sources metadata
    async loadSources() {
        try {
            console.log('📰 Loading sources metadata...');
            const response = await fetch('timeline-data/timeline-sources.json');
            
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
    async loadHistoricalData() {
        try {
            console.log('📜 Loading historical massacres data...');
            this.showLoading('Loading historical data (1948-2023)...');
            
            const response = await fetch('timeline-data/historical-massacres.json');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.historicalData = data.massacres || [];
            
            console.log(`✅ Loaded ${this.historicalData.length} historical events`);
            
        } catch (error) {
            console.error('❌ Error loading historical data:', error);
            this.historicalData = [];
            throw error;
        }
    }

    // Load current genocide data
    async loadCurrentData() {
        try {
            console.log('🚨 Loading current genocide data...');
            this.showLoading('Loading current genocide data (2023-present)...');
            
            const response = await fetch('timeline-data/civilian-casualties-current.json');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.currentData = data.incidents || [];
            
            console.log(`✅ Loaded ${this.currentData.length} current genocide events`);
            
        } catch (error) {
            console.error('❌ Error loading current data:', error);
            this.currentData = [];
            throw error;
        }
    }

    // Combine historical and current data
    combineData() {
        this.combinedData = [
            ...this.historicalData.map(item => ({ ...item, period: 'historical' })),
            ...this.currentData.map(item => ({ ...item, period: 'current' }))
        ].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        console.log(`📊 Combined ${this.combinedData.length} total events`);
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
        
        // View switcher
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.switchView(view);
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
        switch (mode) {
            case 'historical':
                data = this.historicalData;
                break;
            case 'current':
                data = this.currentData;
                break;
            case 'both':
                data = this.combinedData;
                // Show comparison section
                document.getElementById('periodComparison').style.display = 'block';
                this.updateComparison();
                break;
            default:
                data = this.historicalData;
        }
        
        // Hide comparison if not in 'both' mode
        if (mode !== 'both') {
            document.getElementById('periodComparison').style.display = 'none';
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
                item.location?.name?.toLowerCase().includes(searchTerm) ||
                item.brief_summary?.toLowerCase().includes(searchTerm)
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
        document.getElementById('dateRangeFilter').value = '';
        document.getElementById('eventTypeFilter').value = '';
        document.getElementById('searchFilter').value = '';
        document.getElementById('verificationFilter').value = '';
        
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
        document.getElementById('totalEvents').textContent = totalEvents.toLocaleString();
        document.getElementById('totalDeaths').textContent = this.formatNumber(totalDeaths);
        document.getElementById('lastUpdate').textContent = '2025-10-05';
        
        // Update dashboard stats
        document.getElementById('massacresCount').textContent = totalEvents.toLocaleString();
        document.getElementById('deathsCount').textContent = this.formatNumber(totalDeaths);
        document.getElementById('injuredCount').textContent = this.formatNumber(totalInjured);
        document.getElementById('displacedCount').textContent = this.formatNumber(totalDisplaced);
        
        // Update mode counts
        document.getElementById('historicalCount').textContent = this.historicalData.length;
        document.getElementById('historicalDeaths').textContent = this.formatNumber(
            this.historicalData.reduce((sum, item) => sum + (item.casualties?.deaths || 0), 0)
        );
        
        document.getElementById('currentCount').textContent = this.currentData.length;
        document.getElementById('currentDeaths').textContent = this.formatNumber(
            this.currentData.reduce((sum, item) => sum + (item.casualties?.deaths || 0), 0)
        );
        
        document.getElementById('bothCount').textContent = this.combinedData.length;
        document.getElementById('bothDeaths').textContent = this.formatNumber(
            this.combinedData.reduce((sum, item) => sum + (item.casualties?.deaths || 0), 0)
        );
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
        
        document.getElementById('compHistEvents').textContent = this.historicalData.length;
        document.getElementById('compHistDeaths').textContent = this.formatNumber(histDeaths);
        document.getElementById('compHistAvg').textContent = histAvgPerYear.toLocaleString();
        
        document.getElementById('genocideDuration').textContent = `${monthsDiff} months`;
        document.getElementById('compCurrEvents').textContent = this.currentData.length;
        document.getElementById('compCurrDeaths').textContent = this.formatNumber(currDeaths);
        document.getElementById('compCurrAvg').textContent = currAvgPerDay.toLocaleString();
    }

    // Render timeline view
    renderTimeline() {
        console.log('📅 Rendering timeline view...');
        
        const container = document.getElementById('timeline-embed');
        if (!container) return;
        
        const data = this.filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (data.length === 0) {
            container.innerHTML = this.getEmptyStateHTML();
            return;
        }
        
        container.innerHTML = `
            <div class="custom-timeline">
                <div class="timeline-header">
                    <h2>${this.getTimelineTitle()}</h2>
                    <p>Chronological documentation of ${data.length} verified events</p>
                </div>
                <div class="timeline-line">
                    ${data.map((item, index) => this.createTimelineItemHTML(item, index)).join('')}
                </div>
            </div>
        `;
        
        this.addCustomTimelineStyles();
        this.attachTimelineEventListeners();
    }

    // Get timeline title based on mode
    getTimelineTitle() {
        switch (this.currentMode) {
            case 'historical':
                return 'Historical Massacres & War Crimes (1948-2023)';
            case 'current':
                return 'Current Genocide Documentation (Oct 2023-Present)';
            case 'both':
                return 'Complete Historical Timeline (1948-Present)';
            default:
                return 'Gaza Crisis Timeline';
        }
    }

    // Create timeline item HTML
    createTimelineItemHTML(item, index) {
        const casualties = item.casualties || {};
        const deaths = casualties.deaths || 0;
        const injured = casualties.injured || 0;
        const displaced = casualties.forced_displacement || 0;
        
        const color = this.eventColors[item.event_type] || '#6c757d';
        const periodBadge = item.period === 'current' ? 
            '<span class="period-badge current">🚨 Current Genocide</span>' : 
            '<span class="period-badge historical">📜 Historical</span>';
        
        return `
            <div class="timeline-item" data-event-id="${item.id}" data-index="${index}">
                <div class="timeline-marker">
                    <div class="timeline-icon" style="background-color: ${color}">
                        ${this.getEventIcon(item.event_type)}
                    </div>
                </div>
                <div class="timeline-content-item ${index % 2 === 0 ? 'left' : 'right'}">
                    <div class="timeline-date">${this.formatDate(item.date)}</div>
                    ${periodBadge}
                    <h3 class="timeline-title">${this.escapeHtml(item.title)}</h3>
                    <div class="timeline-location">📍 ${this.escapeHtml(item.location?.name || 'Unknown')}</div>
                    <div class="timeline-type" style="color: ${color}">
                        🏷️ ${this.capitalizeWords(item.event_type?.replace(/_/g, ' ') || 'Unknown')}
                    </div>
                    <p class="timeline-description">${this.escapeHtml(this.truncate(item.brief_summary, 150))}</p>
                    
                    <div class="timeline-casualties">
                        ${deaths > 0 ? `<span class="casualty-badge deaths">💀 ${deaths.toLocaleString()} deaths</span>` : ''}
                        ${injured > 0 ? `<span class="casualty-badge injured">🏥 ${injured.toLocaleString()} injured</span>` : ''}
                        ${displaced > 0 ? `<span class="casualty-badge displaced">🏠 ${this.formatNumber(displaced)} displaced</span>` : ''}
                    </div>
                    
                    ${item.war_crimes && item.war_crimes.length > 0 ? `
                        <div class="war-crimes-preview">
                            <strong>⚖️ War Crimes:</strong> ${item.war_crimes.slice(0, 3).join(', ')}
                            ${item.war_crimes.length > 3 ? ` (+${item.war_crimes.length - 3} more)` : ''}
                        </div>
                    ` : ''}
                    
                    <div class="timeline-meta">
                        <span class="verification-badge ${item.verification_status}">
                            ${this.getVerificationIcon(item.verification_status)} ${this.capitalizeWords(item.verification_status)}
                        </span>
                        ${item.sources && item.sources.length > 0 ? `
                            <span class="sources-badge">📰 ${item.sources.length} source${item.sources.length > 1 ? 's' : ''}</span>
                        ` : ''}
                    </div>
                    
                    <button class="timeline-details-btn" data-event-id="${item.id}">
                        📖 View Full Documentation →
                    </button>
                </div>
            </div>
        `;
    }

    // Attach event listeners to timeline items
    attachTimelineEventListeners() {
        const timelineItems = document.querySelectorAll('.timeline-item');
        
        timelineItems.forEach(item => {
            // Intersection Observer for animations
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                    }
                });
            }, { threshold: 0.1 });
            
            observer.observe(item);
            
            // Click handler for entire item
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('timeline-details-btn')) {
                    const eventId = item.dataset.eventId;
                    this.showEventModal(eventId);
                }
            });
        });
        
        // Click handlers for detail buttons
        const detailButtons = document.querySelectorAll('.timeline-details-btn');
        detailButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventId = btn.dataset.eventId;
                this.showEventModal(eventId);
            });
        });
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
        document.getElementById('modalTitle').textContent = event.title;
        document.getElementById('modalDate').textContent = this.formatDate(event.date);
        document.getElementById('modalLocation').textContent = event.location?.name || 'Unknown';
        document.getElementById('modalType').textContent = this.capitalizeWords(event.event_type?.replace(/_/g, ' ') || 'Unknown');
        document.getElementById('modalSummary').textContent = event.brief_summary;
        
        // Verification status
        const verificationEl = document.getElementById('modalVerification');
        verificationEl.className = `verification-badge ${event.verification_status}`;
        verificationEl.textContent = `${this.getVerificationIcon(event.verification_status)} ${this.capitalizeWords(event.verification_status)}`;
        
        // Casualties
        const casualties = event.casualties || {};
        const casualtiesHTML = `
            <div class="casualties-grid">
                ${casualties.deaths ? `<div class="casualty-stat"><strong>💀 Deaths:</strong> ${casualties.deaths.toLocaleString()}</div>` : ''}
                ${casualties.injured ? `<div class="casualty-stat"><strong>🏥 Injured:</strong> ${casualties.injured.toLocaleString()}</div>` : ''}
                ${casualties.forced_displacement ? `<div class="casualty-stat"><strong>🏠 Displaced:</strong> ${this.formatNumber(casualties.forced_displacement)}</div>` : ''}
                ${casualties.critical ? `<div class="casualty-stat"><strong>⚠️ Critical:</strong> ${casualties.critical.toLocaleString()}</div>` : ''}
            </div>
        `;
        document.getElementById('modalCasualties').innerHTML = casualtiesHTML;
        
        // War crimes
        if (event.war_crimes && event.war_crimes.length > 0) {
            document.getElementById('modalWarCrimesSection').style.display = 'block';
            const warCrimesHTML = `
                <ul class="war-crimes-list">
                    ${event.war_crimes.map(crime => `<li>⚖️ ${this.escapeHtml(crime)}</li>`).join('')}
                </ul>
            `;
            document.getElementById('modalWarCrimes').innerHTML = warCrimesHTML;
        } else {
            document.getElementById('modalWarCrimesSection').style.display = 'none';
        }
        
        // Sources
        const sourcesHTML = event.sources && event.sources.length > 0 ?
            event.sources.map(source => `
                <div class="source-item">
                    📰 ${this.escapeHtml(source)}
                </div>
            `).join('') :
            '<p>No sources available</p>';
        document.getElementById('modalSources').innerHTML = sourcesHTML;
        
        // Detail page link
        const detailPageLink = document.getElementById('modalDetailPage');
        if (event.detail_page) {
            detailPageLink.href = event.detail_page;
            detailPageLink.style.display = 'inline-block';
        } else {
            detailPageLink.style.display = 'none';
        }
        
        // Show modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
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
            
            const popupContent = `
                <div class="map-popup">
                    <h3>${this.escapeHtml(event.title)}</h3>
                    <p><strong>📅 Date:</strong> ${this.formatDate(event.date)}</p>
                    <p><strong>📍 Location:</strong> ${this.escapeHtml(event.location.name)}</p>
                    <p><strong>💀 Deaths:</strong> ${(event.casualties?.deaths || 0).toLocaleString()}</p>
                    <p class="popup-summary">${this.escapeHtml(this.truncate(event.brief_summary, 100))}</p>
                    <button onclick="window.dualTimeline.showEventModal('${event.id}')" class="popup-details-btn">
                        View Details
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
        
        loading.style.display = 'none';
        
        if (this.filteredData.length === 0) {
            container.innerHTML = '';
            noResults.style.display = 'block';
            return;
        }
        
        noResults.style.display = 'none';
        
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
        
        return `
            <div class="incident-card" data-event-id="${event.id}">
                <div class="incident-header">
                    <div>
                        <div class="incident-title">${this.escapeHtml(event.title)}</div>
                        <div class="incident-meta">
                            📅 ${this.formatDate(event.date)}
                        </div>
                        <div class="incident-meta">
                            📍 ${this.escapeHtml(event.location?.name || 'Unknown')}
                        </div>
                    </div>
                    <span class="incident-type" style="background-color: ${color}">
                        ${this.capitalizeWords(event.event_type?.replace(/_/g, ' ') || 'Unknown')}
                    </span>
                </div>
                <div class="incident-description">
                    ${this.escapeHtml(this.truncate(event.brief_summary, 150))}
                </div>
                <div class="incident-casualties">
                    ${deaths > 0 ? `<div>💀 ${deaths.toLocaleString()} deaths</div>` : ''}
                    ${injured > 0 ? `<div>🏥 ${injured.toLocaleString()} injured</div>` : ''}
                    ${displaced > 0 ? `<div>🏠 ${this.formatNumber(displaced)} displaced</div>` : ''}
                </div>
                <div class="incident-footer">
                    <span class="verification-badge ${event.verification_status}">
                        ${this.getVerificationIcon(event.verification_status)} ${this.capitalizeWords(event.verification_status)}
                    </span>
                    ${event.sources && event.sources.length > 0 ? `
                        <span class="sources-count">📰 ${event.sources.length} sources</span>
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
        
        // Update active button
        const viewButtons = document.querySelectorAll('.view-btn');
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

    // Add custom timeline styles
    addCustomTimelineStyles() {
        if (document.getElementById('dual-timeline-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'dual-timeline-styles';
        styles.textContent = `
            .custom-timeline {
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
            }

            .timeline-header {
                text-align: center;
                margin-bottom: 40px;
            }

            .timeline-header h2 {
                color: var(--text-primary);
                margin-bottom: 10px;
                font-size: 32px;
                font-weight: 700;
            }

            .timeline-header p {
                color: var(--text-secondary);
                font-size: 16px;
            }

            .timeline-line {
                position: relative;
                padding: 20px 0;
            }

            .timeline-line::before {
                content: '';
                position: absolute;
                left: 50%;
                top: 0;
                bottom: 0;
                width: 4px;
                background: linear-gradient(to bottom, var(--accent-color), var(--border-color));
                transform: translateX(-50%);
                border-radius: 2px;
            }

            .timeline-item {
                position: relative;
                margin-bottom: 60px;
                display: flex;
                align-items: flex-start;
                opacity: 0;
                transform: translateY(30px);
                transition: all 0.6s ease;
                cursor: pointer;
            }

            .timeline-item.visible {
                opacity: 1;
                transform: translateY(0);
            }

            .timeline-marker {
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: var(--surface-color);
                border: 4px solid var(--accent-color);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2;
                font-size: 20px;
                box-shadow: var(--shadow-md);
            }

            .timeline-icon {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 18px;
            }

            .timeline-content-item {
                background: var(--surface-color);
                border: 2px solid var(--border-color);
                border-radius: 12px;
                padding: 24px;
                box-shadow: var(--shadow-md);
                max-width: 450px;
                width: 100%;
                transition: all 0.3s ease;
            }

            .timeline-content-item:hover {
                box-shadow: var(--shadow-lg);
                transform: translateY(-3px);
                border-color: var(--accent-color);
            }

            .timeline-content-item.left {
                margin-right: 55%;
            }

            .timeline-content-item.right {
                margin-left: 55%;
            }

            .timeline-date {
                color: var(--accent-color);
                font-size: 14px;
                font-weight: 700;
                margin-bottom: 8px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .period-badge {
                display: inline-block;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 700;
                margin-bottom: 8px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }

            .period-badge.historical {
                background: rgba(108, 117, 125, 0.2);
                color: #6c757d;
                border: 1px solid #6c757d;
            }

            .period-badge.current {
                background: rgba(220, 53, 69, 0.2);
                color: #dc3545;
                border: 1px solid #dc3545;
            }

            .timeline-title {
                color: var(--text-primary);
                margin-bottom: 10px;
                font-size: 22px;
                line-height: 1.3;
                font-weight: 700;
            }

            .timeline-location {
                color: var(--text-secondary);
                font-size: 14px;
                margin-bottom: 6px;
            }

            .timeline-type {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 12px;
            }

            .timeline-description {
                color: var(--text-primary);
                line-height: 1.6;
                margin-bottom: 16px;
                font-size: 15px;
            }

            .timeline-casualties {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 12px;
            }

            .casualty-badge {
                display: inline-block;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
            }

            .casualty-badge.deaths {
                background: rgba(220, 53, 69, 0.1);
                color: #dc3545;
                border: 1px solid #dc3545;
            }

            .casualty-badge.injured {
                background: rgba(255, 193, 7, 0.1);
                color: #ffc107;
                border: 1px solid #ffc107;
            }

            .casualty-badge.displaced {
                background: rgba(111, 66, 193, 0.1);
                color: #6f42c1;
                border: 1px solid #6f42c1;
            }

            .war-crimes-preview {
                background: rgba(220, 53, 69, 0.05);
                border-left: 3px solid #dc3545;
                padding: 10px 12px;
                margin-bottom: 12px;
                font-size: 13px;
                line-height: 1.5;
            }

            .timeline-meta {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
                flex-wrap: wrap;
                gap: 8px;
            }

            .verification-badge {
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
            }

            .verification-badge.verified {
                background: rgba(40, 167, 69, 0.1);
                color: #28a745;
                border: 1px solid #28a745;
            }

            .verification-badge.disputed {
                background: rgba(255, 193, 7, 0.1);
                color: #ffc107;
                border: 1px solid #ffc107;
            }

            .verification-badge.under_investigation {
                background: rgba(23, 162, 184, 0.1);
                color: #17a2b8;
                border: 1px solid #17a2b8;
            }

            .sources-badge {
                font-size: 12px;
                color: var(--text-secondary);
                background: var(--bg-secondary);
                padding: 4px 8px;
                border-radius: 10px;
            }

            .timeline-details-btn {
                background: var(--accent-color);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s ease;
                width: 100%;
                font-family: var(--font-family-base);
            }

            .timeline-details-btn:hover {
                background: var(--accent-color-dark, #c0392b);
                transform: translateY(-2px);
                box-shadow: var(--shadow-sm);
            }

            /* Responsive Design */
            @media (max-width: 768px) {
                .timeline-line::before {
                    left: 30px;
                }
                
                .timeline-marker {
                    left: 30px;
                    transform: none;
                    width: 40px;
                    height: 40px;
                }
                
                .timeline-content-item.left,
                .timeline-content-item.right {
                    margin-left: 80px;
                    margin-right: 0;
                    max-width: none;
                }

                .timeline-content-item {
                    padding: 20px;
                }

                .timeline-title {
                    font-size: 18px;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    // Utility functions
    formatDate(dateString) {
        const date = new Date(dateString);
        if (isNaN(date)) return 'Unknown date';
        
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatNumber(num) {
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
            urban_destruction: '💥'
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

    showLoading(message) {
        const statusEl = document.getElementById('timelineStatusContent');
        const statusContainer = document.getElementById('timelineStatus');
        
        if (statusEl && statusContainer) {
            statusEl.textContent = `📊 ${message}`;
            statusContainer.style.display = 'block';
        }
    }

    showError(message) {
        console.error(message);
        
        const container = document.getElementById('timeline-embed');
        if (container) {
            container.innerHTML = `
                <div class="timeline-error">
                    <div class="error-icon">⚠️</div>
                    <h3>Error Loading Timeline</h3>
                    <p>${message}</p>
                    <button onclick="location.reload()" class="retry-btn">🔄 Retry</button>
                </div>
            `;
        }
    }

    getEmptyStateHTML() {
        return `
            <div class="timeline-empty-state">
                <div class="empty-icon">📅</div>
                <h3>No Events Found</h3>
                <p>No events match your current filters.</p>
                <button onclick="window.dualTimeline.clearAllFilters()" class="clear-all-btn">
                    🔄 Clear All Filters
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
            }
        };
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Dual Timeline System...');
    
    window.dualTimeline = new DualTimelineManager();
    window.dualTimeline.init();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DualTimelineManager;
}