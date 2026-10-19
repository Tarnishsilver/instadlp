const { getLogger } = require('./logger');

let browserTimeout = null;

/**
 * Reset (or start) the idle timeout that auto-closes the browser after 3 minutes of inactivity.
 * @param {import('puppeteer').Page} page
 * @param {import('puppeteer').Browser} browser
 */
function resetBrowserTimeout(page, browser) {
  const logger = getLogger();

  // Clear existing timer
  if (browserTimeout) {
    clearTimeout(browserTimeout);
  }

  // Start fresh 3-minute timer
  browserTimeout = setTimeout(async () => {
    logger.info('Browser idle for 3 minutes. Closing...');

    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
      if (browser && browser.isConnected()) {
        await browser.close();
      }
      logger.info('Browser closed successfully after idle timeout.');
    } catch (err) {
      logger.error(`Error closing browser after idle timeout: ${err.message}`);
    }
  }, 180000);
}

module.exports = resetBrowserTimeout;
