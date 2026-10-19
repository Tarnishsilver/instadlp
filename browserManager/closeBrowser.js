const storingLaunch = require('./storingLaunch');
const { getLogger } = require('../helper/logger');

/**
 * Close the browser and page, cleaning up the stored launch references.
 * @param {import('puppeteer').Page} page
 * @param {import('puppeteer').Browser} browser
 */
async function closeBrowser(page, browser) {
  const logger = getLogger();
  logger.debug('Closing browser...');

  try {
    if (page && !page.isClosed()) {
      await page.close();
    }
    if (browser && browser.isConnected()) {
      await browser.close();
    }
    logger.debug('Browser closed successfully.');
  } catch (err) {
    logger.warn(`Error while closing browser: ${err.message}`);
  }

  storingLaunch.browser = null;
  storingLaunch.page = null;
}

module.exports = closeBrowser;
