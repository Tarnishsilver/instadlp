# Contributing

Thanks for taking the time. This document covers the workflow, the code conventions,
and the boundaries of what this project accepts.

## Getting started

```bash
git clone https://github.com/Tarnishsilver/instadlp.git
cd instadlp
npm ci
```

## Workflow

1. Open an issue first for anything beyond a trivial fix. It avoids duplicated work
   and gives the design a chance to be agreed on before you write the code.
2. Branch from `main`:
   ```bash
   git checkout -b feature/short-description
   ```
3. Make the change. Keep it focused; unrelated refactors belong in a separate PR.
4. Verify locally:
   ```bash
   npm run lint          # ESLint
   npm run format:check  # Prettier
   npm test              # Full suite with coverage
   ```
5. Push and open a pull request against `main`.

Every pull request runs CI on Linux, Windows, and macOS across Node 18, 20, and 22.

## Code conventions

The project uses ESLint and Prettier, and the configuration is committed. Do not
reformat unrelated code in a pull request; run `npm run format` on the files you
touched.

- CommonJS, no transpilation step. The source runs directly on Node 18.
- Two-space indentation, single quotes, semicolons, trailing commas.
- JSDoc on every exported function: a one-line summary, `@param` for each argument
  with its type, and `@returns`.
- Prefer dependency injection for anything a test needs to control. The existing
  modules take `env`, `homedir`, `cwd`, `logger`, and `sleep` as injectable arguments
  for exactly this reason; follow that pattern rather than reaching for module-level
  mocks.
- Errors thrown from the fetch layer carry a machine-readable prefix
  (`INSTAGRAM_AUTH_`, `INSTAGRAM_HTML_`, `INSTAGRAM_RATE_LIMIT_`). New error
  families need a new prefix and a matching entry in the README's failure taxonomy.

## Testing

- `tests/unit/` covers the deterministic layers and must not touch the network.
- `tests/integration/` spawns the real CLI and asserts on exit codes and output.
- `tests/fixtures/` holds synthetic API payloads. **Never commit captured responses
  from a real account.**

A change to the fetch layer needs a unit test for the new failure classification. A
change to the login flow needs a test for the new page state in `classifyLoginState`.

## Reporting security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Scope

This project targets scraping public and permitted Instagram content, within
Instagram's rate limits. Pull requests that add credential harvesting, rate-limit
evasion, identity rotation, or anti-bot circumvention will not be merged.
