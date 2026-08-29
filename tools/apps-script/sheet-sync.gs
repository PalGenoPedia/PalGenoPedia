/**
 * sheet-sync.gs — the ONE Apps Script that pushes every PalGenoPedia Google
 * Sheet to CSVs in PalGenoPedia/PalGenoPedia. Replaces the separate
 * "Historical Events" and "War Crimes Stats" sync projects — one SPREADSHEETS
 * list, one syncAll(), one token.
 *
 * Covers:
 *   - Historical Massacres      (events / details + _ar / _de)
 *   - Hospitals / Universities / Schools / Religious Sites
 *     (each: <thing>_facilities / <thing>_incidents + _ar / _de)
 *   - placeholders for Water / Power / Media / Shelters (skipped until filled)
 *
 * Downstream: a push to any of these CSVs triggers
 * .github/workflows/build-records.yml, which regenerates the record pages,
 * data layer, feeds, sitemap and the archive-domain inventories.
 *
 * ── FIRST-TIME SETUP ──────────────────────────────────────────
 *   1. Create a GitHub fine-grained PAT: repository access = only
 *      PalGenoPedia/PalGenoPedia · permission = Contents: Read and write.
 *   2. Project Settings → Script properties → add GITHUB_TOKEN = that PAT.
 *      (Or paste it into storeToken() once, Run it, then delete the string.)
 *   3. Run checkSetup()  → verifies the token + every tab is reachable.
 *   4. Run syncAll()     → pushes everything.
 *   5. Add a trigger (Triggers → Add trigger → syncAll, time-driven or
 *      on-change) and DELETE the triggers on the old two projects so nothing
 *      double-pushes.
 */

const GITHUB_OWNER = 'PalGenoPedia';
const GITHUB_REPO = 'PalGenoPedia';

// Fallback timezone for Date cells NOT formatted as yyyy-mm-dd. Set to each
// spreadsheet's own zone (File → Settings → Time zone). All the workbooks
// should share one zone; if one differs, format its date columns as
// yyyy-mm-dd (Format → Number → Custom) so this constant is never consulted.
const EXPORT_TZ = 'Europe/Istanbul';

const SPREADSHEETS = [

  // ── HISTORICAL MASSACRES ──────────────────────────────────
  {
    id: '1fTNCpO6vhsRZz_OrHNs7b4B7aVotfcA0XH8yygybkPo',
    sheets: {
      'Events': 'Pages/Historical_Massacres/events.csv',
      'Details': 'Pages/Historical_Massacres/details.csv',
    },
    translationSheets: {
      'Events_ar': 'Pages/Historical_Massacres/events_ar.csv',
      'Events_de': 'Pages/Historical_Massacres/events_de.csv',
      'Details_ar': 'Pages/Historical_Massacres/details_ar.csv',
      'Details_de': 'Pages/Historical_Massacres/details_de.csv',
    },
  },

  // ── HOSPITALS ─────────────────────────────────────────────
  {
    id: '1JUJTf0sdPo4o-DluzuwjMOMAc6Fhe4k9kFv-UIXyMg4',
    sheets: {
      'Hospital_incidents': 'Pages/War_Crimes_Stats/stat-hospitals-attacked/Hospital_incidents.csv',
      'Hospital_facilities': 'Pages/War_Crimes_Stats/stat-hospitals-attacked/Hospital_facilities.csv',
    },
    translationSheets: {
      'Hospital_facilities_ar': 'Pages/War_Crimes_Stats/stat-hospitals-attacked/Hospital_facilities_ar.csv',
      'Hospital_facilities_de': 'Pages/War_Crimes_Stats/stat-hospitals-attacked/Hospital_facilities_de.csv',
      'Hospital_incidents_ar': 'Pages/War_Crimes_Stats/stat-hospitals-attacked/Hospital_incidents_ar.csv',
      'Hospital_incidents_de': 'Pages/War_Crimes_Stats/stat-hospitals-attacked/Hospital_incidents_de.csv',
    },
  },

  // ── UNIVERSITIES ──────────────────────────────────────────
  {
    id: '1USy-ZPTwzio49_yKkkc-5WPOscIBDa5tetRZ8NTWZFo',
    sheets: {
      'University_incidents': 'Pages/War_Crimes_Stats/stat-universities-attacked/University_incidents.csv',
      'University_facilities': 'Pages/War_Crimes_Stats/stat-universities-attacked/University_facilities.csv',
    },
    translationSheets: {
      'University_facilities_ar': 'Pages/War_Crimes_Stats/stat-universities-attacked/University_facilities_ar.csv',
      'University_facilities_de': 'Pages/War_Crimes_Stats/stat-universities-attacked/University_facilities_de.csv',
      'University_incidents_ar': 'Pages/War_Crimes_Stats/stat-universities-attacked/University_incidents_ar.csv',
      'University_incidents_de': 'Pages/War_Crimes_Stats/stat-universities-attacked/University_incidents_de.csv',
    },
  },

  // ── SCHOOLS ───────────────────────────────────────────────
  {
    id: '1NuD4YMqCwUZyCDE4r0xHyzBdWod9WFH-cEuN6eP7LWw',
    sheets: {
      'Schools_incidents': 'Pages/War_Crimes_Stats/stat-schools-attacked/School_incidents.csv',
      'Schools_facilities': 'Pages/War_Crimes_Stats/stat-schools-attacked/School_facilities.csv',
    },
    translationSheets: {
      'Schools_facilities_ar': 'Pages/War_Crimes_Stats/stat-schools-attacked/School_facilities_ar.csv',
      'Schools_facilities_de': 'Pages/War_Crimes_Stats/stat-schools-attacked/School_facilities_de.csv',
      'Schools_incidents_ar': 'Pages/War_Crimes_Stats/stat-schools-attacked/School_incidents_ar.csv',
      'Schools_incidents_de': 'Pages/War_Crimes_Stats/stat-schools-attacked/School_incidents_de.csv',
    },
  },

  // ── RELIGIOUS SITES ───────────────────────────────────────
  {
    id: '1_zn0gHo2XlEoQFHtPwNxJG6pFvYiK9WbYiR-6thxj7A',
    sheets: {
      // sic — the tab is spelled "Religous" in the live sheet.
      'Religous_incidents': 'Pages/War_Crimes_Stats/stat-religious-attacked/Religous_incidents.csv',
      'Religous_facilities': 'Pages/War_Crimes_Stats/stat-religious-attacked/Religous_facilities.csv',
    },
    translationSheets: {
      'Religous_facilities_ar': 'Pages/War_Crimes_Stats/stat-religious-attacked/Religous_facilities_ar.csv',
      'Religous_facilities_de': 'Pages/War_Crimes_Stats/stat-religious-attacked/Religous_facilities_de.csv',
      'Religous_incidents_ar': 'Pages/War_Crimes_Stats/stat-religious-attacked/Religous_incidents_ar.csv',
      'Religous_incidents_de': 'Pages/War_Crimes_Stats/stat-religious-attacked/Religous_incidents_de.csv',
    },
  },

  // ── PLACEHOLDERS — fill the id, then they sync automatically ──
  {
    id: 'SPREADSHEET_ID_WATER',
    sheets: {
      'Water_incidents': 'Pages/War_Crimes_Stats/stat-water-attacked/Water_incidents.csv',
      'Water_facilities': 'Pages/War_Crimes_Stats/stat-water-attacked/Water_facilities.csv',
    },
    translationSheets: {
      'Water_facilities_ar': 'Pages/War_Crimes_Stats/stat-water-attacked/Water_facilities_ar.csv',
      'Water_facilities_de': 'Pages/War_Crimes_Stats/stat-water-attacked/Water_facilities_de.csv',
      'Water_incidents_ar': 'Pages/War_Crimes_Stats/stat-water-attacked/Water_incidents_ar.csv',
      'Water_incidents_de': 'Pages/War_Crimes_Stats/stat-water-attacked/Water_incidents_de.csv',
    },
  },
  {
    id: 'SPREADSHEET_ID_POWER',
    sheets: {
      'Power_incidents': 'Pages/War_Crimes_Stats/stat-power-attacked/Power_incidents.csv',
      'Power_facilities': 'Pages/War_Crimes_Stats/stat-power-attacked/Power_facilities.csv',
    },
    translationSheets: {
      'Power_facilities_ar': 'Pages/War_Crimes_Stats/stat-power-attacked/Power_facilities_ar.csv',
      'Power_facilities_de': 'Pages/War_Crimes_Stats/stat-power-attacked/Power_facilities_de.csv',
      'Power_incidents_ar': 'Pages/War_Crimes_Stats/stat-power-attacked/Power_incidents_ar.csv',
      'Power_incidents_de': 'Pages/War_Crimes_Stats/stat-power-attacked/Power_incidents_de.csv',
    },
  },
  {
    id: 'SPREADSHEET_ID_MEDIA',
    sheets: {
      'Media_incidents': 'Pages/War_Crimes_Stats/stat-media-attacked/Media_incidents.csv',
      'Media_facilities': 'Pages/War_Crimes_Stats/stat-media-attacked/Media_facilities.csv',
    },
    translationSheets: {
      'Media_facilities_ar': 'Pages/War_Crimes_Stats/stat-media-attacked/Media_facilities_ar.csv',
      'Media_facilities_de': 'Pages/War_Crimes_Stats/stat-media-attacked/Media_facilities_de.csv',
      'Media_incidents_ar': 'Pages/War_Crimes_Stats/stat-media-attacked/Media_incidents_ar.csv',
      'Media_incidents_de': 'Pages/War_Crimes_Stats/stat-media-attacked/Media_incidents_de.csv',
    },
  },
  {
    id: 'SPREADSHEET_ID_SHELTERS',
    sheets: {
      'Shelter_incidents': 'Pages/War_Crimes_Stats/stat-shelters-attacked/Shelter_incidents.csv',
      'Shelter_facilities': 'Pages/War_Crimes_Stats/stat-shelters-attacked/Shelter_facilities.csv',
    },
    translationSheets: {
      'Shelter_facilities_ar': 'Pages/War_Crimes_Stats/stat-shelters-attacked/Shelter_facilities_ar.csv',
      'Shelter_facilities_de': 'Pages/War_Crimes_Stats/stat-shelters-attacked/Shelter_facilities_de.csv',
      'Shelter_incidents_ar': 'Pages/War_Crimes_Stats/stat-shelters-attacked/Shelter_incidents_ar.csv',
      'Shelter_incidents_de': 'Pages/War_Crimes_Stats/stat-shelters-attacked/Shelter_incidents_de.csv',
    },
  },

];

// ── TOKEN MANAGEMENT ──────────────────────────────────────────

// Paste the PAT between the quotes, Run this once, then blank it out again.
function storeToken() {
  const NEW_TOKEN = '';
  if (!NEW_TOKEN) {
    Logger.log('Paste your PAT into NEW_TOKEN first (or set GITHUB_TOKEN in Script properties directly).');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', NEW_TOKEN);
  Logger.log('Token saved. Now blank out NEW_TOKEN in this function.');
  Logger.log('Preview: ' + NEW_TOKEN.substring(0, 8) + '…' + NEW_TOKEN.slice(-4));
}

function clearToken() {
  PropertiesService.getScriptProperties().deleteProperty('GITHUB_TOKEN');
  Logger.log('GITHUB_TOKEN cleared.');
}

// Read-only: is the token stored and does GitHub accept it for this repo?
function debugToken() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  Logger.log('GITHUB_TOKEN stored: ' + !!token);
  if (!token) { Logger.log('Run storeToken() first.'); return; }
  Logger.log('Preview: ' + token.substring(0, 8) + '…' + token.slice(-4));

  const res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO,
    { headers: { Authorization: 'token ' + token }, muteHttpExceptions: true }
  );
  Logger.log('GET repo -> ' + res.getResponseCode());
  Logger.log(res.getResponseCode() === 200
    ? 'OK — token valid, repo accessible. Run syncAll().'
    : 'REJECTED — ' + res.getContentText().slice(0, 300));
}

// ── CSV HELPERS ───────────────────────────────────────────────

// One cell → one CSV field. Dates come from the sheet's own displayed text
// when that text is ISO (yyyy-mm-dd); otherwise formatted via EXPORT_TZ. This
// avoids the "date shifts a day" bug you get from formatting the raw Date
// object in a timezone other than the spreadsheet's.
function cellToCsvValue_(value, shown) {
  let s;
  if (value instanceof Date) {
    const m = String(shown).match(/^\d{4}-\d{2}-\d{2}/);
    s = m ? m[0] : Utilities.formatDate(value, EXPORT_TZ, 'yyyy-MM-dd');
  } else {
    s = String(value);
  }
  s = s.replace(/"/g, '""');
  return (s.indexOf(',') > -1 || s.indexOf('\n') > -1 || s.indexOf('"') > -1) ? '"' + s + '"' : s;
}

// All columns of a sheet → CSV (main data tabs).
function sheetToCsv(sheet) {
  const rng = sheet.getDataRange();
  const vals = rng.getValues();
  const disp = rng.getDisplayValues();
  return vals
    .map(function (row, r) { return row.map(function (c, i) { return cellToCsvValue_(c, disp[r][i]); }).join(','); })
    .join('\r\n');
}

// Translation tab → CSV, dropping any column whose header contains
// "(English — reference)" (source-language mirrors only).
function sheetToCsvFiltered(sheet) {
  const rng = sheet.getDataRange();
  const vals = rng.getValues();
  const disp = rng.getDisplayValues();
  if (vals.length === 0) return '';

  const keep = vals[0].reduce(function (acc, header, i) {
    if (String(header).indexOf('(English — reference)') === -1) acc.push(i);
    return acc;
  }, []);

  return vals
    .map(function (row, r) { return keep.map(function (i) { return cellToCsvValue_(row[i], disp[r][i]); }).join(','); })
    .join('\r\n');
}

// ── GITHUB PUSH ───────────────────────────────────────────────
// Reads and logs every response code — a silent PUT failure once let a month
// of syncs "succeed" while the repo received nothing.

function pushToGitHub(filePath, csvContent) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) { Logger.log('  ERROR: no GITHUB_TOKEN — run storeToken().'); return false; }

  const apiUrl = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + filePath;
  const encoded = Utilities.base64Encode(csvContent, Utilities.Charset.UTF_8);

  let sha = null;
  const get = UrlFetchApp.fetch(apiUrl, {
    headers: { Authorization: 'token ' + token },
    muteHttpExceptions: true,
  });
  const gc = get.getResponseCode();
  if (gc === 200) {
    sha = JSON.parse(get.getContentText()).sha;
  } else if (gc === 401 || gc === 403) {
    Logger.log('  ' + filePath + ' — GET ' + gc + ' (token invalid / missing Contents scope). Run debugToken().');
    return false;
  } else if (gc !== 404) {
    Logger.log('  ' + filePath + ' — GET ' + gc + ': ' + get.getContentText().slice(0, 200));
  }

  const payload = { message: 'auto: update ' + filePath.split('/').pop() + ' [' + new Date().toISOString() + ']', content: encoded };
  if (sha) payload.sha = sha;

  const put = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: { Authorization: 'token ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const pc = put.getResponseCode();
  if (pc >= 300) {
    Logger.log('  ✗ ' + filePath + ' — PUT ' + pc + ': ' + put.getContentText().slice(0, 200));
    return false;
  }
  Logger.log('  ✓ ' + filePath.split('/').pop());
  return true;
}

// ── MAIN SYNC ─────────────────────────────────────────────────

function syncAll() {
  if (!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN')) {
    Logger.log('No GITHUB_TOKEN — run storeToken() first.');
    return;
  }
  let ok = 0, fail = 0, skipped = 0;

  SPREADSHEETS.forEach(function (entry) {
    if (String(entry.id).indexOf('SPREADSHEET_ID') === 0) { skipped++; return; }

    const ss = SpreadsheetApp.openById(entry.id);
    Logger.log('\n' + ss.getName());

    Object.keys(entry.sheets).forEach(function (tab) {
      const sheet = ss.getSheetByName(tab);
      if (!sheet) { Logger.log('  ⚠ tab not found: ' + tab); fail++; return; }
      (pushToGitHub(entry.sheets[tab], sheetToCsv(sheet)) ? ok++ : fail++);
    });

    Object.keys(entry.translationSheets || {}).forEach(function (tab) {
      const sheet = ss.getSheetByName(tab);
      if (!sheet) { Logger.log('  ⚠ translation tab not found: ' + tab); fail++; return; }
      (pushToGitHub(entry.translationSheets[tab], sheetToCsvFiltered(sheet)) ? ok++ : fail++);
    });
  });

  Logger.log('\nsyncAll: ' + ok + ' pushed, ' + fail + ' failed, ' + skipped + ' placeholder workbook(s) skipped.');
}

// ── DIAGNOSTIC ────────────────────────────────────────────────

function checkSetup() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  Logger.log('GITHUB_TOKEN stored: ' + !!token);
  if (!token) { Logger.log('Run storeToken() first.'); return; }

  const repo = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO,
    { headers: { Authorization: 'token ' + token }, muteHttpExceptions: true }
  );
  Logger.log('Repo access -> ' + repo.getResponseCode() + (repo.getResponseCode() === 200 ? ' ✓' : ' ✗ ' + repo.getContentText().slice(0, 200)));
  if (repo.getResponseCode() !== 200) return;

  SPREADSHEETS.forEach(function (entry) {
    if (String(entry.id).indexOf('SPREADSHEET_ID') === 0) { Logger.log('\n(placeholder ' + entry.id + ' — skipped)'); return; }
    const ss = SpreadsheetApp.openById(entry.id);
    Logger.log('\n' + ss.getName());
    const have = ss.getSheets().map(function (s) { return s.getName(); });
    Object.keys(entry.sheets).concat(Object.keys(entry.translationSheets || {})).forEach(function (tab) {
      Logger.log('  ' + (have.indexOf(tab) > -1 ? '✓' : '✗ MISSING') + '  ' + tab);
    });
  });
  Logger.log('\nIf every tab shows ✓, run syncAll().');
}
