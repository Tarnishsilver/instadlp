const {
  resolveCredentials,
  hasCredentials,
  CREDENTIALS_INCOMPLETE,
  CREDENTIAL_SOURCES,
} = require('../../helper/credentials');

describe('resolveCredentials', () => {
  const cleanEnv = {};

  describe('CLI options', () => {
    it('returns CLI credentials when both are provided', () => {
      const result = resolveCredentials(
        { loginUser: 'cliuser', loginPassword: 'clipass' },
        cleanEnv
      );
      expect(result).toEqual({
        user: 'cliuser',
        password: 'clipass',
        source: CREDENTIAL_SOURCES.CLI,
      });
    });

    it('trims whitespace from the username', () => {
      const result = resolveCredentials(
        { loginUser: '  cliuser  ', loginPassword: 'clipass' },
        cleanEnv
      );
      expect(result.user).toBe('cliuser');
    });

    it('does not trim the password (spaces are significant)', () => {
      const result = resolveCredentials(
        { loginUser: 'cliuser', loginPassword: ' pass word ' },
        cleanEnv
      );
      expect(result.password).toBe(' pass word ');
    });

    it('takes priority over environment variables', () => {
      const result = resolveCredentials(
        { loginUser: 'cliuser', loginPassword: 'clipass' },
        { INSTAGRAM_USER: 'envuser', INSTAGRAM_PASSWORD: 'envpass' }
      );
      expect(result).toEqual({
        user: 'cliuser',
        password: 'clipass',
        source: CREDENTIAL_SOURCES.CLI,
      });
    });

    it('throws when only a CLI username is provided', () => {
      expect(() => resolveCredentials({ loginUser: 'cliuser' }, cleanEnv)).toThrow(
        CREDENTIALS_INCOMPLETE
      );
    });

    it('throws when only a CLI password is provided', () => {
      expect(() => resolveCredentials({ loginPassword: 'clipass' }, cleanEnv)).toThrow(
        CREDENTIALS_INCOMPLETE
      );
    });
  });

  describe('environment variables', () => {
    it('returns env credentials when both are set and no CLI options given', () => {
      const result = resolveCredentials(
        {},
        { INSTAGRAM_USER: 'envuser', INSTAGRAM_PASSWORD: 'envpass' }
      );
      expect(result).toEqual({
        user: 'envuser',
        password: 'envpass',
        source: CREDENTIAL_SOURCES.ENV,
      });
    });

    it('throws when only INSTAGRAM_USER is set', () => {
      expect(() => resolveCredentials({}, { INSTAGRAM_USER: 'envuser' })).toThrow(
        CREDENTIALS_INCOMPLETE
      );
    });

    it('throws when only INSTAGRAM_PASSWORD is set', () => {
      expect(() => resolveCredentials({}, { INSTAGRAM_PASSWORD: 'envpass' })).toThrow(
        CREDENTIALS_INCOMPLETE
      );
    });
  });

  describe('no credentials', () => {
    it('returns the "none" source when nothing is provided', () => {
      const result = resolveCredentials({}, cleanEnv);
      expect(result).toEqual({ user: '', password: '', source: CREDENTIAL_SOURCES.NONE });
    });

    it('treats whitespace-only CLI username as absent', () => {
      const result = resolveCredentials({ loginUser: '   ' }, cleanEnv);
      expect(result.source).toBe(CREDENTIAL_SOURCES.NONE);
    });

    it('does not throw when options is undefined', () => {
      const result = resolveCredentials(undefined, cleanEnv);
      expect(result.source).toBe(CREDENTIAL_SOURCES.NONE);
    });

    it('does not throw when env is undefined', () => {
      const result = resolveCredentials({ loginUser: 'u', loginPassword: 'p' });
      expect(result.source).toBe(CREDENTIAL_SOURCES.CLI);
    });
  });
});

describe('hasCredentials', () => {
  it('returns true for CLI source', () => {
    expect(hasCredentials({ source: CREDENTIAL_SOURCES.CLI })).toBe(true);
  });

  it('returns true for env source', () => {
    expect(hasCredentials({ source: CREDENTIAL_SOURCES.ENV })).toBe(true);
  });

  it('returns false for none source', () => {
    expect(hasCredentials({ source: CREDENTIAL_SOURCES.NONE })).toBe(false);
  });
});
