const startBrowser = require('../browserManager/startBrowser');
const closeBrowser = require('../browserManager/closeBrowser');
const { performLogin } = require('./login');
const { resolveProfileDir, isAuthenticated, removeProfile } = require('./profile');
const { resolveCredentials, hasCredentials } = require('./credentials');
const { getLogger } = require('./logger');

/**
 * Acquire a browser session that is authenticated with Instagram.
 *
 * Authentication is determined by the presence of the Instagram session cookie,
 * not by the contents of the Chrome profile directory. Chrome populates a
 * profile on any launch, so directory contents cannot indicate whether a login
 * ever succeeded.
 *
 * @param {Object} options
 * @param {string} [options.loginUser]
 * @param {string} [options.loginPassword]
 * @param {boolean} [options.forceLogin=false] - Clear cookies and log in again
 * @param {boolean} [options.logout=false] - Delete the Chrome profile and exit
 * @returns {Promise<{page: import('puppeteer').Page, browser: import('puppeteer').Browser}>}
 */
async function storeCredentials(options = {}) {
  const logger = getLogger();
  const profileDir = resolveProfileDir();

  if (options.logout) {
    logger.info(`Logging out — removing Chrome profile at ${profileDir}`);
    if (!removeProfile(profileDir)) {
      throw new Error(
        `Could not complete logout: the profile directory at ${profileDir} could not be removed. ` +
          'Close any running Chrome window using it and try again.'
      );
    }
    logger.info('Logged out. The next run will require a fresh login.');
    return null;
  }

  const { page, browser } = await startBrowser(profileDir);

  if (options.forceLogin) {
    logger.info('--force-login: clearing existing Instagram cookies...');
    try {
      const client = await page.createCDPSession();
      await client.send('Network.clearBrowserCookies');
    } catch (err) {
      logger.warn(`Could not clear cookies automatically (${err.message}); continuing.`);
    }
  }

  // --force-login deliberately bypasses this check rather than relying on the
  // cookie clear having taken effect.
  if (!options.forceLogin && (await isAuthenticated(page))) {
    logger.debug('Instagram session cookie found — skipping login.');
    return { page, browser };
  }

  const credentials = resolveCredentials(options);

  if (!hasCredentials(credentials)) {
    await closeBrowser(page, browser);
    throw new Error(
      'No Instagram login session and no credentials available. ' +
        'Run "instadlp login" (or pass --login-user/--login-password, or set ' +
        'INSTAGRAM_USER/INSTAGRAM_PASSWORD) to sign in. Use --force-login to re-authenticate.'
    );
  }

  logger.info('No Instagram session found — logging in.');

  try {
    const result = await performLogin({ page, credentials });
    logger.info(result.message);
    return { page, browser };
  } catch (err) {
    // Leave nothing behind that would look like a usable session.
    await closeBrowser(page, browser);
    throw err;
  }
}

module.exports = storeCredentials;
