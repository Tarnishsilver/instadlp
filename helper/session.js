const storeCredentials = require('./storeCredentials');
const storingLaunch = require('../browserManager/storingLaunch');
const closeBrowser = require('../browserManager/closeBrowser');
const resetBrowserTimeout = require('./timeout');
const { getLogger } = require('./logger');

/**
 * Acquire a browser session, reusing an existing one if persist mode is active.
 * @param {Object} options - CLI options (persistSession, loginUser, loginPassword, etc.)
 * @returns {Promise<{page: import('puppeteer').Page, browser: import('puppeteer').Browser}>}
 */
async function getSession(options) {
  const logger = getLogger();

  if (options.persistSession) {
    if (!storingLaunch.browser || !storingLaunch.browser.isConnected()) {
      logger.debug('Persistent session requested but no active browser — launching new session');
      await storeCredentials(options);
    } else {
      logger.debug('Reusing existing persistent browser session');
    }
    return { page: storingLaunch.page, browser: storingLaunch.browser };
  }

  logger.debug('Launching new browser session');
  return await storeCredentials(options);
}

/**
 * Release a browser session — either close it or set an idle timeout.
 * @param {Object} options - CLI options
 * @param {import('puppeteer').Page} page
 * @param {import('puppeteer').Browser} browser
 */
async function releaseSession(options, page, browser) {
  if (options.closeBrowser || !options.persistSession) {
    await closeBrowser(page, browser);
  } else {
    resetBrowserTimeout(page, browser);
  }
}

module.exports = { getSession, releaseSession };
