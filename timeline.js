// Fixed Timeline Integration for Gaza Crisis Documentation Platform
// This file provides timeline functionality with proper incident modal integration

class TimelineManager {
    constructor() {
        this.timeline = null;
        this.timelineData = null;
        this.incidents = [];
        this.isTimelineJSLoaded = false;
    }

    // Initialize timeline with incidents data
    init(incidents) {
        console.log('Timeline init called with incidents:', incidents?.length || 0);

        this.incidents = incidents || [];

        if (this.incidents.length === 0) {
            console.log('No incidents provided, trying to get from global sources');
            this.incidents = this.getIncidentsFromGlobal();
        }

        if (this.incidents.length === 0) {
            this.showEmptyState();
            return;
        }

        console.log('Initializing timeline with', this.incidents.length, 'incidents');
        // Always use custom timeline for reliability
        this.initCustomTimeline();
    }

    // Get incidents from various global sources
    getIncidentsFromGlobal() {
        let incidents = [];

        // Try different global sources in order of preference
        if (window.filteredIncidents && Array.isArray(window.filteredIncidents) && window.filteredIncidents.length > 0) {
            incidents = window.filteredIncidents;
            console.log('Got incidents from window.filteredIncidents:', incidents.length);
        } else if (window.incidents && Array.isArray(window.incidents) && window.incidents.length > 0) {
            incidents = window.incidents;
            console.log('Got incidents from window.incidents:', incidents.length);
        } else if (window.incidentsData?.incidents && Array.isArray(window.incidentsData.incidents)) {
            incidents = window.incidentsData.incidents;
            console.log('Got incidents from window.incidentsData.incidents:', incidents.length);
        } else if (window.GazaDocsPlatform?.incidents && Array.isArray(window.GazaDocsPlatform.incidents)) {
            incidents = window.GazaDocsPlatform.incidents;
            console.log('Got incidents from window.GazaDocsPlatform.incidents:', incidents.length);
        }

        return incidents;
    }

    // Initialize custom HTML timeline (reliable fallback)
    initCustomTimeline() {
        const container = document.getElementById('timeline-embed');
        if (!container) {
            console.error('Timeline container not found');
            return;
        }

        const sortedIncidents = [...this.incidents]
            .filter(incident => incident.date)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (sortedIncidents.length === 0) {
            this.showEmptyState();
            return;
        }

        container.innerHTML = `
            <div class="custom-timeline">
                <div class="timeline-header">
                    <h2>Gaza Crisis Timeline</h2>
                    <p>Chronological documentation of ${sortedIncidents.length} incidents</p>
                </div>
                <div class="timeline-line">
                    ${sortedIncidents.map((incident, index) => this.createTimelineItem(incident, index)).join('')}
                </div>
            </div>
        `;

        this.addCustomTimelineStyles();
        this.addTimelineInteractivity();
        console.log('Custom timeline initialized successfully with', sortedIncidents.length, 'incidents');
    }

    // Create timeline item HTML
    createTimelineItem(incident, index) {
        const casualties = incident.casualties || {};
        let casualtyText = [];

        // Build casualty text
        if (casualties.deaths) casualtyText.push(`${casualties.deaths} deaths`);
        if (casualties.injured) casualtyText.push(`${casualties.injured} injured`);
        if (casualties.affected) casualtyText.push(`${casualties.affected} affected`);
        if (casualties.critical) casualtyText.push(`${casualties.critical} critical`);

        // Get type color
        const typeColors = window.GazaDocsPlatform?.typeColors || {
            hunger: '#e53e3e',
            water: '#3182ce',
            aid: '#d69e2e',
            casualties: '#805ad5',
            infrastructure: '#38a169'
        };

        const typeColor = typeColors[incident.type] || '#6c757d';

        // Handle detailed casualties
        let detailedCasualtyInfo = '';
        if (incident.casualties_details && incident.casualties_details.length > 0) {
            const detailedCount = incident.casualties_details.length;
            detailedCasualtyInfo = `
                <div class="timeline-casualties">
                    <span class="casualties-badge detailed">
                        💥 ${detailedCount} documented case${detailedCount > 1 ? 's' : ''}
                    </span>
                    <div class="detailed-preview">
                        ${incident.casualties_details.slice(0, 2).map(detail => 
                            detail.public_identifiers?.published_name ? 
                                `<span class="victim-preview">${this.escapeHtml(detail.name)}, age ${detail.age}</span>` : 
                                `<span class="victim-preview">Name protected, age ${detail.age}</span>`
                        ).join('<br>')}
                        ${incident.casualties_details.length > 2 ? `<span class="more-victims">...and ${incident.casualties_details.length - 2} more</span>` : ''}
                    </div>
                </div>
            `;
        } else if (casualtyText.length > 0) {
            detailedCasualtyInfo = `
                <div class="timeline-casualties">
                    <span class="casualties-badge">⚠️ ${casualtyText.join(', ')}</span>
                </div>
            `;
        }

        return `
            <div class="timeline-item" data-incident-id="${incident.id}" data-incident-index="${index}">
                <div class="timeline-marker">
                    <div class="timeline-icon ${incident.type || 'other'}" style="background-color: ${typeColor}">
                        ${this.getTypeIcon(incident.type)}
                    </div>
                </div>
                <div class="timeline-content-item ${index % 2 === 0 ? 'left' : 'right'}">
                    <div class="timeline-date">${this.formatDate(incident.date)}</div>
                    ${incident.time ? `<div class="timeline-time">🕐 ${incident.time}</div>` : ''}
                    <h3 class="timeline-title">${this.escapeHtml(incident.title)}</h3>
                    <div class="timeline-location">📍 ${this.escapeHtml(incident.location?.name || 'Unknown location')}</div>
                    <div class="timeline-type" style="color: ${typeColor}">
                        🏷️ ${this.capitalizeFirst(incident.type || 'other')}
                    </div>
                    <p class="timeline-description">${this.escapeHtml(this.truncateText(incident.description, 150))}</p>
                    
                    ${detailedCasualtyInfo}
                    
                    ${incident.verified ? `
                        <div class="timeline-verification">
                            <span class="verification-badge ${incident.verified}">
                                ${incident.verified === 'verified' ? '✅ Verified' : '⏳ Pending'}
                            </span>
                        </div>
                    ` : ''}
                    
                    ${incident.sources && incident.sources.length > 0 ? `
                        <div class="timeline-sources">
                            <span class="sources-count">📰 ${incident.sources.length} source${incident.sources.length > 1 ? 's' : ''}</span>
                        </div>
                    ` : ''}
                    
                    <button class="timeline-details-btn" data-incident-id="${incident.id}">
                        View Full Details →
                    </button>
                </div>
            </div>
        `;
    }

    // Add interactivity to custom timeline
    addTimelineInteractivity() {
        // Smooth scrolling for timeline items
        const timelineItems = document.querySelectorAll('.timeline-item');

        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, observerOptions);

        timelineItems.forEach(item => {
            observer.observe(item);
        });

        // Add click handlers for timeline items and buttons
        timelineItems.forEach(item => {
            // Click handler for the entire timeline item
            item.addEventListener('click', (e) => {
                // Don't trigger if clicking on the button itself
                if (e.target.classList.contains('timeline-details-btn')) {
                    return;
                }

                const incidentId = item.dataset.incidentId;
                const incidentIndex = parseInt(item.dataset.incidentIndex);

                if (incidentId) {
                    this.showIncidentDetailsWithFallback(incidentId, incidentIndex);
                }
            });

            // Specific click handler for the details button
            const detailsBtn = item.querySelector('.timeline-details-btn');
            if (detailsBtn) {
                detailsBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent triggering the item click handler

                    const incidentId = detailsBtn.dataset.incidentId;
                    const incidentIndex = parseInt(item.dataset.incidentIndex);

                    if (incidentId) {
                        this.showIncidentDetailsWithFallback(incidentId, incidentIndex);
                    }
                });
            }
        });
    }

    // Enhanced incident details function with multiple fallback methods
    showIncidentDetailsWithFallback(incidentId, incidentIndex) {
        console.log('Showing details for incident:', incidentId, 'index:', incidentIndex);

        let incident = null;

        // Method 1: Try to find by ID in various global sources
        const sources = [
            window.incidents,
            window.filteredIncidents,
            window.incidentsData?.incidents,
            window.GazaDocsPlatform?.incidents,
            this.incidents
        ];

        for (const source of sources) {
            if (source && Array.isArray(source)) {
                incident = source.find(i => i && i.id === incidentId);
                if (incident) {
                    console.log('Found incident by ID in source:', source);
                    break;
                }
            }
        }

        // Method 2: Try to find by index if ID search failed
        if (!incident && incidentIndex !== undefined && !isNaN(incidentIndex)) {
            console.log('Trying to find by index:', incidentIndex);

            for (const source of sources) {
                if (source && Array.isArray(source) && source[incidentIndex]) {
                    const candidateIncident = source[incidentIndex];
                    if (candidateIncident && candidateIncident.id === incidentId) {
                        incident = candidateIncident;
                        console.log('Found incident by index in source:', source);
                        break;
                    }
                }
            }
        }

        // Method 3: Try to find in the current timeline's incidents array
        if (!incident && this.incidents && this.incidents.length > 0) {
            incident = this.incidents.find(i => i && i.id === incidentId);
            if (incident) {
                console.log('Found incident in timeline manager incidents');
            }
        }

        // Try to show the modal
        if (incident) {
            console.log('Attempting to show incident modal for:', incident.title);

            // Try multiple modal functions
            if (typeof window.showIncidentModal === 'function') {
                try {
                    window.showIncidentModal(incident);
                    return;
                } catch (error) {
                    console.error('Error calling window.showIncidentModal:', error);
                }
            }

            if (typeof showIncidentModal === 'function') {
                try {
                    showIncidentModal(incident);
                    return;
                } catch (error) {
                    console.error('Error calling showIncidentModal:', error);
                }
            }

            // Fallback: Create a simple modal
            this.createFallbackModal(incident);
        } else {
            console.error('Incident not found:', incidentId);
            console.log('Available incidents:', this.incidents.length);
            console.log('Window incidents:', window.incidents?.length || 0);
            console.log('Filtered incidents:', window.filteredIncidents?.length || 0);

            // Show error with more helpful information
            this.showIncidentNotFoundError(incidentId);
        }
    }

    // Create a fallback modal when the main modal function isn't available
    createFallbackModal(incident) {
        console.log('Creating fallback modal for incident:', incident.title);

        // Remove any existing fallback modal
        const existingModal = document.getElementById('timeline-fallback-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'timeline-fallback-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        const casualties = incident.casualties || {};
        let casualtyInfo = '';

        if (Object.keys(casualties).length > 0) {
            casualtyInfo = `
                <div class="fallback-casualties">
                    <h4>💥 Impact:</h4>
                    ${casualties.deaths ? `<p>💀 Deaths: ${casualties.deaths}</p>` : ''}
                    ${casualties.injured ? `<p>🏥 Injured: ${casualties.injured}</p>` : ''}
                    ${casualties.affected ? `<p>👥 Affected: ${casualties.affected}</p>` : ''}
                    ${casualties.critical ? `<p>⚠️ Critical: ${casualties.critical}</p>` : ''}
                </div>
            `;
        }

        let detailedCasualties = '';
        if (incident.casualties_details && incident.casualties_details.length > 0) {
            detailedCasualties = `
                <div class="fallback-detailed-casualties">
                    <h4>📋 Documented Cases (${incident.casualties_details.length}):</h4>
                    ${incident.casualties_details.slice(0, 3).map(detail => `
                        <div class="casualty-summary">
                            <p><strong>${detail.public_identifiers?.published_name ? this.escapeHtml(detail.name) : 'Name protected'}</strong>, Age: ${detail.age}</p>
                            <p>Condition: ${this.escapeHtml(detail.condition || 'Unknown')}</p>
                        </div>
                    `).join('')}
                    ${incident.casualties_details.length > 3 ? `<p><em>...and ${incident.casualties_details.length - 3} more cases</em></p>` : ''}
                </div>
            `;
        }

        modal.innerHTML = `
            <div class="fallback-modal-content" style="
                background: var(--surface-color, #fff);
                color: var(--text-primary, #000);
                max-width: 800px;
                max-height: 80vh;
                overflow-y: auto;
                padding: 30px;
                border-radius: 12px;
                position: relative;
                margin: 20px;
            ">
                <button class="fallback-close-btn" style="
                    position: absolute;
                    top: 15px;
                    right: 20px;
                    background: none;
                    border: none;
                    font-size: 2rem;
                    cursor: pointer;
                    color: var(--text-secondary, #666);
                ">&times;</button>
                
                <h2 style="margin-bottom: 20px; color: var(--accent-color, #007bff);">
                    ${this.escapeHtml(incident.title)}
                </h2>
                
                <div class="fallback-meta" style="margin-bottom: 20px; color: var(--text-secondary, #666);">
                    <p><strong>📅 Date:</strong> ${this.formatDate(incident.date)} ${incident.time ? `at ${incident.time}` : ''}</p>
                    <p><strong>📍 Location:</strong> ${this.escapeHtml(incident.location?.name || 'Unknown location')}</p>
                    <p><strong>🏷️ Type:</strong> ${this.capitalizeFirst(incident.type || 'other')}</p>
                    <p><strong>✅ Status:</strong> ${incident.verified === 'verified' ? 'Verified' : 'Pending verification'}</p>
                </div>
                
                <div class="fallback-description" style="margin-bottom: 20px; line-height: 1.6;">
                    <h4>📄 Description:</h4>
                    <p>${this.escapeHtml(incident.description)}</p>
                </div>
                
                ${casualtyInfo}
                ${detailedCasualties}
                
                ${incident.sources && incident.sources.length > 0 ? `
                    <div class="fallback-sources" style="margin-top: 20px;">
                        <h4>📰 Sources:</h4>
                        ${incident.sources.map(source => 
                            source.startsWith('http') ? 
                                `<p><a href="${this.escapeHtml(source)}" target="_blank" rel="noopener">🔗 ${this.escapeHtml(source)}</a></p>` :
                                `<p>📰 ${this.escapeHtml(source)}</p>`
                        ).join('')}
                    </div>
                ` : ''}
                
                <div style="margin-top: 30px; text-align: center;">
                    <button class="fallback-close-btn-bottom" style="
                        background: var(--accent-color, #007bff);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 16px;
                    ">Close Details</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // Add close event listeners
        const closeBtn = modal.querySelector('.fallback-close-btn');
        const closeBottomBtn = modal.querySelector('.fallback-close-btn-bottom');

        const closeModal = () => {
            modal.remove();
            document.body.style.overflow = 'auto';
        };

        closeBtn.addEventListener('click', closeModal);
        closeBottomBtn.addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // Show incident not found error
    showIncidentNotFoundError(incidentId) {
        const errorModal = document.createElement('div');
        errorModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--surface-color, #fff);
            color: var(--text-primary, #000);
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 10001;
            text-align: center;
            max-width: 400px;
            border: 2px solid var(--danger-color, #dc3545);
        `;

        errorModal.innerHTML = `
            <div style="color: var(--danger-color, #dc3545); font-size: 3rem; margin-bottom: 20px;">⚠️</div>
            <h3 style="margin-bottom: 15px;">Incident Details Not Found</h3>
            <p style="margin-bottom: 20px; line-height: 1.5;">
                Unable to load details for incident ID: <strong>${this.escapeHtml(incidentId)}</strong>
            </p>
            <p style="margin-bottom: 25px; color: var(--text-secondary, #666); font-size: 14px;">
                This may be due to data loading issues. Please try refreshing the page.
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="error-refresh-btn" style="
                    background: var(--accent-color, #007bff);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                ">🔄 Refresh Page</button>
                <button id="error-close-btn" style="
                    background: var(--secondary-color, #6c757d);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                ">Close</button>
            </div>
        `;

        document.body.appendChild(errorModal);

        document.getElementById('error-refresh-btn').addEventListener('click', () => {
            location.reload();
        });

        document.getElementById('error-close-btn').addEventListener('click', () => {
            errorModal.remove();
        });

        // Auto-close after 10 seconds
        setTimeout(() => {
            if (errorModal.parentElement) {
                errorModal.remove();
            }
        }, 10000);
    }

    // Get icon for incident type
    getTypeIcon(type) {
        const icons = {
            hunger: '🍽️',
            water: '💧',
            aid: '🚛',
            casualties: '⚠️',
            infrastructure: '🏗️'
        };
        return icons[type] || '📍';
    }

    // Show empty state
    showEmptyState() {
        const container = document.getElementById('timeline-embed');
        if (container) {
            container.innerHTML = `
                <div class="timeline-empty-state">
                    <div class="empty-icon">📅</div>
                    <h3>No Crisis Data Available</h3>
                    <p>No incidents found to display in the timeline.</p>
                    <p>Try adjusting your filters or check back later.</p>
                    <button onclick="location.reload()" class="reload-btn">🔄 Reload Page</button>
                </div>
            `;
        }
    }

    // Add custom timeline styles
    addCustomTimelineStyles() {
        if (document.getElementById('custom-timeline-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'custom-timeline-styles';
        styles.textContent = `
            .custom-timeline {
                max-width: 1000px;
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
                font-size: 28px;
                font-weight: 600;
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
                width: 3px;
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
                font-size: 18px;
                box-shadow: var(--shadow-sm);
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
            }

            .timeline-content-item {
                background: var(--surface-color);
                border: 1px solid var(--border-color);
                border-radius: 12px;
                padding: 24px;
                box-shadow: var(--shadow-md);
                max-width: 400px;
                width: 100%;
                transition: all 0.3s ease;
            }

            .timeline-content-item:hover {
                box-shadow: var(--shadow-lg);
                transform: translateY(-2px);
            }

            .timeline-content-item.left {
                margin-right: 60%;
            }

            .timeline-content-item.right {
                margin-left: 60%;
            }

            .timeline-date {
                color: var(--accent-color);
                font-size: 15px;
                font-weight: 700;
                margin-bottom: 4px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .timeline-time {
                color: var(--text-secondary);
                font-size: 13px;
                margin-bottom: 8px;
            }

            .timeline-title {
                color: var(--text-primary);
                margin-bottom: 10px;
                font-size: 20px;
                line-height: 1.3;
                font-weight: 600;
            }

            .timeline-location {
                color: var(--text-secondary);
                font-size: 14px;
                margin-bottom: 8px;
            }

            .timeline-type {
                font-size: 14px;
                font-weight: 500;
                margin-bottom: 12px;
            }

            .timeline-description {
                color: var(--text-primary);
                line-height: 1.6;
                margin-bottom: 16px;
                font-size: 15px;
            }

            .timeline-casualties {
                margin-bottom: 12px;
            }

            .casualties-badge {
                display: inline-block;
                background: #fee;
                color: #dc3545;
                border: 1px solid #f8d7da;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
            }

            .casualties-badge.detailed {
                background: #e3f2fd;
                color: #1976d2;
                border: 1px solid #bbdefb;
            }

            .detailed-preview {
                margin-top: 8px;
                font-size: 12px;
                color: var(--text-secondary);
                line-height: 1.4;
            }

            .victim-preview {
                display: inline-block;
                margin-right: 8px;
            }

            .more-victims {
                font-style: italic;
                color: var(--text-secondary);
            }

            .timeline-verification {
                margin-bottom: 12px;
            }

            .timeline-sources {
                margin-bottom: 16px;
            }

            .sources-count {
                font-size: 12px;
                color: var(--text-secondary);
                background: var(--light-color);
                padding: 4px 8px;
                border-radius: 12px;
            }

            .verification-badge {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
            }
            
            .verification-badge.verified {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            
            .verification-badge.pending {
                background: #fff3cd;
                color: #856404;
                border: 1px solid #ffeaa7;
            }

            .timeline-details-btn {
                background: var(--accent-color);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s ease;
                width: 100%;
            }

            .timeline-details-btn:hover {
                background: var(--accent-color-dark, #0056b3);
                transform: translateY(-1px);
                box-shadow: var(--shadow-sm);
            }

            .timeline-empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 400px;
                text-align: center;
                color: var(--text-secondary);
            }

            .timeline-empty-state .empty-icon {
                font-size: 64px;
                margin-bottom: 16px;
                opacity: 0.5;
            }

            .timeline-empty-state h3 {
                margin: 0 0 8px 0;
                color: var(--text-primary);
            }

            .timeline-empty-state p {
                margin: 4px 0;
                font-size: 16px;
            }

            .reload-btn {
                background: var(--accent-color);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                margin-top: 16px;
                transition: background 0.2s ease;
            }

            .reload-btn:hover {
                background: var(--accent-color-dark, #0056b3);
            }

            /* Fallback modal styles */
            .fallback-casualties,
            .fallback-detailed-casualties {
                margin: 20px 0;
                padding: 15px;
                background: var(--light-color, #f8f9fa);
                border-radius: 8px;
                border-left: 4px solid var(--accent-color);
            }

            .casualty-summary {
                margin: 10px 0;
                padding: 10px;
                background: rgba(var(--accent-color-rgb, 0, 123, 255), 0.1);
                border-radius: 6px;
            }

            @media (max-width: 768px) {
                .custom-timeline {
                    padding: 15px;
                }

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
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, length) {
        if (!text || text.length <= length) return text;
        return text.substring(0, length) + '...';
    }

    capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown date';
        const date = new Date(dateString);
        if (isNaN(date)) return 'Invalid date';

        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Update timeline with new incidents
    update(incidents) {
        console.log('Timeline update called with incidents:', incidents?.length || 0);
        this.incidents = incidents || [];

        if (this.incidents.length === 0) {
            this.incidents = this.getIncidentsFromGlobal();
        }

        this.initCustomTimeline();
    }

    // Destroy timeline
    destroy() {
        if (this.timeline && typeof this.timeline.destroy === 'function') {
            try {
                this.timeline.destroy();
            } catch (e) {
                console.log('Error destroying timeline:', e);
            }
        }
        this.timeline = null;
        this.timelineData = null;
    }

    // Apply filters to timeline
    applyFilters(filters) {
        console.log('Applying filters to timeline:', filters);

        // Get the current incidents from global sources
        let incidents = this.getIncidentsFromGlobal();

        if (filters && Object.keys(filters).length > 0) {
            // Apply search filter
            if (filters.search && filters.search.trim()) {
                const searchTerm = filters.search.toLowerCase();
                incidents = incidents.filter(incident =>
                    incident.title?.toLowerCase().includes(searchTerm) ||
                    incident.description?.toLowerCase().includes(searchTerm) ||
                    incident.location?.name?.toLowerCase().includes(searchTerm)
                );
            }

            // Apply type filter
            if (filters.type) {
                incidents = incidents.filter(incident => incident.type === filters.type);
            }

            // Apply date filter
            if (filters.date) {
                incidents = incidents.filter(incident => this.filterByDate(incident.date, filters.date));
            }
        }

        this.incidents = incidents;
        this.initCustomTimeline();
    }

    // Filter by date helper
    filterByDate(incidentDate, filter) {
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

    // Refresh timeline
    refresh() {
        console.log('Refreshing timeline...');
        this.init(this.getIncidentsFromGlobal());
    }
}

// Global timeline manager instance
window.timelineManager = new TimelineManager();

// Legacy function for backward compatibility - now enhanced
function showTimelineIncidentDetails(incidentId) {
    console.log('Legacy showTimelineIncidentDetails called for:', incidentId);

    if (window.timelineManager) {
        // Try to find the incident index
        const incidents = window.timelineManager.getIncidentsFromGlobal();
        const incidentIndex = incidents.findIndex(i => i.id === incidentId);

        window.timelineManager.showIncidentDetailsWithFallback(incidentId, incidentIndex);
    } else {
        console.error('Timeline manager not available');
        alert('Timeline system not ready. Please refresh the page and try again.');
    }
}

// Initialize timeline when called from main app
function initializeTimeline() {
    console.log('initializeTimeline called');

    // Try to get the most current incident data
    let incidents = [];

    // Priority order: filteredIncidents > incidents > incidentsData > GazaDocsPlatform
    if (window.filteredIncidents && Array.isArray(window.filteredIncidents)) {
        incidents = window.filteredIncidents;
        console.log('Using filteredIncidents:', incidents.length);
    } else if (window.incidents && Array.isArray(window.incidents)) {
        incidents = window.incidents;
        console.log('Using incidents:', incidents.length);
    } else if (window.incidentsData?.incidents && Array.isArray(window.incidentsData.incidents)) {
        incidents = window.incidentsData.incidents;
        console.log('Using incidentsData.incidents:', incidents.length);
    } else if (window.GazaDocsPlatform?.incidents && Array.isArray(window.GazaDocsPlatform.incidents)) {
        incidents = window.GazaDocsPlatform.incidents;
        console.log('Using GazaDocsPlatform.incidents:', incidents.length);
    }

    console.log('Timeline initializing with incidents:', incidents?.length || 0);

    if (incidents.length > 0) {
        window.timelineManager.init(incidents);
    } else {
        console.error('No incidents data available for timeline');
        console.log('Available global objects:');
        console.log('window.incidents:', window.incidents);
        console.log('window.filteredIncidents:', window.filteredIncidents);
        console.log('window.incidentsData:', window.incidentsData);
        console.log('window.GazaDocsPlatform:', window.GazaDocsPlatform);

        window.timelineManager.showEmptyState();
    }
}

// Make functions globally available
window.initializeTimeline = initializeTimeline;
window.showTimelineIncidentDetails = showTimelineIncidentDetails;
window.TimelineManager = TimelineManager;

// Auto-initialize on DOM ready if we're on the timeline page and data is available
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Timeline.js loaded and ready');
        // Auto-initialize if we have data and are showing timeline
        setTimeout(() => {
            if (window.currentView === 'timeline' || document.getElementById('timelineView')?.classList.contains('active')) {
                initializeTimeline();
            }
        }, 100);
    });
} else {
    console.log('Timeline.js loaded and ready');
    // Auto-initialize if we have data and are showing timeline
    setTimeout(() => {
        if (window.currentView === 'timeline' || document.getElementById('timelineView')?.classList.contains('active')) {
            initializeTimeline();
        }
    }, 100);
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TimelineManager, initializeTimeline };
}