// Mock all external dependencies used by session.js
jest.mock('../../helper/storeCredentials');
jest.mock('../../browserManager/storingLaunch', () => ({
  browser: null,
  page: null,
}));
jest.mock('../../browserManager/closeBrowser');
jest.mock('../../helper/timeout');
jest.mock('../../helper/logger', () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const { getSession, releaseSession } = require('../../helper/session');
const storeCredentials = require('../../helper/storeCredentials');
const storingLaunch = require('../../browserManager/storingLaunch');
const closeBrowser = require('../../browserManager/closeBrowser');
const resetBrowserTimeout = require('../../helper/timeout');

describe('getSession', () => {
  const mockPage = { evaluate: jest.fn() };
  const mockBrowser = { isConnected: jest.fn(() => true) };

  beforeEach(() => {
    jest.clearAllMocks();
    storingLaunch.browser = null;
    storingLaunch.page = null;
  });

  it('reuses existing browser when persistSession is true and browser is connected', async () => {
    storingLaunch.browser = mockBrowser;
    storingLaunch.page = mockPage;
    mockBrowser.isConnected.mockReturnValue(true);

    const result = await getSession({ persistSession: true });

    expect(result).toEqual({ page: mockPage, browser: mockBrowser });
    expect(storeCredentials).not.toHaveBeenCalled();
  });

  it('launches new session when persistSession is true but no browser exists', async () => {
    storingLaunch.browser = null;
    storeCredentials.mockResolvedValue({ page: mockPage, browser: mockBrowser });

    const result = await getSession({ persistSession: true });

    expect(storeCredentials).toHaveBeenCalledWith({ persistSession: true });
    expect(result).toEqual({ page: storingLaunch.page, browser: storingLaunch.browser });
  });

  it('launches new session when persistSession is true but browser is disconnected', async () => {
    storingLaunch.browser = { isConnected: jest.fn(() => false) };
    storeCredentials.mockResolvedValue({ page: mockPage, browser: mockBrowser });

    await getSession({ persistSession: true });

    expect(storeCredentials).toHaveBeenCalledWith({ persistSession: true });
  });

  it('launches new session when persistSession is not set', async () => {
    const expected = { page: mockPage, browser: mockBrowser };
    storeCredentials.mockResolvedValue(expected);

    const result = await getSession({});

    expect(storeCredentials).toHaveBeenCalledWith({});
    expect(result).toEqual(expected);
  });
});

describe('releaseSession', () => {
  const mockPage = { isClosed: jest.fn(() => false), close: jest.fn() };
  const mockBrowser = { isConnected: jest.fn(() => true), close: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('closes browser when closeBrowser option is true', async () => {
    await releaseSession({ closeBrowser: true }, mockPage, mockBrowser);

    expect(closeBrowser).toHaveBeenCalledWith(mockPage, mockBrowser);
    expect(resetBrowserTimeout).not.toHaveBeenCalled();
  });

  it('closes browser when persistSession is not set', async () => {
    await releaseSession({}, mockPage, mockBrowser);

    expect(closeBrowser).toHaveBeenCalledWith(mockPage, mockBrowser);
    expect(resetBrowserTimeout).not.toHaveBeenCalled();
  });

  it('sets timeout instead of closing when persistSession is true and closeBrowser is not set', async () => {
    await releaseSession({ persistSession: true }, mockPage, mockBrowser);

    expect(resetBrowserTimeout).toHaveBeenCalledWith(mockPage, mockBrowser);
    expect(closeBrowser).not.toHaveBeenCalled();
  });

  it('closes browser when both persistSession and closeBrowser are true', async () => {
    await releaseSession({ persistSession: true, closeBrowser: true }, mockPage, mockBrowser);

    expect(closeBrowser).toHaveBeenCalledWith(mockPage, mockBrowser);
    expect(resetBrowserTimeout).not.toHaveBeenCalled();
  });
});
