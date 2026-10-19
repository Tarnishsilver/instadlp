const fs = require('fs');
const path = require('path');
const os = require('os');
const { ensureUserFolder, writeLines } = require('../../helper/output');

describe('output helpers', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instadlp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ensureUserFolder', () => {
    it('creates directory and returns the correct path', () => {
      // The function uses process.cwd() + "output" + username
      // We'll change cwd temporarily to our temp dir
      const originalCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const result = ensureUserFolder('testuser');
        const expected = path.join(tmpDir, 'output', 'testuser');
        expect(result).toBe(expected);
        expect(fs.existsSync(result)).toBe(true);
        expect(fs.statSync(result).isDirectory()).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('is idempotent — calling twice does not throw', () => {
      const originalCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        const result1 = ensureUserFolder('testuser');
        const result2 = ensureUserFolder('testuser');
        expect(result1).toBe(result2);
        expect(fs.existsSync(result1)).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('creates nested output/username directory structure', () => {
      const originalCwd = process.cwd();
      process.chdir(tmpDir);

      try {
        ensureUserFolder('deep.user');
        expect(fs.existsSync(path.join(tmpDir, 'output'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'output', 'deep.user'))).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('writeLines', () => {
    it('writes array of URLs to a file', () => {
      const filePath = path.join(tmpDir, 'urls.txt');
      const lines = [
        'https://example.com/img1.jpg',
        'https://example.com/img2.jpg',
        'https://example.com/img3.jpg',
      ];

      writeLines(filePath, lines);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe(
        'https://example.com/img1.jpg\nhttps://example.com/img2.jpg\nhttps://example.com/img3.jpg\n'
      );
    });

    it('writes empty string for empty array', () => {
      const filePath = path.join(tmpDir, 'empty.txt');
      writeLines(filePath, []);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('');
    });

    it('filters out falsy values', () => {
      const filePath = path.join(tmpDir, 'filtered.txt');
      const lines = [
        'https://example.com/img1.jpg',
        null,
        undefined,
        '',
        'https://example.com/img2.jpg',
        false,
        0,
      ];

      writeLines(filePath, lines);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('https://example.com/img1.jpg\nhttps://example.com/img2.jpg\n');
    });

    it('handles a single line', () => {
      const filePath = path.join(tmpDir, 'single.txt');
      writeLines(filePath, ['https://example.com/only.jpg']);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('https://example.com/only.jpg\n');
    });

    it('overwrites existing file content', () => {
      const filePath = path.join(tmpDir, 'overwrite.txt');
      fs.writeFileSync(filePath, 'old content', 'utf8');

      writeLines(filePath, ['new line']);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('new line\n');
    });
  });
});
