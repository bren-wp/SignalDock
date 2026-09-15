# SignalDock desktop architecture

SignalDock is currently a local browser application. This document defines the boundary needed for a future native desktop shell without claiming that Windows, macOS or Linux installers already exist.

## Design goals

- Keep parsing, query, trace, service, exception and investigation logic shell-agnostic.
- Keep user log content local and preserve the no-telemetry/no-cloud-ingestion model.
- Centralize filesystem, persistence, recent-file and lifecycle behavior behind adapters.
- Preserve browser mode as a supported deployment rather than turning it into an Electron-only application.
- Make permission boundaries explicit and testable.

## Recommended boundary

UI and domain modules should depend on small capabilities instead of browser globals. `storage-adapter.js` is the first browser implementation of this boundary and should evolve into interfaces for text/binary open and save, directory access, metadata-only recent-file references, persistence, workspace lifecycle and application lifecycle.

The browser adapter may use File System Access APIs, downloads, localStorage and IndexedDB. A future desktop adapter may implement the same operations with native filesystem APIs. Direct `showOpenFilePicker`, `showSaveFilePicker`, IndexedDB or shell-specific calls should not be spread through feature modules.

## Shell recommendation

**Tauri 2 is the preferred first native-shell candidate** for SignalDock. The application is already static HTML/CSS/JavaScript, so Tauri can host the existing frontend while exposing narrowly scoped filesystem commands. Its smaller runtime footprint and explicit capability model are a good fit for a privacy-first local tool.

Tradeoffs:

- Tauri introduces Rust tooling and platform-specific build/signing work.
- Native filesystem permissions and path handling require dedicated integration tests on every supported OS.
- WebView behavior differs slightly between Windows, macOS and Linux and must be tested rather than assumed.

Electron remains a reasonable fallback if SignalDock later requires Node-specific libraries, a uniform bundled Chromium runtime or ecosystem integrations that outweigh its larger distribution and memory footprint. No framework should be introduced until the browser/desktop adapter contract is stable.

## Proposed adapter contracts

`storage` — open/save files, save streams, directory selection, safe filename handling and metadata-only file references.

`persistence` — recovery snapshots, search-cache/index storage, project metadata and migrations.

`workspace` — open/save `.sdsession`, `.sdbaseline`, `.sdbundle`, case and project artifacts through storage capabilities rather than direct browser APIs.

`recent` — bounded metadata-only recent projects, datasets and workspaces. Raw logs must not be copied into recent-item metadata.

`lifecycle` — startup, shutdown, unsaved-state hooks and future native window integration. Browser mode can provide no-op implementations where appropriate.

## Security requirements

A native shell must preserve SignalDock's local-first trust model. Filesystem access should be capability-scoped, network access should remain disabled unless a future feature is explicitly designed and documented, imported data must continue to be rendered safely, and desktop IPC payloads must be validated like external input.

Do not expose unrestricted shell execution or broad filesystem roots to frontend JavaScript. Desktop commands should use narrow parameter schemas, bounded reads/writes and canonicalized paths.

## Migration sequence

1. Finish consolidating browser file operations in `storage-adapter.js`.
2. Extract persistence operations behind an adapter while preserving IndexedDB compatibility and migrations.
3. Move recent workspace/dataset/project metadata into the shared project layer.
4. Add adapter conformance tests that can run without a native shell.
5. Prototype Tauri in a separate packaging directory while reusing the existing application files.
6. Add real Windows/macOS/Linux integration, signing and installer tests before advertising native desktop support.

Until those steps are complete, product copy must continue to describe SignalDock as the local browser application and desktop-ready architecture, not as a shipped native desktop product.


## Current implementation status

SignalDock v2.7 adds `desktop-bridge.js` as the application-facing capability facade. Browser mode delegates to `storage-adapter.js`; a future native shell may inject only the narrow methods documented by the bridge. Project Reopen now exercises that boundary for pick, save, reopen, permission recovery and capability cleanup.

This does **not** mean native installers are shipped. Tauri/Electron packaging, signing, updater behavior and OS integration remain future packaging work. The frontend must not receive a generic shell command or unrestricted path API.
