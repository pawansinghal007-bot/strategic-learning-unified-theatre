Here’s a concrete patch you can adapt into your repo plus an engineering checklist you can use to close the sprint 15.5 acceptance bullet.

***

## 1. Assumptions and intent

To keep this drop‑in and self‑contained, I’m assuming:

- You have an Electron app with a main process file like `src/main.ts` or `main.js`.
- You’re fine using `electron-builder` + `electron-updater` with a generic HTTP(S) update server (S3, GCS, nginx, etc.). [stackoverflow](https://stackoverflow.com/questions/64069124/electron-builder-does-not-create-latest-yml-for-auto-updates-generic-provider)
- You want:
  - Signed Windows installer (NSIS) and a Linux AppImage.
  - Stable / beta channels.
  - Auto‑update with integrity checks (hash + signature) and a simple health‑check based rollback mechanism. [electron](https://www.electron.build/tutorials/release-using-channels.html)

You’ll need to fill in real certificate details and real update URLs.

***

## 2. Patch: packaging, signing, auto‑update and rollback

### 2.1 Dependencies

Add these to `package.json`:

```jsonc
{
  "devDependencies": {
    "electron-builder": "^24.0.0"
  },
  "dependencies": {
    "electron-updater": "^6.0.0"
  }
}
```

`electron-builder` provides cross‑platform installers and generates update metadata files like `latest.yml` with SHA‑512 hashes used by `electron-updater` to validate downloads before applying updates. `electron-updater` wires into Electron’s `autoUpdater` API to check, download and install updates. [npmjs](https://www.npmjs.com/package/electron-updater-yaml)

***

### 2.2 package.json: build, signing and channels

Here is a concrete `build` section and scripts you can merge into your `package.json` (adjust IDs, names, paths, and URLs):

```diff
--- a/package.json
+++ b/package.json
@@ -1,6 +1,55 @@
 {
   "name": "your-app",
-  "version": "1.0.0",
+  "version": "1.0.0",
+  "main": "dist/main.js",
   ...
+  "scripts": {
+    "dist:win": "electron-builder --win nsis",
+    "dist:linux": "electron-builder --linux AppImage",
+    "dist:all": "electron-builder -mwl",
+    "dist": "npm run dist:all"
+  },
+  "build": {
+    "appId": "com.example.yourapp",
+    "productName": "YourApp",
+    "directories": {
+      "output": "release"
+    },
+    "files": [
+      "dist/**/*",
+      "node_modules/**/*",
+      "package.json"
+    ],
+    "publish": [
+      {
+        "provider": "generic",
+        "url": "https://updates.example.com/yourapp"
+      }
+    ],
+    "generateUpdatesFilesForAllChannels": true,
+    "win": {
+      "target": [
+        "nsis"
+      ],
+      "publisherName": [
+        "Your Company, Inc."
+      ],
+      "artifactName": "${productName}-Setup-${version}.${ext}"
+    },
+    "linux": {
+      "target": [
+        "AppImage",
+        "deb"
+      ],
+      "category": "Utility",
+      "artifactName": "${productName}-${version}-${os}-${arch}.${ext}"
+    }
+  }
 }
```

Key points:

- `generateUpdatesFilesForAllChannels: true` makes `electron-builder` emit channel‑specific metadata (e.g. `latest.yml`, `beta.yml`), enabling `latest`/`beta` channels and downgrades. [electron](https://www.electron.build/tutorials/release-using-channels.html)
- The generic `publish` provider allows you to host signed installers and `*.yml` metadata on any HTTPS server. [git.spacemit](https://git.spacemit.com/electron/electron-builder/-/blob/5ab2bee1e1db77967c65d56443f0dc79de5071da/docs/auto-update.md)
- `publisherName` must match your Windows code‑signing certificate subject so Windows can show a verified publisher and `electron-updater` can enforce signature consistency. [github](https://github.com/electron-userland/electron-builder/issues/6499)

For signing:

- On Windows, `electron-builder` will pick up signing credentials from env vars such as `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` or from the local certificate store, and sign the NSIS installer and EXE so the installer shows your publisher and updates can verify signatures. [codesigningstore](https://codesigningstore.com/how-to-sign-a-windows-app-in-electron-builder)
- For Linux, you’ll at least ship SHA‑256 checksum files (and optionally GPG signatures) for each artifact; enterprise tooling often treats those as the integrity + authenticity mechanism for Unix installers. [blog.doyensec](https://blog.doyensec.com/2026/02/16/electron-safe-updater.html)

***

### 2.3 Config file: stable / beta channel selection

Add a config file that an admin or your deployment template can manage, e.g. `config/update.json`:

```json
{
  "channel": "latest",       // "latest" for stable, "beta" for pre‑release
  "healthCheckTimeoutMs": 30000
}
```

The channel name maps directly to the update channel `electron-updater` follows (e.g., version `1.3.2-beta.1` on the `beta` channel). [stackoverflow](https://stackoverflow.com/questions/59115441/auto-update-electron-app-to-a-specific-non-latest-version)

***

### 2.4 main process: auto‑update, channels, integrity and rollback

Assume your main file is `src/main.ts` or `src/main.js`. Below is a concrete, minimal wiring; adapt paths to your structure.

```ts
// src/main.ts
import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'fs';
import * as path from 'path';

interface UpdateConfig {
  channel: string;
  healthCheckTimeoutMs: number;
}

interface HealthState {
  lastKnownGoodVersion?: string;
  pendingVersion?: string;
}

const userDataDir = app.getPath('userData');
const healthStatePath = path.join(userDataDir, 'health-state.json');
const updateConfigPath = path.join(process.resourcesPath, 'config', 'update.json');

function readUpdateConfig(): UpdateConfig {
  try {
    const raw = fs.readFileSync(updateConfigPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      channel: parsed.channel || 'latest',
      healthCheckTimeoutMs: parsed.healthCheckTimeoutMs || 30000
    };
  } catch {
    return { channel: 'latest', healthCheckTimeoutMs: 30000 };
  }
}

function readHealthState(): HealthState {
  try {
    return JSON.parse(fs.readFileSync(healthStatePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeHealthState(state: HealthState) {
  fs.writeFileSync(healthStatePath, JSON.stringify(state, null, 2));
}

function markPendingVersion(current: string, next: string) {
  const state = readHealthState();
  state.lastKnownGoodVersion = state.lastKnownGoodVersion || current;
  state.pendingVersion = next;
  writeHealthState(state);
}

function clearPendingVersionAsGood(current: string) {
  const state = readHealthState();
  state.lastKnownGoodVersion = current;
  state.pendingVersion = undefined;
  writeHealthState(state);
}

function markRollbackRequested() {
  const state = readHealthState();
  state.pendingVersion = undefined;
  writeHealthState(state);
}

function getCurrentVersion(): string {
  return app.getVersion();
}

// Replace with your real health checks (DB connectivity, API, etc.)
async function runHealthChecks(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    // Dummy health check – always passes
    // Insert real checks here and call resolve(true/false) accordingly.
    clearTimeout(timer);
    resolve(true);
  });
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true
    }
  });

  // Load your UI
  mainWindow.loadURL('http://localhost:3000'); // or file://...
}

async function handleStartupHealth() {
  const config = readUpdateConfig();
  const currentVersion = getCurrentVersion();
  const state = readHealthState();

  if (state.pendingVersion === currentVersion) {
    const ok = await runHealthChecks(config.healthCheckTimeoutMs);
    if (ok) {
      clearPendingVersionAsGood(currentVersion);
    } else {
      // Mark for rollback. Admin / server side will point channel back to lastKnownGood.
      markRollbackRequested();
      dialog.showErrorBox(
        'Update failed health checks',
        'The newly installed version failed startup health checks. The application will be rolled back to the previous stable version.'
      );
      app.exit(1);
    }
  } else if (!state.lastKnownGoodVersion) {
    // First successful boot marks this version as good
    clearPendingVersionAsGood(currentVersion);
  }
}

function setupAutoUpdater() {
  const config = readUpdateConfig();
  autoUpdater.channel = config.channel; // "latest" / "beta" etc.[web:2][web:5]
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update:status', 'checking');
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info);
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update:not-available');
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update:error', err.message);
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    const currentVersion = getCurrentVersion();
    const nextVersion = info.version;
    markPendingVersion(currentVersion, nextVersion);

    const response = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['Install and restart', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `A new version (${nextVersion}) has been downloaded. Install now?`
    });

    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  // Check once at startup, then periodically (e.g., every 30 min)
  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 30 * 60 * 1000);
}

app.on('ready', async () => {
  createWindow();
  setupAutoUpdater();
  await handleStartupHealth();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

How this addresses requirements:

- **Installer verifies publisher**: Windows shows your publisher from the code‑signed NSIS installer and EXE, using the certificate configured for `electron-builder`. [codesigningstore](https://codesigningstore.com/how-to-sign-a-windows-app-in-electron-builder)
- **App verifies update integrity**: `electron-updater` validates that the downloaded installer’s SHA‑512 hash matches the one in `latest.yml` (or channel YML) before applying the update, and enforces signature verification if the app is signed. [electronjs](https://electronjs.org/docs/latest/tutorial/updates)
- **Stable / beta channels**: `autoUpdater.channel = config.channel` picks the channel (`latest` for stable, `beta` for pre‑release); `generateUpdatesFilesForAllChannels` produces metadata for each channel. [stackoverflow](https://stackoverflow.com/questions/59115441/auto-update-electron-app-to-a-specific-non-latest-version)
- **Safe auto‑update + rollback**:
  - Before installing, the app marks `pendingVersion` and preserves `lastKnownGoodVersion`.
  - On first startup of the new version, it runs health checks; if they fail, the app exits with an error and flags rollback.
  - Operationally, your update server / admin responds by re‑pointing the channel metadata (`latest.yml` / `beta.yml`) to the previous `lastKnownGoodVersion`, which `electron-updater` can then install, including downgrades when allowed. [blog.doyensec](https://blog.doyensec.com/2026/02/16/electron-safe-updater.html)

(If you want fully automatic rollback with no admin intervention, you can extend this pattern to point autoUpdater at a `rollback` channel when health fails.)

***

### 2.5 CI: reproducible tagged artifacts, checksums and signed metadata

Below is a concrete GitHub Actions workflow you can drop as `.github/workflows/release.yml`. Adapt for GitLab/other CI if needed.

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  build-and-publish:
    runs-on: windows-latest

    env:
      NODE_ENV: production
      # Windows code signing – fill these with your real values
      WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
      WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build installers (Windows + Linux)
        run: npm run dist

      - name: Generate checksums
        run: |
          cd release
          Get-ChildItem -File | ForEach-Object {
            $hash = (Get-FileHash $_.Name -Algorithm SHA256).Hash
            "$hash  $($_.Name)" | Out-File -Encoding ascii -Append SHA256SUMS
          }

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: installers-and-checksums
          path: release/**

      # Optional: publish to S3 / GCS / internal HTTP as your generic provider
      # - name: Sync to update server
      #   run: aws s3 sync release s3://your-bucket/yourapp/${{ github.ref_name }}/ --delete
```

What this gives you:

- **Reproducible CI artifact per tag**: workflow triggers on tags like `v1.0.0` and builds installers and metadata from that tag. [stackoverflow](https://stackoverflow.com/questions/64069124/electron-builder-does-not-create-latest-yml-for-auto-updates-generic-provider)
- **Versioned artifacts with checksums**: CI emits signed installers (via `electron-builder`) plus a `SHA256SUMS` file per release. You can GPG‑sign `SHA256SUMS` in a follow‑up step for Unix authenticity. [npmjs](https://www.npmjs.com/package/electron-updater-yaml)
- **Update metadata**: `electron-builder` generates `latest.yml` / channel YML files containing version, URL and SHA‑512 hashes that `electron-updater` uses for integrity checks and staged rollouts. [git.spacemit](https://git.spacemit.com/electron/electron-builder/-/blob/5ab2bee1e1db77967c65d56443f0dc79de5071da/docs/auto-update.md)

***

### 2.6 Enterprise release checklist doc (to ship in repo)

Create `docs/release-checklist-enterprise.md` with something like this:

```markdown
# YourApp Enterprise Release Checklist

This checklist describes how to safely roll out a new YourApp version to desktops using standard management tools (SCCM, Intune, JAMF, etc.).

## 1. Inputs

- Target version tag (e.g. `v1.0.0`).
- Download URL of release artifacts (from update server or artifact repository).
- SHA256SUMS file and, if used, GPG signature for SHA256SUMS.

## 2. Pre‑deployment validation

1. Verify checksums:

   - Download the installers and `SHA256SUMS`.
   - Run `sha256sum --check SHA256SUMS` (Linux/macOS) or the Windows equivalent.
   - Ensure all entries report `OK`.

2. Verify publisher / signature (Windows):

   - Right‑click installer `.exe` / `.msi` → **Properties** → **Digital Signatures**.
   - Ensure the signer name is `Your Company, Inc.` and the signature is valid.

3. Verify update channel:

   - Decide target channel:
     - `latest` for stable production rollout.
     - `beta` for pilot / pre‑release users.
   - Confirm that your deployment template sets the correct `config/update.json` `channel` value on each device.

## 3. Pilot deployment

1. Deploy the new installer to a small pilot group.
2. Confirm:
   - Installer runs without OS warnings beyond the standard “publisher” prompt.
   - App launches and basic workflows pass.
   - Auto‑update check succeeds (no “update error” in UI/logs).

## 4. Broad rollout

1. Deploy to the remaining target devices using your MDM/desktop management tool.
2. Confirm:
   - Devices pick up updates from the configured channel.
   - No unexpected rollbacks (health‑check failures) are reported.

## 5. Rollback procedure

If the new version causes issues:

1. Mark the release as “blocked” in your change log.
2. Re‑publish the previous known‑good version as the head of the appropriate channel on the update server (e.g. update `latest.yml` to point to `v0.9.x`).
3. Optionally, redeploy the previous installer using your desktop management tool.
4. Monitor that affected endpoints return to the previous version after the next update check.
```

This gives enterprise admins:

- A publisher/signature verification step.
- A checksum verification step.
- A clear pilot → broad rollout → rollback flow aligned with your update channels and health‑check‑driven rollback behaviour. [electronjs](https://electronjs.org/docs/latest/tutorial/updates)

***

## 3. Engineering acceptance checklist for Sprint 15.5

You can use this as the concrete internal checklist to close the sprint acceptance bullet:

### 3.1 Packaging and signing

- [ ] `electron-builder` is configured in `package.json` with `win` and `linux` targets (NSIS + AppImage/deb) and `directories.output` pointing to a deterministic `release` folder. [stackoverflow](https://stackoverflow.com/questions/64069124/electron-builder-does-not-create-latest-yml-for-auto-updates-generic-provider)
- [ ] Running `npm run dist` on a clean tag produces a Windows installer and at least one Unix installer.  
- [ ] Windows installer is code‑signed with a certificate whose subject matches `publisherName`, and Windows shows “Verified publisher: Your Company, Inc.” in properties. [github](https://github.com/electron-userland/electron-builder/issues/6499)
- [ ] Linux artifacts are accompanied by `SHA256SUMS` (and optionally GPG signatures) published alongside the installers for integrity / authenticity. [npmjs](https://www.npmjs.com/package/electron-updater-yaml)

### 3.2 Versioned artifacts with checksums

- [ ] CI workflow triggers on tags matching your sprint/version scheme (e.g. `v1.0.0`, `v1.0-sprint15.5`).  
- [ ] Each tagged build produces installers + `latest.yml`/channel YML + `SHA256SUMS` and uploads them to your update server or artifact store. [electron](https://www.electron.build/tutorials/release-using-channels.html)
- [ ] Checksums from `SHA256SUMS` match the published installers when recomputed on a separate machine.

### 3.3 Update channels and configuration

- [ ] `config/update.json` is included in the packaged app (e.g. under `resources/config/update.json`) and is templated by your deployment system.  
- [ ] `autoUpdater.channel` is set from `config.update.json` (`latest` for stable, `beta` for pre‑release); changing the config on a test machine switches which releases it receives. [stackoverflow](https://stackoverflow.com/questions/59115441/auto-update-electron-app-to-a-specific-non-latest-version)
- [ ] Beta machines receive both `beta` and `latest` releases, while stable machines only receive `latest`, as per standard electron‑builder channel semantics. [electron](https://www.electron.build/tutorials/release-using-channels.html)

### 3.4 Safe auto‑update + rollback

- [ ] On startup, the app reads `health-state.json` and `update.json` and runs `runHealthChecks` once when a new `pendingVersion` is detected.  
- [ ] When an update is downloaded, `pendingVersion` and `lastKnownGoodVersion` are written to `health-state.json` before `quitAndInstall` runs.  
- [ ] On successful first startup, the app clears `pendingVersion` and updates `lastKnownGoodVersion`.  
- [ ] When you simulate a failing health check (e.g. temporarily return `false` in `runHealthChecks`), the app:
  - Shows a clear error to the user/admin.
  - Exits with a non‑zero status so monitoring and admins can detect the failed rollout.
- [ ] Operational runbook / admin checklist documents that rollback is done by re‑pointing channel metadata (`latest.yml`/`beta.yml`) to `lastKnownGoodVersion` and redeploying if needed. [blog.doyensec](https://blog.doyensec.com/2026/02/16/electron-safe-updater.html)

### 3.5 Signed update metadata and integrity

- [ ] `latest.yml` / channel YML files are generated and published alongside installers, containing version, URL, and SHA‑512 hash of each artifact. [git.spacemit](https://git.spacemit.com/electron/electron-builder/-/blob/5ab2bee1e1db77967c65d56443f0dc79de5071da/docs/auto-update.md)
- [ ] The app successfully detects a corrupted installer (e.g. manually tampered file on the update server) and refuses to install, logging a hash mismatch / integrity error via `autoUpdater` events. [electronjs](https://electronjs.org/docs/latest/tutorial/updates)

### 3.6 Acceptance artefacts

- [ ] CI logs and artifacts for at least one tag (e.g. `v1.0.0`) are attached to the sprint evidence.  
- [ ] A test plan / run shows:
  - Fresh install via signed installer on Windows and Linux.
  - Upgrade from previous version to new version via auto‑update.
  - Simulated rollback via failing health checks and server‑side channel revert.  
- [ ] `docs/release-checklist-enterprise.md` is in the repo and referenced from your main `README` or internal deployment wiki, satisfying the “small release checklist” requirement for enterprise admins. [npmjs](https://www.npmjs.com/package/electron-updater-yaml)

If you share your actual repo layout (main file path, current build system), I can tighten this further into a literal unified diff against your existing files.