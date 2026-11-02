# Security Policy

SignalDock is a local-first browser application. Imported log contents are processed locally; there is no SignalDock ingestion backend. The application CSP restricts runtime network connections with `connect-src 'none'`. Browser storage, exported investigations and the host computer remain within the user's own security boundary.

## Reporting a vulnerability

**Do not disclose exploit steps, credentials, production logs or personal data in public GitHub issues.**

Use GitHub's private vulnerability reporting through the repository **Security** tab, if enabled. If that option is unavailable, open a public issue requesting a private reporting channel, but share no exploit payload or sensitive reproduction data there. Prefer synthetic data and the smallest possible reproducer.

Please include the affected version/commit, browser/OS, impact, reproduction outline and a proposed remediation when available. Do not send real incident datasets or secret-bearing logs.

## Security boundaries and local data

- Imported ZIP, text and JSON files, portable sessions and investigation bundles are **untrusted inputs**. Parse them only in a current supported browser, and keep the browser up to date.
- ZIP ingestion limits archive and extracted sizes and validates archive metadata, but does not make malicious file contents safe for other programs.
- Recovery and search-cache features can persist log-derived content in IndexedDB and/or local browser storage. This data is **not encrypted at rest by SignalDock**; browser-profile and device access controls protect it.
- Copying, exporting and saving cases or workspaces can produce files containing sensitive raw log data. Inspect exports before sharing.
- The app does not provide a remote multi-user authentication boundary, isolated plugin execution, evidentiary chain of custody or a general-purpose JavaScript sandbox. Bundled parser plugins are trusted application code.
- On shared devices, use a separate protected OS/browser profile and clear local workspace/recovery data when it is no longer needed.

## Maintainer validation

Security-sensitive changes should include regression tests for untrusted input handling, browser CSP restrictions, storage integrity and worker message handling. GitHub CI and CodeQL reduce risk but are not substitutes for browser testing, targeted code review or a penetration test.
