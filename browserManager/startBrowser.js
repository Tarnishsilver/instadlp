const puppeteer = require('puppeteer');
const storingLaunch = require('./storingLaunch');
const { getLogger } = require('../helper/logger');

/**
 * Resolve the Chrome executable. Falls back to the well-known Windows install
 * location only when PUPPETEER_EXECUTABLE_PATH / CHROME_PATH are both unset, and
 * otherwise lets puppeteer use its own bundled browser.
 */
function resolveExecutablePath() {
  return (
    process.env.CHROME_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined)
  );
}

/**
 * Launch a Chromium browser and navigate to Instagram.
 *
 * @param {string} userDataDir - Path to Chrome user data directory
 * @returns {Promise<{page: import('puppeteer').Page, browser: import('puppeteer').Browser}>}
 * @throws {Error} If browser launch or navigation fails
 */
async function startBrowser(userDataDir) {
  const logger = getLogger();
  const executablePath = resolveExecutablePath();

  logger.debug(`Launching browser (executable: ${executablePath || 'puppeteer bundled Chrome'})`);
  logger.debug(`User data directory: ${userDataDir}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      ...(executablePath ? { executablePath } : {}),
      userDataDir,
      headless: false,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
      defaultViewport: null,
    });
  } catch (err) {
    const target = executablePath || "puppeteer's bundled Chrome";
    throw new Error(
      `Failed to launch browser (${target}). ` +
        `Ensure Chrome/Chromium is installed, or set CHROME_PATH to its executable. ` +
        `Original error: ${err.message}`
    );
  }

  const pages = await browser.pages();
  const page = pages[0];
  logger.info('Opening Instagram...');

  try {
    await page.goto('https://www.instagram.com/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
  } catch (err) {
    await browser.close().catch(() => {});
    throw new Error(
      `Failed to load Instagram. Check your internet connection. Original error: ${err.message}`
    );
  }

  storingLaunch.page = page;
  storingLaunch.browser = browser;

  return { page, browser };
}

module.exports = startBrowser;
