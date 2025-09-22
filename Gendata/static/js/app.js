// Gaza Crisis Data Extractor - Frontend JavaScript

class GazaDataExtractor {
    constructor() {
        this.urls = [];
        this.isExtracting = false;
        this.extractionStatus = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadFiles();
        this.updateURLCount();

        // Start status polling
        this.startStatusPolling();

        console.log('Gaza Crisis Data Extractor initialized');
    }

    bindEvents() {
        // URL input events
        document.getElementById('addUrlBtn').addEventListener('click', () => this.addSingleURL());
        document.getElementById('addBulkUrlsBtn').addEventListener('click', () => this.addBulkURLs());
        document.getElementById('useExampleBtn').addEventListener('click', () => this.useExampleURL());
        document.getElementById('validateUrlBtn').addEventListener('click', () => this.validateSingleURL());
        document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAllURLs());

        // Extraction events
        document.getElementById('startExtractionBtn').addEventListener('click', () => this.startExtraction());

        // File management events
        document.getElementById('refreshFilesBtn').addEventListener('click', () => this.loadFiles());
        document.getElementById('viewStatsBtn').addEventListener('click', () => this.showStatistics());

        // Enter key support for single URL input
        document.getElementById('singleUrl').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addSingleURL();
            }
        });

        // Modal close events
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openModals = document.querySelectorAll('.modal[style*="block"]');
                openModals.forEach(modal => this.closeModal(modal.id));
            }
        });
    }

    // URL Management Methods
    addSingleURL() {
        const urlInput = document.getElementById('singleUrl');
        const url = urlInput.value.trim();

        if (!url) {
            this.showAlert('Please enter a URL', 'warning');
            return;
        }

        if (!this.isValidURL(url)) {
            this.showAlert('Please enter a valid URL', 'error');
            return;
        }

        if (this.urls.includes(url)) {
            this.showAlert('URL already added', 'warning');
            return;
        }

        this.urls.push(url);
        urlInput.value = '';

        this.updateURLList();
        this.updateURLCount();
        this.updateExtractionButton();

        this.showAlert('URL added successfully', 'success');
    }

    addBulkURLs() {
        const bulkInput = document.getElementById('bulkUrls');
        const urlsText = bulkInput.value.trim();

        if (!urlsText) {
            this.showAlert('Please enter URLs in the bulk input area', 'warning');
            return;
        }

        const urlLines = urlsText.split('\n').map(line => line.trim()).filter(line => line);
        const validUrls = [];
        const invalidUrls = [];
        const duplicateUrls = [];

        urlLines.forEach(url => {
            if (!this.isValidURL(url)) {
                invalidUrls.push(url);
            } else if (this.urls.includes(url)) {
                duplicateUrls.push(url);
            } else {
                validUrls.push(url);
            }
        });

        // Add valid URLs
        this.urls.push(...validUrls);
        bulkInput.value = '';

        this.updateURLList();
        this.updateURLCount();
        this.updateExtractionButton();

        // Show summary
        let message = `Added ${validUrls.length} URLs`;
        if (invalidUrls.length > 0) {
            message += `, ${invalidUrls.length} invalid URLs skipped`;
        }
        if (duplicateUrls.length > 0) {
            message += `, ${duplicateUrls.length} duplicates skipped`;
        }

        this.showAlert(message, validUrls.length > 0 ? 'success' : 'warning');
    }

    useExampleURL() {
        const exampleURL = 'https://www.aljazeera.com/news/2025/8/10/al-jazeera-journalist-anas-al-sharif-killed-in-israeli-attack-in-gaza-city';
        document.getElementById('singleUrl').value = exampleURL;
    }

    async validateSingleURL() {
        const urlInput = document.getElementById('singleUrl');
        const url = urlInput.value.trim();

        if (!url) {
            this.showAlert('Please enter a URL to validate', 'warning');
            return;
        }

        if (!this.isValidURL(url)) {
            this.showAlert('Please enter a valid URL format', 'error');
            return;
        }

        this.showValidationModal('Validating URL...');

        try {
            const response = await fetch('/api/validate-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });

            const result = await response.json();
            this.showValidationResult(url, result);

        } catch (error) {
            this.showValidationResult(url, {
                valid: false,
                error: 'Network error: ' + error.message
            });
        }
    }

    removeURL(url) {
        const index = this.urls.indexOf(url);
        if (index > -1) {
            this.urls.splice(index, 1);
            this.updateURLList();
            this.updateURLCount();
            this.updateExtractionButton();
            this.showAlert('URL removed', 'info');
        }
    }

    clearAllURLs() {
        if (this.urls.length === 0) {
            this.showAlert('No URLs to clear', 'info');
            return;
        }

        if (confirm('Are you sure you want to clear all URLs?')) {
            this.urls = [];
            this.updateURLList();
            this.updateURLCount();
            this.updateExtractionButton();
            this.showAlert('All URLs cleared', 'info');
        }
    }

    // Extraction Methods
    async startExtraction() {
        if (this.urls.length === 0) {
            this.showAlert('Please add some URLs first', 'warning');
            return;
        }

        if (this.isExtracting) {
            this.showAlert('Extraction already in progress', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    urls: this.urls,
                    update_main_csv: document.getElementById('updateMainCsv').checked,
                    create_backup: document.getElementById('createBackup').checked
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.isExtracting = true;
                this.showProgressSection();
                this.updateExtractionButton();
                this.showAlert('Extraction started successfully', 'success');
            } else {
                this.showAlert('Failed to start extraction: ' + result.error, 'error');
            }

        } catch (error) {
            this.showAlert('Network error: ' + error.message, 'error');
        }
    }

    async getExtractionStatus() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();

            this.extractionStatus = status;
            this.updateProgressDisplay(status);

            // Check if extraction completed
            if (this.isExtracting && !status.running) {
                this.isExtracting = false;
                this.onExtractionComplete(status);
            }

        } catch (error) {
            console.error('Failed to get extraction status:', error);
        }
    }

    onExtractionComplete(status) {
        this.hideProgressSection();
        this.showResultsSection(status);
        this.updateExtractionButton();
        this.loadFiles(); // Refresh file list

        if (status.message.includes('completed!')) {
            this.showAlert('Extraction completed successfully!', 'success');
        } else {
            this.showAlert('Extraction completed with issues: ' + status.message, 'warning');
        }
    }

    startStatusPolling() {
        setInterval(() => {
            this.getExtractionStatus();
        }, 2000); // Poll every 2 seconds
    }

    // File Management Methods
    async loadFiles() {
        const filesList = document.getElementById('filesList');
        filesList.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Loading files...</p></div>';

        try {
            const response = await fetch('/api/files');
            const data = await response.json();

            if (response.ok) {
                this.displayFiles(data.files);
            } else {
                filesList.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error loading files: ' + data.error + '</p></div>';
            }

        } catch (error) {
            filesList.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Network error: ' + error.message + '</p></div>';
        }
    }

    displayFiles(files) {
        const filesList = document.getElementById('filesList');

        if (files.length === 0) {
            filesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-csv"></i>
                    <p>No CSV files found. Start an extraction to create files.</p>
                </div>
            `;
            return;
        }

        const filesHTML = files.map(file => `
            <div class="file-item">
                <div class="file-icon">
                    <i class="fas fa-file-csv"></i>
                </div>
                <div class="file-info">
                    <div class="file-name">${file.filename}</div>
                    <div class="file-meta">
                        <span><i class="fas fa-calendar"></i> ${this.formatDate(file.created)}</span>
                        <span><i class="fas fa-hdd"></i> ${this.formatFileSize(file.size)}</span>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-outline" onclick="app.downloadFile('${file.filename}')">
                        <i class="fas fa-download"></i> Download
                    </button>
                    <button class="btn btn-secondary" onclick="app.previewFile('${file.filename}')">
                        <i class="fas fa-eye"></i> Preview
                    </button>
                </div>
            </div>
        `).join('');

        filesList.innerHTML = filesHTML;
    }

    downloadFile(filename) {
        window.open(`/api/download/${filename}`, '_blank');
    }

    async previewFile(filename) {
        try {
            const response = await fetch(`/api/preview/${filename}`);
            const data = await response.json();

            if (response.ok) {
                this.showPreviewModal(filename, data);
            } else {
                this.showAlert('Failed to preview file: ' + data.error, 'error');
            }

        } catch (error) {
            this.showAlert('Network error: ' + error.message, 'error');
        }
    }

    async showStatistics() {
        try {
            const response = await fetch('/api/statistics');
            const data = await response.json();

            if (response.ok) {
                this.showStatsModal(data);
            } else {
                this.showAlert('Failed to load statistics: ' + data.error, 'error');
            }

        } catch (error) {
            this.showAlert('Network error: ' + error.message, 'error');
        }
    }

    // UI Update Methods
    updateURLList() {
        const urlList = document.getElementById('urlList');

        if (this.urls.length === 0) {
            urlList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-link"></i>
                    <p>No URLs added yet. Add some URLs above to get started.</p>
                </div>
            `;
            return;
        }

        const urlsHTML = this.urls.map(url => `
            <div class="url-item">
                <div class="url-item-content">
                    <div class="url-item-url">${url}</div>
                    <div class="url-item-status">
                        <span class="url-status pending">Ready for extraction</span>
                    </div>
                </div>
                <div class="url-item-actions">
                    <button class="btn btn-outline" onclick="app.validateURL('${url}')">
                        <i class="fas fa-check"></i> Validate
                    </button>
                    <button class="btn btn-danger" onclick="app.removeURL('${url}')">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </div>
        `).join('');

        urlList.innerHTML = urlsHTML;
    }

    updateURLCount() {
        const urlCount = document.getElementById('urlCount');
        urlCount.textContent = `${this.urls.length} URLs`;
    }

    updateExtractionButton() {
        const button = document.getElementById('startExtractionBtn');

        if (this.isExtracting) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Extracting...';
        } else if (this.urls.length === 0) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-play"></i> Start Extraction';
        } else {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-play"></i> Start Extraction';
        }
    }

    showProgressSection() {
        const progressSection = document.getElementById('progressSection');
        const resultsSection = document.getElementById('resultsSection');

        progressSection.style.display = 'block';
        resultsSection.style.display = 'none';
    }

    hideProgressSection() {
        const progressSection = document.getElementById('progressSection');
        progressSection.style.display = 'none';
    }

    showResultsSection(status) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsContent = document.getElementById('resultsContent');

        const resultsHTML = `
            <div class="result-stats">
                <div class="stat-card">
                    <div class="stat-value">${status.total_urls || 0}</div>
                    <div class="stat-label">Total URLs</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${status.processed_urls || 0}</div>
                    <div class="stat-label">Processed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${status.progress || 0}%</div>
                    <div class="stat-label">Completion</div>
                </div>
            </div>
            <div class="result-item">
                <h4>Extraction Summary</h4>
                <p>${status.message}</p>
                ${status.output_file ? `<p><strong>Output file:</strong> ${status.output_file}</p>` : ''}
                ${status.last_extraction ? `<p><strong>Completed at:</strong> ${this.formatDateTime(status.last_extraction)}</p>` : ''}
            </div>
        `;

        resultsContent.innerHTML = resultsHTML;
        resultsSection.style.display = 'block';
    }

    updateProgressDisplay(status) {
        if (!this.isExtracting) return;

        const progressFill = document.getElementById('progressFill');
        const progressPercent = document.getElementById('progressPercent');
        const progressText = document.getElementById('progressText');
        const currentUrl = document.getElementById('currentUrl');

        if (progressFill) progressFill.style.width = `${status.progress || 0}%`;
        if (progressPercent) progressPercent.textContent = `${status.progress || 0}%`;
        if (progressText) progressText.textContent = status.message || 'Processing...';
        if (currentUrl) currentUrl.textContent = `Processing ${status.processed_urls || 0} of ${status.total_urls || 0} URLs`;
    }

    // Modal Methods
    showValidationModal(content) {
        const modal = document.getElementById('validationModal');
        const modalContent = document.getElementById('validationContent');

        modalContent.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>${content}</p>
            </div>
        `;

        modal.style.display = 'block';
    }

    showValidationResult(url, result) {
        const modalContent = document.getElementById('validationContent');

        const statusClass = result.valid ? 'success' : 'error';
        const statusIcon = result.valid ? 'check-circle' : 'times-circle';
        const statusText = result.valid ? 'Valid' : 'Invalid';

        modalContent.innerHTML = `
            <div class="validation-result">
                <div class="status-indicator ${statusClass}">
                    <i class="fas fa-${statusIcon}"></i>
                    ${statusText}
                </div>
                <div class="validation-details">
                    <h4>URL: ${url}</h4>
                    ${result.valid ? `
                        <p><strong>Status Code:</strong> ${result.status_code}</p>
                        <p><strong>Content Type:</strong> ${result.content_type || 'Not specified'}</p>
                    ` : `
                        <p><strong>Error:</strong> ${result.error}</p>
                        ${result.status_code ? `<p><strong>Status Code:</strong> ${result.status_code}</p>` : ''}
                    `}
                </div>
            </div>
        `;
    }

    showPreviewModal(filename, data) {
        const modal = document.getElementById('previewModal') || this.createPreviewModal();
        const modalContent = modal.querySelector('.modal-body');

        const previewHTML = `
            <h4>File: ${filename}</h4>
            <p><strong>Total Rows:</strong> ${data.total_rows}</p>
            <p><strong>Columns:</strong> ${data.columns.length}</p>
            
            <div class="preview-table-container">
                <table class="preview-table">
                    <thead>
                        <tr>
                            ${data.columns.map(col => `<th>${col}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.rows.slice(0, 5).map(row => `
                            <tr>
                                ${data.columns.map(col => `<td>${row[col] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            ${data.total_rows > 5 ? `<p><em>Showing first 5 rows of ${data.total_rows} total rows.</em></p>` : ''}
        `;

        modalContent.innerHTML = previewHTML;
        modal.style.display = 'block';
    }

    showStatsModal(stats) {
        const modal = document.getElementById('statsModal');
        const modalContent = document.getElementById('statsContent');

        const avgFileSize = stats.file_sizes.length > 0
            ? stats.file_sizes.reduce((a, b) => a + b, 0) / stats.file_sizes.length
            : 0;

        modalContent.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.total_files}</div>
                    <div class="stat-label">Total Files</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.total_incidents}</div>
                    <div class="stat-label">Total Incidents</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.recent_extractions}</div>
                    <div class="stat-label">Recent Extractions (7 days)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.formatFileSize(avgFileSize)}</div>
                    <div class="stat-label">Average File Size</div>
                </div>
            </div>
            
            <div class="stats-details">
                <h4>Extraction Statistics</h4>
                <p>These statistics are based on all CSV files in the daily reports directory.</p>
            </div>
        `;

        modal.style.display = 'block';
    }

    createPreviewModal() {
        const modalHTML = `
            <div id="previewModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-eye"></i> File Preview</h3>
                        <button type="button" class="modal-close" onclick="app.closeModal('previewModal')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <!-- Preview content will be inserted here -->
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        return document.getElementById('previewModal');
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Utility Methods
    isValidURL(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    formatDateTime(dateString) {
        return new Date(dateString).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showAlert(message, type = 'info') {
        // Create alert element if it doesn't exist
        let alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) {
            alertContainer = document.createElement('div');
            alertContainer.id = 'alertContainer';
            alertContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                max-width: 400px;
            `;
            document.body.appendChild(alertContainer);
        }

        const alertId = 'alert-' + Date.now();
        const iconMap = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };

        const alert = document.createElement('div');
        alert.id = alertId;
        alert.className = `alert alert-${type}`;
        alert.style.cssText = `
            padding: 15px 20px;
            margin-bottom: 10px;
            border-radius: 8px;
            background: var(--${type === 'error' ? 'danger' : type}-color);
            color: white;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        alert.innerHTML = `
            <i class="fas fa-${iconMap[type]}"></i>
            <span>${message}</span>
            <button onclick="app.removeAlert('${alertId}')" style="
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                margin-left: auto;
                font-size: 18px;
            ">×</button>
        `;

        alertContainer.appendChild(alert);

        // Animate in
        setTimeout(() => {
            alert.style.opacity = '1';
            alert.style.transform = 'translateX(0)';
        }, 10);

        // Auto remove after 5 seconds
        setTimeout(() => {
            this.removeAlert(alertId);
        }, 5000);
    }

    removeAlert(alertId) {
        const alert = document.getElementById(alertId);
        if (alert) {
            alert.style.opacity = '0';
            alert.style.transform = 'translateX(100%)';
            setTimeout(() => {
                alert.remove();
            }, 300);
        }
    }

    // Public method for URL validation from HTML
    async validateURL(url) {
        try {
            const response = await fetch('/api/validate-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });

            const result = await response.json();

            // Update URL item status
            const urlItems = document.querySelectorAll('.url-item');
            urlItems.forEach(item => {
                const urlElement = item.querySelector('.url-item-url');
                if (urlElement && urlElement.textContent === url) {
                    const statusElement = item.querySelector('.url-status');
                    if (statusElement) {
                        statusElement.className = `url-status ${result.valid ? 'valid' : 'invalid'}`;
                        statusElement.textContent = result.valid ? 'Valid URL' : 'Invalid URL';
                    }
                }
            });

            this.showAlert(
                result.valid ? 'URL is valid and accessible' : `URL validation failed: ${result.error}`,
                result.valid ? 'success' : 'error'
            );

        } catch (error) {
            this.showAlert('Network error during validation: ' + error.message, 'error');
        }
    }
}

// Global functions for HTML onclick handlers
function showHelp() {
    const modal = document.getElementById('helpModal');
    modal.style.display = 'block';
}

function showAbout() {
    app.showAlert('Gaza Crisis Data Extractor v1.0 - Built for humanitarian documentation and crisis data analysis.', 'info');
}

function closeModal(modalId) {
    app.closeModal(modalId);
}

// Add preview table styles
const tableStyles = document.createElement('style');
tableStyles.textContent = `
    .preview-table-container {
        max-height: 400px;
        overflow: auto;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        margin: 15px 0;
    }
    
    .preview-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
    }
    
    .preview-table th,
    .preview-table td {
        padding: 8px 12px;
        border-bottom: 1px solid #e9ecef;
        text-align: left;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .preview-table th {
        background: #f8f9fa;
        font-weight: 600;
        position: sticky;
        top: 0;
        z-index: 1;
    }
    
    .preview-table tr:hover {
        background: #f8f9fa;
    }
    
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
    }
    
    .validation-result {
        text-align: center;
        padding: 20px;
    }
    
    .validation-details {
        margin-top: 20px;
        text-align: left;
        background: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
    }
    
    .validation-details h4 {
        margin-bottom: 10px;
        word-break: break-all;
    }
`;
document.head.appendChild(tableStyles);

// Initialize the application
const app = new GazaDataExtractor();

// Export for testing purposes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GazaDataExtractor;
}