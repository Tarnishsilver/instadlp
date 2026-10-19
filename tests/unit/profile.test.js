const os = require('os');
const path = require('path');
const fs = require('fs');

const {
  resolveProfileDir,
  isInside,
  getSessionCookie,
  isAuthenticated,
  removeProfile,
  SESSION_COOKIE_NAME,
  DEFAULT_PROFILE_DIR_NAME,
} = require('../../helper/profile');

describe('resolveProfileDir', () => {
  it('uses CHROME_PROFILE_DIR when set', () => {
    const result = resolveProfileDir({ CHROME_PROFILE_DIR: '/custom/profile' });
    expect(result).toBe(path.resolve('/custom/profile'));
  });

  it('falls back to a chrome profile dir inside the home directory', () => {
    const result = resolveProfileDir({}, '/home/tester');
    expect(result).toBe(path.join('/home/tester', DEFAULT_PROFILE_DIR_NAME));
  });

  it('keeps the stable profile dir name so existing sessions are not orphaned', () => {
    // The historical default was "<home>/chrome-puppeteer-profile". On Windows
    // (where this tool actually runs) `path` is path.win32, so this reproduces
    // the legacy directory exactly while remaining portable.
    expect(DEFAULT_PROFILE_DIR_NAME).toBe('chrome-puppeteer-profile');
    expect(resolveProfileDir({}, '/home/tester')).toBe(
      path.join('/home/tester', 'chrome-puppeteer-profile')
    );
  });

  it('ignores a blank CHROME_PROFILE_DIR and uses the default', () => {
    expect(resolveProfileDir({ CHROME_PROFILE_DIR: '   ' }, '/home/tester')).toBe(
      path.join('/home/tester', DEFAULT_PROFILE_DIR_NAME)
    );
  });

  it('does not hardcode a specific home directory anywhere in the module', () => {
    // Regression guard: a hardcoded home path would break the tool for
    // everyone else and silently orphan this repo's original session.
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'helper', 'profile.js'),
      'utf8'
    );
    expect(source).not.toMatch(/[A-Z]:\\\\/);
    expect(source).not.toMatch(/\/home\/[a-z]/i);
  });
});

describe('isInside', () => {
  it('detects a nested path', () => {
    expect(isInside('/a/b', '/a/b/c')).toBe(true);
  });

  it('rejects the parent itself', () => {
    expect(isInside('/a/b', '/a/b')).toBe(false);
  });

  it('rejects a sibling path', () => {
    expect(isInside('/a/b', '/a/c')).toBe(false);
  });

  it('rejects an unrelated path', () => {
    expect(isInside('/a/b', '/x/y')).toBe(false);
  });
});

describe('resolveProfileDir credential-leak guard', () => {
  const projectDir = path.join(os.tmpdir(), 'instadlp-project');

  it('rejects an absolute override inside the project tree', () => {
    const inside = path.join(projectDir, 'chrome-profile');
    expect(() =>
      resolveProfileDir({ CHROME_PROFILE_DIR: inside }, '/home/tester', projectDir)
    ).toThrow(/inside the project/);
  });

  it('rejects a relative override that resolves inside the project tree', () => {
    expect(() =>
      resolveProfileDir({ CHROME_PROFILE_DIR: './chrome-profile' }, '/home/tester', projectDir)
    ).toThrow(/inside the project/);
  });

  it('accepts an override outside the project tree', () => {
    const outside = path.join(os.tmpdir(), 'instadlp-profile-outside');
    expect(resolveProfileDir({ CHROME_PROFILE_DIR: outside }, '/home/tester', projectDir)).toBe(
      outside
    );
  });

  it('does not apply the guard to the default home directory location', () => {
    expect(resolveProfileDir({}, '/home/tester', projectDir)).toBe(
      path.join('/home/tester', DEFAULT_PROFILE_DIR_NAME)
    );
  });
});

describe('getSessionCookie', () => {
  const pageWith = (cookies) => ({ cookies: jest.fn().mockResolvedValue(cookies) });

  it('returns the sessionid value when present', async () => {
    const page = pageWith([
      { name: 'csrftoken', value: 'abc' },
      { name: SESSION_COOKIE_NAME, value: 'sess-123' },
    ]);
    await expect(getSessionCookie(page)).resolves.toBe('sess-123');
  });

  it('returns null when the session cookie is absent', async () => {
    const page = pageWith([{ name: 'csrftoken', value: 'abc' }]);
    await expect(getSessionCookie(page)).resolves.toBeNull();
  });

  it('returns null when there are no cookies at all', async () => {
    await expect(getSessionCookie(pageWith([]))).resolves.toBeNull();
  });

  it('returns null when the cookie read throws', async () => {
    const page = { cookies: jest.fn().mockRejectedValue(new Error('no cookie access')) };
    await expect(getSessionCookie(page)).resolves.toBeNull();
  });

  it('returns null when page is missing', async () => {
    await expect(getSessionCookie(null)).resolves.toBeNull();
  });
});

describe('isAuthenticated', () => {
  it('returns true when a session cookie exists', async () => {
    const page = {
      cookies: jest.fn().mockResolvedValue([{ name: SESSION_COOKIE_NAME, value: 'x' }]),
    };
    await expect(isAuthenticated(page)).resolves.toBe(true);
  });

  it('returns false when only anonymous cookies exist', async () => {
    const page = {
      cookies: jest.fn().mockResolvedValue([
        { name: 'csrftoken', value: 'x' },
        { name: 'ig_did', value: 'y' },
      ]),
    };
    await expect(isAuthenticated(page)).resolves.toBe(false);
  });

  it('returns false when the cookie read throws', async () => {
    const page = { cookies: jest.fn().mockRejectedValue(new Error('boom')) };
    await expect(isAuthenticated(page)).resolves.toBe(false);
  });
});

describe('removeProfile', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'instadlp-profile-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const makeProfile = (name = 'profile') => {
    const dir = path.join(tmpRoot, name);
    fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Local State'), '{}');
    fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), '{}');
    return dir;
  };

  it('removes a real profile directory and reports true', () => {
    const dir = makeProfile();
    expect(removeProfile(dir)).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('returns false when the directory does not exist', () => {
    expect(removeProfile(path.join(tmpRoot, 'nope'))).toBe(false);
  });

  it('refuses to delete a directory that is not a chrome profile', () => {
    const notAProfile = path.join(tmpRoot, 'random');
    fs.mkdirSync(notAProfile, { recursive: true });
    fs.writeFileSync(path.join(notAProfile, 'important.txt'), 'keep me');

    expect(removeProfile(notAProfile)).toBe(false);
    expect(fs.existsSync(path.join(notAProfile, 'important.txt'))).toBe(true);
  });

  it('refuses to delete a filesystem root', () => {
    expect(removeProfile(path.parse(tmpRoot).root)).toBe(false);
  });

  it('refuses to delete the home directory', () => {
    expect(removeProfile(os.homedir())).toBe(false);
  });
});
