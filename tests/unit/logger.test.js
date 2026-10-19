// Reset the logger module's internal state between tests
let loggerModule;

beforeEach(() => {
  jest.resetModules();
  loggerModule = require('../../helper/logger');
});

describe('initLogger', () => {
  it('creates a logger instance', () => {
    const logger = loggerModule.initLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('returns a logger with info level by default', () => {
    const logger = loggerModule.initLogger();
    expect(logger.level).toBe('info');
  });

  it('sets debug level when verbose is true', () => {
    const logger = loggerModule.initLogger({ verbose: true });
    expect(logger.level).toBe('debug');
  });

  it('adds a file transport when logFile is specified', () => {
    const logger = loggerModule.initLogger({ logFile: 'test.log' });
    const fileTransport = logger.transports.find((t) => t.constructor.name === 'File');
    expect(fileTransport).toBeDefined();
    expect(fileTransport.filename).toBe('test.log');
  });

  it('does not add file transport when logFile is not specified', () => {
    const logger = loggerModule.initLogger();
    const fileTransport = logger.transports.find((t) => t.constructor.name === 'File');
    expect(fileTransport).toBeUndefined();
  });

  it('always includes a console transport', () => {
    const logger = loggerModule.initLogger();
    const consoleTransport = logger.transports.find((t) => t.constructor.name === 'Console');
    expect(consoleTransport).toBeDefined();
  });
});

describe('getLogger', () => {
  it('returns the same instance after initLogger', () => {
    const logger1 = loggerModule.initLogger();
    const logger2 = loggerModule.getLogger();
    expect(logger2).toBe(logger1);
  });

  it('auto-initializes a logger if not yet initialized', () => {
    // Fresh module — no initLogger called
    const logger = loggerModule.getLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('returns consistent instance on repeated calls', () => {
    const logger1 = loggerModule.getLogger();
    const logger2 = loggerModule.getLogger();
    expect(logger1).toBe(logger2);
  });
});
