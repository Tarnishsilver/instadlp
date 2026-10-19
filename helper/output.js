const fs = require('fs');
const path = require('path');

/**
 * Ensure the output folder for a given username exists.
 * @param {string} username - Instagram username
 * @param {string} [outputDir] - Base output directory (defaults to ./output)
 * @returns {string} Absolute path to the user's output folder
 */
function ensureUserFolder(username, outputDir) {
  const baseDir = outputDir || path.join(process.cwd(), 'output');
  const targetDir = path.join(baseDir, username);
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

/**
 * Write an array of lines (URLs) to a file.
 * @param {string} filePath - Absolute path to the output file
 * @param {string[]} lines - Array of strings to write
 */
function writeLines(filePath, lines) {
  const content = Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || '');
  fs.writeFileSync(filePath, content ? `${content}\n` : '', 'utf8');
}

module.exports = {
  ensureUserFolder,
  writeLines,
};
