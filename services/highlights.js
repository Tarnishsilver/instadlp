const path = require('path');
const { getSession, releaseSession } = require('../helper/session');
const { ensureUserFolder, writeLines } = require('../helper/output');
const {
  fetchJson,
  findUserByUsername,
  getInstagramHeaders,
  resolveUserId,
} = require('../helper/instagram');
const { extractHighlightMediaUrl } = require('../helper/media');
const { createProgressBar } = require('../helper/progress');
const { getLogger } = require('../helper/logger');

/**
 * Fetch highlight media URLs for a given Instagram user.
 *
 * @param {Object} inputOptions - CLI options
 * @param {string} inputOptions.targetUser - Instagram username to scrape
 * @param {string} [inputOptions.outputDir] - Custom output directory
 * @returns {Promise<void>}
 */
async function highlightsFetch(inputOptions) {
  const logger = getLogger();
  const username = (inputOptions.targetUser || '').trim();

  if (!username) {
    throw new Error('Target username is required.');
  }

  const targetDir = ensureUserFolder(username, inputOptions.outputDir);
  const outputFile = path.join(targetDir, 'highlights.txt');

  let page, browser;

  try {
    ({ page, browser } = await getSession(inputOptions));

    const headers = await getInstagramHeaders(page);

    // Find user by username
    const user = await findUserByUsername(page, username, headers);

    // The highlights endpoints are keyed by numeric id, not by username.
    const userId = resolveUserId(user);
    if (!userId) {
      throw new Error(`Could not resolve a numeric user id for @${username}.`);
    }

    // Fetch highlights tray
    logger.info(`Fetching highlights for @${username}...`);
    const trayData = await fetchJson(
      page,
      `https://i.instagram.com/api/v1/highlights/${userId}/highlights_tray/`,
      headers
    );
    const tray = trayData?.tray || [];

    if (!tray.length) {
      writeLines(outputFile, []);
      logger.info(`No highlights found for @${username}.`);
      return;
    }

    // Fetch reels for all highlight IDs
    logger.info(`Found ${tray.length} highlight reels — fetching media...`);
    const highlightIds = tray.map((item) => item.id);
    const params = highlightIds.map((id) => `reel_ids=${encodeURIComponent(id)}`).join('&');
    const reelsData = await fetchJson(
      page,
      `https://i.instagram.com/api/v1/feed/reels_media/?${params}`,
      headers
    );

    const reelsMedia = reelsData?.reels_media || [];
    const urls = [];

    // Extract media URLs with progress
    const totalItems = reelsMedia.reduce((sum, reel) => sum + (reel.items?.length || 0), 0);
    const progress = createProgressBar('Extracting highlights', totalItems);
    let processed = 0;

    try {
      for (const reel of reelsMedia) {
        for (const item of reel.items || []) {
          const mediaUrl = extractHighlightMediaUrl(item);
          if (mediaUrl) {
            urls.push(mediaUrl);
          }
          processed++;
          progress.update(processed);
        }
      }
    } finally {
      // Always stop the bar so it cannot overwrite error output.
      progress.stop();
    }

    writeLines(outputFile, urls);
    logger.info(`Saved ${urls.length} highlight media URLs to: ${outputFile}`);
  } catch (err) {
    const message = String(err.message || '');
    if (message.includes('INSTAGRAM_AUTH_')) {
      throw new Error(
        'Instagram returned 401/403 while fetching highlights. Your session may have expired — try logging in again.'
      );
    }
    if (message.includes('INSTAGRAM_RATE_LIMIT_')) {
      throw new Error(
        'Instagram is rate-limiting/action-blocking this account or IP. Wait a while before retrying.'
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

module.exports = highlightsFetch;
