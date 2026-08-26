// Ethnic Cleansing Documentation Manager
// Manages village data, filtering, and visualization
class EthnicCleansingManager {
    constructor() {
        this.data = null;
        this.villages = [];
        this.filteredVillages = [];
        this.currentPeriod = 'all';
        this.map = null;
        this.markers = [];
        this.currentPage = 1;
        this.itemsPerPage = 50;

        this.periodColors = {
            '1948-1949': '#dc3545',
            '1950-1966': '#fd7e14',
            '1967': '#6f42c1',
            '1967-2023': '#0d6efd',
            '2023-present': '#e83e8c'
        };

        this.methodColors = {
            massacre: '#dc3545',
            military_assault: '#fd7e14',
            forced_expulsion: '#6f42c1',
            fear_of_attack: '#ffc107',
            whispering_campaign: '#20c997',
            administrative_demolition: '#e83e8c',
            unknown: '#6c757d'
        };
    }

    async init() {
        console.log('🚀 Initializing Ethnic Cleansing Documentation System...');

        try {
            // Load data from JSON
            await this.loadData();

            // Populate districts filter
            this.populateDistrictsFilter();

            // Apply initial filters
            this.applyFilters();

            // Initialize map
            this.initMap();

            // Setup event listeners
            this.setupEventListeners();

            console.log('✅ System initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing system:', error);
        }
    }

    async loadData() {
        try {
const response = await fetch(window.siteConfig.baseUrl + 'timeline-data/ethnic-cleansing-villages.json');
            this.data = await response.json();
            this.villages = this.data.villages;
            this.filteredVillages = [...this.villages];

            // Update stats
            document.getElementById('totalVillages').textContent = this.data.metadata.total_villages.toLocaleString();
            document.getElementById('totalDisplaced').textContent = this.data.metadata.total_displaced.toLocaleString();
            document.getElementById('lastUpdated').textContent = this.data.metadata.last_updated;

            // Update period counts
            Object.entries(this.data.metadata.period_breakdown).forEach(([period, data]) => {
                const countEl = document.getElementById(`count-${period}`);
                if (countEl) {
                    countEl.textContent = data.villages;
                }
            });

            console.log(`📊 Loaded ${this.villages.length} villages`);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    populateDistrictsFilter() {
        const districtFilter = document.getElementById('districtFilter');
        const districts = [...new Set(this.villages.map(v => v.district))].sort();

        districts.forEach(district => {
            const option = document.createElement('option');
            option.value = district;
            option.textContent = district;
            districtFilter.appendChild(option);
        });
    }

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', () => this.applyFilters());

        // Modal close on outside click
        const modal = document.getElementById('villageModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }

    filterByPeriod(period) {
        this.currentPeriod = period;

        // Update active period card
        document.querySelectorAll('.period-card').forEach(card => {
            card.classList.remove('active');
        });
        document.querySelector(`[data-period="${period}"]`).classList.add('active');

        this.applyFilters();
    }

    applyFilters() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const methodFilter = document.getElementById('methodFilter').value;
        const districtFilter = document.getElementById('districtFilter').value;

        this.filteredVillages = this.villages.filter(village => {
            // Period filter
            if (this.currentPeriod !== 'all' && village.period !== this.currentPeriod) {
                return false;
            }

            // Search filter
            if (searchTerm && !village.name.toLowerCase().includes(searchTerm) &&
                !village.district.toLowerCase().includes(searchTerm)) {
                return false;
            }

            // Method filter
            if (methodFilter && village.displacement_method !== methodFilter) {
                return false;
            }

            // District filter
            if (districtFilter && village.district !== districtFilter) {
                return false;
            }

            return true;
        });

        // Reset to page 1 when filters change
        this.currentPage = 1;

        // Update results count
        const resultsCount = document.getElementById('resultsCount');
        resultsCount.textContent = `Showing ${this.filteredVillages.length} of ${this.villages.length} villages`;

        // Render current view
        const viewMode = document.getElementById('viewMode').value;
        if (viewMode === 'timeline') {
            this.renderTimeline();
        } else if (viewMode === 'map') {
            this.renderMap();
        } else if (viewMode === 'table') {
            this.renderTable();
        }
    }

    clearFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('methodFilter').value = '';
        document.getElementById('districtFilter').value = '';
        this.filterByPeriod('all');
    }

    switchView() {
        const viewMode = document.getElementById('viewMode').value;

        // Hide all views
        document.getElementById('timelineView').style.display = 'none';
        document.getElementById('mapView').style.display = 'none';
        document.getElementById('tableView').style.display = 'none';

        // Show selected view
        if (viewMode === 'timeline') {
            document.getElementById('timelineView').style.display = 'block';
            this.renderTimeline();
        } else if (viewMode === 'map') {
            document.getElementById('mapView').style.display = 'block';
            this.renderMap();
            if (this.map) {
                setTimeout(() => this.map.invalidateSize(), 100);
            }
        } else if (viewMode === 'table') {
            document.getElementById('tableView').style.display = 'block';
            this.renderTable();
        }
    }

    renderTimeline() {
        const villageList = document.getElementById('villageList');

        if (this.filteredVillages.length === 0) {
            villageList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p>No villages found matching your filters</p>
                    <button onclick="ethnicCleansingManager.clearFilters()" class="clear-btn">Clear Filters</button>
                </div>
            `;
            return;
        }

        // Sort by date
        const sorted = [...this.filteredVillages].sort((a, b) => new Date(a.date) - new Date(b.date));

        // Create horizontal scrolling timeline
        villageList.innerHTML = `
            <div class="horizontal-scroll-container">
                <div class="horizontal-scroll-hint">← Scroll horizontally to view all ${sorted.length} villages →</div>
                <div class="timeline-cards-wrapper">
                    ${sorted.map(village => this.createTimelineCard(village)).join('')}
                </div>
            </div>
        `;

        // Add scroll indicators
        this.setupScrollIndicators();
    }

    createTimelineCard(village) {
        const methodInfo = this.data.displacement_methods[village.displacement_method];
        const color = this.periodColors[village.period];

        return `
            <div class="timeline-village-card" onclick="ethnicCleansingManager.showVillageDetail(${village.id})">
                <div class="card-header" style="background: linear-gradient(135deg, ${color}, ${this.adjustColor(color, -20)});">
                    <div class="card-period-badge">${village.period}</div>
                    <div class="card-date">${this.formatDate(village.date)}</div>
                </div>
                <div class="card-content">
                    <h3 class="card-village-name">${village.name}</h3>
                    <div class="card-meta">
                        <div class="card-meta-item">
                            <span class="meta-icon">📍</span>
                            <span class="meta-text">${village.district}</span>
                        </div>
                        <div class="card-meta-item">
                            <span class="meta-icon">👥</span>
                            <span class="meta-text">${village.population.toLocaleString()}</span>
                        </div>
                        <div class="card-meta-item">
                            <span class="method-badge-small" style="background: ${this.methodColors[village.displacement_method]};">
                                ${methodInfo ? methodInfo.icon : '❓'} ${methodInfo ? methodInfo.label : 'Unknown'}
                            </span>
                        </div>
                    </div>
                    ${village.additional_notes ? `<div class="card-notes">${this.truncate(village.additional_notes, 100)}</div>` : ''}
                </div>
                <div class="card-footer">
                    <button class="view-details-btn">View Details →</button>
                </div>
            </div>
        `;
    }

    setupScrollIndicators() {
        const container = document.querySelector('.timeline-cards-wrapper');
        if (!container) return;

        // Enable mouse wheel horizontal scrolling
        container.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                container.scrollBy({
                    left: e.deltaY,
                    behavior: 'smooth'
                });
            }
        });
    }

    adjustColor(color, amount) {
        const num = parseInt(color.replace('#', ''), 16);
        const r = Math.max(0, Math.min(255, (num >> 16) + amount));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
        const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }

    formatDate(dateStr) {
        if (dateStr.includes('ongoing')) return 'Ongoing';
        const date = new Date(dateStr);
        if (isNaN(date)) return dateStr;
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    truncate(text, length) {
        if (!text || text.length <= length) return text;
        return text.substring(0, length) + '...';
    }

    initMap() {
        if (!this.map) {
            this.map = L.map('ethnicCleansingMap').setView([31.9466, 35.2137], 8);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(this.map);
        }
    }

    renderMap() {
        if (!this.map) {
            this.initMap();
        }

        // Clear existing markers
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];

        const markerCluster = L.markerClusterGroup({
            chunkedLoading: true,
            maxClusterRadius: 50
        });

        this.filteredVillages.forEach(village => {
            if (!village.coordinates || village.coordinates.length !== 2) return;

            const color = this.periodColors[village.period];
            const methodInfo = this.data.displacement_methods[village.displacement_method];

            const marker = L.circleMarker([village.coordinates[0], village.coordinates[1]], {
                radius: 8,
                fillColor: color,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });

            marker.bindPopup(`
                <div style="min-width: 250px;">
                    <h3 style="margin: 0 0 0.5rem 0;">${village.name}</h3>
                    <p style="margin: 0.25rem 0;"><strong>📅 Date:</strong> ${village.date}</p>
                    <p style="margin: 0.25rem 0;"><strong>📍 District:</strong> ${village.district}</p>
                    <p style="margin: 0.25rem 0;"><strong>👥 Population:</strong> ${village.population.toLocaleString()}</p>
                    <p style="margin: 0.25rem 0;"><strong>Method:</strong> ${methodInfo ? methodInfo.icon : '❓'} ${methodInfo ? methodInfo.label : 'Unknown'}</p>
                    <button onclick="ethnicCleansingManager.showVillageDetail(${village.id})" style="margin-top: 0.5rem; padding: 0.5rem 1rem; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">View Details</button>
                </div>
            `);

            markerCluster.addLayer(marker);
            this.markers.push(marker);
        });

        this.map.addLayer(markerCluster);

        if (this.markers.length > 0) {
            const group = new L.featureGroup(this.markers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        }
    }

    renderTable() {
        const tableBody = document.getElementById('tableBody');

        if (this.filteredVillages.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem;">
                        No villages found matching your filters
                    </td>
                </tr>
            `;
            document.getElementById('tablePagination').style.display = 'none';
            return;
        }

        // Sort by date
        const sorted = [...this.filteredVillages].sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate pagination
        const totalPages = Math.ceil(sorted.length / this.itemsPerPage);
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, sorted.length);
        const pageItems = sorted.slice(startIndex, endIndex);

        // Render table rows
        tableBody.innerHTML = pageItems.map(village => {
            const methodInfo = this.data.displacement_methods[village.displacement_method];
            return `
                <tr onclick="ethnicCleansingManager.showVillageDetail(${village.id})" style="cursor: pointer;">
                    <td><strong>${village.name}</strong></td>
                    <td><span class="badge" style="background: ${this.periodColors[village.period]};">${village.period}</span></td>
                    <td>${village.date}</td>
                    <td>${village.district}</td>
                    <td>${village.population.toLocaleString()}</td>
                    <td>${methodInfo ? methodInfo.icon : '❓'} ${methodInfo ? methodInfo.label : 'Unknown'}</td>
                    <td>${village.current_status.replace('_', ' ')}</td>
                </tr>
            `;
        }).join('');

        // Update pagination
        this.renderPagination(totalPages, startIndex, endIndex, sorted.length);
    }

    renderPagination(totalPages, startIndex, endIndex, totalItems) {
        const pagination = document.getElementById('tablePagination');
        pagination.style.display = 'flex';

        const paginationInfo = document.getElementById('paginationInfo');
        paginationInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalItems} villages`;

        const paginationButtons = document.getElementById('paginationButtons');

        let buttonsHTML = '';

        // Previous button
        buttonsHTML += `
            <button 
                class="pagination-btn" 
                onclick="ethnicCleansingManager.goToPage(${this.currentPage - 1})"
                ${this.currentPage === 1 ? 'disabled' : ''}
            >
                ← Previous
            </button>
        `;

        // Page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        if (startPage > 1) {
            buttonsHTML += `
                <button class="pagination-btn" onclick="ethnicCleansingManager.goToPage(1)">1</button>
                ${startPage > 2 ? '<span class="pagination-ellipsis">...</span>' : ''}
            `;
        }

        for (let i = startPage; i <= endPage; i++) {
            buttonsHTML += `
                <button 
                    class="pagination-btn ${i === this.currentPage ? 'active' : ''}" 
                    onclick="ethnicCleansingManager.goToPage(${i})"
                >
                    ${i}
                </button>
            `;
        }

        if (endPage < totalPages) {
            buttonsHTML += `
                ${endPage < totalPages - 1 ? '<span class="pagination-ellipsis">...</span>' : ''}
                <button class="pagination-btn" onclick="ethnicCleansingManager.goToPage(${totalPages})">${totalPages}</button>
            `;
        }

        // Next button
        buttonsHTML += `
            <button 
                class="pagination-btn" 
                onclick="ethnicCleansingManager.goToPage(${this.currentPage + 1})"
                ${this.currentPage === totalPages ? 'disabled' : ''}
            >
                Next →
            </button>
        `;

        paginationButtons.innerHTML = buttonsHTML;
    }

    goToPage(page) {
        const totalPages = Math.ceil(this.filteredVillages.length / this.itemsPerPage);

        if (page < 1 || page > totalPages) return;

        this.currentPage = page;
        this.renderTable();

        // Scroll to top of table
        document.getElementById('tableView').scrollIntoView({ behavior: 'smooth' });
    }

    showVillageDetail(villageId) {
        const village = this.villages.find(v => v.id === villageId);
        if (!village) return;

        const methodInfo = this.data.displacement_methods[village.displacement_method];
        const statusInfo = this.data.status_types[village.current_status];

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div style="padding: 1.5rem;">
                <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;">
                    <h3 style="margin: 0 0 1rem 0; color: var(--text-primary);">📋 Basic Information</h3>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                        <div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Period</div>
                            <div style="font-weight: 600;">${village.period}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Date</div>
                            <div style="font-weight: 600;">${village.date}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">District</div>
                            <div style="font-weight: 600;">${village.district}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Population</div>
                            <div style="font-weight: 600;">${village.population.toLocaleString()}</div>
                        </div>
                    </div>
                </div>
                
                <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;">
                    <h3 style="margin: 0 0 1rem 0; color: var(--text-primary);">🏗️ Displacement Details</h3>
                    <div style="margin-bottom: 1rem;">
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Method</div>
                        <div style="font-size: 1.1rem; font-weight: 600; color: ${this.methodColors[village.displacement_method]};">
                            ${methodInfo ? methodInfo.icon : '❓'} ${methodInfo ? methodInfo.label : 'Unknown'}
                        </div>
                        ${methodInfo ? `<div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">${methodInfo.description}</div>` : ''}
                    </div>
                    <div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Current Status</div>
                        <div style="font-size: 1rem; font-weight: 600;">${statusInfo ? statusInfo.icon : '❓'} ${statusInfo ? statusInfo.label : village.current_status}</div>
                        ${statusInfo ? `<div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">${statusInfo.description}</div>` : ''}
                    </div>
                </div>
                
                ${village.additional_notes ? `
                <div style="background: rgba(220, 53, 69, 0.1); padding: 1.5rem; border-radius: 8px; border-left: 4px solid var(--accent-color);">
                    <h3 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">📝 Additional Notes</h3>
                    <div style="font-size: 0.95rem; color: var(--text-primary);">${village.additional_notes}</div>
                </div>
                ` : ''}
                
                <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-top: 1.5rem;">
                    <h3 style="margin: 0 0 0.5rem 0; color: var(--text-primary);">📍 Coordinates</h3>
                    <div style="font-family: monospace; color: var(--text-secondary);">
                        Latitude: ${village.coordinates[0]}, Longitude: ${village.coordinates[1]}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('modalTitle').textContent = village.name;
        document.getElementById('villageModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        document.getElementById('villageModal').classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Global instance
let ethnicCleansingManager;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    ethnicCleansingManager = new EthnicCleansingManager();
    ethnicCleansingManager.init();
});

// Global functions for HTML onclick handlers
function filterByPeriod(period) {
    ethnicCleansingManager.filterByPeriod(period);
}

function applyFilters() {
    ethnicCleansingManager.applyFilters();
}

function clearFilters() {
    ethnicCleansingManager.clearFilters();
}

function switchView() {
    ethnicCleansingManager.switchView();
}

function closeModal() {
    ethnicCleansingManager.closeModal();
}

function goToPage(page) {
    ethnicCleansingManager.goToPage(page);
}
