# Security Policy

SignalDock is intentionally local-first: imported log contents are processed in the browser, the application has no SignalDock backend, and the runtime Content Security Policy disables network connections with `connect-src 'none'`.

## Reporting a vulnerability

Please avoid publishing exploit details in a public issue before a fix is available. Open a GitHub issue with the minimum information needed to establish contact and clearly mark it as a security report; do not attach real production logs, credentials, tokens, personal data or other secrets.

A useful report includes:

- affected SignalDock version or commit;
- browser and operating system;
- minimal reproduction steps using synthetic data;
- expected vs. observed behavior;
- security impact;
- a suggested fix, if known.

## Security boundaries

SignalDock is a developer investigation tool, not a sandbox for hostile JavaScript plugins and not a forensic chain-of-custody system. Parser plugins are bundled/trusted code. Local recovery and search-cache features may persist normalized log-derived data in the browser profile until cleared by the user.
