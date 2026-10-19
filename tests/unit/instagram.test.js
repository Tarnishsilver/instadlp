const {
  bestCandidate,
  findUserByUsername,
  fetchJson,
  sleep,
  getInstagramHeaders,
  resolveUserId,
} = require('../../helper/instagram');

// Mock the logger module so instagram.js doesn't fail when calling getLogger()
jest.mock('../../helper/logger', () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  initLogger: jest.fn(),
}));

/**
 * Creates a mock Puppeteer page object with a configurable evaluate function.
 * @param {Function} evaluateFn - Function to use as page.evaluate
 * @returns {Object} Mock page
 */
const createMockPage = (evaluateFn) => ({
  evaluate: jest.fn(evaluateFn),
});

describe('resolveUserId', () => {
  it('prefers pk over id', () => {
    expect(resolveUserId({ pk: 123, id: 456 })).toBe(123);
  });

  it('falls back to id when pk is absent', () => {
    expect(resolveUserId({ id: 456 })).toBe(456);
  });

  it('returns null when neither field is present', () => {
    expect(resolveUserId({})).toBeNull();
  });

  it('returns null for a missing user object', () => {
    expect(resolveUserId(undefined)).toBeNull();
  });
});

describe('bestCandidate', () => {
  it('returns the URL of the candidate with the highest width', () => {
    const candidates = [
      { url: 'https://example.com/small.jpg', width: 320, height: 320 },
      { url: 'https://example.com/large.jpg', width: 1080, height: 1080 },
      { url: 'https://example.com/medium.jpg', width: 640, height: 640 },
    ];
    expect(bestCandidate(candidates)).toBe('https://example.com/large.jpg');
  });

  it('returns null for an empty array', () => {
    expect(bestCandidate([])).toBeNull();
  });

  it('returns null for null input', () => {
    expect(bestCandidate(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(bestCandidate(undefined)).toBeNull();
  });

  it('returns the URL when there is a single candidate', () => {
    const candidates = [{ url: 'https://example.com/only.jpg', width: 640, height: 640 }];
    expect(bestCandidate(candidates)).toBe('https://example.com/only.jpg');
  });

  it('does not mutate the original array', () => {
    const candidates = [
      { url: 'https://example.com/a.jpg', width: 320 },
      { url: 'https://example.com/b.jpg', width: 1080 },
    ];
    const original = [...candidates];
    bestCandidate(candidates);
    expect(candidates).toEqual(original);
  });
});

describe('findUserByUsername', () => {
  it('returns the matched user object on success', async () => {
    const mockUser = { username: 'testuser', pk: '12345', full_name: 'Test User' };
    const page = createMockPage(async () => ({
      __data: {
        users: [{ user: { username: 'otheruser', pk: '99999' } }, { user: mockUser }],
      },
    }));

    const result = await findUserByUsername(page, 'testuser', {});
    expect(result).toEqual(mockUser);
    expect(page.evaluate).toHaveBeenCalled();
  });

  it('matches username case-insensitively', async () => {
    const mockUser = { username: 'TestUser', pk: '12345' };
    const page = createMockPage(async () => ({
      __data: {
        users: [{ user: mockUser }],
      },
    }));

    const result = await findUserByUsername(page, 'testuser', {});
    expect(result).toEqual(mockUser);
  });

  it('throws a descriptive error when user is not found', async () => {
    const page = createMockPage(async () => ({
      __data: {
        users: [{ user: { username: 'differentuser', pk: '99999' } }],
      },
    }));

    await expect(findUserByUsername(page, 'nonexistent', {})).rejects.toThrow(
      'User "nonexistent" not found'
    );
  });

  it('throws when API returns empty users array', async () => {
    const page = createMockPage(async () => ({
      __data: { users: [] },
    }));

    await expect(findUserByUsername(page, 'nobody', {})).rejects.toThrow('User "nobody" not found');
  });

  it('throws when API returns no users property', async () => {
    const page = createMockPage(async () => ({
      __data: {},
    }));

    await expect(findUserByUsername(page, 'nobody', {})).rejects.toThrow('User "nobody" not found');
  });
});

describe('getInstagramHeaders', () => {
  it('returns the web-app header set including csrftoken from cookies', async () => {
    const page = {
      cookies: jest.fn(async () => [
        { name: 'csrftoken', value: 'abc123' },
        { name: 'sessionid', value: 'session-value' },
      ]),
    };

    const headers = await getInstagramHeaders(page);

    expect(headers['x-ig-app-id']).toBe('936619743392459');
    expect(headers['x-requested-with']).toBe('XMLHttpRequest');
    expect(headers['x-csrftoken']).toBe('abc123');
    expect(headers['x-asbd-id']).toBeDefined();
    expect(headers['x-ig-www-claim']).toBeDefined();
  });

  it('returns an empty csrftoken when the cookie is absent', async () => {
    const page = { cookies: jest.fn(async () => []) };

    const headers = await getInstagramHeaders(page);

    expect(headers['x-csrftoken']).toBe('');
  });

  it('does not throw and uses an empty csrftoken when page.cookies fails', async () => {
    const page = {
      cookies: jest.fn(async () => {
        throw new Error('cookie store unavailable');
      }),
    };

    const headers = await getInstagramHeaders(page);

    expect(headers['x-csrftoken']).toBe('');
    expect(headers['x-ig-app-id']).toBe('936619743392459');
  });
});

describe('fetchJson', () => {
  it('returns parsed data on successful response', async () => {
    const expected = { items: [1, 2, 3] };
    const page = createMockPage(async () => ({ __data: expected }));

    const result = await fetchJson(page, 'https://api.instagram.com/test', {});
    expect(result).toEqual(expected);
  });

  it('throws immediately on 401 auth error without retrying', async () => {
    const page = createMockPage(async () => ({
      __error: true,
      status: 401,
      type: 'auth',
    }));

    await expect(fetchJson(page, 'https://api.instagram.com/test', {})).rejects.toThrow(
      'Authentication failed'
    );
    // Should only be called once (no retries for auth errors)
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 403 auth error without retrying', async () => {
    const page = createMockPage(async () => ({
      __error: true,
      status: 403,
      type: 'auth',
    }));

    await expect(fetchJson(page, 'https://api.instagram.com/test', {})).rejects.toThrow(
      'Authentication failed'
    );
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 server errors and throws after max attempts', async () => {
    const page = createMockPage(async () => ({
      __error: true,
      status: 500,
      type: 'http',
    }));

    // Mock sleep to avoid actual delays in tests
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => fn());

    await expect(fetchJson(page, 'https://api.instagram.com/test', {})).rejects.toThrow('HTTP 500');
    // Should retry: 3 attempts total (maxAttempts = 3)
    expect(page.evaluate).toHaveBeenCalledTimes(3);

    jest.restoreAllMocks();
  });

  it('retries on network errors and throws after max attempts', async () => {
    const page = createMockPage(async () => {
      throw new Error('net::ERR_CONNECTION_RESET');
    });

    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => fn());

    await expect(fetchJson(page, 'https://api.instagram.com/test', {})).rejects.toThrow(
      'Failed to fetch'
    );
    expect(page.evaluate).toHaveBeenCalledTimes(3);

    jest.restoreAllMocks();
  });

  it('succeeds after a transient failure', async () => {
    let callCount = 0;
    const page = createMockPage(async () => {
      callCount++;
      if (callCount === 1) {
        return { __error: true, status: 500, type: 'http' };
      }
      return { __data: { success: true } };
    });

    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => fn());

    const result = await fetchJson(page, 'https://api.instagram.com/test', {});
    expect(result).toEqual({ success: true });
    expect(page.evaluate).toHaveBeenCalledTimes(2);

    jest.restoreAllMocks();
  });

  it('throws a clear error and does not retry when Instagram returns HTML instead of JSON', async () => {
    const page = createMockPage(async () => ({
      __error: true,
      status: 200,
      type: 'html',
      contentType: 'text/html',
      redirected: true,
      finalUrl: 'https://www.instagram.com/',
      body: '<!DOCTYPE html>',
    }));

    await expect(
      fetchJson(page, 'https://www.instagram.com/api/v1/feed/user/1/', {})
    ).rejects.toThrow(/HTML page instead of JSON/);
    // Deterministic failure — must not be hammered with retries.
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('throws a rate-limit error and does not retry on HTTP 429', async () => {
    const page = createMockPage(async () => ({
      __error: true,
      status: 429,
      type: 'http',
      body: 'Too Many Requests',
    }));

    await expect(
      fetchJson(page, 'https://www.instagram.com/api/v1/feed/user/1/', {})
    ).rejects.toThrow(/rate-lim/i);
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('throws a rate-limit error and does not retry on feedback_required', async () => {
    const page = createMockPage(async () => ({
      __error: true,
      status: 400,
      type: 'http',
      body: '{"message":"feedback_required","spam":true}',
    }));

    await expect(
      fetchJson(page, 'https://www.instagram.com/api/v1/feed/user/1/', {})
    ).rejects.toThrow(/rate-lim/i);
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('passes headers and init to page.evaluate', async () => {
    const page = createMockPage(async () => ({ __data: {} }));
    const headers = { 'X-CSRFToken': 'abc123' };
    const init = { method: 'POST' };

    await fetchJson(page, 'https://api.instagram.com/test', headers, init);
    expect(page.evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      'https://api.instagram.com/test',
      headers,
      init
    );
  });
});

describe('sleep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves after the specified duration', async () => {
    const promise = sleep(1000);
    jest.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });

  it('does not resolve before the specified duration', () => {
    let resolved = false;
    sleep(1000).then(() => {
      resolved = true;
    });

    jest.advanceTimersByTime(500);
    expect(resolved).toBe(false);
  });

  it('resolves with zero ms', async () => {
    const promise = sleep(0);
    jest.advanceTimersByTime(0);
    await expect(promise).resolves.toBeUndefined();
  });
});
