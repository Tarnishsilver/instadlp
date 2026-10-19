const path = require('path');
const { getSession, releaseSession } = require('../helper/session');
const { ensureUserFolder, writeLines } = require('../helper/output');
const {
  fetchJson,
  findUserByUsername,
  getInstagramHeaders,
  resolveUserId,
} = require('../helper/instagram');
const { extractPostMediaUrls } = require('../helper/media');
const { createProgressBar } = require('../helper/progress');
const { getLogger } = require('../helper/logger');

/**
 * Fetch posts/reels media URLs for a given Instagram user.
 *
 * @param {Object} inputOptions - CLI options
 * @param {string} inputOptions.targetUser - Instagram username to scrape
 * @param {number} [inputOptions.count=10] - Max number of posts to fetch
 * @param {string} [inputOptions.outputDir] - Custom output directory
 * @returns {Promise<void>}
 */
async function postsreelsfetch(inputOptions) {
  const logger = getLogger();
  const username = (inputOptions.targetUser || '').trim();

  if (!username) {
    throw new Error('Target username is required.');
  }

  const limit = Number.parseInt(inputOptions.count, 10) || 10;
  const targetDir = ensureUserFolder(username, inputOptions.outputDir);
  const outputFile = path.join(targetDir, 'posts.txt');

  let page, browser;

  try {
    ({ page, browser } = await getSession(inputOptions));

    const headers = await getInstagramHeaders(page);

    // Find user by username
    const user = await findUserByUsername(page, username, headers);

    // The feed endpoint is keyed by numeric id, not by username.
    const userId = resolveUserId(user);
    if (!userId) {
      throw new Error(`Could not resolve a numeric user id for @${username}.`);
    }

    // Fetch posts with pagination
    logger.info(`Fetching up to ${limit} posts for @${username}...`);
    const posts = [];
    let nextMax = null;
    const progress = createProgressBar('Fetching posts', limit);

    try {
      while (posts.length < limit) {
        let url = `/api/v1/feed/user/${userId}/`;
        if (nextMax) url += `?max_id=${nextMax}`;

        const data = await fetchJson(page, url, headers);
        posts.push(...(data.items || []));
        progress.update(Math.min(posts.length, limit));

        nextMax = data.next_max_id;
        if (!nextMax) break;
      }
    } finally {
      // Always stop the bar so it cannot overwrite error output.
      progress.stop();
    }

    // Extract media URLs from posts
    const mediaUrls = [];
    for (const post of posts.slice(0, limit)) {
      mediaUrls.push(...extractPostMediaUrls(post));
    }

    writeLines(outputFile, mediaUrls);
    logger.info(`Saved ${mediaUrls.length} media URLs to: ${outputFile}`);
  } catch (err) {
    const message = String(err.message || '');
    if (message.includes('INSTAGRAM_AUTH_')) {
      throw new Error(
        'Instagram returned 401/403 while fetching posts. Your session may have expired — try logging in again.'
      );
    }
    if (message.includes('INSTAGRAM_RATE_LIMIT_')) {
      throw new Error(
        'Instagram is rate-limiting/action-blocking this account or IP. Wait a while before retrying, and use a smaller --count.'
      );
    }
    if (message.includes('INSTAGRAM_HTML_')) {
      throw new Error(
        'Instagram returned a web page instead of data (login/anti-bot wall). Log in again or wait before retrying.'
      );
    }
    throw err;
  } finally {
    await releaseSession(inputOptions, page, browser);
  }
}

module.exports = postsreelsfetch;
