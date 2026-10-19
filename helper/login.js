const { getLogger } = require('./logger');
const { getSessionCookie, isAuthenticated } = require('./profile');

/** Instagram's dedicated login page — far more stable than the logged-out home page. */
const LOGIN_URL = 'https://www.instagram.com/accounts/login/';

const USERNAME_SELECTOR = 'input[name="username"]';
const PASSWORD_SELECTOR = 'input[name="password"]';
const SUBMIT_SELECTOR = 'button[type="submit"]';

/** Recognised page states during a login attempt. */
const LOGIN_STATES = {
  FORM: 'form',
  TWO_FACTOR: 'two-factor',
  CHALLENGE: 'challenge',
  ERROR: 'error',
  UNKNOWN: 'unknown',
};

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read everything the login flow needs to know about the current page in one
 * round trip, keeping the selectors in a single place.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Object|null>} Raw page signals
 */
function readLoginState(page) {
  return page
    .evaluate(() => {
      const text = (el) => (el && el.textContent ? el.textContent.trim() : '');
      const visible = (sel) => {
        const el = document.querySelector(sel);
        return Boolean(el && el.offsetParent !== null);
      };

      const errorEl =
        document.querySelector('#loginForm [role="alert"]') ||
        document.querySelector('form [role="alert"]') ||
        document.querySelector('[data-testid="login-error"]');

      const twoFactorEl =
        document.querySelector('input[name="verificationCode"]') ||
        document.querySelector('input[name="security_code"]');

      const body = (document.body && document.body.innerText) || '';

      return {
        hasUsernameField: visible('input[name="username"]'),
        hasPasswordField: visible('input[name="password"]'),
        errorText: text(errorEl),
        needsTwoFactor:
          Boolean(twoFactorEl) ||
          /two-factor authentication|enter the code we sent|verify it's you|verify it.s you/i.test(
            body
          ),
        needsChallenge: /help us confirm|is it you|unusual activity|checkpoint/i.test(body),
      };
    })
    .catch(() => null);
}

/**
 * Map raw page signals onto a login state. Pure so it can be unit tested and
 * reused for error reporting.
 *
 * @param {Object|null} raw
 * @returns {{kind: string, message: string}}
 */
function classifyLoginState(raw) {
  if (!raw || typeof raw !== 'object') {
    return { kind: LOGIN_STATES.UNKNOWN, message: '' };
  }

  if (raw.needsTwoFactor) {
    return {
      kind: LOGIN_STATES.TWO_FACTOR,
      message: 'Instagram is asking for a two-factor authentication code.',
    };
  }

  if (raw.needsChallenge) {
    return {
      kind: LOGIN_STATES.CHALLENGE,
      message: 'Instagram is asking you to confirm it is you (security checkpoint).',
    };
  }

  if (raw.errorText && raw.errorText.trim()) {
    return { kind: LOGIN_STATES.ERROR, message: raw.errorText.trim() };
  }

  if (raw.hasUsernameField && raw.hasPasswordField) {
    return { kind: LOGIN_STATES.FORM, message: '' };
  }

  return { kind: LOGIN_STATES.UNKNOWN, message: '' };
}

/**
 * Drive the Instagram login form and wait for an authenticated session.
 *
 * Success is confirmed by the appearance of the session cookie rather than by a
 * navigation, so a rejected login is never mistaken for a successful one.
 * Two-factor and checkpoint screens leave the browser open for the user to
 * finish, since those codes arrive by authenticator app, SMS or email.
 *
 * @param {Object} opts
 * @param {import('puppeteer').Page} opts.page - An open, logged-out page
 * @param {{user: string, password: string}} opts.credentials
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.intervalMs]
 * @param {Object} [opts.logger]
 * @param {(ms:number)=>Promise<void>} [opts.sleep] - Injectable for tests
 * @returns {Promise<{status: 'success'|'already-authenticated', message: string}>}
 */
async function performLogin(opts = {}) {
  const {
    page,
    credentials = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    logger = getLogger(),
    wait = sleep,
  } = opts;

  const { user, password } = credentials;

  if (!user || !password) {
    throw new Error(
      'Instagram login requires both a username and a password. ' +
        'Pass --login-user/--login-password or set INSTAGRAM_USER/INSTAGRAM_PASSWORD.'
    );
  }

  if (!page) {
    throw new Error('Cannot log in: no browser page is available.');
  }

  if (await isAuthenticated(page)) {
    logger.debug('Session cookie already present — skipping login form.');
    return { status: 'already-authenticated', message: 'Already signed in.' };
  }

  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30_000 });

  try {
    await page.waitForSelector(USERNAME_SELECTOR, { timeout: 20_000 });
    await page.waitForSelector(PASSWORD_SELECTOR, { timeout: 20_000 });
  } catch {
    throw new Error(
      'Could not find the Instagram login form. Instagram may have changed its layout, ' +
        'or the page did not load. Try running with --verbose, or log in manually in the ' +
        'browser window that opens.'
    );
  }

  logger.info(`Signing in as @${user}...`);

  await page.type(USERNAME_SELECTOR, user, { delay: 50 });
  await page.type(PASSWORD_SELECTOR, password, { delay: 50 });

  try {
    await page.click(SUBMIT_SELECTOR);
  } catch {
    // Some variants hide the submit button; Enter in the password field works.
    await page.focus(PASSWORD_SELECTOR);
    await page.keyboard.press('Enter');
  }

  const deadline = Date.now() + timeoutMs;
  const announced = new Set();

  while (Date.now() < deadline) {
    if (await getSessionCookie(page)) {
      logger.info('Login successful — Instagram session is active.');
      return { status: 'success', message: 'Login successful.' };
    }

    const state = classifyLoginState(await readLoginState(page));

    if (state.kind === LOGIN_STATES.ERROR) {
      throw new Error(`Instagram rejected the login: ${state.message}`);
    }

    if (state.kind === LOGIN_STATES.TWO_FACTOR || state.kind === LOGIN_STATES.CHALLENGE) {
      if (!announced.has(state.kind)) {
        announced.add(state.kind);
        logger.warn(`${state.message} Complete it in the open browser window — waiting...`);
      }
    }

    await wait(intervalMs);
  }

  throw new Error(
    'Login timed out: Instagram never established a session. ' +
      'If two-factor authentication is enabled, finish the challenge in the browser window ' +
      'and run again with --force-login.'
  );
}

module.exports = {
  performLogin,
  classifyLoginState,
  readLoginState,
  LOGIN_STATES,
  LOGIN_URL,
  USERNAME_SELECTOR,
  PASSWORD_SELECTOR,
  SUBMIT_SELECTOR,
};
