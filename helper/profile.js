const fs = require('fs');
const os = require('os');
const path = require('path');
const { getLogger } = require('./logger');

/** Cookie Instagram sets once a login succeeds. Its presence *is* the auth state. */
const SESSION_COOKIE_NAME = 'sessionid';

/** Directory name of the managed Chrome profile, kept stable for existing users. */
const DEFAULT_PROFILE_DIR_NAME = 'chrome-puppeteer-profile';

/** Origin used for cookie lookups. */
const INSTAGRAM_ORIGIN = 'https://www.instagram.com';

/**
 * Whether `child` is contained within `parent`.
 *
 * @param {string} parent
 * @param {string} child
 * @returns {boolean}
 */
function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Resolve the Chrome profile directory.
 *
 * Honours CHROME_PROFILE_DIR, otherwise uses a profile directory inside the
 * user's home directory. The name matches the historical hardcoded default so
 * previously authenticated sessions keep working after this change.
 *
 * The profile directory holds live Instagram session cookies, so an override
 * that points inside the project tree is rejected. Otherwise the session
 * becomes committable, and a pushed repository publishes a live login.
 *
 * @param {Object} [env=process.env]
 * @param {string} [homedir=os.homedir()]
 * @param {string} [cwd=process.cwd()] - Base for resolving relative overrides
 * @returns {string} Absolute path to the profile directory
 * @throws {Error} If an explicit override resolves inside the project tree
 */
function resolveProfileDir(env = process.env, homedir = os.homedir(), cwd = process.cwd()) {
  const override = env && env.CHROME_PROFILE_DIR;
  const trimmed = override ? String(override).trim() : '';

  if (!trimmed) {
    return path.join(homedir, DEFAULT_PROFILE_DIR_NAME);
  }

  const resolved = path.resolve(cwd, trimmed);
  const packageRoot = path.resolve(__dirname, '..');

  if (isInside(cwd, resolved) || isInside(packageRoot, resolved)) {
    throw new Error(
      `Refusing to use the Chrome profile directory at ${resolved}: it is inside the project ` +
        `tree, and it stores live Instagram session cookies that would be published with the ` +
        `repository. Point CHROME_PROFILE_DIR at a directory outside the project.`
    );
  }

  return resolved;
}

/**
 * Read the Instagram session cookie from a page.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<string|null>} Cookie value, or null if absent/unreadable
 */
async function getSessionCookie(page) {
  if (!page || typeof page.cookies !== 'function') return null;
  try {
    const cookies = (await page.cookies(INSTAGRAM_ORIGIN)) || [];
    const match = cookies.find((cookie) => cookie && cookie.name === SESSION_COOKIE_NAME);
    return match && match.value ? match.value : null;
  } catch {
    return null;
  }
}

/**
 * Whether the page currently holds an authenticated Instagram session.
 *
 * This intentionally inspects cookies rather than the profile directory
 * contents: Chrome populates a profile directory on any launch, including
 * ones that never authenticated, so directory contents say nothing about login
 * state.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
async function isAuthenticated(page) {
  return (await getSessionCookie(page)) !== null;
}

/**
 * Whether a directory looks like a Chrome profile (guards destructive deletes).
 * @param {string} dir
 * @returns {boolean}
 */
function looksLikeChromeProfile(dir) {
  try {
    if (fs.existsSync(path.join(dir, 'Local State'))) return true;
    return fs.existsSync(path.join(dir, 'Default'));
  } catch {
    return false;
  }
}

/**
 * Delete a Chrome profile directory, refusing unsafe targets.
 *
 * @param {string} dir - Profile directory to remove
 * @returns {boolean} True if the directory was removed
 */
function removeProfile(dir) {
  const logger = getLogger();

  if (!dir) return false;

  const resolved = path.resolve(dir);

  // Never delete a filesystem root or the user's home directory.
  if (resolved === path.parse(resolved).root || resolved === path.resolve(os.homedir())) {
    logger.warn(`Refusing to delete unsafe profile path: ${resolved}`);
    return false;
  }

  if (!fs.existsSync(resolved)) {
    logger.debug(`Profile directory does not exist: ${resolved}`);
    return false;
  }

  if (!looksLikeChromeProfile(resolved)) {
    logger.warn(`Refusing to delete "${resolved}" because it does not look like a Chrome profile.`);
    return false;
  }

  fs.rmSync(resolved, { recursive: true, force: true });
  logger.info(`Removed Chrome profile directory: ${resolved}`);
  return true;
}

module.exports = {
  resolveProfileDir,
  isInside,
  getSessionCookie,
  isAuthenticated,
  removeProfile,
  SESSION_COOKIE_NAME,
  DEFAULT_PROFILE_DIR_NAME,
  INSTAGRAM_ORIGIN,
};
