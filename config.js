/**
 * Site Configuration
 * Global settings for Gaza Crisis Documentation
 * Last Updated: 2025-10-12 17:44:52
 */

window.siteConfig = {
    // Base URL for the site (used for calculating paths)
    baseUrl: '/',
    
    // Path to translation files
    translationsPath: '/translations/',
    
    // Default language
    defaultLanguage: 'en',
    
    // Debug mode (enables detailed logging)
    debug: true
};

// Global translation configuration
window.translationConfig = {
    debug: true,
    // Dynamic function to calculate path to translations based on page depth
    customTranslationPath: function(lang) {
        // Calculate path to root directory
        const path = window.location.pathname;
        const parts = path.split('/').filter(p => p.length > 0);
        const dirDepth = path.endsWith('.html') ? parts.length - 1 : parts.length;
        const rootPath = dirDepth <= 0 ? './' : Array(dirDepth).fill('..').join('/') + '/';
        
        console.log(`🔍 Translation path resolution: Current depth=${dirDepth}, path to root=${rootPath}`);
        
        return `${rootPath}translations/${lang}.json`;
    }
};

console.log('✅ Site configuration loaded');