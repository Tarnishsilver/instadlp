/**
 * Central resolution of Instagram login credentials.
 *
 * This is the single source of truth for "where do credentials come from", used
 * by both option validation and the login flow so the rules cannot drift apart.
 *
 * Priority: CLI options > environment variables.
 */

const CREDENTIAL_SOURCES = {
  CLI: 'cli',
  ENV: 'env',
  NONE: 'none',
};

/** Marker message used for the "one of user/password given but not both" case. */
const CREDENTIALS_INCOMPLETE = 'CREDENTIALS_INCOMPLETE';

/**
 * Resolve credentials from CLI options, falling back to environment variables.
 *
 * @param {Object} [options] - Parsed CLI options (loginUser / loginPassword)
 * @param {Object} [env=process.env] - Environment to read INSTAGRAM_USER / INSTAGRAM_PASSWORD from
 * @returns {{user: string, password: string, source: string}} Resolved credentials
 * @throws {Error} If a username or password is supplied without its counterpart
 */
function resolveCredentials(options = {}, env = process.env) {
  const cliUser = typeof options.loginUser === 'string' ? options.loginUser.trim() : '';
  const cliPassword = typeof options.loginPassword === 'string' ? options.loginPassword : '';
  const envUser = typeof env.INSTAGRAM_USER === 'string' ? env.INSTAGRAM_USER.trim() : '';
  const envPassword = typeof env.INSTAGRAM_PASSWORD === 'string' ? env.INSTAGRAM_PASSWORD : '';

  // A partial CLI pair is a user error, not a reason to silently fall back to env.
  if (cliUser || cliPassword) {
    if (!cliUser || !cliPassword) {
      throw new Error(CREDENTIALS_INCOMPLETE);
    }
    return { user: cliUser, password: cliPassword, source: CREDENTIAL_SOURCES.CLI };
  }

  if (envUser || envPassword) {
    if (!envUser || !envPassword) {
      throw new Error(CREDENTIALS_INCOMPLETE);
    }
    return { user: envUser, password: envPassword, source: CREDENTIAL_SOURCES.ENV };
  }

  return { user: '', password: '', source: CREDENTIAL_SOURCES.NONE };
}

/**
 * Whether any usable credentials were found.
 * @param {{source: string}} credentials
 * @returns {boolean}
 */
function hasCredentials(credentials) {
  return Boolean(credentials) && credentials.source !== CREDENTIAL_SOURCES.NONE;
}

module.exports = {
  resolveCredentials,
  hasCredentials,
  CREDENTIAL_SOURCES,
  CREDENTIALS_INCOMPLETE,
};
