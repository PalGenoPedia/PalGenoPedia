/**
 * record-page.js
 * Optional enhancement for the generated record pages
 * (/war-crimes/<section>/[lang]/<slug>/ and the section indexes).
 *
 * PROGRESSIVE ENHANCEMENT ONLY - and that is the whole point of these pages.
 * Every one of them is complete and readable with JavaScript disabled: the
 * record, the incident history, the sidebar and the stats strip are all baked
 * into the HTML at build time by tools/build_records.py. Nothing in this file
 * creates content; it only adds behaviour on top of markup already present.
 * The full-account disclosure uses a native <details>, so even that needs no
 * script.
 *
 * That is the deliberate inverse of the hub pages, which build their DOM from
 * CSV at runtime and therefore show "0 facilities" to anything that does not
 * execute JavaScript.
 *
 * Class names here mirror Pages/War_Crimes_Stats/shared.css, which these pages
 * load, so the markup is identical to the interactive detail view.
 */
(function () {
    'use strict';

    /* ── theme: honour the choice made elsewhere on the site ────────── */
    function applyStoredTheme() {
        var stored = null;
        try {
            stored = localStorage.getItem('theme') || localStorage.getItem('gaza-docs-theme');
        } catch (e) { /* private mode - fall back to prefers-color-scheme */ }
        if (stored === 'dark' || stored === 'light') {
            document.documentElement.setAttribute('data-theme', stored);
        }
    }

    /* ── remember the reader's language across pages ─────────────────
       The switcher is real <a> links, so it already works with JS off.
       This only records the choice so the rest of the site picks it up. */
    function rememberLanguage() {
        var lang = document.documentElement.lang;
        if (!lang) return;
        try { localStorage.setItem('gaza-docs-lang', lang); } catch (e) { /* ignore */ }
    }

    /* ── images: hide the figure when the remote file has rotted ─────
       Many image_url values point at third-party hosts. A broken-image icon
       reads as a site fault; an absent figure does not. */
    function guardImages() {
        var imgs = document.querySelectorAll('.detail-fac-img, .detail-inc-img, .fac-card-img');
        Array.prototype.forEach.call(imgs, function (img) {
            img.addEventListener('error', function () {
                var wrap = img.closest('.detail-fac-img-wrap');
                if (wrap) { wrap.style.display = 'none'; return; }
                img.style.display = 'none';
            }, { once: true });
        });
    }

    /* ── incident filter ─────────────────────────────────────────────
       Built only when there are enough incidents for filtering to help, and
       only over cards that already exist in the markup. With JS off the
       reader simply sees the full, unfiltered list - which is the correct
       fallback for an archive. */
    /** Which of the seven normalised attack classes a card belongs to.
     *  Read off the type-* class the generator already put there for the
     *  colour coding. */
    function cardClass(card) {
        var m = /(?:^|\s)type-([a-z]+)/.exec(card.className);
        return m ? m[1] : 'unidentified';
    }

    function buildIncidentFilter() {
        var list = document.querySelector('.detail-incidents');
        if (!list) return;
        var cards = list.querySelectorAll('.detail-inc-card');
        if (cards.length < 5) return;

        // Group by attack CLASS, not by the raw attack_type string. The source
        // column holds 104 distinct spellings across 308 incidents - "hit",
        // "Airstrike (Vicinity)", "strikes-vicinity", "unidentified" vs
        // "Unidentified" - so grouping on the raw text produced ~30 buttons for
        // one facility. Seven classes match the card colour coding and are
        // immune to the spelling drift.
        var counts = {};
        Array.prototype.forEach.call(cards, function (c) {
            var k = cardClass(c);
            counts[k] = (counts[k] || 0) + 1;
        });
        var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
        if (keys.length < 2) return;

        var labels = window.RP_LABELS || {};
        var typeLabels = labels.types || {};

        var wrap = document.createElement('div');
        wrap.className = 'inc-filter';

        function makeBtn(value, text, active) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'inc-filter-btn' + (value ? ' type-' + value : '') + (active ? ' is-active' : '');
            b.textContent = text;
            b.setAttribute('aria-pressed', active ? 'true' : 'false');
            b.addEventListener('click', function () {
                Array.prototype.forEach.call(wrap.children, function (o) {
                    o.classList.remove('is-active');
                    o.setAttribute('aria-pressed', 'false');
                });
                b.classList.add('is-active');
                b.setAttribute('aria-pressed', 'true');
                Array.prototype.forEach.call(cards, function (c) {
                    c.hidden = !(!value || cardClass(c) === value);
                });
            });
            return b;
        }

        wrap.appendChild(makeBtn('', (labels.all || 'All') + ' (' + cards.length + ')', true));
        keys.forEach(function (k) {
            wrap.appendChild(makeBtn(k, (typeLabels[k] || k) + ' (' + counts[k] + ')', false));
        });
        list.parentNode.insertBefore(wrap, list);
    }

    function init() {
        applyStoredTheme();
        rememberLanguage();
        guardImages();
        buildIncidentFilter();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
