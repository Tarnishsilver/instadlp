const cliProgress = require('cli-progress');
const { getLogger } = require('./logger');

/**
 * Create a CLI progress bar. Falls back to log messages if not a TTY.
 * @param {string} label - Label for the progress bar
 * @param {number} total - Total number of items
 * @returns {Object} Progress bar controller with update() and stop() methods
 */
function createProgressBar(label, total) {
  const isTTY = process.stdout.isTTY;

  if (!isTTY) {
    // Non-TTY fallback: use logger
    const logger = getLogger();
    return {
      update(current) {
        logger.info(`${label}: ${current}/${total}`);
      },
      stop() {
        logger.info(`${label}: complete`);
      },
      increment() {},
    };
  }

  const bar = new cliProgress.SingleBar(
    {
      format: `${label} |{bar}| {value}/{total} ({percentage}%)`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      clearOnComplete: false,
    },
    cliProgress.Presets.shades_classic
  );

  bar.start(total, 0);

  return {
    update(current) {
      bar.update(current);
    },
    stop() {
      bar.stop();
    },
    increment() {
      bar.increment();
    },
  };
}

module.exports = { createProgressBar };
