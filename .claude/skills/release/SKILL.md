---
name: release
description: Cut a new Recreate release — bump the version in package.json, build the installer for the host OS (a macOS .dmg, or the Windows NSIS installers for arm64 and x64), and generate release notes. Use when the user wants to ship a new version, bump the version number, build/create an installer (.dmg or .exe), or generate release notes for a release.
---

# Release a new version of Recreate

This skill bumps the version, builds the installer **for the OS you're running on**, and writes release notes:

- **macOS** → a drag-to-install `.dmg` (Apple Silicon).
- **Windows** → the NSIS setup `.exe` installers for both arm64 and x64.

Installers are published as GitHub Releases on the public repo `ammarrik/recreate-app`, and the in-app auto-updater compares the published tag against the running version.

The desktop app is the repo root (package `recreate`); run all commands from the repo root.

Run the steps in order. Do NOT publish to GitHub unless the user explicitly asks — building artifacts and notes is the default; publishing is a separate, outward-facing step.

## 1. Decide and bump the version

Read the current `version` in [package.json](package.json) and propose the next one using semver:

- **patch** (1.0.0 → 1.0.1): only bug fixes.
- **minor** (1.0.x → 1.1.0): new features or notable UI changes.
- **major** (1.x → 2.0.0): breaking changes.

If the user named a version, use it. If they're unsure, infer from the commits since the last `vX.Y.Z` tag (see step 3) and state which bump you chose and why. Then edit `version` in [package.json](package.json).

The version is the single source of truth: `app.getVersion()`, the installer filename/embedded version, and the release tag all derive from it. An update is only detected when the published version is **higher** than what the user is running, so always bump before building.

## 2. Build the installer (OS-specific)

Detect the host OS (`uname` → `Darwin` is macOS; otherwise Windows) and follow the matching section. Each build takes a few minutes — use a long timeout (~600000 ms).

### macOS → `.dmg`

Build the arm64 disk image with the host toolchain. `electron-forge make` runs every darwin maker, so it also emits a `.zip` byproduct — the **`.dmg`** is the installer you ship.

```bash
pnpm exec electron-forge make --platform=darwin --arch=arm64
```

Confirm the artifact is freshly written:

```bash
ls -lh out/make/Recreate-<version>-arm64.dmg
```

You should see `Recreate-<version>-arm64.dmg`. Optionally sanity-check the embedded version and name:

```bash
hdiutil attach out/make/Recreate-<version>-arm64.dmg -nobrowse -readonly
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "/Volumes/Recreate/Recreate.app/Contents/Info.plist"
hdiutil detach "/Volumes/Recreate"
```

Notes:

- The `.dmg` maker (`@electron-forge/maker-dmg`) pulls in `appdmg`, which needs the native modules `fs-xattr` and `macos-alias` compiled. They're listed in pnpm's `onlyBuiltDependencies`, so a clean `pnpm install` builds them. If `make` fails with a "Cannot find module …xattr/volume" error, compile them directly and retry:
    ```bash
    ( cd node_modules/fs-xattr && npx node-gyp rebuild )
    ( cd node_modules/macos-alias && npx node-gyp rebuild )
    ```
- **Apple Silicon only.** `scripts/install-ffmpeg.mjs` installs a single host-arch ffmpeg, so a cross-packaged x64 `.dmg` would bundle the arm64 ffmpeg and break on Intel Macs. Don't build `--arch=x64`/`universal` for macOS without first fetching an x64 ffmpeg for the bundle.
- The build is **unsigned / unnotarized** — see the macOS Install note in step 3.

### Windows → NSIS installers (both arches)

The host is arm64. Build arm64 with the host toolchain, then cross-package x64. Run them sequentially (they share `out/`). Packaging runs in place (`electron-forge package`): the repo is a single pnpm package with a hoisted `node_modules`, so no staging tree is needed.

```powershell
# arm64 (host): packages the app, then runs makensis
pnpm run make:nsis

# x64 (cross-packaged on the arm64 host)
pnpm run package -- --arch=x64
node scripts/make-nsis.mjs --arch=x64
```

Then confirm both artifacts exist and are freshly written:

```powershell
Get-ChildItem "out\make" -Filter "Recreate-Setup-<version>-*.exe" |
  Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}}, LastWriteTime
```

You should see `Recreate-Setup-<version>-arm64.exe` and `Recreate-Setup-<version>-x64.exe`. Verify the makensis output shows the right `VERSIONMAJOR/MINOR/BUILD` for the new version.

## 3. Generate release notes

Base the notes on the commits since the previous release tag:

```bash
git log --oneline -20   # find the previous "vX.Y.Z" commit and read commits since it
```

Write to `build/release-notes-<version>.md`. Conventions for this project:

- **No emojis.**
- Group changes under `### New`, `### Improvements`, `### Fixes` (omit any empty section).
- Lead with a one-line summary of the release.
- Rewrite terse commit messages ("ui fixes", "bug fixes") into user-facing language. If the commit log is too vague to describe accurately, ask the user for the highlights rather than guessing.
- End with the **Install** section that matches the installer(s) you built (below).

Install section for a **macOS** release (substitute the version):

```markdown
### Install

Download **Recreate-<version>-arm64.dmg** (Apple Silicon), open it, and drag **Recreate** into **Applications**.

Already running Recreate? It will detect <version> automatically and offer to update.

Because the app isn't notarized yet, macOS may block the first launch — right-click **Recreate** in Applications, choose **Open**, then confirm.
```

Install section for a **Windows** release (substitute the version):

```markdown
### Install

Download the installer for your architecture from the [releases page](https://github.com/ammarrik/recreate-app/releases) and run it:

- **Recreate-Setup-<version>-x64.exe** — Intel/AMD (64-bit)
- **Recreate-Setup-<version>-arm64.exe** — ARM (e.g. Snapdragon)

Already running Recreate? It will detect <version> automatically and offer to update — no manual download needed.

Windows may show a SmartScreen warning since the installer isn't code-signed yet — choose **More info → Run anyway**.
```

## 4. Report and (optionally) publish

Summarize for the user: new version, the installer path(s)/size(s) you built, and the notes file path.

To actually publish (only when the user asks):

- **Windows** — `pnpm run publish -- --notes-file build/release-notes-<version>.md` auto-finds both `Recreate-Setup-<version>-*.exe` in `out/make` and creates the `v<version>` release on `ammarrik/recreate-app`. Requires `gh` installed and authed (`gh auth login`).
- **macOS** — `scripts/publish-release.mjs` only uploads `.exe` assets, so it won't pick up the `.dmg`. Publish via the web UI: create a release at https://github.com/ammarrik/recreate-app/releases/new, tag `v<version>`, attach `Recreate-<version>-arm64.dmg`, paste the notes, and Publish.
- **Web UI (either OS)** — release at https://github.com/ammarrik/recreate-app/releases/new, tag `v<version>`, attach the built artifact(s), paste the notes, and Publish (not a draft — `/releases/latest` skips drafts and prereleases).
