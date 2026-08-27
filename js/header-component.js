/**
 * header-component.js
 * Renders the shared site header and wires up theme + active-nav logic.
 *
 * Usage — add to every page just before </body>:
 *   <div id="header-placeholder"></div>
 *   <script src="js/config.js"></script>
 *   <script src="js/header-component.js"></script>
 *
 * Per-page nav mode (optional) — declare before loading this script:
 *   <script>
 *     window.headerConfig = {
 *       mode: 'main'        // 'main' | 'stat-page'
 *       activePage: 'war-crimes'  // used in 'main' mode to highlight a nav link
 *     };
 *   </script>
 *
 * Modes:
 *   'main'      — index.html nav: War Crimes | Hunger Crisis | History | Timeline | Join Us
 *   'stat-page' — inner-page nav: ← Back to Main | Overview | Categories | Legal | Resources
 *                 Active tab is driven by data-view buttons (handled by the page's own JS).
 */

(function () {
    'use strict';

    /* ── helpers ─────────────────────────────────────────────── */

    /** Build a root-absolute path that works on both localhost and GitHub Pages.
     *  Always returns a leading-slash URL so sub-pages (e.g. Pages/War_Crimes_Stats/)
     *  resolve links to the site root, not their own directory.
     *    base='/'           → '/war-crimes/'
     *    base='/repo-name/' → '/repo-name/war-crimes/' */
    function rootPath(relativePath) {
        const base = (window.siteConfig && window.siteConfig.baseUrl) ? window.siteConfig.baseUrl : '/';
        // Strip trailing slash from base, strip leading './' from path, then join.
        return base.replace(/\/$/, '') + '/' + relativePath.replace(/^\.\//,'');
    }

    /** Detect active page from URL when headerConfig.activePage isn't set. */
    function detectActivePage() {
        const filename = window.location.pathname.split('/').pop() || 'index.html';
        // The war-crimes hub is a directory index, so there is no filename to
        // match - test the path instead. Kept ahead of the filename checks
        // because every page under /war-crimes/ belongs to this section.
        if (/^\/war-crimes(\/|$)/.test(window.location.pathname)) return 'war-crimes';
        if (filename === 'hunger-crisis-stats.html')           return 'hunger-crisis';
        if (/^\/historical-events\/ethnic-cleansing(\/|$)/.test(window.location.pathname)) return 'ethnic-cleansing';
        if (/\/historical-events\/massacres\/(index\.html)?$/.test(window.location.pathname)) return 'timeline';
        if (/^\/historical-events(\/|$)/.test(window.location.pathname)) return 'historical';
        if (filename === 'major-incidents-timeline.html')      return 'timeline';
        if (filename === 'volunteer.html')                     return 'volunteer';
        return 'home'; // index.html
    }

    /** Human-readable title shown in the sub-header for each page. */
    const PAGE_TITLES = {
        'war-crimes':        '⚖️ War Crimes Statistics',
        'hunger-crisis':     '🍽️ Hunger Crisis Statistics',
        'historical':        '📜 Historical Events',
        'timeline':          '📋 Current Timeline',
        'ethnic-cleansing':  '🏘️ Ethnic Cleansing Documentation',
        'volunteer':         '🤝 Join Us',
        'home':              '🏠 Home',
    };

    /* ── config ──────────────────────────────────────────────── */

    const cfg = window.headerConfig || {};
    const mode       = cfg.mode || 'main';           // 'main' | 'stat-page'
    const activePage = cfg.activePage || detectActivePage();
    const subNav     = cfg.subNav || null;           // 'timeline' | null

    /* ── nav HTML builders ───────────────────────────────────── */

    function activeIf(page) {
        return activePage === page ? ' class="nav-btn active"' : ' class="nav-btn"';
    }

    /** Main-page navigation (index.html) */
    function mainNav() {
        return `
            <a href="${rootPath('war-crimes/')}"${activeIf('war-crimes')}
               data-i18n="common.nav.warCrimes">⚖️ War Crimes</a>
            <a href="${rootPath('hunger-crisis-stats.html')}"${activeIf('hunger-crisis')}
               data-i18n="common.nav.hungerCrisis">🍽️ Hunger Crisis</a>
            <a href="${rootPath('historical-events/')}"${activeIf('historical')}
               data-i18n="common.nav.historical">📜 History</a>
            <a href="${rootPath('historical-events/massacres/')}"${activeIf('timeline')}
               data-i18n="common.nav.timeline">📋 Timeline</a>
            <a href="${rootPath('volunteer.html')}" class="nav-btn join-us-btn"
               data-i18n="common.nav.joinUs">🤝 Join Us</a>`;
    }

    /** Stat-page navigation (war-crimes / hunger-crisis inner pages) */
    function statPageNav() {
        return `
            <a href="${rootPath('index.html')}" class="nav-btn"
               data-i18n="common.nav.backToMain">← Back to Main</a>
            <button class="nav-btn active" data-view="overview"
               data-i18n="common.nav.overview">Overview</button>
            <button class="nav-btn" data-view="violations"
               data-i18n="common.nav.categories">Categories</button>
            <button class="nav-btn" data-view="legal"
               data-i18n="common.nav.legal">Legal Framework</button>
            <button class="nav-btn" data-view="resources"
               data-i18n="common.nav.resources">Resources</button>
            <button class="nav-btn" data-view="hungerData"
               data-i18n="common.nav.hungerData">🍽️ Hunger Data</button>`;
    }

    /** Sub-header bar rendered below the main header for the timeline page. */
    function timelineSubNavHTML() {
        const title = PAGE_TITLES[activePage] || '';
        return `
<div class="sub-header">
    <div class="container">
        ${title ? `<span class="sub-header-title">${title}</span>` : ''}
        <nav class="sub-nav">
            <button class="sub-nav-btn active" data-view="timeline"
                data-i18n="timeline.nav.timelineView">📅 Timeline</button>
            <button class="sub-nav-btn" data-view="map"
                data-i18n="timeline.nav.mapView">🗺️ Map</button>
            <button class="sub-nav-btn" data-view="list"
                data-i18n="timeline.nav.listView">📋 List</button>
        </nav>
    </div>
</div>`;
    }

    /** Sub-header bar for stat pages (Overview / Categories / Legal / Resources / Hunger Data). */
    function statPageSubNavHTML() {
        const title = PAGE_TITLES[activePage] || '';
        return `
<div class="sub-header">
    <div class="container">
        ${title ? `<span class="sub-header-title">${title}</span>` : ''}
        <nav class="sub-nav">
            <button class="sub-nav-btn active" data-view="overview"
                data-i18n="common.nav.overview">Overview</button>
            <button class="sub-nav-btn" data-view="violations"
                data-i18n="common.nav.categories">Categories</button>
            <button class="sub-nav-btn" data-view="legal"
                data-i18n="common.nav.legal">Legal Framework</button>
            <button class="sub-nav-btn" data-view="resources"
                data-i18n="common.nav.resources">Resources</button>
            <button class="sub-nav-btn hunger-data-tab" data-view="hungerData"
                data-i18n="common.nav.hungerData">🍽️ Hunger Data</button>
        </nav>
    </div>
</div>`;
    }

    /** Inject sub-header styles into <head> once. */
    function injectSubHeaderStyles() {
        if (document.getElementById('sub-header-styles')) return;
        const style = document.createElement('style');
        style.id = 'sub-header-styles';
        style.textContent = `
            .sub-header {
                background: var(--surface-color);
                border-bottom: 1px solid var(--border-color);
                box-shadow: 0 2px 4px rgba(0,0,0,.06);
                position: sticky;
                top: var(--header-height, 60px);
                z-index: 99;
            }
            .sub-header .container {
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            /* Page name label on the left of the sub-header */
            .sub-header-title {
                font-size: 0.85rem;
                font-weight: 700;
                color: var(--text-primary);
                white-space: nowrap;
                padding: 0 0.5rem 0 0;
                border-right: 2px solid var(--border-color);
                margin-right: 0.25rem;
                flex-shrink: 0;
            }
            .sub-nav {
                display: flex;
                gap: 0;
            }
            .sub-nav-btn {
                background: none;
                border: none;
                border-bottom: 3px solid transparent;
                padding: 0.75rem 1.5rem;
                font-size: 0.95rem;
                font-weight: 600;
                color: var(--text-secondary);
                cursor: pointer;
                transition: color .2s, border-color .2s;
                white-space: nowrap;
            }
            .sub-nav-btn:hover {
                color: var(--text-primary);
                border-bottom-color: var(--border-color);
            }
            .sub-nav-btn.active {
                color: var(--secondary-color, #c0392b);
                border-bottom-color: var(--secondary-color, #c0392b);
            }
            /* Hunger Data tab: subtle tint to distinguish it */
            .sub-nav-btn.hunger-data-tab {
                color: var(--critical-color, #c0392b);
                opacity: 0.85;
            }
            .sub-nav-btn.hunger-data-tab:hover,
            .sub-nav-btn.hunger-data-tab.active {
                opacity: 1;
                color: var(--critical-color, #c0392b);
                border-bottom-color: var(--critical-color, #c0392b);
            }
            /* Compact Join Us button */
            .header .nav .join-us-btn {
                padding: 0.35rem 0.85rem !important;
                font-size: 0.8rem !important;
                border-radius: 20px !important;
            }
        `;
        document.head.appendChild(style);
    }

    /* ── header-controls alignment fix + mobile nav ─────────── */

    (function injectHeaderControlsStyles() {
        if (document.getElementById('header-controls-styles')) return;
        const style = document.createElement('style');
        style.id = 'header-controls-styles';
        style.textContent = `
            /* Lock header layout to LTR regardless of page language (e.g. Arabic) */
            .header,
            .header .container,
            .header .nav,
            .header .header-controls {
                direction: ltr !important;
            }

            /* Force the whole header row to stay on one line */
            .header .container {
                display: flex !important;
                flex-direction: row !important;
                align-items: center !important;
                flex-wrap: nowrap !important;
            }

            /* Nav stays on one line and never wraps to a second row — desktop */
            .header .nav {
                display: flex !important;
                flex-direction: row !important;
                align-items: center !important;
                flex-wrap: nowrap !important;
                gap: 0.5rem !important;
                flex: 1 1 auto !important;
                justify-content: center !important;
                min-width: 0 !important;
            }

            /* Nav buttons don't break onto new lines */
            .header .nav .nav-btn,
            .header .nav .join-us-btn {
                white-space: nowrap !important;
                flex-shrink: 0 !important;
            }

            /* Controls group stays to the right, never wraps */
            .header-controls {
                display: flex !important;
                flex-direction: row !important;
                align-items: center !important;
                gap: 8px !important;
                flex-wrap: nowrap !important;
                flex-shrink: 0 !important;
            }
            .header-controls .language-selector { flex-shrink: 0; }
            .header-controls .theme-toggle      { flex-shrink: 0; }

            /* ── Hamburger button (hidden on desktop) ────────────── */
            .hamburger-btn {
                display: none;
                background: none;
                border: none;
                cursor: pointer;
                padding: 6px 8px;
                border-radius: 6px;
                color: var(--text-primary, #222);
                flex-shrink: 0;
                line-height: 1;
                transition: background 0.15s;
            }
            .hamburger-btn:hover { background: rgba(0,0,0,0.07); }
            .hamburger-btn svg   { display: block; }
            [data-theme="dark"] .hamburger-btn         { color: var(--text-primary, #eee); }
            [data-theme="dark"] .hamburger-btn:hover   { background: rgba(255,255,255,0.1); }

            /* ── Mobile drawer overlay ───────────────────────────── */
            .mobile-nav-overlay {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.45);
                z-index: 1998;
                opacity: 0;
                transition: opacity 0.25s;
            }
            .mobile-nav-overlay.is-open { display: block; opacity: 1; }

            /* ── Mobile nav drawer ───────────────────────────────── */
            .mobile-nav-drawer {
                position: fixed;
                top: 0; right: 0;
                height: 100%;
                width: min(280px, 82vw);
                background: var(--surface-color, #fff);
                z-index: 1999;
                display: flex;
                flex-direction: column;
                box-shadow: -4px 0 28px rgba(0,0,0,0.18);
                transform: translateX(100%);
                transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
                overflow-y: auto;
            }
            [data-theme="dark"] .mobile-nav-drawer { background: var(--surface-color, #1a1a2e); }
            .mobile-nav-drawer.is-open             { transform: translateX(0); }

            .mobile-drawer-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 1rem 1.25rem;
                border-bottom: 1px solid var(--border-color, #e0e0e0);
                flex-shrink: 0;
            }
            .mobile-drawer-label {
                font-size: 0.75rem;
                font-weight: 700;
                letter-spacing: 0.07em;
                text-transform: uppercase;
                color: var(--text-secondary, #666);
            }
            .mobile-drawer-close {
                background: none;
                border: none;
                cursor: pointer;
                font-size: 1.25rem;
                line-height: 1;
                padding: 4px 6px;
                border-radius: 4px;
                color: var(--text-primary, #222);
                transition: background 0.15s;
            }
            .mobile-drawer-close:hover            { background: rgba(0,0,0,0.07); }
            [data-theme="dark"] .mobile-drawer-close { color: var(--text-primary, #eee); }
            [data-theme="dark"] .mobile-drawer-close:hover { background: rgba(255,255,255,0.1); }

            .mobile-drawer-links {
                display: flex;
                flex-direction: column;
                padding: 0.5rem 0 1rem;
            }
            .mobile-drawer-links a,
            .mobile-drawer-links button {
                display: block;
                width: 100%;
                text-align: left;
                padding: 0.8rem 1.5rem;
                font-size: 0.975rem;
                font-weight: 600;
                color: var(--text-primary, #222);
                text-decoration: none;
                background: none;
                border: none;
                border-left: 3px solid transparent;
                cursor: pointer;
                transition: background 0.12s, border-color 0.12s, color 0.12s;
                box-sizing: border-box;
            }
            [data-theme="dark"] .mobile-drawer-links a,
            [data-theme="dark"] .mobile-drawer-links button {
                color: var(--text-primary, #eee);
            }
            .mobile-drawer-links a:hover,
            .mobile-drawer-links button:hover { background: rgba(0,0,0,0.05); }
            [data-theme="dark"] .mobile-drawer-links a:hover,
            [data-theme="dark"] .mobile-drawer-links button:hover { background: rgba(255,255,255,0.07); }

            .mobile-drawer-links a.active,
            .mobile-drawer-links button.active {
                border-left-color: var(--secondary-color, #c0392b);
                color: var(--secondary-color, #c0392b);
                background: rgba(192,57,43,0.06);
            }
            /* Join Us gets a pill treatment inside the drawer */
            .mobile-drawer-links .join-us-btn {
                margin: 0.75rem 1.25rem 0;
                width: calc(100% - 2.5rem);
                text-align: center;
                border-left: none !important;
                border-radius: 20px;
                background: var(--secondary-color, #c0392b) !important;
                color: #fff !important;
                padding: 0.7rem 1rem;
            }
            .mobile-drawer-links .join-us-btn:hover { opacity: 0.88; }

            /* ── Logo: never shrink below its content ────────────── */
            .header .logo {
                flex-shrink: 0 !important;
                min-width: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* ── Medium screens: tighten everything so logo doesn't clip ── */
            @media (max-width: 1100px) {
                .header .logo a {
                    font-size: 1rem !important;
                }
                .header .nav {
                    gap: 0.2rem !important;
                }
                .header .nav .nav-btn {
                    padding: 0.35rem 0.6rem !important;
                    font-size: 0.8rem !important;
                }
                .header .nav .join-us-btn {
                    padding: 0.35rem 0.6rem !important;
                    font-size: 0.8rem !important;
                }
                .header-controls {
                    gap: 4px !important;
                }
            }

            /* ── Sub-header: scroll horizontally on mobile ───────── */
            @media (max-width: 640px) {
                .sub-header .container {
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                    scrollbar-width: none;
                    flex-wrap: nowrap;
                    gap: 0;
                }
                .sub-header .container::-webkit-scrollbar { display: none; }
                .sub-header-title { display: none; }
                .sub-nav-btn {
                    padding: 0.65rem 1rem !important;
                    font-size: 0.85rem !important;
                    white-space: nowrap;
                }
            }

            /* ── Mobile breakpoint: swap desktop nav for hamburger ── */
            @media (max-width: 640px) {
                .header .nav        { display: none !important; }
                .hamburger-btn      { display: flex !important; align-items: center; justify-content: center; }
            }
        `;
        document.head.appendChild(style);
    })();

    /* ── render ──────────────────────────────────────────────── */

    const navHTML = mode === 'stat-page' ? statPageNav() : mainNav();

    const headerHTML = `
<header class="header${mode === 'stat-page' ? ' header--stat-page' : ''}" dir="ltr">
    <div class="container" dir="ltr">
        <!-- The site brand is an identity link, not the page's heading. It was
             an <h1>, which gave every page an identical injected top-level
             heading ahead of its real one. Styling is class-based, so this
             renders the same. -->
        <div class="logo">
            <a href="${rootPath('index.html')}">PalGenoPedia</a>
        </div>
        <nav class="nav" dir="ltr">
            ${navHTML}
        </nav>
        <div class="header-controls" dir="ltr" style="display:flex;flex-direction:row;align-items:center;gap:8px;flex-wrap:nowrap;">
            <div id="language-selector" class="language-selector" style="flex-shrink:0;">
                <!-- populated by translation-system.js -->
            </div>
            <button class="theme-toggle" aria-label="Toggle theme" style="flex-shrink:0;">🌙</button>
            <button class="hamburger-btn" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav-drawer">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <line x1="2" y1="5"  x2="20" y2="5"/>
                    <line x1="2" y1="11" x2="20" y2="11"/>
                    <line x1="2" y1="17" x2="20" y2="17"/>
                </svg>
            </button>
        </div>
    </div>
</header>`;

    const placeholder = document.getElementById('header-placeholder');
    if (placeholder) {
        placeholder.outerHTML = headerHTML;
    } else {
        // Fallback: prepend to body if placeholder is missing.
        document.body.insertAdjacentHTML('afterbegin', headerHTML);
        console.warn('header-component.js: #header-placeholder not found, injected at top of <body>.');
    }

    // Inject the timeline sub-header bar directly after the main header.
    if (subNav === 'timeline') {
        injectSubHeaderStyles();
        document.querySelector('.header').insertAdjacentHTML('afterend', timelineSubNavHTML());
    }

    // Inject the stat-page sub-header bar directly after the main header.
    if (subNav === 'stat-page') {
        injectSubHeaderStyles();
        document.querySelector('.header').insertAdjacentHTML('afterend', statPageSubNavHTML());
    }

    /* ── theme ───────────────────────────────────────────────── */

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const toggle = document.querySelector('.theme-toggle');
        if (toggle) toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    }

    function initTheme() {
        // Support both localStorage key variants used across the pages.
        const saved = localStorage.getItem('gaza-docs-theme')
                   || localStorage.getItem('theme')
                   || 'light';
        applyTheme(saved);

        document.querySelector('.theme-toggle')?.addEventListener('click', function () {
            const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            localStorage.setItem('gaza-docs-theme', next);
            localStorage.setItem('theme', next); // keep both keys in sync
            applyTheme(next);
        });
    }

    /* ── stat-page view switching ────────────────────────────── */

    /** Wire up the Overview / Categories / Legal / Resources tab buttons. */
    function initStatPageNav() {
        const navBtns     = document.querySelectorAll('.nav-btn[data-view]');
        const viewSections = document.querySelectorAll('.view-section');

        navBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                navBtns.forEach(b => b.classList.remove('active'));
                viewSections.forEach(s => s.classList.remove('active'));
                this.classList.add('active');
                document.getElementById(this.dataset.view + 'View')?.classList.add('active');
            });
        });
    }

    /* ── stat-page sub-header view switching ────────────────── */

    /** Wire up the Overview / Categories / Legal / Resources sub-header tabs. */
    function initStatPageSubNav() {
        const subNavBtns   = document.querySelectorAll('.sub-nav-btn[data-view]');
        const viewSections = document.querySelectorAll('.view-section');

        subNavBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                subNavBtns.forEach(b => b.classList.remove('active'));
                viewSections.forEach(s => s.classList.remove('active'));
                this.classList.add('active');
                document.getElementById(this.dataset.view + 'View')?.classList.add('active');
            });
        });
    }

    /* ── timeline sub-header view switching ──────────────────── */

    /** Wire up the Timeline / Map / List sub-header tab buttons. */
    function initTimelineSubNav() {
        const subNavBtns   = document.querySelectorAll('.sub-nav-btn[data-view]');
        const viewSections = document.querySelectorAll('.view-section');

        subNavBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                subNavBtns.forEach(b => b.classList.remove('active'));
                viewSections.forEach(s => s.classList.remove('active'));
                this.classList.add('active');
                document.getElementById(this.dataset.view + 'View')?.classList.add('active');
            });
        });
    }

    /* ── mobile hamburger drawer ─────────────────────────────── */

    function initMobileNav() {
        const hamburger = document.querySelector('.hamburger-btn');
        if (!hamburger) return;

        // Build drawer link HTML by mirroring the desktop nav items.
        const desktopItems = document.querySelectorAll('.header .nav a, .header .nav button[data-view]');
        let linksHTML = '';
        desktopItems.forEach(function (el) {
            const isActive  = el.classList.contains('active')    ? ' active'    : '';
            const isJoinUs  = el.classList.contains('join-us-btn') ? ' join-us-btn' : '';
            const i18nAttr  = el.dataset.i18n ? ` data-i18n="${el.dataset.i18n}"` : '';
            const viewAttr  = el.dataset.view  ? ` data-view="${el.dataset.view}"` : '';
            if (el.tagName === 'A') {
                linksHTML += `<a href="${el.getAttribute('href')}" class="${('nav-btn' + isActive + isJoinUs).trim()}"${i18nAttr}>${el.innerHTML}</a>\n`;
            } else {
                linksHTML += `<button class="${('nav-btn' + isActive + isJoinUs).trim()}"${viewAttr}${i18nAttr}>${el.innerHTML}</button>\n`;
            }
        });

        // Overlay (click-outside-to-close backdrop)
        const overlay = document.createElement('div');
        overlay.className = 'mobile-nav-overlay';
        overlay.setAttribute('aria-hidden', 'true');

        // Drawer panel
        const drawer = document.createElement('nav');
        drawer.id = 'mobile-nav-drawer';
        drawer.className = 'mobile-nav-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Site navigation');
        drawer.innerHTML = `
            <div class="mobile-drawer-header">
                <span class="mobile-drawer-label">Menu</span>
                <button class="mobile-drawer-close" aria-label="Close menu">&times;</button>
            </div>
            <div class="mobile-drawer-links">${linksHTML}</div>`;

        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        const OPEN = 'is-open';

        function openDrawer() {
            overlay.classList.add(OPEN);
            drawer.classList.add(OPEN);
            hamburger.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
            drawer.querySelector('.mobile-drawer-close').focus();
        }

        function closeDrawer() {
            overlay.classList.remove(OPEN);
            drawer.classList.remove(OPEN);
            hamburger.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
            hamburger.focus();
        }

        hamburger.addEventListener('click', function () {
            drawer.classList.contains(OPEN) ? closeDrawer() : openDrawer();
        });
        overlay.addEventListener('click', closeDrawer);
        drawer.querySelector('.mobile-drawer-close').addEventListener('click', closeDrawer);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && drawer.classList.contains(OPEN)) closeDrawer();
        });

        // Wire data-view buttons in the drawer the same way the desktop nav does.
        if (mode === 'stat-page') {
            drawer.querySelectorAll('button[data-view]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    const allBtns = document.querySelectorAll('.nav-btn[data-view], .mobile-drawer-links button[data-view]');
                    const allSections = document.querySelectorAll('.view-section');
                    allBtns.forEach(b => b.classList.remove('active'));
                    allSections.forEach(s => s.classList.remove('active'));
                    // Activate matching buttons in both desktop + drawer
                    document.querySelectorAll(`[data-view="${btn.dataset.view}"]`).forEach(b => b.classList.add('active'));
                    document.getElementById(btn.dataset.view + 'View')?.classList.add('active');
                    closeDrawer();
                });
            });
        }
    }

    /* ── init ────────────────────────────────────────────────── */

    // Run after the header is in the DOM.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initTheme();
            initMobileNav();
            if (mode === 'stat-page') initStatPageNav();
            if (subNav === 'timeline') initTimelineSubNav();
            if (subNav === 'stat-page') initStatPageSubNav();
        });
    } else {
        initTheme();
        initMobileNav();
        if (mode === 'stat-page') initStatPageNav();
        if (subNav === 'timeline') initTimelineSubNav();
        if (subNav === 'stat-page') initStatPageSubNav();
    }

    console.log(`✅ header-component.js loaded (mode: ${mode}, activePage: ${activePage})`);
})();