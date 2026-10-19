# instadlp

[![CI](https://github.com/Tarnishsilver/instadlp/actions/workflows/ci.yml/badge.svg)](https://github.com/Tarnishsilver/instadlp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org)
[![Code style: Prettier](https://img.shields.io/badge/code_style-Prettier-ff69b4.svg)](https://prettier.io)

A Node.js CLI that resolves Instagram post, reel, and story-highlight media URLs by driving a real Chrome instance through Instagram's own private web API.

The tool does not guess URLs or brute-force CDN patterns. It authenticates a browser session, replays the exact request shapes the Instagram web app sends, then persists the resulting `fbcdn.net` URLs to newline-delimited text files.

---

## Table of Contents

- [Motivation](#motivation)
- [Architecture](#architecture)
- [Request Pipeline](#request-pipeline)
- [API Surface](#api-surface)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Authentication Model](#authentication-model)
- [Usage](#usage)
- [CLI Reference](#cli-reference)
- [Configuration](#configuration)
- [Output Format](#output-format)
- [Failure Taxonomy](#failure-taxonomy)
- [Retry and Backoff Policy](#retry-and-backoff-policy)
- [Development](#development)
- [Testing](#testing)
- [Project Layout](#project-layout)
- [Security Posture](#security-posture)
- [Limitations](#limitations)
- [Legal and Ethical Use](#legal-and-ethical-use)
- [Contributing](#contributing)
- [License](#license)

---

## Motivation

Instagram's Graph API does not expose arbitrary historical post media for personal or creator accounts, and the public web profile only renders a lazy-loaded subset of a timeline. The endpoints the web application itself uses are reachable, but only under three conditions that are not documented anywhere:

1. the request must originate from an `instagram.com` origin,
2. it must carry the same header set the web client sends, including a valid `csrftoken`, and
3. it must be authenticated with a `sessionid` cookie.

`instadlp` exists to make that mechanism explicit and reproducible rather than to hide it behind a scraping framework.

---

## Architecture

```
                        CLI (commander)
                              |
                       entry.js  -- dispatch
                              |
        +---------------------+---------------------+
        |                                           |
   runLoginCommand()                            runScrape()
        |                                           |
  storeCredentials()                        services/posts_reels.js
        |                                   services/highlights.js
        |                                           |
        +------------------+------------------------+
                           |
                  helper/session.js
                (acquire / release policy)
                           |
        +------------------+------------------+
        |                                     |
  browserManager/startBrowser.js      Chrome profile dir
        |                            ($HOME/chrome-puppeteer-profile)
  browserManager/closeBrowser.js
        |
   page.evaluate(fetch)  <-- in-page, same-origin, credentials:'include'
        |
        +--> helper/instagram.js   (fetchJson, headers, user lookup)
        +--> helper/media.js       (URL extraction from API payloads)
        +--> helper/output.js      (output/<user>/posts.txt)
```

Three design decisions shape the codebase:

**Requests execute inside the page, not in Node.** `helper/instagram.js` calls `page.evaluate(fetch, ...)`. The request therefore inherits the page's origin, its cookie jar, and its TLS session, which is exactly why the private API answers with JSON instead of an HTML redirect.

**Authentication state is a cookie, not a directory.** Chrome populates a user-data directory on every launch, including launches that never authenticate. `helper/profile.js` treats the presence of the `sessionid` cookie as the sole definition of an authenticated session. Inspecting directory contents produces false positives.

**Failures are classified, not retried blindly.** A 429 is not a transient fault and retrying it deepens the action block. A 200 that returns HTML is deterministic for that endpoint. Only 5xx and network-level errors are treated as retryable.

---

## Request Pipeline

```
  1. resolve credentials        CLI flags > environment variables > existing session
  2. acquire browser            puppeteer.launch(userDataDir=~/.chrome-puppeteer-profile)
  3. detect session             GET cookies -> sessionid present?
  4. authenticate (if needed)   fill login form, poll for sessionid cookie
  5. build headers              x-ig-app-id, x-requested-with, x-csrftoken, ...
  6. resolve user               web/search/topsearch -> { pk, id, username }
  7. paginate feed              /api/v1/feed/user/<id>/?max_id=<cursor>
  8. extract media              image_versions2.candidates | video_versions[0]
  9. persist                    output/<username>/posts.txt
 10. release session            close, or arm 180s idle timeout in persist mode
```

---

## API Surface

All endpoints are private, undocumented, and subject to change without notice. The endpoint set below is what the current implementation calls.

| Endpoint                                          | Origin              | Purpose                                          |
| ------------------------------------------------- | ------------------- | ------------------------------------------------ |
| `GET /web/search/topsearch/?query=<username>`     | `www.instagram.com` | Resolve a username to its numeric user id (`pk`) |
| `GET /api/v1/feed/user/<id>/?max_id=<cursor>`     | `www.instagram.com` | User timeline, paginated via `next_max_id`       |
| `GET /api/v1/highlights/<id>/highlights_tray/`    | `i.instagram.com`   | List of highlight reels owned by a user          |
| `GET /api/v1/feed/reels_media/?reel_ids=<id>&...` | `i.instagram.com`   | Media items inside each highlight reel           |

### Required request headers

Instagram answers `/api/v1/*` with a redirect to the web app (HTML) when only `x-ig-app-id` and `x-requested-with` are present. `helper/instagram.js` sends the full set:

| Header             | Source                                                     |
| ------------------ | ---------------------------------------------------------- |
| `x-ig-app-id`      | Constant `936619743392459` (Instagram's public web app id) |
| `x-requested-with` | Constant `XMLHttpRequest`                                  |
| `x-csrftoken`      | Read from the `csrftoken` cookie at request time           |
| `x-asbd-id`        | Constant `129477`                                          |
| `x-ig-www-claim`   | Constant `0`                                               |
| `x-instagram-ajax` | Constant `1`                                               |
| `x-web-session-id` | Constant `0`                                               |

None of these values are credentials. The `x-ig-app-id` is a public identifier embedded in Instagram's own JavaScript bundle; it is not an API key and grants no access on its own.

---

## Features

- Post, reel, and highlight extraction through Instagram's own private web API
- Cursor-based pagination over the user timeline via `next_max_id`
- Highest-resolution image candidate selection, with video preferred for `media_type: 2` and for highlights
- Session reuse through a managed Chrome profile directory
- Standalone `login` subcommand, plus `--force-login` and `--logout`
- Password ingestion via `--password-stdin`, keeping secrets out of shell history and process listings
- A credential-leak guard that refuses to place the session directory inside the project tree
- Deterministic failure classification across five distinct error families
- Bounded exponential backoff on retryable statuses only
- Terminal progress reporting with a non-TTY log fallback
- Structured logging through Winston, with optional file transport
- ESLint and Prettier enforced in CI across Linux, Windows, and macOS on Node 18, 20, and 22
- 184 unit tests and 16 CLI integration tests covering the deterministic layers

---

## Requirements

- Node.js 18.0 or later
- Google Chrome or Chromium. Puppeteer can provision a compatible build automatically, or an existing installation can be pointed at via `CHROME_PATH` / `PUPPETEER_EXECUTABLE_PATH`.

---

## Installation

```bash
git clone https://github.com/Tarnishsilver/instadlp.git
cd instadlp
npm ci

# Optional: expose the binary on PATH
npm link
```

Use `npm ci` to install exactly what the lockfile pins. If you are modifying the
project rather than just running it, use `npm install` so the lockfile updates with
your changes.

---

## Authentication Model

Three credential sources are consulted, in priority order:

1. CLI flags (`--login-user` / `--login-password`, or `login --user` / `--password`)
2. Environment variables (`INSTAGRAM_USER` / `INSTAGRAM_PASSWORD`)
3. An existing browser session (a valid `sessionid` cookie in the Chrome profile)

A username and a password must always be supplied as a pair. A partial pair is a hard error rather than a silent fallback, so a typo can never degrade into an unauthenticated request.

### Session storage

The session lives in a Chrome user-data directory:

```
$HOME/chrome-puppeteer-profile        # override with CHROME_PROFILE_DIR
```

That directory contains live Instagram session cookies in Chrome's encrypted cookie store. Treat it as a credential: anyone with read access to it can impersonate the logged-in account.

### Recommended usage

```bash
# Preferred: keep the password out of shell history and `ps` output
instadlp login --user myuser --password-stdin < password.txt

# Then scrape without credentials; the stored session is reused
instadlp --posts -t natgeo
```

---

## Usage

```bash
instadlp [options] -t <username> --posts|--highlights
instadlp login [options]
```

### Common invocations

```bash
# Posts and reels from a public profile
instadlp --posts -t natgeo

# Story highlights
instadlp --highlights -t natgeo

# Both modes, 50 posts
instadlp --posts --highlights -t natgeo -c 50

# Authenticated scrape of a private account
instadlp login --user myuser --password-stdin < password.txt
instadlp --posts -t private_user

# Discard an existing session and re-authenticate
instadlp --posts -t private_user --force-login

# Destroy the stored session
instadlp login --logout

# Custom output root, file logging, debug level
instadlp --posts -t natgeo -o ./downloads --log-file debug.log --verbose
```

---

## CLI Reference

### Root command

| Option                        | Alias | Description                                                 | Default      |
| ----------------------------- | ----- | ----------------------------------------------------------- | ------------ |
| `--target-user <string>`      | `-t`  | Target Instagram username                                   | _(required)_ |
| `--posts`                     |       | Extract post and reel media                                 | `false`      |
| `--highlights`                |       | Extract story highlight media                               | `false`      |
| `--count <number>`            | `-c`  | Maximum posts to fetch (1–500)                              | `10`         |
| `--output-dir <path>`         | `-o`  | Root directory for output                                   | `./output`   |
| `--login-user <username>`     |       | Instagram username                                          | —            |
| `--login-password <password>` |       | Instagram password                                          | —            |
| `--password-stdin`            |       | Read the password from stdin                                | `false`      |
| `--force-login`               |       | Clear cookies and authenticate again                        | `false`      |
| `--logout`                    |       | Delete the Chrome profile and exit                          | `false`      |
| `--persist-session`           | `-P`  | Keep the browser alive between fetches (3 min idle timeout) | `false`      |
| `--close-browser`             |       | Force browser shutdown after fetching                       | `false`      |
| `--log-file <path>`           |       | Mirror logs to a file                                       | —            |
| `--verbose`                   |       | Enable debug-level logging                                  | `false`      |
| `--help`                      | `-h`  | Print help                                                  | —            |

At least one of `--posts` or `--highlights` is required.

### `login` subcommand

| Option                  | Alias | Description                                     | Default |
| ----------------------- | ----- | ----------------------------------------------- | ------- |
| `--user <username>`     | `-u`  | Instagram username                              | —       |
| `--password <password>` | `-p`  | Instagram password                              | —       |
| `--password-stdin`      |       | Read the password from stdin                    | `false` |
| `--force-login`         |       | Clear an existing session first                 | `false` |
| `--logout`              |       | Delete the Chrome profile instead of logging in | `false` |
| `--verbose`             |       | Enable debug-level logging                      | `false` |

---

## Configuration

| Variable                    | Description                                        |
| --------------------------- | -------------------------------------------------- |
| `INSTAGRAM_USER`            | Login username fallback                            |
| `INSTAGRAM_PASSWORD`        | Login password fallback                            |
| `CHROME_PATH`               | Path to a Chrome/Chromium executable               |
| `PUPPETEER_EXECUTABLE_PATH` | Standard Puppeteer override for the browser binary |
| `CHROME_PROFILE_DIR`        | Location of the managed Chrome profile directory   |

Command-line flags take precedence over environment variables.

---

## Output Format

```
output/
└── natgeo/
    ├── posts.txt        # one media URL per line
    └── highlights.txt   # one media URL per line
```

Files are newline-delimited with a trailing newline, so they pipe directly into `wget -i`, `aria2c -i`, `xargs -n1 curl -O`, or any other line-oriented consumer.

```bash
instadlp --posts -t natgeo && wget -i output/natgeo/posts.txt
```

Only `fbcdn.net` URLs are emitted for posts; other CDN hosts are filtered out to keep the output usable as a download manifest.

---

## Failure Taxonomy

Every error raised by the fetch layer carries a machine-readable prefix. Callers and CI scripts can branch on the prefix instead of pattern-matching prose.

| Prefix                                      | Meaning                                                                                                                   | Retryable                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `INSTAGRAM_AUTH_401` / `INSTAGRAM_AUTH_403` | Session absent, expired, or rejected                                                                                      | No. Re-authenticate            |
| `INSTAGRAM_HTML_<status>`                   | 2xx response whose body is HTML, not JSON. The session is not authorised for that endpoint, or an anti-bot wall is active | No                             |
| `INSTAGRAM_RATE_LIMIT_429`                  | Action block or rate limiting on the account or IP                                                                        | No. Back off for 15+ minutes   |
| `HTTP <status>`                             | Any other non-2xx status                                                                                                  | Only for 500, 502, 503, 504    |
| `Failed to fetch <url> after N attempts`    | Network-level failure or evaluation error                                                                                 | Yes, up to the attempt ceiling |

The `INSTAGRAM_HTML_*` case deserves emphasis: a 200 response containing `<!DOCTYPE html>` is a normal outcome when Instagram decides the caller is not a legitimate web client. Treating it as a transport error and retrying it produces a hot loop against a wall that will not move.

---

## Retry and Backoff Policy

```
max attempts   : 3
base delay     : 1000 ms
delay formula  : baseDelay * 2^(attempt - 1)   ->  1s, 2s
retryable      : 500, 502, 503, 504, network/evaluation errors
never retried  : 401, 403, 429, feedback_required, HTML-instead-of-JSON
```

Delays are computed and awaited in-process. There is no jitter, which is a deliberate simplification: the retry volume here is small enough that randomised backoff would add complexity without materially reducing the request rate.

---

## Development

```bash
npm ci              # install exactly what the lockfile pins
npm run lint        # ESLint
npm run format      # Prettier, writing changes
npm run format:check # Prettier, read-only (used by CI)
```

The ESLint and Prettier configurations are committed, so `npm run format:check` is the
source of truth for formatting. There is no transpilation step: the CommonJS source
runs directly on Node 18.

CI runs on every push and pull request against `main`. The lint and format jobs run
once; the unit suite runs across Linux, Windows, and macOS on Node 18, 20, and 22.

---

## Testing

```bash
npm test                 # full suite with coverage
npm run test:unit        # unit tests only
npm run test:integration # integration tests only
```

**Unit tests** cover the deterministic layers and require no network access: credential resolution and precedence, login state classification, profile-directory resolution and guarded deletion, media URL extraction, output writing, retry configuration, option validation, logger setup, and progress-bar fallback.

**Integration tests** spawn the real CLI as a child process and assert on exit codes and output. They exercise argument parsing, validation failure paths, credential pairing rejection, and profile removal on logout.

Fixture files under `tests/fixtures/` are synthetic. They contain no captured account data and no live CDN URLs.

Coverage is collected from `helper/`, `services/`, and `browserManager/`; the test files themselves are excluded.

---

## Project Layout

```
instadlp/
├── entry.js                     # CLI entry point and command dispatch
├── cli.js                       # Commander program definition
├── diagnose.js                  # Standalone endpoint probe for debugging
├── helper/
│   ├── credentials.js           # Credential resolution and precedence
│   ├── instagram.js             # fetchJson, user lookup, header builder
│   ├── login.js                 # Login form driver and state classifier
│   ├── logger.js                # Winston logger factory
│   ├── media.js                 # Media URL extraction from API payloads
│   ├── output.js                # Output directory and file writers
│   ├── profile.js               # Profile directory resolution, session cookie
│   ├── progress.js              # Terminal progress bar with non-TTY fallback
│   ├── session.js               # Session acquire/release lifecycle
│   ├── storeCredentials.js      # Authentication orchestration
│   ├── timeout.js               # Persist-mode idle timeout
│   └── validate.js              # CLI option validation
├── browserManager/
│   ├── startBrowser.js          # Puppeteer launcher
│   ├── closeBrowser.js          # Browser teardown
│   └── storingLaunch.js         # In-process browser registry
├── services/
│   ├── posts_reels.js           # Posts and reels pipeline
│   └── highlights.js            # Highlights pipeline
├── tests/
│   ├── fixtures/                # Synthetic API payloads
│   ├── unit/                    # Unit tests
│   └── integration/             # CLI-level integration tests
├── .github/
│   ├── workflows/ci.yml         # Lint, format, and test matrix
│   ├── ISSUE_TEMPLATE/          # Bug and feature templates
│   └── pull_request_template.md
├── .editorconfig
├── .gitignore
├── .prettierrc
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── eslint.config.js
├── jest.config.js
├── package.json
└── README.md
```

---

## Security Posture

- No credential is ever persisted by the application itself. The session is stored only inside the Chrome profile directory that Chrome manages.
- `--password-stdin` exists so that passwords do not land in shell history, in `ps` output, or in CI logs.
- The Chrome profile directory holds live Instagram session cookies and is treated as a secret. `helper/profile.js` **rejects** a `CHROME_PROFILE_DIR` that resolves inside the project tree, because such a directory would be committable and a push would publish a live login. `.gitignore` excludes the common profile directory names as a second line of defence.
- `helper/profile.js` refuses to delete a filesystem root, the user's home directory, or any directory that does not contain Chrome profile markers. This guards the destructive `--logout` path against a misconfigured `CHROME_PROFILE_DIR`.
- Passwords, session cookies, and CSRF tokens are never written to the log.
- The application does not phone home. It contacts only `instagram.com`, `i.instagram.com`, and `fbcdn.net`.
- The `x-ig-app-id` constant is a public client identifier, not a credential. There is no API key in this project.

The full threat model and reporting process are in [SECURITY.md](SECURITY.md).

---

## Limitations

- **Private APIs.** The endpoint set is undocumented and can change without notice. A silent upstream change is the most likely failure mode.
- **No 2FA automation.** Two-factor and checkpoint screens are detected and reported, then left for the user to complete in the visible browser window. There is no SMS or TOTP integration.
- **Rate limiting is not defeated.** There is no proxy rotation, no residential IP sourcing, and no attempt to bypass action blocks. Tooling that does that belongs in a different category entirely.
- **Pagination is bounded by `--count`.** The maximum is 500 posts, chosen to keep request volume inside Instagram's tolerance.
- **Selection is by resolution only.** `helper/media.js` picks the largest image candidate and prefers video for reels. There is no ranking by engagement or recency.
- **Persist mode is in-process.** `--persist-session` keeps one browser alive across multiple fetches within a single run. It does not keep a browser alive across separate CLI invocations; only the cookie-based session survives those.

---

## Legal and Ethical Use

This tool automates access to Instagram content. Automating access to a platform generally conflicts with that platform's terms of service, and it may place an account at risk of restriction if used at volume.

Use it on accounts you own or have permission to work with, respect Instagram's rate limits, and do not redistribute fetched media without the rights holder's consent. The authors assume no liability for use of this software.

---

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
workflow, the code conventions, and the testing requirements.

```bash
git clone https://github.com/Tarnishsilver/instadlp.git
cd instadlp
npm ci
npm run lint && npm run format:check && npm test
```

Changes to the fetch layer should come with a unit test that exercises the new failure
classification. Changes to the login flow should come with a test covering the new page
state in `classifyLoginState`.

Security issues should not be opened as public issues. See
[SECURITY.md](SECURITY.md).

---

## License

MIT. See [LICENSE](LICENSE).

The changelog is maintained in [CHANGELOG.md](CHANGELOG.md).
