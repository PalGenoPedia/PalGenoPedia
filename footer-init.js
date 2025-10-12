/**
 * Universal Footer Initializer
 * Automatically loads footer and generates share buttons for ANY page
 * Version: 1.2.0 - Fixed translation path resolution
 * Last Updated: 2025-10-12 17:44:52
 */

console.log('🔧 Universal Footer Initializer loading...');

(function() {
    'use strict';

    // Check if translation system is ready or wait for it
    function ensureTranslationSystem(callback) {
        if (window.TranslationSystem) {
            callback();
        } else {
            console.log('⏳ Waiting for translation system to load...');
            document.addEventListener('translationSystemReady', callback);

            // Set a timeout in case translation system never loads
            setTimeout(() => {
                if (!window.TranslationSystem) {
                    console.warn('⚠️ Translation system not available after timeout');
                    callback();
                }
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
            // Calculate path to root directory
            const path = window.location.pathname;
            const parts = path.split('/').filter(p => p.length > 0);
            const dirDepth = path.endsWith('.html') ? parts.length - 1 : parts.length;
            const rootPath = dirDepth <= 0 ? './' : Array(dirDepth).fill('..').join('/') + '/';

            // Use correct path to common-styles.html
            const commonStylesPath = `${rootPath}common-styles.html`;
            console.log(`🔍 Loading footer from: ${commonStylesPath}`);

            // Load the footer HTML
            const response = await fetch(commonStylesPath);
            const html = await response.text();

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
                console.log('🌍 Translation system available, applying translations to footer');
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
                    window.TranslationSystem.init(translationConfig);
                }
            } else {
                console.warn('⚠️ Translation system not available');

                // Try to load translation system
                const scriptElement = document.createElement('script');
                scriptElement.src = `${rootPath}js/translation-system.js`;
                scriptElement.onload = function() {
                    if (window.TranslationSystem) {
                        const translationConfig = {
                            debug: true,
                            customTranslationPath: function(lang) {
                                return `${rootPath}translations/${lang}.json`;
                            }
                        };

                        window.TranslationSystem.init(translationConfig);
                        translateFooter();
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
        if (!window.TranslationSystem || !window.TranslationSystem.getTranslation) return;

        // Apply translations to footer elements
        const footerElements = document.querySelectorAll('.universal-footer [data-i18n]');
        footerElements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                const translation = window.TranslationSystem.getTranslation(key);
                if (translation) {
                    el.textContent = translation;
                }
            }
        });

        console.log('✅ Footer translations applied');
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
                            title="Copy link to clipboard">
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
                       title="Share on ${platform.name}">
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
    }

    function showFallbackFooter(container) {
        container.innerHTML = `
            <footer class="universal-footer">
                <div class="footer-container">
                    <div class="footer-bottom">
                        <div class="footer-copyright">
                            © 2024 Gaza Crisis Documentation Platform. All rights reserved.
                        </div>
                        <div class="footer-meta">
                            <span class="footer-update-time">Last Updated: October 12, 2025</span>
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
                    .then(() => showCopyNotification('✅ Link copied to clipboard!'))
                    .catch(() => fallbackCopyToClipboard(url));
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
                showCopyNotification('✅ Link copied to clipboard!');
            } else {
                showCopyNotification('❌ Failed to copy link');
            }
        } catch (err) {
            showCopyNotification('❌ Failed to copy link');
            console.error('Fallback copy failed:', err);
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
        notification.innerHTML = `<span>${message}</span>`;
        document.body.appendChild(notification);

        // Show with animation
        setTimeout(() => notification.classList.add('show'), 10);

        // Hide and remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
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

    console.log('✅ Footer utilities initialized');
})();
