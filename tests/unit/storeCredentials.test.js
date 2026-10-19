jest.mock('../../browserManager/startBrowser');
jest.mock('../../browserManager/closeBrowser');
jest.mock('../../helper/login');
jest.mock('../../helper/profile');
jest.mock('../../helper/credentials');
jest.mock('../../helper/logger', () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const storeCredentials = require('../../helper/storeCredentials');
const startBrowser = require('../../browserManager/startBrowser');
const closeBrowser = require('../../browserManager/closeBrowser');
const { performLogin } = require('../../helper/login');
const { isAuthenticated, resolveProfileDir, removeProfile } = require('../../helper/profile');
const { resolveCredentials, hasCredentials } = require('../../helper/credentials');

describe('storeCredentials', () => {
  let page;
  let browser;
  let send;

  beforeEach(() => {
    jest.clearAllMocks();
    page = {
      createCDPSession: jest.fn(),
      close: jest.fn(),
      isClosed: jest.fn(() => false),
    };
    browser = { close: jest.fn(), isConnected: jest.fn(() => true) };
    send = jest.fn().mockResolvedValue(undefined);
    page.createCDPSession.mockResolvedValue({ send });

    startBrowser.mockResolvedValue({ page, browser });
    resolveProfileDir.mockReturnValue('/tmp/profile');
    resolveCredentials.mockReturnValue({ user: 'u', password: 'p', source: 'cli' });
    hasCredentials.mockReturnValue(true);
    performLogin.mockResolvedValue({ status: 'success', message: 'ok' });
    removeProfile.mockReturnValue(true);
  });

  it('reuses the existing session without logging in when authenticated', async () => {
    isAuthenticated.mockResolvedValue(true);

    const result = await storeCredentials({});

    expect(result).toEqual({ page, browser });
    expect(performLogin).not.toHaveBeenCalled();
  });

  it('logs in when the session cookie is missing', async () => {
    isAuthenticated.mockResolvedValue(false);

    const result = await storeCredentials({});

    expect(performLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        page,
        credentials: expect.objectContaining({ user: 'u', password: 'p' }),
      })
    );
    expect(result).toEqual({ page, browser });
  });

  it('decides based on cookies, never on profile directory contents', async () => {
    // A populated profile directory means nothing about login state.
    isAuthenticated.mockResolvedValue(false);

    await storeCredentials({});

    expect(performLogin).toHaveBeenCalled();
  });

  it('clears cookies and forces a fresh login with forceLogin', async () => {
    isAuthenticated.mockResolvedValue(true);

    await storeCredentials({ forceLogin: true });

    expect(send).toHaveBeenCalledWith('Network.clearBrowserCookies');
    expect(performLogin).toHaveBeenCalled();
  });

  it('closes the browser and explains when no credentials are available', async () => {
    isAuthenticated.mockResolvedValue(false);
    hasCredentials.mockReturnValue(false);

    await expect(storeCredentials({})).rejects.toThrow(/credentials/i);
    expect(closeBrowser).toHaveBeenCalledWith(page, browser);
  });

  it('closes the browser when login fails', async () => {
    isAuthenticated.mockResolvedValue(false);
    performLogin.mockRejectedValue(new Error('Instagram rejected the login: bad password'));

    await expect(storeCredentials({})).rejects.toThrow(/bad password/);
    expect(closeBrowser).toHaveBeenCalledWith(page, browser);
  });

  it('keeps the browser open on success so 2FA can be completed', async () => {
    isAuthenticated.mockResolvedValue(false);

    await storeCredentials({});

    expect(closeBrowser).not.toHaveBeenCalled();
  });

  it('handles logout by deleting the profile and not launching a browser', async () => {
    await storeCredentials({ logout: true });

    expect(removeProfile).toHaveBeenCalledWith('/tmp/profile');
    expect(startBrowser).not.toHaveBeenCalled();
  });

  it('reports logout failure when the profile could not be removed', async () => {
    removeProfile.mockReturnValue(false);
    await expect(storeCredentials({ logout: true })).rejects.toThrow(/logout/i);
  });
});
