# Project Reopen

SignalDock v2.7 can associate recent dataset/workspace metadata with an explicit local filesystem capability. The capability is stored in the local handle registry or a future native bridge, never inside exported project JSON.

## User flow

1. Activate a project.
2. Use **Link & load files** to choose supported log datasets. SignalDock parses the files locally and stores reopen capability only for successfully loaded items.
3. Open project history and use **Reopen**. SignalDock checks/request read permission and reuses the existing local file; no cloud or backend is involved.
4. Use **Relink** when a metadata-only history item should be associated with a local file again.
5. Use **Forget link** to remove the saved capability while keeping history metadata and the actual file unchanged.

Workspace saves follow the same trust model. A workspace is added to project history only after a successful save. When the runtime returns a persistent handle, that history item can be reopened later.

## Portability and security

`.sdprojects` exports intentionally strip `handleRef`, handle kind and linked capability state. Duplicated projects also drop those capabilities so a copy does not silently inherit local filesystem access. Deleting project metadata removes its stored handle records but never deletes user files.

`src/platform/desktop-bridge.js` exposes only pick, save, reopen, status and forget operations. A future native shell must implement those operations with bounded payloads and must not expose arbitrary shell execution or unrestricted filesystem roots.
