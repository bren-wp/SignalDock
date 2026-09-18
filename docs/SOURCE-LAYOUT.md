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

Current feature controllers: `query-library-controller.js`, `baseline-controller.js`, `project-controller.js`, `inspector-controller.js`, `settings-controller.js`, `command-navigation-controller.js`, `recovery-diagnostics-controller.js`, `saved-views-controller.js`, `import-live-tail-controller.js`, `dataset-filter-controller.js`, `table-view-controller.js`, `workspace-controller.js`, `dataset-overview-controller.js`, `filter-worker-controller.js`, `related-context-controller.js`, `dataset-session-controller.js`, `investigation-controller.js`, `exception-controller.js`, `trace-explorer-controller.js`, `trace-outlier-controller.js`, `service-map-controller.js`, `service-matrix-controller.js`, `service-heatmap-controller.js`, `service-trends-controller.js`, `health-controller.js`, `case-workspace-controller.js` and `case-checkpoint-controller.js`. Cross-feature work must be supplied as narrow callbacks rather than direct controller-to-controller calls.

No bundler or package-install step is introduced by this layout.


Case file application boundary: src/app/case-file-controller.js owns bounded Case import/export and report orchestration. Storage and domain capabilities remain injected.


Query navigation application boundary: src/app/query-navigation-controller.js owns UI query composition for service, environment, namespace and topology navigation without direct Query Engine or storage capabilities.


Interaction shell application boundary: src/app/interaction-shell-controller.js owns global keyboard shortcuts and dialog exclusivity without direct storage, worker, filesystem or network capabilities.


View orchestration application boundary: src/app/view-orchestrator-controller.js coordinates full/data render passes and level-chip UI synchronization without direct parser, storage, worker, filesystem or network capabilities.


Element registry boundary: src/app/element-registry.js owns the declarative list of application DOM IDs and lookup creation. Tests require every registered ID to exist exactly once in index.html.


Startup state application boundary: src/app/startup-state-controller.js owns initial Saved Views/settings, investigation/case/query, baseline, project and checkpoint hydration through explicit injected loaders. It must not acquire direct storage, filesystem, worker or network capabilities.


Dataset View composition boundary: src/app/dataset-view-composition.js owns explicit lazy wiring for the pure dataset-view controller stack. It must not acquire storage, filesystem, worker-construction or network capabilities.


Analysis View composition staging boundary: `src/app/analysis-view-composition.js` defines capability-narrow lazy wiring for Trace Explorer, Trace Outliers, Service Map, Service Matrix, Dependency Heatmap, Dependency Trends and Observed Health. The module is covered in isolation while root runtime ownership remains unchanged until the composition migration can be committed atomically. It must not acquire storage, persistence, filesystem, worker-construction, network or native bridge capabilities.
