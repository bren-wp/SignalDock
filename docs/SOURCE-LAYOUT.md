# Source layout

SignalDock is a zero-build static application, so repository organization must stay compatible with ordinary shared hosting, local HTTP servers and GitHub Pages-style static delivery.

## Public entrypoints

The repository root intentionally keeps only the files that a static server resolves directly: `index.html`, `styles.css`, `app.js` and `filter-worker.js`. Product assets remain under `assets/` and the product website remains under `website/`.

## Runtime modules

| Directory | Responsibility |
|---|---|
| `src/core/` | parsers, queries, indexes, workspace state, persistence and local utility primitives |
| `src/analysis/` | traces, services, spans, exceptions and dependency analysis |
| `src/investigation/` | projects, baselines, cases, checkpoints and evidence workflows |
| `src/platform/` | storage and browser/native capability boundaries |
| `src/ui/` | UI helpers, keyboard/focus behavior and accessibility hardening |
| `src/vendor/` | bundled third-party or vendored runtime code |

## Quality rules

CI syntax-checks JavaScript recursively instead of only checking root entrypoints. Static auditing also scans all production JavaScript under `src/` for forbidden runtime network primitives. The source-layout smoke test rejects new root JavaScript modules so future additions stay organized.

No bundler or package-install step is introduced by this layout.
