/**
 * Universal Footer Initializer
 * Automatically loads footer and generates share buttons for ANY page
 * Version: 1.3.0 - Fixed for GitHub Pages deployment
 * Last Updated: 2025-10-12
 */

console.log('🔧 Universal Footer Initializer loading...');

(function() {
    'use strict';

    // Get base path for GitHub Pages or regular hosting
    function getBasePath() {
        // Check if we have a configured base path
        if (window.siteConfig && window.siteConfig.baseUrl) {
            return window.siteConfig.baseUrl;
        }

        // Auto-detect GitHub Pages repository name
        const path = window.location.pathname;
        const pathParts = path.split('/').filter(p => p.length > 0);

        // If the first part doesn't contain .html, it might be a repo name
        if (pathParts.length > 0 && !pathParts[0].includes('.html')) {
            // Check if this looks like a GitHub Pages repo
            if (window.location.hostname.includes('github.io')) {
                return '/' + pathParts[0] + '/';
            }
        }

        return '/';
    }

    // Calculate relative path to root from current page
    function getPathToRoot() {
        const basePath = getBasePath();
        const currentPath = window.location.pathname;

        // Remove base path from current path
        let relativePath = currentPath;
        if (basePath !== '/' && currentPath.startsWith(basePath)) {
            relativePath = currentPath.substring(basePath.length);
        }

        // Count directory depth
        const parts = relativePath.split('/').filter(p => p.length > 0);
        const dirDepth = relativePath.endsWith('.html') ? parts.length - 1 : parts.length;

        console.log(`📍 Path calculation: base="${basePath}", current="${currentPath}", depth=${dirDepth}`);

        if (dirDepth <= 0) {
            return './';
        }

        return Array(dirDepth).fill('..').join('/') + '/';
    }

    // Check if translation system is ready or wait for it
    function ensureTranslationSystem(callback) {
        if (window.TranslationSystem) {
            callback();
        } else {
            console.log('⏳ Waiting for translation system to load...');
            
            let callbackExecuted = false;
            
            const executeCallback = () => {
                if (!callbackExecuted) {
                    callbackExecuted = true;
                    callback();
                }
            };

            document.addEventListener('translationSystemReady', executeCallback, { once: true });

            // Set a timeout in case translation system never loads
            setTimeout(() => {
                if (!window.TranslationSystem) {
                    console.warn('⚠️ Translation system not available after timeout');
                }
                executeCallback();
            }, 2000);
        }
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ensureTranslationSystem(initFooter));
    } else {
        ensureTranslationSystem(initFooter);
    }

    async function initFooter() {
        console.log('📄 Initializing universal footer...');

        const footerPlaceholder = document.getElementById('footer-placeholder');
        if (!footerPlaceholder) {
            console.warn('⚠️ Footer placeholder not found');
            return;
        }

        try {
            // Get root path
            const rootPath = getPathToRoot();
            const commonStylesPath = `${rootPath}common-styles.html`;
            
            console.log(`🔍 Loading footer from: ${commonStylesPath}`);

            // Load the footer HTML with error handling
            let response;
            try {
                response = await fetch(commonStylesPath);
            } catch (fetchError) {
                console.error('❌ Network error loading footer:', fetchError);
                throw new Error(`Network error: ${fetchError.message}`);
            }
            
            if (!response.ok) {
                console.error(`❌ HTTP error loading footer: ${response.status} ${response.statusText}`);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const html = await response.text();

            if (!html || html.trim().length === 0) {
                throw new Error('Footer HTML is empty');
            }

            footerPlaceholder.innerHTML = html;
            console.log('✅ Footer HTML loaded successfully');

            // Wait a moment for DOM to settle
            await new Promise(resolve => setTimeout(resolve, 100));

            // Initialize social share buttons
            initializeSocialShareButtons();

            // Initialize mobile footer accordion
            initializeMobileFooter();

            // Initialize translation system ONLY if not already initialized
            if (window.TranslationSystem) {
                console.log('🌐 Translation system available, applying translations to footer');
                translateFooter();

                // If translation system needs initialization
                if (!window.TranslationSystem.isInitialized && typeof window.TranslationSystem.init === 'function') {
                    // Create configuration with correct root path
                    const translationConfig = {
                        debug: true,
                        customTranslationPath: function(lang) {
                            return `${rootPath}translations/${lang}.json`;
                        }
                    };

                    // Initialize translation system with our config
                    await window.TranslationSystem.init(translationConfig);
                }
            } else {
                console.warn('⚠️ Translation system not available, attempting to load...');

                // Try to load translation system
                const scriptElement = document.createElement('script');
                scriptElement.src = `${rootPath}js/translation-system.js`;
                scriptElement.onerror = function() {
                    console.error('❌ Failed to load translation system script');
                };
                scriptElement.onload = function() {
                    console.log('✅ Translation system script loaded');
                    if (window.TranslationSystem) {
                        const translationConfig = {
                            debug: true,
                            customTranslationPath: function(lang) {
                                return `${rootPath}translations/${lang}.json`;
                            }
                        };

                        window.TranslationSystem.init(translationConfig).then(() => {
                            translateFooter();
                        });
                    }
                };
                document.head.appendChild(scriptElement);
            }

            console.log('✅ Footer fully initialized');

        } catch (error) {
            console.error('❌ Error loading footer:', error);
            showFallbackFooter(footerPlaceholder);
        }
    }

    function translateFooter() {
        if (!window.TranslationSystem || !window.TranslationSystem.getTranslation) {
            console.warn('⚠️ Translation system not ready for footer translation');
            return;
        }

        // Apply translations to footer elements
        const footerElements = document.querySelectorAll('.universal-footer [data-i18n]');
        let translatedCount = 0;

        footerElements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                const translation = window.TranslationSystem.getTranslation(key);
                if (translation) {
                    el.textContent = translation;
                    translatedCount++;
                }
            }
        });

        console.log(`✅ Footer translations applied (${translatedCount} elements)`);
    }

    function initializeSocialShareButtons() {
        const buttonsContainer = document.getElementById('socialShareButtons');

        if (!buttonsContainer) {
            console.warn('⚠️ Social share buttons container not found');
            return;
        }

        if (buttonsContainer.dataset.initialized === 'true') {
            console.log('🔤 Share buttons already initialized');
            return;
        }

        console.log('🔤 Generating social share buttons for current page...');

        // Get current page information
        const currentUrl = encodeURIComponent(window.location.href);
        const pageTitle = encodeURIComponent(document.title || 'Gaza Crisis Documentation');
        const shareText = document.title ?
            `${document.title} - Gaza Crisis Documentation` :
            'Gaza Crisis Documentation - Verified Data';
        const shareTextEncoded = encodeURIComponent(shareText);

        // Define social media platforms
        const socialPlatforms = [
            {
                name: 'Twitter/X',
                icon: '𝕏',
                class: 'btn-twitter',
                url: `https://twitter.com/intent/tweet?text=${shareTextEncoded}&url=${currentUrl}`
            },
            {
                name: 'Facebook',
                icon: '📘',
                class: 'btn-facebook',
                url: `https://www.facebook.com/sharer/sharer.php?u=${currentUrl}&quote=${shareTextEncoded}`
            },
            {
                name: 'LinkedIn',
                icon: '💼',
                class: 'btn-linkedin',
                url: `https://www.linkedin.com/sharing/share-offsite/?url=${currentUrl}`
            },
            {
                name: 'WhatsApp',
                icon: '💬',
                class: 'btn-whatsapp',
                url: `https://wa.me/?text=${shareTextEncoded}%20${currentUrl}`
            },
            {
                name: 'Telegram',
                icon: '✈️',
                class: 'btn-telegram',
                url: `https://t.me/share/url?url=${currentUrl}&text=${shareTextEncoded}`
            },
            {
                name: 'Reddit',
                icon: '🔴',
                class: 'btn-reddit',
                url: `https://reddit.com/submit?url=${currentUrl}&title=${shareTextEncoded}`
            },
            {
                name: 'Email',
                icon: '📧',
                class: 'btn-email',
                url: `mailto:?subject=${pageTitle}&body=${shareTextEncoded}%0A%0A${currentUrl}`
            },
            {
                name: 'Copy Link',
                icon: '🔗',
                class: 'btn-copy',
                url: '#',
                action: 'copy'
            }
        ];

        // Generate HTML for buttons
        const buttonsHTML = socialPlatforms.map(platform => {
            if (platform.action === 'copy') {
                return `
                    <button class="social-share-btn ${platform.class}"
                            onclick="window.FooterUtils.copyPageLink()"
                            title="Copy link to clipboard"
                            aria-label="Copy link to clipboard">
                        <span class="share-icon">${platform.icon}</span>
                        <span class="share-label">${platform.name}</span>
                    </button>
                `;
            } else {
                return `
                    <a href="${platform.url}"
                       class="social-share-btn ${platform.class}"
                       target="_blank"
                       rel="noopener noreferrer"
                       title="Share on ${platform.name}"
                       aria-label="Share on ${platform.name}">
                        <span class="share-icon">${platform.icon}</span>
                        <span class="share-label">${platform.name}</span>
                    </a>
                `;
            }
        }).join('');

        // Insert buttons into container
        buttonsContainer.innerHTML = buttonsHTML;
        buttonsContainer.dataset.initialized = 'true';

        console.log(`✅ Generated ${socialPlatforms.length} social share buttons`);
    }

    function initializeMobileFooter() {
        const footerColumns = document.querySelectorAll('.footer-column');
        const isMobile = window.innerWidth <= 768;

        if (!isMobile) {
            footerColumns.forEach(column => column.classList.remove('collapsed'));
            return;
        }

        console.log('📱 Initializing mobile footer accordion...');

        footerColumns.forEach((column, index) => {
            const header = column.querySelector('h4');
            if (!header) return;

            // Collapse all except first
            if (index !== 0) {
                column.classList.add('collapsed');
            }

            // Remove existing click handler if any
            const newHeader = header.cloneNode(true);
            header.parentNode.replaceChild(newHeader, header);

            // Add click handler
            newHeader.addEventListener('click', function() {
                column.classList.toggle('collapsed');
            });
        });

        console.log(`✅ Mobile footer initialized (${footerColumns.length} sections)`);
    }

    function showFallbackFooter(container) {
        console.log('⚠️ Loading fallback footer');
        
        container.innerHTML = `
            <footer class="universal-footer" style="background: var(--surface-color, #fff); border-top: 2px solid var(--border-color, #dee2e6); padding: 2rem 0; margin-top: 4rem;">
                <div class="footer-container" style="max-width: 1400px; margin: 0 auto; padding: 0 1rem;">
                    <div class="footer-bottom" style="text-align: center; padding: 1rem 0; border-top: 1px solid var(--border-color, #dee2e6);">
                        <div class="footer-copyright" style="color: var(--text-secondary, #6c757d); margin-bottom: 0.5rem;">
                            © 2024 Gaza Crisis Documentation Platform. All rights reserved.
                        </div>
                        <div class="footer-meta" style="color: var(--text-muted, #adb5bd); font-size: 0.85rem;">
                            <span class="footer-update-time">Last Updated: October 12, 2025</span>
                        </div>
                        <div style="margin-top: 1rem;">
                            <button onclick="location.reload()" style="background: var(--accent-color, #ff6b35); color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer;">
                                🔄 Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            </footer>
        `;
    }

    // Create global utility functions
    window.FooterUtils = {
        copyPageLink: function() {
            const url = window.location.href;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url)
                    .then(() => {
                        console.log('✅ Link copied to clipboard');
                        showCopyNotification('✅ Link copied to clipboard!');
                    })
                    .catch((err) => {
                        console.warn('⚠️ Clipboard API failed, using fallback:', err);
                        fallbackCopyToClipboard(url);
                    });
            } else {
                fallbackCopyToClipboard(url);
            }
        },

        refreshShareButtons: function() {
            const container = document.getElementById('socialShareButtons');
            if (container) {
                container.dataset.initialized = 'false';
                initializeSocialShareButtons();
            }
        },

        reinitializeFooter: function() {
            console.log('🔄 Reinitializing footer...');
            initFooter();
        }
    };

    function fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                console.log('✅ Link copied using fallback method');
                showCopyNotification('✅ Link copied to clipboard!');
            } else {
                console.error('❌ Failed to copy link');
                showCopyNotification('❌ Failed to copy link');
            }
        } catch (err) {
            console.error('❌ Fallback copy failed:', err);
            showCopyNotification('❌ Failed to copy link');
        }

        document.body.removeChild(textArea);
    }

    function showCopyNotification(message) {
        // Remove existing notification if any
        const existing = document.querySelector('.copy-notification');
        if (existing) existing.remove();

        // Create notification
        const notification = document.createElement('div');
        notification.className = 'copy-notification';
        notification.style.cssText = `
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            background: var(--success-color, #28a745);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            font-weight: 600;
            z-index: 10000;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        `;
        notification.innerHTML = `<span>${message}</span>`;
        document.body.appendChild(notification);

        // Show with animation
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);

        // Hide and remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Handle window resize for mobile footer
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(initializeMobileFooter, 250);
    });

    // Handle language change events
    document.addEventListener('languageChanged', function(e) {
        console.log('🌐 Language changed, updating footer translations');
        translateFooter();
    });

    console.log('✅ Footer utilities initialized');
})();
