/**
 * Site Configuration
 * Global settings for Gaza Crisis Documentation
 * Compatible with GitHub Pages and localhost
 * Last Updated: 2025-10-12
 */

(function() {
    'use strict';

    // Detect if we're on GitHub Pages
    function detectGitHubPages() {
        const hostname = window.location.hostname;
        const pathname = window.location.pathname;
        
        // Check for GitHub Pages hosting
        if (hostname.includes('github.io')) {
            // Extract repository name from path
            const pathParts = pathname.split('/').filter(p => p.length > 0);
            if (pathParts.length > 0 && !pathParts[0].includes('.html')) {
                return '/' + pathParts[0] + '/';
            }
        }
        
        return '/';
    }

    // Get base URL
    const baseUrl = detectGitHubPages();
    
    console.log(`🌍 Site base URL detected: ${baseUrl}`);
    
    window.siteConfig = {
        // Base URL for the site (used for calculating paths)
        baseUrl: baseUrl,
        
        // Path to translation files (relative to base)
        translationsPath: baseUrl + 'translations/',
        
        // Default language
        defaultLanguage: 'en',
        
        // Debug mode (enables detailed logging)
        debug: true,
        
        // GitHub Pages mode
        isGitHubPages: baseUrl !== '/',
        
        // Repository name (if on GitHub Pages)
        repoName: baseUrl !== '/' ? baseUrl.split('/').filter(p => p)[0] : null
    };

    // Global translation configuration
    window.translationConfig = {
        debug: true,
        
        // Dynamic function to calculate path to translations based on page depth
        customTranslationPath: function(lang) {
            // Calculate path to root directory
            const path = window.location.pathname;
            let cleanPath = path;
            
            // Remove base URL from path
            if (window.siteConfig.baseUrl !== '/') {
                cleanPath = path.replace(window.siteConfig.baseUrl, '/');
            }
            
            const parts = cleanPath.split('/').filter(p => p.length > 0);
            const dirDepth = cleanPath.endsWith('.html') ? parts.length - 1 : parts.length;
            
            // Build path to root
            let rootPath;
            if (dirDepth <= 0) {
                rootPath = './';
            } else {
                rootPath = Array(dirDepth).fill('..').join('/') + '/';
            }
            
            const translationPath = `${rootPath}translations/${lang}.json`;
            
            if (window.siteConfig.debug) {
                console.log(`🔍 Translation path for ${lang}: ${translationPath} (depth: ${dirDepth})`);
            }
            
            return translationPath;
        }
    };

    console.log('✅ Site configuration loaded:', {
        baseUrl: window.siteConfig.baseUrl,
        isGitHubPages: window.siteConfig.isGitHubPages,
        repoName: window.siteConfig.repoName,
        translationsPath: window.siteConfig.translationsPath
    });
})();
