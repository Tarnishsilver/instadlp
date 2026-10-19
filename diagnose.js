#!/usr/bin/env node
/*
 * Instagram fetch diagnostic for instadlp.
 *
 * Purpose: find out WHY a private-API request comes back as HTML instead of JSON.
 * It captures the status code, redirect chain, content-type and body start that
 * the normal tool discards, and compares several endpoint variants.
 *
 * Usage (PowerShell, from the project root):
 *   node .\diagnose.js <instagram-username>
 *
 * Optional env overrides (same as the tool):
 *   CHROME_PATH, CHROME_PROFILE_DIR
 *
 * It opens one visible Chrome window using your existing profile, makes a
 * handful of requests, then closes it. Paste the whole console output back.
 */

const puppeteer = require('puppeteer');
const { resolveProfileDir } = require('./helper/profile');

const USERNAME = (process.argv[2] || '').trim();

if (!USERNAME) {
  console.error('Usage: node diagnose.js <instagram-username>');
  process.exit(1);
}

const executablePath =
  process.env.CHROME_PATH ||
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined);

const userDataDir = resolveProfileDir();

function log(...args) {
  console.log(...args);
}

async function main() {
  log('=== instadlp diagnose ===');
  log('node        :', process.version);
  log('chrome      :', executablePath);
  log('profile dir :', userDataDir);
  log('username    :', USERNAME);
  log('');

  const browser = await puppeteer.launch({
    ...(executablePath ? { executablePath } : {}),
    userDataDir,
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    defaultViewport: null,
  });

  const pages = await browser.pages();
  const page = pages[0];

  try {
    await page
      .goto('https://www.instagram.com/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      })
      .catch((e) => log('goto warning:', e.message));

    log('page.url()   :', page.url());
    log('page.title() :', await page.title().catch(() => '<n/a>'));

    // Which session cookies exist? (is a login present at all)
    let cookies = [];
    try {
      cookies = await page.cookies('https://www.instagram.com');
    } catch (e) {
      log('cookie read warning:', e.message);
    }
    const interesting = ['sessionid', 'csrftoken', 'ds_user_id', 'ig_did', 'mid'];
    log(
      'cookies      :',
      interesting.map((n) => `${n}=${cookies.some((c) => c.name === n) ? 'yes' : 'no'}`).join('  ')
    );
    log('');

    // The in-page fetch probe. Returns a plain serializable object.
    const probe = async (label, url, extraHeaders) => {
      const result = await page.evaluate(
        async (url, extraHeaders) => {
          const out = { url };
          try {
            const resp = await fetch(url, {
              headers: {
                'x-ig-app-id': '936619743392459',
                'x-requested-with': 'XMLHttpRequest',
                ...(extraHeaders || {}),
              },
              credentials: 'include',
            });
            out.status = resp.status;
            out.ok = resp.ok;
            out.redirected = resp.redirected;
            out.finalUrl = resp.url;
            out.type = resp.type;
            out.contentType = resp.headers.get('content-type');
            const text = await resp.text();
            out.bodyStart = text.slice(0, 300).replace(/\s+/g, ' ');
            try {
              const j = JSON.parse(text);
              out.jsonOk = true;
              out.jsonTopKeys = Object.keys(j).slice(0, 12);
              out.jsonMessage = j.message || null;
              out.jsonRequireLogin = j.require_login ?? null;
              out.jsonStatus = j.status ?? null;
              if (Array.isArray(j.users)) {
                out.jsonUsers = j.users.slice(0, 5).map((e) => ({
                  username: e && e.user ? e.user.username : null,
                  pk: e && e.user ? e.user.pk || e.user.id : null,
                }));
              }
            } catch {
              out.jsonOk = false;
            }
          } catch (err) {
            out.fetchError = err && err.message ? err.message : String(err);
          }
          return out;
        },
        url,
        extraHeaders
      );
      log(`--- ${label} ---`);
      log(JSON.stringify(result, null, 2));
      log('');
      return result;
    };

    // 1) Control + resolve the numeric user id (pk). The feed endpoint needs
    //    the numeric id, NOT the username — using the username 404s.
    const search = await probe(
      'control: topsearch (public web endpoint)',
      `https://www.instagram.com/web/search/topsearch/?query=${encodeURIComponent(USERNAME)}`
    );

    let userId = null;
    if (Array.isArray(search.jsonUsers)) {
      const match = search.jsonUsers.find(
        (u) => u.username && String(u.username).toLowerCase() === USERNAME.toLowerCase()
      );
      if (match) userId = match.pk;
    }

    log('resolved user id (pk):', userId);
    log('');

    if (!userId) {
      log('!! Could not resolve numeric user id; skipping feed probes.');
      log('=== done ===');
      return;
    }

    // 2) The exact call the tool makes: relative URL on www, numeric id.
    await probe('feed: relative www, numeric id (baseline)', `/api/v1/feed/user/${userId}/`);

    // Build the header set Instagram's own web app sends.
    const csrf = (cookies.find((c) => c.name === 'csrftoken') || {}).value || '';
    const webAppHeaders = {
      'x-csrftoken': csrf,
      'x-asbd-id': '129477',
      'x-ig-www-claim': '0',
      'x-instagram-ajax': '1',
      'x-web-session-id': '0',
    };
    log('csrftoken present:', csrf ? `yes (${csrf.length} chars)` : 'NO');
    log('');

    // 2b) Same URL, but with the csrftoken header.
    await probe('feed: relative www + x-csrftoken', `/api/v1/feed/user/${userId}/`, {
      'x-csrftoken': csrf,
    });

    // 2c) Same URL, full web-app header set.
    await probe(
      'feed: relative www + full web-app headers',
      `/api/v1/feed/user/${userId}/`,
      webAppHeaders
    );

    // 2d) Alternative: web_profile_info (what the profile page uses).
    await probe(
      'profile: web_profile_info by username',
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(USERNAME)}`
    );

    // 2e) Alternative: user info by numeric id.
    await probe(
      'user: api/v1/users/<id>/info',
      `https://www.instagram.com/api/v1/users/${userId}/info/`
    );

    log('=== done ===');
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('diagnose fatal:', err);
  process.exit(1);
});
