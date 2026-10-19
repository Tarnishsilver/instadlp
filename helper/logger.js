const winston = require('winston');

let loggerInstance = null;

/**
 * Initialize the logger with optional file transport and debug level.
 * @param {Object} opts
 * @param {string} [opts.logFile] - Path to log file
 * @param {boolean} [opts.verbose] - Enable debug-level logging
 * @returns {winston.Logger}
 */
function initLogger(opts = {}) {
  const level = opts.verbose ? 'debug' : 'info';
  const transports = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp }) => {
          return `${timestamp} [${level}]: ${message}`;
        })
      ),
    }),
  ];

  if (opts.logFile) {
    transports.push(
      new winston.transports.File({
        filename: opts.logFile,
        format: winston.format.combine(
          winston.format.uncolorize(),
          winston.format.printf(({ level, message, timestamp }) => {
            return `${timestamp} [${level}]: ${message}`;
          })
        ),
      })
    );
  }

  loggerInstance = winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true })
    ),
    transports,
  });

  return loggerInstance;
}

/**
 * Get the current logger instance. Creates a default one if not initialized.
 * @returns {winston.Logger}
 */
function getLogger() {
  if (!loggerInstance) {
    initLogger();
  }
  return loggerInstance;
}

module.exports = { initLogger, getLogger };
