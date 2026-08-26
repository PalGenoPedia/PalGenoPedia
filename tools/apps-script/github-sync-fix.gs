/**
 * github-sync-fix.gs - make the GitHub sync report its failures.
 *
 * WHY
 *   syncAll() ran on 2026-08-23 and reported "Execution completed" while the
 *   repository received nothing. That is not a fluke, it is the design:
 *   pushToGitHub() sets muteHttpExceptions: true and then never reads the
 *   response code of the PUT. A 401 (expired token), 403 (missing scope) or
 *   404 (token cannot see the repo) all return quietly and the loop moves on
 *   to the next file.
 *
 *   The last successful sync was 2026-07-07. Every run since has "succeeded"
 *   the same way. A fine-grained PAT issued with a 30- or 60-day lifetime
 *   around early June would have expired right about then.
 *
 * HOW TO USE
 *   1. Run testGitHubAuth() and read the log. It says exactly what is wrong.
 *   2. Replace your existing pushToGitHub() with the one below.
 *   3. Delete storeToken() - see the note at the bottom.
 */


/** Read-only. Writes nothing to the repo. Run this first. */
function testGitHubAuth() {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  var out = [];

  if (!token) {
    out.push('NO TOKEN STORED - Script Properties has no GITHUB_TOKEN.');
    Logger.log(out.join('\n'));
    return;
  }
  out.push('token: ' + token.length + ' chars, starts "' + token.slice(0, 11) + '..."');

  var who = UrlFetchApp.fetch('https://api.github.com/user', {
    headers: { Authorization: 'token ' + token },
    muteHttpExceptions: true
  });
  var whoCode = who.getResponseCode();
  out.push('GET /user -> ' + whoCode + (whoCode === 200
    ? '  authenticated as ' + JSON.parse(who.getContentText()).login
    : '  ' + who.getContentText().slice(0, 200)));

  var url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO;
  var repo = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'token ' + token },
    muteHttpExceptions: true
  });
  var repoCode = repo.getResponseCode();
  out.push('GET /repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + ' -> ' + repoCode + (repoCode === 200
    ? '  push permission: ' + JSON.parse(repo.getContentText()).permissions.push
    : '  ' + repo.getContentText().slice(0, 200)));

  out.push('');
  out.push('401 on /user            -> token expired or revoked. Issue a new one.');
  out.push('200 /user, 404 on repo  -> fine-grained PAT not granted access to this repo.');
  out.push('200 both, push = false  -> token lacks Contents: Read and write.');

  Logger.log(out.join('\n'));
}


/**
 * Drop-in replacement. Same signature, same behaviour on success - but a
 * failed write now throws instead of returning quietly, so syncAll() stops
 * with a red error in the execution log rather than a green "completed".
 */
function pushToGitHub(filePath, csvContent) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('No GITHUB_TOKEN in Script Properties.');

  var apiUrl  = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
                '/contents/' + filePath;
  var encoded = Utilities.base64Encode(csvContent, Utilities.Charset.UTF_8);

  // 404 here is legitimate - the file does not exist yet, so there is no sha
  // to send. Any other non-200 is a real problem and must not be swallowed.
  var sha = null;
  var get = UrlFetchApp.fetch(apiUrl, {
    headers: { Authorization: 'token ' + token },
    muteHttpExceptions: true
  });
  var getCode = get.getResponseCode();
  if (getCode === 200) {
    sha = JSON.parse(get.getContentText()).sha;
  } else if (getCode !== 404) {
    throw new Error('GET ' + filePath + ' -> ' + getCode + '  ' +
                    get.getContentText().slice(0, 300));
  }

  var payload = {
    message: 'auto: update ' + filePath.split('/').pop() + ' [' + new Date().toISOString() + ']',
    content: encoded
  };
  if (sha) payload.sha = sha;

  var put = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    headers: { Authorization: 'token ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = put.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('PUT ' + filePath + ' -> ' + code + '  ' +
                    put.getContentText().slice(0, 300));
  }
  Logger.log('ok ' + code + '  ' + filePath);
}


/*
 * DELETE storeToken().
 *
 * A token hardcoded in a source file is readable by anyone who ever opens the
 * script, and travels into every copy, export and screenshot of it. Set the
 * property through the editor instead, where it is never in the code:
 *
 *   Project Settings (gear icon) -> Script Properties -> Add script property
 *   Property: GITHUB_TOKEN
 *   Value:    <the new token>
 *
 * Then delete the storeToken() function entirely.
 */
