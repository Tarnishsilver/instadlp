const { resolveCredentials, CREDENTIALS_INCOMPLETE } = require('./credentials');

/**
 * Validates CLI options before execution.
 * @param {Object} options - Parsed CLI options
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateOptions(options) {
  const errors = [];

  // Must specify at least one mode
  if (!options.posts && !options.highlights) {
    errors.push('At least one mode flag is required: --posts or --highlights');
  }

  // Target user is required
  const username = (options.targetUser || '').trim();
  if (!username) {
    errors.push('Target username is required: use -t <username>');
  } else if (!/^[a-zA-Z0-9._]{1,30}$/.test(username)) {
    errors.push(
      `Invalid username "${username}". Instagram usernames can only contain letters, numbers, periods, and underscores (1-30 chars).`
    );
  }

  // Count validation
  if (options.count !== undefined && options.count !== null) {
    if (!Number.isInteger(options.count) || options.count < 1) {
      errors.push('--count must be a positive integer.');
    } else if (options.count > 500) {
      errors.push('--count must be 500 or less to avoid rate limiting.');
    }
  }

  errors.push(...validateCredentialOptions(options));

  // Output dir validation (basic - just check it's a non-empty string if provided)
  if (
    options.outputDir !== undefined &&
    typeof options.outputDir === 'string' &&
    options.outputDir.trim() === ''
  ) {
    errors.push('--output-dir must be a non-empty path.');
  }

  return errors;
}

/**
 * Validates the credentials supplied for a login.
 *
 * Unlike scrape mode, this does not require credentials: a run that already has
 * a valid Instagram session should never be asked for a password.
 *
 * @param {Object} options - Parsed CLI options
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateLoginOptions(options) {
  return validateCredentialOptions(options);
}

/**
 * Shared credential validation for both scrape and login modes.
 * @param {Object} options
 * @returns {string[]}
 */
function validateCredentialOptions(options) {
  try {
    resolveCredentials(options);
    return [];
  } catch (err) {
    if (err && err.message === CREDENTIALS_INCOMPLETE) {
      return [
        'Both login username and password must be provided together (via --login-user/--login-password or INSTAGRAM_USER/INSTAGRAM_PASSWORD env vars).',
      ];
    }
    throw err;
  }
}

module.exports = { validateOptions, validateLoginOptions };
