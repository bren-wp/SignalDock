# Changelog


## 2.7.0 — 2026-09-15

### Project Reopen workflow
- Projects can now link and load local log datasets through explicit File System Access capabilities and reopen them later after a permission check.
- Recent datasets and workspaces surface Linked vs Metadata only state, Reopen, Relink and Forget link actions.
- Reopen count and last-reopened metadata are tracked locally without copying log bytes into project records.
- Deleting a project forgets its saved capability records while leaving the user's files untouched.
- Duplicating a project intentionally strips local filesystem capabilities from the copy.

### Workspace persistence
- Workspace saving now uses sequential `saveParts` writes when the File System Access API is available, reducing peak memory compared with materializing one large export Blob.
- Recent-workspace metadata is recorded only after the save succeeds; cancelled or failed saves no longer create false history entries.
- Successfully saved workspace handles can be attached to the active project for later local reopening.

### Desktop-ready boundary
- Added `desktop-bridge.js`, a narrow allowlisted capability facade for pick/save/reopen/status/forget operations.
- Browser mode remains the default implementation through `storage-adapter.js`; no native installer or unrestricted shell/filesystem bridge is claimed or exposed.
- Added adapter/project migration and integration coverage for the v2.7 workflow.


## 2.6.0 — 2026-09-13

### Large-dataset trace and service scaling
- Reworked Trace Explorer aggregation into a two-pass parent-coverage calculation that no longer retains parent-ID arrays per trace.
- The application now caches and renders a bounded top trace window while preserving exact global trace/error/incomplete/service summary counts.
- Service Matrix keeps exact latency samples for normal edges, then promotes high-volume edges to bounded logarithmic histograms while preserving exact call/error/average/max counters.
- Added an explicit edge safety ceiling and surfaced approximation/limit metadata through the service-matrix API.

### Project continuity foundation
- Storage Adapter now provides a local IndexedDB registry for File System Access handles, permission checks and user-initiated file reopening.
- Project Manager v3 can associate recent dataset/workspace metadata with opaque local handle references.
- Portable project exports deliberately strip local handle keys and reopenability flags so filesystem capabilities never leave the browser profile.

### Accessibility and mobile hardening
- Added dialog labelling, focus restoration, keyboard focus trapping, input-modality focus visibility, coarse-pointer touch targets and reduced-motion behavior.
- Added narrow-viewport dialog/table constraints for mobile investigation workflows.

### Quality
- Added v2.6 scaling/continuity regression coverage and retained the dependency-free syntax, regression, static/CSP, HTTP and CodeQL gates.

## 2.5.0 — 2026-09-13

### Baseline history and comparison workflow
- Wired the aggregate-only baseline history APIs into the Baseline workspace with bounded local history, active-project association, history import/export and saved-baseline A/B comparison.
- Captured and imported baselines now join local history automatically while preserving the existing current-dataset-vs-baseline workflow and raw-log exclusion guarantee.

### Project and investigation continuity
- Project Manager now surfaces recent workspace, dataset, baseline and case metadata histories with duplicate/archive controls.
- Workspace saves record metadata-only recent-session and case/baseline references; successful log imports add metadata-only dataset history to the active project.
- Case Checkpoints now expose an inline structured diff summary for changed case fields, findings, milestones, attachment references and evidence membership.

### Query Library workflow
- Added multi-select Query Library controls for bulk move, favorite/unfavorite, export and delete.
- Applying a reusable query now records local use count/last-used metadata and query cards expose usage recency; queries can be duplicated without carrying usage history.

### Quality
- Added a UI-foundation static regression test covering the new wiring and kept the dependency-free CI, HTTP smoke and CodeQL gates intact.

## 2.4.0 — 2026-09-13

### Cross-dataset baseline comparison
- Added `baseline-manager.js` and aggregate-only `.sdbaseline` export/import. Baselines contain service metrics, explicit parent-span dependency metrics and grouped trace-set summaries; they never embed raw log entries.
- Added Baseline Compare workspace with service entry/error/p95 deltas, dependency call/error/p95 deltas and navigable service filters.
- Added `trace-regression.js` to compare grouped service-set traces with deterministic measured p95/error-rate thresholds. Labels are descriptive and do not claim root cause or statistical significance.
- Baseline state can survive `.sdsession`/eligible recovery snapshots so a baseline may be compared after loading a different local dataset.

### Case checkpoints
- Added bounded `case-checkpoints.js` snapshots for investigation waypoints. Checkpoints keep normalized case state and evidence IDs while intentionally trimming copied history and never duplicating raw logs.
- Added create/restore/remove controls inside Case Workspace plus `.sdsession`/recovery persistence.

### Local project + filesystem foundation
- Added metadata-only `project-manager.js` with local project name/description, active project, last saved workspace reference and baseline label plus explicit JSON import/export.
- Project records stay in browser storage and never contain imported log bytes or attachment contents.
- Extended `storage-adapter.js` with guarded local text reads and native-open capability support in addition to existing save/download fallback.

### Quality
- Added baseline/trace regression, case-checkpoint and project-manager smoke tests and expanded workspace round-trip coverage for v2.4 state.
- Full prior parser/query/worker/workspace/recovery/search/OTLP/case/service/trace regression suite remains green.

## 2.3.0 — 2026-09-13

### Dependency period comparison
- Added `service-trends.js` for descriptive before/after comparison of explicit parent-span service edges across two adjacent timestamp windows.
- Compares observed call volume, errors, error rate and p95 duration only when the relevant imported evidence exists.
- Classifies edges as new, disappeared, rising, falling, degrading, improving or stable without predicting future behavior or inventing dependencies.
- Added a dedicated Dependency Trends workspace, filter-back navigation and Command Palette action.

### Trace outlier ranking
- Added `trace-outliers.js` with robust local ranking based on measured trace duration deviation, explicit errors and service breadth.
- Rankings include human-readable reasons and never claim automatic root cause, regression or anomaly-model inference.
- Added a Trace Outliers workspace with direct navigation back into the canonical `trace:` query/inspector workflow.

### Unified case timeline
- Added `case-timeline.js` to merge timestamped Investigation evidence, Case milestones and Case Activity History into one deterministic chronological view.
- Timeline entries route back to the pinned evidence/log where a local evidence reference exists.
- Existing separate Evidence Timeline and Case Activity History remain available for focused views.

### Query Library + local file/storage foundation
- Query Library now supports local text search, folder filtering, per-query folder movement, inline folder rename and move-to-General management without browser prompt dialogs.
- Added `storage-adapter.js` as a bounded local export/file-capability layer: File System Access save picker when available, browser-download fallback otherwise, and metadata-only local file references.
- Query Library and Case exports can use the shared local storage adapter while preserving the no-backend/no-upload model.

### Product / quality
- Added dedicated service-trend, trace-outlier, case-timeline and storage-adapter smoke tests and extended Query Library tests for search/folder operations.
- Hardened dependency-trend timestamp scans for very large datasets by avoiding giant spread arrays.
- Full parser/query/worker/workspace/recovery/search/OTLP/exception/investigation/service/trace/static-CSP regression suite remains green.

## 2.2.0 — 2026-09-13

### Investigation + comparison workflow
- Added Service Dependency Heatmap over explicit parent-span edges bucketed by real timestamps.
- Added two-trace A/B comparison across services, spans, errors, events, observed duration and parent-link coverage.
- Query Library v2 added local folders/favorites with v1 migration and explicit JSON import/export.
- Case Workspace v3 added investigation milestones plus metadata-only local attachment references; attachment bytes are never embedded or uploaded.
- Investigation/`.sdbundle` imports use deduplicated evidence merge and remap imported case evidence links where possible.

### Verification
- Added heatmap, trace-compare, Query Library migration/folder and Case Workspace v3 smoke coverage while preserving the complete prior regression suite.

## 2.1.0 — 2026-09-13

### Case activity history
- Upgraded local Case Workspace schema to v2 while preserving v1 `.sdcase` import compatibility.
- Added bounded local activity history for discrete case status/severity changes, finding add/update/remove actions and investigation evidence lifecycle events.
- Activity history survives `.sdcase`, `.sdsession` and eligible IndexedDB recovery because it is part of the normalized Case Workspace payload.
- Case Markdown exports can include the chronological activity history; this remains a local debugging audit trail rather than a forensic chain-of-custody claim.

### Service matrix + Trace Explorer
- Added `service-matrix.js` with service-to-service call/error/latency aggregation derived only from explicit child→parent span relationships.
- Added median/p95/max duration only when the child span provides explicit duration metadata; untimed edges remain visibly untimed.
- Added `trace-explorer.js` for dataset-level trace inventory: services, spans, errors, span events, observed trace duration and parent-link coverage.
- Added navigable Service Matrix and Trace Explorer dialogs that route back into normal SignalDock service/trace inspection filters.

### Query library
- Added `query-library.js` with local reusable named queries, descriptions, tags, structured filters and JSON import/export.
- Query Library remains local browser state unless explicitly exported; existing Saved Views remain supported as lightweight shortcuts.
- Added Command Palette actions for Query Library, Service Matrix and Trace Explorer.

### Product / quality
- Added dedicated service-matrix, trace-explorer and query-library smoke tests plus Case Workspace v1→v2 migration/activity coverage.
- Updated landing page, README and brand guidance for the new local investigation/trace workflows.
- Full parser/query/worker/workspace/recovery/search/OTLP/exception/investigation/static-CSP regression suite remains green.

## 2.0.0 — 2026-09-13

### Case + evidence workspace
- Added `case-workspace.js` with local case status/severity, hypothesis, impact, next steps and bounded evidence-linked findings.
- Case findings support open/confirmed/dismissed state, tags and links to pinned Investigation evidence.
- Added case JSON import/export and an enriched local Markdown report that can include clearly separated observed-dataset context.
- Evidence Bundle schema v2 can carry Case Workspace data while v1 bundle import remains supported.
- Case + Investigation state survives `.sdsession` and eligible IndexedDB recovery round-trips.

### Observed health + exception trends
- Added `service-health.js` with per-service observed entry/error/warning counts, recurring exception groups, trace-duration median/p95, source count and recent-vs-previous error deltas.
- Added the Observed Health workspace with service filters and explicit language that statuses summarize imported evidence rather than uptime/SLO/live health.
- Added `exception-trends.js` to compare adjacent local timestamp windows and classify recurring exception fingerprints as spiking, rising, stable or falling.
- Exception trend rows remain tied to deterministic fingerprints and normal SignalDock filters; no predictive/ML anomaly claims are made.

### Disk-backed local query index
- Replaced the v1.9 sequential token-segment cache with a v3 **bucketed** IndexedDB index.
- 3-gram postings are stored across deterministic local buckets while structured exact-match maps remain in the manifest.
- Cold-start workers can restore manifest metadata and load only the bucket(s) needed by the current semantically safe query instead of rehydrating the full token map into RAM.
- Every disk-indexed candidate still passes through the canonical query engine; regex/exclusions/date bounds/unsupported expressions fall back to linear filtering.
- Added bucket integrity/fingerprint checks, bounded in-memory bucket LRU, orphan cleanup and migration cleanup for older search-cache databases.

### Trace / OTLP quality
- Added `trace-insights.js` with parent-link coverage, root/orphan span counts, error/timed spans, span-event count, instrumentation-scope count and resource-set count.
- Added a Trace Quality card before interpreting waterfall/flame/critical-chain output.
- Preserved existing honesty rules: missing parent spans and missing durations are reported instead of fabricated.

### Product / quality
- Updated Command Palette with Observed Health and case-report actions.
- Updated the static product landing page and v2 documentation to reflect only implemented capabilities.
- Added dedicated case-workspace, exception-trend, service-health and trace-insight smoke tests plus bucketed search-cache/worker restore coverage.
- Full parser/query/worker/workspace/recovery/service-map/OTLP/Investigation/static-CSP regression suite remains green.

## 1.9.0 — 2026-09-13

### Recurring exception analysis
- Added `exception-groups.js` with deterministic local fingerprints for recurring errors/failures.
- Normalizes common dynamic values such as timestamps, UUIDs, long hex IDs, IP addresses, file paths, quoted values and numbers before grouping.
- Added a dedicated Exceptions workspace with occurrence/severity/service/source/time-range summaries, sample opening and sample pinning.
- Opening Exceptions while an `exception:` / `fingerprint:` query is active focuses the matching group while preserving an explicit “Show all groups” escape hatch.
- Added `exception:` / `fingerprint:` and `has:exception` smart-query support plus exact exception candidate indexing in the worker search index.

### Investigation v2 + evidence bundles
- Upgraded Investigation storage to schema v2 while preserving import compatibility with v1 files.
- New evidence items keep bounded local raw/correlation/trace/dimension snapshots and exception fingerprints where applicable.
- Added a compact local evidence timeline.
- Added self-contained `.sdbundle` export/import alongside the existing JSON and Markdown handoff formats.
- Extended workspace/recovery tests so Investigation v2 snapshots survive session round-trips.

### Segmented local search cache
- Replaced the single monolithic cached index record with a v2 manifest plus bounded token-map segments.
- Level/service/source/environment/namespace/exception/correlation maps remain explicit structured records in the cache manifest.
- Worker restore validates dataset fingerprint, segment count/order and entry count before using the cache. Missing/invalid segments fall back to a normal rebuild.
- Diagnostics now report local cache segment count.
- Successful v2 cache writes and explicit cache clearing also clean up the obsolete v1 IndexedDB cache where the browser supports database deletion.

### OpenTelemetry context
- OTLP flattening now preserves resource schema URL plus instrumentation scope name/version/schema URL.
- Trace metadata retains OTLP resource attributes and span attributes.
- Added a dedicated Resource & Scope card in the Trace inspector without changing span-event/flame-chart honesty rules.

### Verification
- Added exception-group and OTLP-context smoke tests.
- Extended smart-query/search-index tests for exception fingerprints and Investigation/workspace tests for evidence snapshots.
- Full parser/query/worker/workspace/recovery/service-map/performance/static/CSP regression suite remains green.

## 1.8.0 — 2026-09-12

### Investigation workflow
- Added a local Investigation notebook for pinning selected log entries as evidence.
- Added bounded per-evidence notes and tags, duplicate-entry protection, evidence reopen/remove actions and local evidence counts.
- Added explicit JSON and Markdown investigation export plus JSON import.
- Investigation state is embedded in `.sdsession` workspaces and eligible IndexedDB recovery snapshots.

### OpenTelemetry trace events
- Added bounded extraction of OpenTelemetry-style span events from `events`, `span.events`, `otel.events` and `otel.span.events`.
- Added direct flattening of standard OTLP JSON exports (`resourceSpans → scopeSpans → spans`) into SignalDock trace entries with resource service/environment/namespace metadata.
- Normalizes event timestamps plus common map/list attribute representations without converting events into synthetic spans.
- Added a dedicated Span Events section in the Trace inspector; event rows navigate back to the owning log/span.
- Updated the demo NDJSON dataset with real span-event examples and added `sample/otel-export.json`.
- Hardened duration-unit handling so explicit `duration_ms` values remain milliseconds while `event.duration` / `duration_ns` fields are converted from nanoseconds.

### Persistent large-dataset search cache
- Added an optional single-dataset IndexedDB cache for the bounded worker search index.
- Dataset fingerprints are computed locally and mismatches always trigger a normal index rebuild.
- Search-cache failures are best-effort only and never block loading/filtering.
- Added Settings diagnostics for cache restore/eligibility plus an explicit Clear search cache action.
- Cache usage preserves the existing final query-engine verification and linear fallback semantics.

### Quality
- Added standalone investigation, span-event and search-cache smoke tests plus a worker cache-hit integration test.
- Extended workspace regression coverage so span events and investigation state survive session round-trips.
- Static/CSP audit remains clean with no inline code, CDN dependencies, runtime network primitives or legacy branding.

## 1.7.0 — 2026-09-12

### Search and large datasets
- Added a bounded worker-side local 3-gram candidate index for large datasets.
- Indexed filtering narrows candidates only for semantically safe substring/exact-field constraints, then runs the normal query engine as the final authority.
- Regex, exclusions, ambiguous substring filters, date bounds and unsupported operators automatically fall back to linear scanning.
- Added index diagnostics for index-key count, build time, candidate count and indexed/linear mode.
- Added hard unique-token and posting-count safety caps; incomplete/truncated indexes are never used.
- Added `virtual-viewport.js` and compressed logical scroll scaling so Windowed mode can navigate million-row result sets without requiring tens of millions of CSS pixels.
- Added adaptive overscan based on scroll velocity and cached CSSOM spacer rules to reduce repeated stylesheet scans.

### Trace analysis
- Added `trace-flame.js` and a local span flame view above the detailed waterfall.
- Flame bars require explicit span id, timestamp and non-null duration metadata.
- Duration-less events remain visible in the trace list but are excluded from the flame chart.
- Flame bars are keyboard/inspector-compatible through the existing trace-entry selection path.

### Parser architecture
- Added `parser-plugins.js`, a trusted bundled/local parser registry.
- Added a bundled CEF (Common Event Format) parser plugin for security-event logs.
- Parser plugin failures are isolated and automatically fall through to SignalDock's normal parser chain.
- No dynamic remote/user-script loading was added; CSP and offline-first constraints remain intact.

### Verification
- Added dedicated smoke tests for the search index, million-row virtual viewport, trace flame layout and parser plugin registry/CEF parser.
- Existing parser, worker, workspace, persistence, service-map, command-palette, performance and static/CSP regression suites continue to run.

## 1.6.0 — 2026-09-12

### Trace intelligence
- Added a local critical-chain analyzer over explicit span / parent-span relationships.
- Reports trace wall-clock latency, chain length, parent-link coverage and the longest measured span on the selected chain.
- Partial traces are explicitly labeled when parent spans are missing instead of presenting an inferred result as complete.
- Critical-chain rows are highlighted inside the existing Trace waterfall.

### Large-result navigation
- Added an optional Windowed table mode for desktop-sized, non-wrapped log views.
- Windowed mode keeps only the visible result window plus overscan rows in the DOM while preserving the full scroll range.
- Paged mode remains the default and automatic fallback for wrapped messages and narrow/mobile layouts.
- Table diagnostics now report paged vs windowed mode and current DOM-row footprint.

### Command palette
- Added Ctrl/Cmd+K command palette with fuzzy command filtering.
- Added keyboard access to import, search, service map, workspace save, export, saved views, filter reset, table mode, Live Tail, settings and workspace clearing.

### Parser profile library
- Added reusable named custom parser profiles stored locally in the browser.
- Added local profile create/update/delete plus JSON export/import.
- Loading a saved parser profile updates the existing bounded custom-regex parser path rather than bypassing parser safety validation.

### Topology dimensions
- Added extraction of environment and namespace metadata from structured and plain-text logs.
- Added `env:` / `environment:` and `namespace:` / `ns:` smart-query operators.
- Service Map can now group by service, environment, namespace, environment + service or namespace + service.
- Grouped map clicks translate back into normal local smart-query filters.

### Quality
- Hardened modal transitions so Command Palette, Settings and Service Map cannot leave competing modal dialogs open during rapid keyboard-driven navigation.
- Added standalone critical-chain, command-palette and parser-profile smoke tests.
- Extended parser and service-map tests for environment/namespace dimensions and grouped explicit dependencies.
- Preserved local-only assets, no telemetry, no analytics, no backend, no CDN and `connect-src 'none'`.

## 1.5.0 — 2026-09-12

### Service topology
- Added a dedicated Service Map workspace view derived from explicit trace/span parent relationships.
- Added per-service entry, error, warning, trace and aggregate-duration metrics.
- Added directed cross-service edge counts and error-aware edge styling.
- Service nodes and summary cards can be used to create normal `service:` filters.
- The topology intentionally avoids inferred dependencies when no parent-span relationship is present.

### Recovery architecture
- Migrated browser recovery from one monolithic IndexedDB blob to a manifest plus 4 MB data chunks.
- Increased guarded automatic recovery limits to 500,000 entries and approximately 350 MB.
- Kept backward-compatible loading of legacy single-record recovery snapshots.
- Added corruption detection when a chunk referenced by the recovery manifest is missing.
- Clearing recovery now removes the manifest, view overlay, legacy record and all known data chunks.

### Performance diagnostics
- Added a bounded local performance profiler for parser, filter, table-render, trace, correlation and service-map timings.
- Added p95/last timing diagnostics, worker state, long-task counters and JS heap visibility where supported.
- Added a Copy diagnostics action that excludes log payload/message content.

### Quality
- Added standalone service-map and performance-profiler smoke tests.
- Expanded IndexedDB integration testing to force a real multi-chunk snapshot round trip.
- Added a local network/service-map icon and responsive topology UI without external chart libraries.
- Preserved local-only assets, `connect-src 'none'`, no telemetry, no analytics, no backend and no CDN dependency.

## 1.4.0 — 2026-09-12

### Local recovery
- Added optional IndexedDB crash/restart recovery for eligible local workspaces.
- Added restore, dismiss and explicit clear-recovery controls; recovery is never restored silently.
- Split recovery into a larger dataset snapshot plus a lightweight latest-view overlay so query/filter/selection changes do not require reserializing the entire dataset.
- Added 200,000-entry and 180 MB estimated/actual snapshot safety limits.
- Added recovery eligibility/estimated-size status in Settings.
- Clearing the active workspace also clears its browser recovery snapshot.

### Custom parser profiles
- Added a Custom Regex parser profile using named capture groups such as `time`, `level`, `service` and `message`.
- Added bounded 500-character regex configuration and flag sanitization.
- Applied custom profiles to standard imports, ZIP members and Live Tail parsing.
- Custom parser configuration is preserved in portable `.sdsession` workspaces and local recovery.

### Trace and correlation UX
- Added per-identifier correlation match counts so mixed trace/request/job/session/user clusters are easier to understand.
- Added per-service trace summaries with entry counts, error counts and aggregate span duration.
- Trace service summaries can be clicked to create a service query filter.

### Large-page rendering
- Added browser-native `content-visibility`, layout/paint containment and intrinsic row sizing to reduce rendering work for offscreen rows.
- Kept progressive animation-frame batching for large 500/1000-row pages.

### Quality
- Added custom-regex parser smoke tests.
- Added recovery eligibility/size tests plus an IndexedDB-style integration test covering dataset save/load, view overlay and clear.
- Re-ran parser, worker, workspace, static/CSP and large streaming regression tests.
- Preserved the no-CDN, no-telemetry, no-backend and `connect-src 'none'` runtime model.

## 1.3.0 — 2026-09-12

### Trace analysis
- Added a dedicated Trace inspector tab.
- Added local trace/span grouping and a waterfall visualization with SVG geometry.
- Added parent-span hierarchy support and capped indentation for nested spans.
- Added extraction of span/operation names and duration metadata.
- Added OpenTelemetry `event.duration` nanosecond-to-millisecond normalization.
- Added worker-backed trace lookup for large datasets.
- Added service/error summary metadata for the selected trace.

### Workspace sessions
- Added portable `.sdsession` workspace files.
- Added a Save Workspace control and Ctrl/Cmd + Shift + S shortcut.
- Restores normalized entries, query/filter/sort state, page size, selected entry, inspector tab and workspace settings.
- Added workspace schema validation, a 500 MB file limit and a 2,000,000-entry restore guard.
- Moved serialization/normalization into testable `workspace.js`.

### Parser profiles
- Added fixed parser profiles for NLog/text, JSON/NDJSON, Apache/Nginx access logs, syslog and logfmt.
- Kept Auto Detect as the default.
- Applied the selected parser profile to normal imports and Live Tail.
- Preserved parser profile selection in workspace sessions.

### Quality
- Added trace metadata and parser-profile smoke tests.
- Extended worker tests to cover trace lookup.
- Added workspace round-trip and invalid-schema tests.
- Kept all runtime assets local with no CDN, analytics, telemetry or backend.

## 1.2.0 — 2026-09-12

### Large-dataset architecture
- Reworked filtered results to store source indexes instead of a second array of log-entry references.
- Removed repeated full-dataset severity/source counting from ordinary filter changes by caching summary metadata during index rebuilds.
- Reworked the activity timeline to iterate result indexes directly rather than allocating a duplicate timestamped-entry list.
- Added progressive animation-frame row rendering for 500/1000-row result pages.
- Increased page-size options to 50 / 100 / 250 / 500 / 1000.
- Reduced plain-text search-index duplication and bounded raw structured text added to each entry's searchable text.
- Large exports above 50,000 rows now use chunked NDJSON instead of pretty-printed array JSON.

### Query engine
- Added `any:` OR matching.
- Added correlation operators: `trace:`, `span:`, `request:`, `correlation:`, `job:`, `session:` and `user:`.
- Added guarded regular-expression queries with `re:/.../i` and field regex forms such as `message~:/.../i`.
- Added regex pattern-length, flag and nested-quantifier guards before execution.
- `has:` now recognizes extracted correlation fields.

### Correlation analysis
- Parser now extracts common trace, span, request, correlation, job, session and user identifiers from structured JSON/logfmt and plain-text logs.
- Added a Correlated inspector tab listing detected identifiers and related events.
- Added one-click conversion of a detected identifier into a smart-query filter.
- Added worker-backed correlation search for large datasets.
- Correlation results are searched outward from the selected event when its global position is known.

### Live Tail
- Added experimental local Live Tail using the File System Access API in supported Chromium-based browsers.
- Live Tail follows appended content from an explicitly selected local LOG/TXT/JSONL/NDJSON file without opening a network connection.
- Added stop/restart handling and a visible live state in navigation.
- File truncation is detected and the follow offset resets safely.

### Inspector and context
- Replaced full-array scans used for nearby source/service context with bounded searches around the selected entry.
- Added detected correlation IDs to normalized Details and JSON inspector output.

### Quality
- Added smoke tests for structured and plain-text correlation extraction, correlation matching, regex queries, invalid-regex rejection and expensive nested-quantifier rejection.
- Reverified JS syntax, DOM IDs, local asset references, no inline CSS/JS, no external runtime resources and no network primitives.

## 1.1.0 — 2026-09-12

### Performance
- Added streaming parsing for large line-oriented LOG, TXT, JSONL and NDJSON files.
- Added an optional background Web Worker filter engine for large datasets when served over HTTP(S).
- Added automatic main-thread fallback for direct `file://` usage and unsupported worker environments.
- Added request/version protection so stale worker results cannot replace newer filter results.

### Search and analysis
- Expanded smart queries with comma-separated levels, quoted values, negative terms, message filters, `has:` conditions, `after:`/`since:` and `before:` timestamp operators.
- Added Last 15 minutes, 1 hour, 6 hours, 24 hours and 7 days filters relative to the newest timestamp in the dataset.
- Added Original order, Newest first and Oldest first sorting.
- Added an activity timeline for the current result set with warning/error emphasis.
- Saved views now preserve time range and sort order.

### Parser
- Added nested structured field detection such as `log.level`, `service.name`, `resource.service.name`, `@timestamp`, `event.created`, `error.message` and `exception.message`.
- Added Docker log parsing.
- Added Apache/Nginx common access-log parsing with severity inference from HTTP status.
- Added syslog parsing and lightweight severity inference.
- Added logfmt parsing.
- Added multiline stack-trace grouping.
- Added a 750 MB safety limit for plain files.

### Inspector and UX
- Added Context inspector tab with nearby entries from the same source and related entries from the same service.
- Added direct filter-by-service action.
- Flattened nested structured fields for a more useful Details view.
- Added background-filter preference and smart-query syntax help to Settings.
- Reworked marketing-site feature copy to reflect the v1.1 functionality.
- Reformatted the marketing CSS into readable source rather than a single minified line.

### Quality
- Added smoke-test coverage for structured JSON, text formats, multiline logs, query matching, streaming parsing and ZIP parsing.
- Verified all app JavaScript syntax, static element references and local asset references.

## 1.0.0 — 2026-09-12

### Rebrand
- Established the SignalDock product name and identity.
- Replaced frog branding with a geometric SignalDock mark and cyan/emerald identity.
- Rewrote product positioning around local-first private observability.
- Standardized SignalDock code-facing namespaces throughout the runtime.

### Redesign
- Replaced the previous single-column viewer with a full desktop-style workspace.
- Added navigation sidebar, source navigation, file tabs, summary metrics and right-side log inspector.
- Added polished responsive behavior for desktop, tablet and mobile.
- Added compact density and message wrapping preferences.

### Functionality
- Added smart query syntax for level, source and service filters.
- Added saved views using local browser storage.
- Added pagination and configurable page size.
- Added Details, Raw and normalized JSON inspector views.
- Added filtered JSON export.
- Added source/service extraction improvements for structured logs.
- Kept all processing local and removed all external runtime dependencies.
