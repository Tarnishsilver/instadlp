const { classifyLoginState, performLogin, LOGIN_STATES, LOGIN_URL } = require('../../helper/login');

/**
 * Minimal fake of the puppeteer Page surface that performLogin uses.
 *
 * `states` is the sequence of raw readLoginState payloads evaluate() returns.
 * `sessionAfterState` is how many evaluate() calls must happen before the
 * session cookie appears — this is what models "2FA screen first, cookie later".
 */
function makePage({
  initialCookies = [],
  states = [],
  sessionAfterState = Infinity,
  selectors = {},
} = {}) {
  let stateIndex = 0;

  return {
    goto: jest.fn().mockResolvedValue(null),
    waitForSelector: jest.fn(async (selector) => {
      if (selectors[selector] === 'missing') throw new Error(`Timeout waiting for ${selector}`);
      return {};
    }),
    type: jest.fn().mockResolvedValue(undefined),
    click: jest.fn().mockResolvedValue(undefined),
    focus: jest.fn().mockResolvedValue(undefined),
    keyboard: { press: jest.fn().mockResolvedValue(undefined) },
    url: jest.fn(() => LOGIN_URL),
    cookies: jest.fn(async () =>
      stateIndex >= sessionAfterState ? [{ name: 'sessionid', value: 'sess' }] : initialCookies
    ),
    evaluate: jest.fn(async () => {
      stateIndex += 1;
      return states[Math.min(stateIndex, states.length - 1)];
    }),
  };
}

const FORM = {
  hasUsernameField: true,
  hasPasswordField: true,
  errorText: '',
  needsTwoFactor: false,
  needsChallenge: false,
};

describe('classifyLoginState', () => {
  it('classifies a ready form', () => {
    expect(classifyLoginState(FORM)).toEqual({ kind: LOGIN_STATES.FORM, message: '' });
  });

  it('classifies a two-factor screen', () => {
    const state = classifyLoginState({ ...FORM, needsTwoFactor: true });
    expect(state.kind).toBe(LOGIN_STATES.TWO_FACTOR);
    expect(state.message).toMatch(/two-factor|2fa/i);
  });

  it('classifies a challenge/checkpoint screen', () => {
    const state = classifyLoginState({ ...FORM, needsChallenge: true });
    expect(state.kind).toBe(LOGIN_STATES.CHALLENGE);
    expect(state.message).toMatch(/confirm|challenge/i);
  });

  it('classifies a rejected-credentials error and surfaces Instagram text', () => {
    const state = classifyLoginState({ ...FORM, errorText: 'Your password was incorrect.' });
    expect(state.kind).toBe(LOGIN_STATES.ERROR);
    expect(state.message).toBe('Your password was incorrect.');
  });

  it('does not blame the credentials when Instagram renders a blank error', () => {
    // Guessing "incorrect password" here is exactly what made the old timeout
    // message misleading, so a blank error is not treated as a rejection.
    expect(classifyLoginState({ ...FORM, errorText: '   ' }).kind).toBe(LOGIN_STATES.FORM);
  });

  it('classifies a page with no form and no error as unknown', () => {
    expect(classifyLoginState({ hasUsernameField: false, hasPasswordField: false }).kind).toBe(
      LOGIN_STATES.UNKNOWN
    );
  });

  it('classifies an unrecognised page as unknown rather than guessing', () => {
    const state = classifyLoginState({});
    expect(state.kind).toBe(LOGIN_STATES.UNKNOWN);
  });

  it('treats a missing raw payload as unknown', () => {
    expect(classifyLoginState(null).kind).toBe(LOGIN_STATES.UNKNOWN);
  });
});

describe('performLogin', () => {
  const creds = { user: 'testuser', password: 'testpass' };
  const instantWait = jest.fn().mockResolvedValue(undefined);
  // Real but short waits, so bounded polling loops terminate quickly instead of
  // spinning (jest.fn records every call and would exhaust the heap).
  const boundedWait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5)));
  let warn;

  beforeEach(() => {
    warn = jest.fn();
  });

  const logger = () => ({ info: jest.fn(), warn, error: jest.fn(), debug: jest.fn() });

  it('returns already-authenticated without touching the form when a session exists', async () => {
    const page = makePage({ sessionAfterState: 0, states: [FORM] });

    const result = await performLogin({
      page,
      credentials: creds,
      logger: logger(),
      wait: instantWait,
    });

    expect(result.status).toBe('already-authenticated');
    expect(page.type).not.toHaveBeenCalled();
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('navigates to the dedicated login page', async () => {
    const page = makePage({ states: [FORM, FORM], sessionAfterState: 1 });
    await performLogin({ page, credentials: creds, logger: logger(), wait: instantWait });
    expect(page.goto).toHaveBeenCalledWith(
      LOGIN_URL,
      expect.objectContaining({ waitUntil: 'networkidle2' })
    );
  });

  it('types into the real username and password inputs', async () => {
    const page = makePage({ states: [FORM, FORM], sessionAfterState: 1 });
    await performLogin({ page, credentials: creds, logger: logger(), wait: instantWait });

    expect(page.type).toHaveBeenCalledWith('input[name="username"]', 'testuser', expect.anything());
    expect(page.type).toHaveBeenCalledWith('input[name="password"]', 'testpass', expect.anything());
  });

  it('submits via the submit button', async () => {
    const page = makePage({ states: [FORM, FORM], sessionAfterState: 1 });
    await performLogin({ page, credentials: creds, logger: logger(), wait: instantWait });
    expect(page.click).toHaveBeenCalledWith('button[type="submit"]');
  });

  it('reports success once a session cookie appears', async () => {
    const page = makePage({ states: [FORM, FORM], sessionAfterState: 1 });

    const result = await performLogin({
      page,
      credentials: creds,
      logger: logger(),
      wait: instantWait,
    });

    expect(result.status).toBe('success');
  });

  it('throws the real Instagram message when login is rejected', async () => {
    const page = makePage({
      states: [FORM, { ...FORM, errorText: 'Your password was incorrect. Please try again.' }],
    });

    await expect(
      performLogin({ page, credentials: creds, logger: logger(), wait: instantWait })
    ).rejects.toThrow(/Your password was incorrect/);
  });

  it('waits through a two-factor screen and succeeds once the user completes it', async () => {
    const page = makePage({
      states: [FORM, { ...FORM, needsTwoFactor: true }, { ...FORM, needsTwoFactor: true }],
      sessionAfterState: 2,
    });

    const result = await performLogin({
      page,
      credentials: creds,
      logger: logger(),
      wait: instantWait,
    });

    expect(result.status).toBe('success');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/two-factor|2fa/i));
  });

  it('waits through a checkpoint challenge and succeeds once the user completes it', async () => {
    const page = makePage({
      states: [FORM, { ...FORM, needsChallenge: true }],
      sessionAfterState: 2,
    });

    const result = await performLogin({
      page,
      credentials: creds,
      logger: logger(),
      wait: instantWait,
    });

    expect(result.status).toBe('success');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/confirm|challenge/i));
  });

  it('announces a 2FA screen only once, not on every poll', async () => {
    const page = makePage({
      states: [FORM, { ...FORM, needsTwoFactor: true }],
      sessionAfterState: Infinity,
      timeoutMs: 40,
      intervalMs: 1,
    });

    await expect(
      performLogin({
        page,
        credentials: creds,
        logger: logger(),
        wait: boundedWait,
        timeoutMs: 40,
        intervalMs: 1,
      })
    ).rejects.toThrow(/timed out/i);

    const twoFactorWarnings = warn.mock.calls.filter((c) => /two-factor|2fa/i.test(c[0]));
    expect(twoFactorWarnings).toHaveLength(1);
  });

  it('times out with an actionable message when no session ever appears', async () => {
    const page = makePage({ states: [FORM] });

    await expect(
      performLogin({
        page,
        credentials: creds,
        logger: logger(),
        wait: boundedWait,
        timeoutMs: 60,
        intervalMs: 10,
      })
    ).rejects.toThrow(/timed out/i);
  });

  it('reports a clear error when the login form never renders', async () => {
    const page = makePage({ states: [FORM], selectors: { 'input[name="username"]': 'missing' } });

    await expect(
      performLogin({ page, credentials: creds, logger: logger(), wait: instantWait })
    ).rejects.toThrow(/login form/i);
  });

  it('rejects empty credentials before opening a browser', async () => {
    const page = makePage({ states: [FORM] });
    await expect(
      performLogin({
        page,
        credentials: { user: '', password: '' },
        logger: logger(),
        wait: instantWait,
      })
    ).rejects.toThrow(/username and a password/i);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('rejects when there is no page at all', async () => {
    await expect(
      performLogin({ page: null, credentials: creds, logger: logger(), wait: instantWait })
    ).rejects.toThrow(/no browser page/i);
  });
});
