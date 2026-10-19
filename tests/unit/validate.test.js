const { validateOptions } = require('../../helper/validate');

describe('validateOptions', () => {
  const validBase = {
    targetUser: 'testuser',
    posts: true,
  };

  describe('valid options', () => {
    it('returns empty array for valid options with --posts', () => {
      const errors = validateOptions({ targetUser: 'testuser', posts: true });
      expect(errors).toEqual([]);
    });

    it('returns empty array for valid options with --highlights', () => {
      const errors = validateOptions({ targetUser: 'testuser', highlights: true });
      expect(errors).toEqual([]);
    });

    it('returns empty array for valid options with both --posts and --highlights', () => {
      const errors = validateOptions({ targetUser: 'testuser', posts: true, highlights: true });
      expect(errors).toEqual([]);
    });
  });

  describe('targetUser validation', () => {
    it('returns error when targetUser is missing', () => {
      const errors = validateOptions({ posts: true });
      expect(errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Target username is required')])
      );
    });

    it('returns error when targetUser is empty string', () => {
      const errors = validateOptions({ targetUser: '', posts: true });
      expect(errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Target username is required')])
      );
    });

    it('returns error when targetUser is whitespace only', () => {
      const errors = validateOptions({ targetUser: '   ', posts: true });
      expect(errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Target username is required')])
      );
    });

    it('returns error for username with special characters', () => {
      const errors = validateOptions({ targetUser: 'user@name!', posts: true });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('Invalid username')]));
    });

    it('returns error for username with spaces', () => {
      const errors = validateOptions({ targetUser: 'user name', posts: true });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('Invalid username')]));
    });

    it('returns error for username longer than 30 characters', () => {
      const longUsername = 'a'.repeat(31);
      const errors = validateOptions({ targetUser: longUsername, posts: true });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('Invalid username')]));
    });

    it('accepts username with dots', () => {
      const errors = validateOptions({ targetUser: 'user.name', posts: true });
      expect(errors).toEqual([]);
    });

    it('accepts username with underscores', () => {
      const errors = validateOptions({ targetUser: 'user_name', posts: true });
      expect(errors).toEqual([]);
    });

    it('accepts username with numbers', () => {
      const errors = validateOptions({ targetUser: 'user123', posts: true });
      expect(errors).toEqual([]);
    });

    it('accepts username with dots and underscores combined', () => {
      const errors = validateOptions({ targetUser: 'user.name_123', posts: true });
      expect(errors).toEqual([]);
    });

    it('accepts single character username', () => {
      const errors = validateOptions({ targetUser: 'a', posts: true });
      expect(errors).toEqual([]);
    });

    it('accepts 30 character username', () => {
      const errors = validateOptions({ targetUser: 'a'.repeat(30), posts: true });
      expect(errors).toEqual([]);
    });
  });

  describe('count validation', () => {
    it('returns error for count of 0', () => {
      const errors = validateOptions({ ...validBase, count: 0 });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('positive integer')]));
    });

    it('returns error for negative count', () => {
      const errors = validateOptions({ ...validBase, count: -1 });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('positive integer')]));
    });

    it('returns error for non-integer count', () => {
      const errors = validateOptions({ ...validBase, count: 3.5 });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('positive integer')]));
    });

    it('returns error for count greater than 500', () => {
      const errors = validateOptions({ ...validBase, count: 501 });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('500 or less')]));
    });

    it('returns error for NaN count (simulating parseInt("abc"))', () => {
      const errors = validateOptions({ ...validBase, count: NaN });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('positive integer')]));
    });

    it('accepts valid count of 1', () => {
      const errors = validateOptions({ ...validBase, count: 1 });
      expect(errors).toEqual([]);
    });

    it('accepts valid count of 500', () => {
      const errors = validateOptions({ ...validBase, count: 500 });
      expect(errors).toEqual([]);
    });

    it('accepts valid count of 50', () => {
      const errors = validateOptions({ ...validBase, count: 50 });
      expect(errors).toEqual([]);
    });

    it('allows undefined count (no count provided)', () => {
      const errors = validateOptions({ ...validBase });
      expect(errors).toEqual([]);
    });
  });

  describe('mode flags validation', () => {
    it('returns error when neither --posts nor --highlights is set', () => {
      const errors = validateOptions({ targetUser: 'testuser' });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('mode flag')]));
    });

    it('returns error when both are explicitly false', () => {
      const errors = validateOptions({ targetUser: 'testuser', posts: false, highlights: false });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('mode flag')]));
    });
  });

  describe('login credentials validation', () => {
    it('returns error when loginUser is provided without loginPassword', () => {
      const errors = validateOptions({ ...validBase, loginUser: 'myuser' });
      expect(errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Both login username and password')])
      );
    });

    it('returns error when loginPassword is provided without loginUser', () => {
      const errors = validateOptions({ ...validBase, loginPassword: 'secret' });
      expect(errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Both login username and password')])
      );
    });

    it('accepts when both loginUser and loginPassword are provided', () => {
      const errors = validateOptions({ ...validBase, loginUser: 'user', loginPassword: 'pass' });
      expect(errors).toEqual([]);
    });

    it('accepts when neither login credential is provided', () => {
      const errors = validateOptions({ ...validBase });
      expect(errors).toEqual([]);
    });
  });

  describe('environment variable credentials', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.INSTAGRAM_USER;
      delete process.env.INSTAGRAM_PASSWORD;
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('returns error when INSTAGRAM_USER env is set without INSTAGRAM_PASSWORD', () => {
      process.env.INSTAGRAM_USER = 'envuser';
      const errors = validateOptions({ ...validBase });
      expect(errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Both login username and password')])
      );
    });

    it('returns error when INSTAGRAM_PASSWORD env is set without INSTAGRAM_USER', () => {
      process.env.INSTAGRAM_PASSWORD = 'envpass';
      const errors = validateOptions({ ...validBase });
      expect(errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Both login username and password')])
      );
    });

    it('accepts when both env vars are set', () => {
      process.env.INSTAGRAM_USER = 'envuser';
      process.env.INSTAGRAM_PASSWORD = 'envpass';
      const errors = validateOptions({ ...validBase });
      expect(errors).toEqual([]);
    });
  });

  describe('outputDir validation', () => {
    it('returns error for empty string outputDir', () => {
      const errors = validateOptions({ ...validBase, outputDir: '' });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('non-empty path')]));
    });

    it('returns error for whitespace-only outputDir', () => {
      const errors = validateOptions({ ...validBase, outputDir: '   ' });
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('non-empty path')]));
    });

    it('accepts valid outputDir', () => {
      const errors = validateOptions({ ...validBase, outputDir: './my-output' });
      expect(errors).toEqual([]);
    });

    it('accepts when outputDir is not provided', () => {
      const errors = validateOptions({ ...validBase });
      expect(errors).toEqual([]);
    });
  });

  describe('multiple errors', () => {
    it('returns multiple errors when multiple validations fail', () => {
      const errors = validateOptions({});
      expect(errors.length).toBeGreaterThanOrEqual(2);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('mode flag'),
          expect.stringContaining('Target username'),
        ])
      );
    });
  });
});
