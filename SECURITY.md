# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue. Use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, or open a report at
[github.com/Tarnishsilver/instadlp/security/advisories/new](https://github.com/Tarnishsilver/instadlp/security/advisories/new).

Please include:

- a description of the issue and its impact,
- the version or commit affected,
- and a minimal reproduction if you have one.

You can expect an acknowledgement within a few days. Confirmed issues are fixed and
disclosed in the next release, and you are credited unless you prefer otherwise.

## Threat model

This tool authenticates against a real Instagram account. The realistic risks are
account compromise and accidental credential publication, not remote code execution:
the tool runs locally, reads no untrusted input beyond the CLI arguments you pass it,
and makes no network requests to any server other than `instagram.com`,
`i.instagram.com`, and `fbcdn.net`.

### How credentials are handled

| Credential                      | Where it lives                                 | How it is protected                                                                                                        |
| ------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Instagram username and password | CLI arguments, environment variables, or stdin | Never written to disk by this tool. Prefer `--password-stdin` so the value stays out of shell history and process listings |
| `sessionid` cookie              | Chrome profile directory                       | Read at request time and sent only to Instagram. Never logged                                                              |
| `csrftoken` cookie              | Chrome profile directory                       | Read at request time and sent only to Instagram. Never logged                                                              |

There are no API keys in this project. The `x-ig-app-id` value is Instagram's public
web application identifier, not a credential.

### The Chrome profile directory

The default location is `$HOME/chrome-puppeteer-profile` (override with
`CHROME_PROFILE_DIR`). It contains live Instagram session cookies in Chrome's
encrypted cookie store. **Anyone with read access to it can impersonate the logged-in
account.**

To keep it out of version control:

- the tool **refuses to start** when `CHROME_PROFILE_DIR` resolves to a path inside
  the project tree, because such a directory would be committable;
- `.gitignore` excludes the common profile directory names as a second line of
  defence.

If you override `CHROME_PROFILE_DIR` to a location inside a repository, the override
is rejected. Point it somewhere outside any repository instead.

### Logging

`--log-file` writes debug-level output to disk. Log files can contain your home
directory path and the target usernames you queried. They are excluded by `.gitignore`
(`*.log`, `logs/`), but review a log before sharing it publicly.

Passwords, session cookies, and CSRF tokens are never written to the log.

## Out of scope

- Automating two-factor authentication.
- Bypassing Instagram's rate limits, action blocks, or anti-bot systems.
- Circumventing access controls on private accounts you do not own.
- Scraping for any purpose that violates Instagram's Terms of Use.

Feature requests that fall outside these boundaries will not be accepted.
