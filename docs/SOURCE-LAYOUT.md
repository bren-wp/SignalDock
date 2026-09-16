# Source layout

SignalDock is a zero-build static application, so repository organization must stay compatible with ordinary shared hosting, local HTTP servers and GitHub Pages-style static delivery.

## Public entrypoints

The repository root intentionally keeps only the files that a static server resolves directly: `index.html`, `styles.css`, `app.js` and `filter-worker.js`. Product assets remain under `assets/` and the product website remains under `website/`.

## Runtime modules

| Directory | Responsibility |
|---|---|
| `src/app/` | feature-level application controllers that coordinate state, UI and domain modules |
| `src/core/` | parsers, queries, indexes, workspace state, persistence and local utility primitives |
| `src/analysis/` | traces, services, spans, exceptions and dependency analysis |
| `src/investigation/` | projects, baselines, cases, checkpoints and evidence workflows |
| `src/platform/` | storage and browser/native capability boundaries |
| `src/ui/` | UI helpers, keyboard/focus behavior and accessibility hardening |
| `src/vendor/` | bundled third-party or vendored runtime code |

## Quality rules

CI syntax-checks JavaScript recursively instead of only checking root entrypoints. Static auditing also scans all production JavaScript under `src/` for forbidden runtime network primitives. The source-layout smoke test rejects new root JavaScript modules so future additions stay organized.

Feature controllers under `src/app/` must receive their state, element registry and cross-feature actions through an explicit factory boundary; they should not create hidden global application state.

Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `investigation-controller.js`, `exception-controller.js`, `trace-explorer-controller.js`, `trace-outlier-controller.js`, `service-matrix-controller.js`, `service-heatmap-controller.js`, `service-trends-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`. Cross-feature work must be supplied as narrow callbacks rather than direct controller-to-controller calls.

No bundler or package-install step is introduced by this layout.
