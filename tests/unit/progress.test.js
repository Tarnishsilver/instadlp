// Mock the logger used by progress.js
jest.mock('../../helper/logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

let createProgressBar;

beforeEach(() => {
  jest.resetModules();

  // Re-apply logger mock after resetModules
  jest.mock('../../helper/logger', () => ({
    getLogger: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }));

  createProgressBar = require('../../helper/progress').createProgressBar;
});

describe('createProgressBar', () => {
  it('returns an object with update, stop, and increment methods', () => {
    const bar = createProgressBar('Downloading', 100);
    expect(typeof bar.update).toBe('function');
    expect(typeof bar.stop).toBe('function');
    expect(typeof bar.increment).toBe('function');
    bar.stop(); // Clean up
  });

  it('update, stop, and increment do not throw', () => {
    const bar = createProgressBar('Fetching', 50);
    expect(() => bar.update(10)).not.toThrow();
    expect(() => bar.increment()).not.toThrow();
    expect(() => bar.stop()).not.toThrow();
  });

  describe('non-TTY fallback', () => {
    let originalIsTTY;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      process.stdout.isTTY = false;
    });

    afterEach(() => {
      process.stdout.isTTY = originalIsTTY;
    });

    it('returns an object with update, stop, and increment methods when not a TTY', () => {
      // Re-require after changing isTTY
      jest.resetModules();
      jest.mock('../../helper/logger', () => ({
        getLogger: () => ({
          info: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }),
      }));
      const { createProgressBar: createBar } = require('../../helper/progress');

      const bar = createBar('Testing', 10);
      expect(typeof bar.update).toBe('function');
      expect(typeof bar.stop).toBe('function');
      expect(typeof bar.increment).toBe('function');
    });

    it('does not throw when calling methods in non-TTY mode', () => {
      jest.resetModules();
      jest.mock('../../helper/logger', () => ({
        getLogger: () => ({
          info: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }),
      }));
      const { createProgressBar: createBar } = require('../../helper/progress');

      const bar = createBar('Testing', 10);
      expect(() => bar.update(5)).not.toThrow();
      expect(() => bar.increment()).not.toThrow();
      expect(() => bar.stop()).not.toThrow();
    });
  });
});
