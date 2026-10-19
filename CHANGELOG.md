# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [1.0.0] - 2026-10-20

First public release.

### Added

- Post, reel, and highlight extraction through Instagram's private web API, with
  cursor-based pagination over the user timeline via `next_max_id`.
- Standalone `login` subcommand, plus `--force-login` and `--logout`.
- `--password-stdin` so credentials stay out of shell history and process listings.
- Credential resolution in a single source of truth (`helper/credentials.js`), with CLI
  flags taking precedence over environment variables. A username and password must
  always be supplied as a pair.
- Credential-leak guard: `CHROME_PROFILE_DIR` now resolves relative paths against the
  working directory and rejects any override that lands inside the project tree,
  where the live Instagram session cookies would be committable.
- `resolveUserId` helper that prefers `pk` over `id` when reading a user's numeric
  identifier, with a hard error when neither is present.
- Deterministic failure classification across five error families, with bounded
  exponential backoff on retryable statuses only.
- Terminal progress reporting with a non-TTY log fallback, and structured Winston
  logging with optional file transport.
- 184 unit tests and 16 CLI integration tests.
- ESLint configuration with `eslint:recommended` plus CommonJS and browser-context
  globals.
- Prettier configuration covering JavaScript, JSON, YAML, and Markdown.
- GitHub Actions CI running lint, format checks, and the test suite across
  Linux, Windows, and macOS on Node 18, 20, and 22.
- Dependabot configuration for npm and GitHub Actions dependencies.
- Issue and pull request templates.
- `SECURITY.md` documenting the credential threat model.
- `CONTRIBUTING.md` documenting the workflow and code conventions.

### Changed

- Authentication state is determined by the presence of the `sessionid` cookie rather
  than by inspecting Chrome profile directory contents, which are populated on every
  launch regardless of whether a login ever succeeded.
- Replaced `catch (_)` with optional catch bindings throughout.
- Rewrote the README with an architecture overview, request pipeline, endpoint and
  header reference, failure taxonomy, retry policy, and security posture.

### Removed

- The `puppeteer-extra` and `puppeteer-extra-plugin-stealth` dependencies. Neither was
  ever imported; the tool relies on Puppeteer's own anti-automation flags.
- A hardcoded local filesystem path from the Chrome profile resolution.
- An unused `path` import in `helper/logger.js`.
- An empty, unreferenced `conf/userids.txt`.
