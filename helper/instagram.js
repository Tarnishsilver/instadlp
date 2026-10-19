// Shared Instagram API helpers for user lookup, data fetching, and media extraction

const { getLogger } = require('./logger');

/** Instagram web app id sent on every private-API request */
const IG_APP_ID = '936619743392459';

/**
 * Default retry configuration.
 * NOTE: 429 is intentionally NOT retryable — Instagram rate limits are not
 * transient on a per-second scale and retrying makes an action block worse.
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  retryableStatuses: [500, 502, 503, 504],
};

/**
 * Sleep for the specified duration.
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch JSON from an Instagram API endpoint via the browser page context.
 * Includes automatic retry with exponential backoff for transient errors.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} url - API URL to fetch
 * @param {Object} [headers={}] - Additional request headers
 * @param {Object} [init={}] - Additional fetch init options
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} On auth failure (401/403) or after all retries exhausted
 */
const fetchJson = async (page, url, headers = {}, init = {}) => {
  const logger = getLogger();

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      logger.debug(`API request (attempt ${attempt}/${RETRY_CONFIG.maxAttempts}): ${url}`);

      const result = await page.evaluate(
        async (url, headers, init) => {
          const resp = await fetch(url, {
            ...init,
            headers: { ...headers, ...(init.headers || {}) },
            credentials: 'include',
          });

          const status = resp.status;
          const contentType = resp.headers.get('content-type') || '';
          const finalUrl = resp.url;
          const redirected = resp.redirected;

          if (status === 401 || status === 403) {
            return { __error: true, status, type: 'auth' };
          }

          if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            return {
              __error: true,
              status,
              type: 'http',
              contentType,
              finalUrl,
              redirected,
              body: (body || '').slice(0, 300),
            };
          }

          // A 2xx response that is not JSON means Instagram served an HTML page
          // (commonly a redirect to the web app after blocking the API call).
          if (!/application\/json/i.test(contentType)) {
            const body = await resp.text().catch(() => '');
            return {
              __error: true,
              status,
              type: 'html',
              contentType,
              finalUrl,
              redirected,
              body: (body || '').slice(0, 300),
            };
          }

          try {
            return { __data: await resp.json() };
          } catch {
            return {
              __error: true,
              status,
              type: 'html',
              contentType,
              finalUrl,
              redirected,
              body: '',
            };
          }
        },
        url,
        headers,
        init
      );

      // Handle auth errors — no retry
      if (result.__error && result.type === 'auth') {
        throw new Error(
          `INSTAGRAM_AUTH_${result.status}: Authentication failed (HTTP ${result.status}). Your session may have expired — try logging in again.`
        );
      }

      // Instagram returned an HTML page instead of JSON. This is deterministic
      // (login/consent/anti-bot wall or an API redirect), so do NOT retry.
      if (result.__error && result.type === 'html') {
        const where =
          result.redirected && result.finalUrl ? ` (redirected to ${result.finalUrl})` : '';
        throw new Error(
          `INSTAGRAM_HTML_${result.status}: Instagram returned an HTML page instead of JSON for ${url}${where}. ` +
            `This usually means the session is not authorised for this endpoint or Instagram is showing a login/anti-bot wall. ` +
            `Log in again (delete the Chrome profile so first-time login runs) or wait before retrying.`
        );
      }

      // HTTP error responses
      if (result.__error && result.type === 'http') {
        const body = result.body || '';

        // Rate limiting / action blocks are not transient: fail fast and clearly.
        if (result.status === 429 || /feedback_required/i.test(body)) {
          throw new Error(
            `INSTAGRAM_RATE_LIMIT_${result.status}: Instagram is rate-limiting/action-blocking this account or IP (${url}). ` +
              `Wait a while (often 15+ minutes, sometimes hours) before retrying.` +
              (body ? ` Response: ${body.slice(0, 200)}` : '')
          );
        }

        const isRetryable = RETRY_CONFIG.retryableStatuses.includes(result.status);
        if (isRetryable && attempt < RETRY_CONFIG.maxAttempts) {
          const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1);
          logger.warn(
            `HTTP ${result.status} from ${url} — retrying in ${delay}ms (attempt ${attempt}/${RETRY_CONFIG.maxAttempts})`
          );
          await sleep(delay);
          continue;
        }
        throw new Error(
          `HTTP ${result.status} from Instagram API: ${url} (after ${attempt} attempt${attempt > 1 ? 's' : ''}).`
        );
      }

      // Success
      logger.debug(`API response received for: ${url}`);
      return result.__data;
    } catch (err) {
      // If it's one of our own terminal errors (auth/html/rate-limit/final HTTP), rethrow
      if (err.message.startsWith('INSTAGRAM_') || err.message.startsWith('HTTP ')) {
        throw err;
      }

      // Network/evaluation error — retry if possible
      if (attempt < RETRY_CONFIG.maxAttempts) {
        const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn(
          `Network error fetching ${url}: ${err.message} — retrying in ${delay}ms (attempt ${attempt}/${RETRY_CONFIG.maxAttempts})`
        );
        await sleep(delay);
        continue;
      }

      throw new Error(
        `Failed to fetch ${url} after ${RETRY_CONFIG.maxAttempts} attempts: ${err.message}`
      );
    }
  }
};

/**
 * Find an Instagram user by username via the top search API.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} username - Instagram username to find
 * @param {Object} headers - Request headers
 * @returns {Promise<Object>} The matched user object
 * @throws {Error} If the user is not found
 */
const findUserByUsername = async (page, username, headers) => {
  const logger = getLogger();
  logger.info(`Looking up user: ${username}`);

  const profileData = await fetchJson(
    page,
    `https://www.instagram.com/web/search/topsearch/?query=${encodeURIComponent(username)}`,
    headers
  );

  const matchedUser = profileData?.users?.find(
    (entry) => entry?.user?.username?.toLowerCase() === username.toLowerCase()
  );

  if (!matchedUser) {
    throw new Error(
      `User "${username}" not found on Instagram. Check the spelling and ensure the account exists and is not private.`
    );
  }

  logger.info(`Found user: ${matchedUser.user.username} (ID: ${resolveUserId(matchedUser.user)})`);
  return matchedUser.user;
};

/**
 * Resolve a user's numeric id from an API user object.
 *
 * The search response has carried `id`, `pk`, or both across API revisions,
 * and they are not guaranteed to be present together. `pk` is the canonical
 * identifier, so it is preferred; `id` is the fallback.
 *
 * @param {Object} user - A user object from an Instagram API response
 * @returns {string|number|null} The numeric id, or null if absent
 */
const resolveUserId = (user) => user?.pk || user?.id || null;

/**
 * Build the headers Instagram's own web app sends for private-API requests.
 *
 * Sending only `x-ig-app-id` + `x-requested-with` now makes Instagram answer
 * `/api/v1/...` with a redirect to the web app (HTML) instead of JSON. The
 * extra headers below make the endpoint respond with JSON again.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<Object>} Headers object for fetchJson
 */
const getInstagramHeaders = async (page) => {
  let csrftoken = '';

  try {
    if (page && typeof page.cookies === 'function') {
      const cookies = await page.cookies('https://www.instagram.com');
      const csrfCookie = (cookies || []).find((cookie) => cookie.name === 'csrftoken');
      if (csrfCookie) csrftoken = csrfCookie.value;
    }
  } catch {
    // Cookie store unavailable — send the header empty rather than fail.
  }

  return {
    'x-ig-app-id': IG_APP_ID,
    'x-requested-with': 'XMLHttpRequest',
    'x-csrftoken': csrftoken,
    'x-asbd-id': '129477',
    'x-ig-www-claim': '0',
    'x-instagram-ajax': '1',
    'x-web-session-id': '0',
  };
};

/**
 * Select the highest-resolution image candidate from an array of candidates.
 *
 * @param {Array<{url: string, width: number, height: number}>} candidates
 * @returns {string|null} URL of the best candidate, or null
 */
const bestCandidate = (candidates) => {
  if (!candidates?.length) return null;
  return [...candidates].sort((a, b) => b.width - a.width)[0].url;
};

module.exports = {
  fetchJson,
  findUserByUsername,
  getInstagramHeaders,
  resolveUserId,
  bestCandidate,
  sleep,
};
