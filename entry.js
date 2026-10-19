#!/usr/bin/env node
const fs = require('fs');
const postsreelsfetch = require('./services/posts_reels');
const options = require('./cli');
const { program } = require('commander');
const chalk = require('chalk');
const highlightsFetch = require('./services/highlights');
const storeCredentials = require('./helper/storeCredentials');
const closeBrowser = require('./browserManager/closeBrowser');
const { initLogger, getLogger } = require('./helper/logger');
const { validateOptions, validateLoginOptions } = require('./helper/validate');
const { resolveCredentials, hasCredentials } = require('./helper/credentials');

/**
 * Read a password from stdin, so it never appears in shell history or `ps`.
 * @returns {string}
 */
function readPasswordFromStdin() {
  try {
    return fs.readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  } catch {
    throw new Error('--password-stdin was given but no password could be read from stdin.');
  }
}

/**
 * Merge the `login` subcommand arguments into the shape the helpers expect.
 * @param {Object} options
 * @returns {Object}
 */
function buildLoginOptions(options) {
  const cmd = options.commandOptions || {};
  const fromStdin = options.passwordStdin || cmd.passwordStdin;

  return {
    loginUser: cmd.user || options.loginUser,
    loginPassword: fromStdin ? readPasswordFromStdin() : cmd.password || options.loginPassword,
    forceLogin: Boolean(cmd.forceLogin || options.forceLogin),
    logout: Boolean(cmd.logout || options.logout),
  };
}

function reportErrors(errors) {
  console.error(chalk.red('\nValidation errors:'));
  errors.forEach((err) => console.error(chalk.red(`  ✗ ${err}`)));
  console.error('');
  program.outputHelp();
}

/**
 * Handle `instadlp login`.
 * @param {Object} options
 */
async function runLoginCommand(options) {
  const logger = getLogger();
  const loginOptions = buildLoginOptions(options);

  const errors = validateLoginOptions(loginOptions);
  if (errors.length > 0) {
    reportErrors(errors);
    process.exit(1);
  }

  if (!loginOptions.logout) {
    // Explain the failure mode up front rather than after opening a browser.
    try {
      const credentials = resolveCredentials(loginOptions);
      if (!hasCredentials(credentials)) {
        logger.warn(
          'No credentials supplied. If a saved session already exists it will be reused; ' +
            'otherwise the login will fail. Pass --user/--password, --password-stdin, or set ' +
            'INSTAGRAM_USER/INSTAGRAM_PASSWORD.'
        );
      }
    } catch {
      // validateLoginOptions already reported this.
    }
  }

  const session = await storeCredentials(loginOptions);

  if (!session || loginOptions.logout) {
    return;
  }

  try {
    logger.info('Session stored. You can now run instadlp without credentials.');
  } finally {
    await closeBrowser(session.page, session.browser);
  }
}

/**
 * Delete the stored Chrome profile and exit.
 */
async function runLogout() {
  await storeCredentials({ logout: true });
}

async function runScrape(options) {
  const logger = getLogger();
  const runPosts = Boolean(options.posts);
  const runHighlights = Boolean(options.highlights);

  logger.info(`Starting instadlp for @${options.targetUser}`);
  if (runPosts) logger.info('Mode: posts');
  if (runHighlights) logger.info('Mode: highlights');

  if (runPosts) {
    await postsreelsfetch(options);
  }

  if (runHighlights) {
    await highlightsFetch(options);
  }

  logger.info('Done!');
}

async function main() {
  const isLogin = options.command === 'login';
  const verbose = Boolean(options.verbose || (options.commandOptions || {}).verbose);

  initLogger({
    logFile: options.logFile,
    verbose,
  });

  if (isLogin) {
    await runLoginCommand(options);
    return;
  }

  // Logout is a standalone action: it must work without --posts or a target user.
  if (options.logout) {
    await runLogout();
    return;
  }

  const errors = validateOptions(options);
  if (errors.length > 0) {
    reportErrors(errors);
    process.exit(1);
  }

  await runScrape(options);
}

main().catch((err) => {
  const logger = getLogger();
  logger.error(`Fatal error: ${err.message}`);
  if (options.verbose || (options.commandOptions || {}).verbose) {
    logger.error(err.stack);
  }
  process.exit(1);
});
