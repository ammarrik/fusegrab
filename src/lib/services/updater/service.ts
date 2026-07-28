import type { BrowserWindow } from 'electron'

import { app } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { toFriendlyError } from '#/lib/network-error'

// Releases (the packaged installers) are published to a *separate public* repo,
// distinct from the private source repo. The GitHub Releases API and asset
// downloads for a public repo need no auth token.
const OWNER = 'ammarrik'
const REPO = 'fuse-app'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`

export type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error'

export type UpdateAssetKind = 'windows-installer' | 'mac-dmg'

export type UpdateState = {
    status: UpdateStatus
    /** Latest available version (without the leading "v"), or null. */
    version: string | null
    notes: string | null
    percent: number
    /** Bytes downloaded so far. */
    transferred: number
    /** Total bytes of the installer. */
    total: number
    /** The platform-specific installer asset currently selected. */
    assetKind: UpdateAssetKind | null
    error: string | null
}

type ReleaseAsset = {
    name: string
    browser_download_url: string
    size: number
}

type Release = {
    tag_name: string
    name: string | null
    body: string | null
    assets: ReleaseAsset[]
}

let state: UpdateState = {
    status: 'idle',
    version: null,
    notes: null,
    percent: 0,
    transferred: 0,
    total: 0,
    assetKind: null,
    error: null,
}

let selectedAsset: ReleaseAsset | null = null
let selectedAssetKind: UpdateAssetKind | null = null
let downloadedInstaller: string | null = null
let installing = false
let mainWindow: BrowserWindow | null = null

// Where downloaded installers are staged before we hand them to the OS.
function updatesDir(): string {
    return path.join(app.getPath('temp'), 'fuse-updates')
}

function clampPercent(percent: number): number {
    return Math.max(0, Math.min(100, percent))
}

function setProgress(percent: number) {
    setState({ percent: clampPercent(percent) })
}

function currentAppBundlePath(): string | null {
    const parts = app.getPath('exe').split(path.sep)
    const appIndex = parts.findIndex((part) =>
        part.toLowerCase().endsWith('.app'),
    )
    if (appIndex === -1) return null
    return parts.slice(0, appIndex + 1).join(path.sep) || path.sep
}

function runProcess(
    command: string,
    args: string[],
    failureMessage: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ['ignore', 'ignore', 'pipe'],
        })
        let stderr = ''
        child.stderr?.on('data', (chunk) => {
            stderr += String(chunk)
        })
        child.once('error', reject)
        child.once('exit', (code) => {
            if (code === 0) {
                resolve()
                return
            }
            reject(
                new Error(
                    `${failureMessage}: ${
                        stderr.trim() || `${command} exited with code ${code}`
                    }`,
                ),
            )
        })
    })
}

function runProcessOutput(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        child.stdout?.on('data', (chunk) => {
            stdout += String(chunk)
        })
        child.stderr?.on('data', (chunk) => {
            stderr += String(chunk)
        })
        child.once('error', reject)
        child.once('exit', (code) => {
            if (code === 0) {
                resolve(stdout)
                return
            }
            reject(
                new Error(
                    stderr.trim() || `${command} exited with code ${code}`,
                ),
            )
        })
    })
}

async function directorySizeKb(target: string): Promise<number> {
    const output = await runProcessOutput('/usr/bin/du', ['-sk', target])
    const kb = Number(output.trim().split(/\s+/)[0])
    return Number.isFinite(kb) ? kb : 0
}

async function findMountedAppBundle(mountPath: string): Promise<string> {
    const entries = await readdir(mountPath, { withFileTypes: true })
    const appBundle = entries.find(
        (entry) =>
            entry.isDirectory() && entry.name.toLowerCase().endsWith('.app'),
    )
    if (!appBundle) {
        throw new Error("The update DMG didn't contain a macOS app.")
    }
    return path.join(mountPath, appBundle.name)
}

async function stageMacAppBundle(
    sourceApp: string,
    stagedApp: string,
): Promise<void> {
    await rm(stagedApp, { recursive: true, force: true })
    const totalKb = await directorySizeKb(sourceApp).catch(() => 0)
    let polling = false
    const timer =
        totalKb > 0
            ? setInterval(() => {
                  if (polling) return
                  polling = true
                  directorySizeKb(stagedApp)
                      .then((copiedKb) => {
                          const copyPercent = (copiedKb / totalKb) * 60
                          setProgress(Math.max(state.percent, 20 + copyPercent))
                      })
                      .catch(() => undefined)
                      .finally(() => {
                          polling = false
                      })
              }, 500)
            : null

    try {
        await runProcess(
            '/usr/bin/ditto',
            [sourceApp, stagedApp],
            "Couldn't stage the update",
        )
    } finally {
        if (timer) clearInterval(timer)
    }
    setProgress(85)
}

async function detachDmg(mountPath: string): Promise<void> {
    await runProcess(
        '/usr/bin/hdiutil',
        ['detach', mountPath, '-quiet'],
        "Couldn't detach the update image",
    ).catch(() =>
        runProcess(
            '/usr/bin/hdiutil',
            ['detach', mountPath, '-force', '-quiet'],
            "Couldn't detach the update image",
        ).catch(() => undefined),
    )
}

async function writeMacRelaunchScript(): Promise<string> {
    const scriptPath = path.join(updatesDir(), 'finish-macos-update.sh')
    const script = `#!/bin/sh
set -u

APP_PID="$1"
STAGED_APP="$2"
TARGET_APP="$3"
OLD_APP="$TARGET_APP.previous-update"

while kill -0 "$APP_PID" 2>/dev/null; do
  sleep 0.2
done

/usr/bin/xattr -dr com.apple.quarantine "$STAGED_APP" 2>/dev/null || true
/bin/rm -rf "$OLD_APP"

if [ -d "$TARGET_APP" ]; then
  /bin/mv "$TARGET_APP" "$OLD_APP" || exit 1
fi

if /bin/mv "$STAGED_APP" "$TARGET_APP"; then
  /bin/rm -rf "$OLD_APP"
  /usr/bin/open "$TARGET_APP"
  /bin/rm -rf "$(/usr/bin/dirname "$STAGED_APP")"
  exit 0
fi

if [ -d "$OLD_APP" ]; then
  /bin/mv "$OLD_APP" "$TARGET_APP"
fi

/usr/bin/open "$TARGET_APP" 2>/dev/null || true
exit 1
`
    await writeFile(scriptPath, script, { mode: 0o755 })
    await chmod(scriptPath, 0o755)
    return scriptPath
}

async function installMacDmg(): Promise<boolean> {
    if (!downloadedInstaller) return false
    if (!app.isPackaged) {
        throw new Error('Updates can only be installed from a packaged app.')
    }

    const targetApp = currentAppBundlePath()
    if (!targetApp) {
        throw new Error("Couldn't locate the installed app bundle.")
    }

    const macUpdateDir = path.join(updatesDir(), 'macos')
    const mountPath = path.join(macUpdateDir, 'mount')
    const stageDir = path.join(macUpdateDir, 'stage')
    const stagedApp = path.join(stageDir, path.basename(targetApp))
    let mounted = false

    await rm(macUpdateDir, { recursive: true, force: true })
    await mkdir(mountPath, { recursive: true })
    await mkdir(stageDir, { recursive: true })
    setProgress(5)

    try {
        await runProcess(
            '/usr/bin/hdiutil',
            [
                'attach',
                downloadedInstaller,
                '-nobrowse',
                '-readonly',
                '-mountpoint',
                mountPath,
            ],
            "Couldn't mount the update",
        )
        mounted = true
        setProgress(15)

        const sourceApp = await findMountedAppBundle(mountPath)
        await stageMacAppBundle(sourceApp, stagedApp)
    } finally {
        if (mounted) {
            await detachDmg(mountPath)
        }
    }

    const scriptPath = await writeMacRelaunchScript()
    setProgress(95)
    const child = spawn(
        '/bin/sh',
        [scriptPath, String(process.pid), stagedApp, targetApp],
        {
            detached: true,
            stdio: 'ignore',
        },
    )
    child.unref()
    app.quit()
    return true
}

export function setUpdaterWindow(win: BrowserWindow) {
    mainWindow = win
}

export function getUpdateState(): UpdateState {
    return state
}

function setState(patch: Partial<UpdateState>) {
    state = { ...state, ...patch }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:state', state)
    }
}

function parseVersion(v: string): number[] {
    return v
        .replace(/^v/i, '')
        .split('-')[0]
        .split('.')
        .map((n) => parseInt(n, 10) || 0)
}

/** Returns >0 if a is newer than b, <0 if older, 0 if equal. */
function compareVersions(a: string, b: string): number {
    const pa = parseVersion(a)
    const pb = parseVersion(b)
    const len = Math.max(pa.length, pb.length)
    for (let i = 0; i < len; i++) {
        const da = pa[i] ?? 0
        const db = pb[i] ?? 0
        if (da !== db) return da - db
    }
    return 0
}

function pickBestAsset(
    assets: ReleaseAsset[],
    extension: string,
): ReleaseAsset | null {
    const candidates = assets.filter((a) =>
        a.name.toLowerCase().endsWith(extension),
    )
    if (candidates.length === 0) return null
    const arch = process.arch
    return (
        candidates.find((a) => a.name.toLowerCase().includes(arch)) ??
        candidates.find((a) => a.name.toLowerCase().includes('x64')) ??
        candidates[0]
    )
}

function pickAsset(
    assets: ReleaseAsset[],
): { asset: ReleaseAsset; kind: UpdateAssetKind } | null {
    if (process.platform === 'win32') {
        const asset = pickBestAsset(assets, '.exe')
        return asset ? { asset, kind: 'windows-installer' } : null
    }
    if (process.platform === 'darwin') {
        const asset = pickBestAsset(assets, '.dmg')
        return asset ? { asset, kind: 'mac-dmg' } : null
    }
    return null
}

function installerAssetDescription(): string {
    if (process.platform === 'win32') return 'Windows installer'
    if (process.platform === 'darwin') return 'macOS DMG'
    return `${process.platform} installer`
}

function clearSelectedAsset() {
    selectedAsset = null
    selectedAssetKind = null
    downloadedInstaller = null
}

export async function checkForUpdate(): Promise<UpdateState> {
    if (process.platform !== 'win32' && process.platform !== 'darwin') {
        clearSelectedAsset()
        setState({ status: 'idle', assetKind: null })
        return state
    }
    try {
        setState({ status: 'checking', error: null })
        const res = await fetch(LATEST_RELEASE_URL, {
            headers: {
                'User-Agent': 'Fuse-Updater',
                Accept: 'application/vnd.github+json',
            },
        })
        // A 404 here means the repo has no published release yet (GitHub's
        // /releases/latest 404s when there's nothing to return) — that's "you're
        // up to date", not an error to alarm the user with.
        if (res.status === 404) {
            clearSelectedAsset()
            setState({
                status: 'idle',
                version: null,
                notes: null,
                assetKind: null,
            })
            return state
        }
        if (!res.ok) {
            throw new Error(`GitHub API responded ${res.status}`)
        }
        const release = (await res.json()) as Release
        const latest = release.tag_name
        const current = app.getVersion()

        if (compareVersions(latest, current) <= 0) {
            // Already up to date.
            clearSelectedAsset()
            setState({
                status: 'idle',
                version: null,
                notes: null,
                assetKind: null,
            })
            return state
        }

        const stripped = latest.replace(/^v/i, '')
        // A routine re-check (e.g. opening Settings) must not interrupt an
        // in-flight download or discard one we've already fetched for this same
        // version — leave that state alone. A genuinely newer version falls
        // through and is picked up normally.
        if (
            (state.status === 'downloading' || state.status === 'downloaded') &&
            state.version === stripped
        ) {
            return state
        }

        const picked = pickAsset(release.assets)
        if (!picked) {
            clearSelectedAsset()
            setState({
                status: 'error',
                error: `No ${installerAssetDescription()} found in the latest release`,
            })
            return state
        }

        selectedAsset = picked.asset
        selectedAssetKind = picked.kind
        downloadedInstaller = null
        setState({
            status: 'available',
            version: stripped,
            notes: release.body ?? null,
            total: picked.asset.size,
            percent: 0,
            transferred: 0,
            assetKind: picked.kind,
            error: null,
        })
        return state
    } catch (err) {
        setState({
            status: 'error',
            error: toFriendlyError(err).message,
        })
        return state
    }
}

export async function downloadUpdate(): Promise<UpdateState> {
    // Don't start a second download on top of one already running.
    if (state.status === 'downloading') return state
    if (!selectedAsset) {
        await checkForUpdate()
        if (!selectedAsset) return state
    }
    const asset = selectedAsset

    try {
        setState({
            status: 'downloading',
            percent: 0,
            transferred: 0,
            total: asset.size,
            assetKind: selectedAssetKind,
            error: null,
        })

        const dir = updatesDir()
        await mkdir(dir, { recursive: true })
        const dest = path.join(dir, asset.name)

        const res = await fetch(asset.browser_download_url, {
            headers: { 'User-Agent': 'Fuse-Updater' },
        })
        if (!res.ok || !res.body) {
            throw new Error(`Download failed (${res.status})`)
        }

        const total = Number(res.headers.get('content-length')) || asset.size
        let transferred = 0
        let lastPercent = 0

        const fileStream = createWriteStream(dest)
        const reader = res.body.getReader()

        try {
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                const chunk = Buffer.from(value)
                if (!fileStream.write(chunk)) {
                    await new Promise<void>((resolve) =>
                        fileStream.once('drain', () => resolve()),
                    )
                }
                transferred += chunk.byteLength
                const percent = total ? (transferred / total) * 100 : 0
                // Throttle IPC: only emit on whole-percent advances.
                if (percent - lastPercent >= 1 || percent >= 100) {
                    lastPercent = percent
                    setState({ percent, transferred, total })
                }
            }
        } finally {
            await new Promise<void>((resolve, reject) =>
                fileStream.end((err?: Error | null) =>
                    err ? reject(err) : resolve(),
                ),
            )
        }

        // A dropped connection can end the stream early without throwing; refuse
        // to hand a truncated installer to the user.
        if (total && transferred !== total) {
            throw new Error(
                `Download incomplete (${transferred} of ${total} bytes)`,
            )
        }

        downloadedInstaller = dest
        setState({
            status: 'downloaded',
            percent: 100,
            transferred: total,
            total,
            assetKind: selectedAssetKind,
        })
        return state
    } catch (err) {
        setState({
            status: 'error',
            error: toFriendlyError(err).message,
        })
        return state
    }
}

// On macOS, mount the downloaded DMG, stage the new .app while reporting
// progress, then quit only for the final bundle swap/relaunch. On Windows,
// launch the downloaded installer in its visible auto-update mode and quit so
// it can replace the running files. The NSIS installer shows only its progress
// page, installs without extra clicks, and relaunches the app itself once the
// new files are in place (see installer.nsi).
//
// The installer is manifested to require admin (RequestExecutionLevel admin).
// We must NOT spawn it directly: child_process.spawn uses CreateProcess, which
// does not perform UAC elevation and fails outright with
// ERROR_ELEVATION_REQUIRED (740) for an admin-manifested exe. Instead we go
// through ShellExecute's "runas" verb (via PowerShell's Start-Process), which
// raises the UAC prompt and elevates correctly.
//
// Two things here are load-bearing and were the cause of "Restart just closes
// the app and nothing installs":
//
//  1. We do NOT pass `detached: true`. On Windows, spawning powershell.exe with
//     `{ detached: true, stdio: 'ignore' }` makes it exit cleanly (code 0)
//     WITHOUT ever running its `-Command` — so Start-Process never fires and no
//     installer launches. We don't need detach anyway: Start-Process -Verb
//     RunAs hands the elevated installer to the Windows AppInfo service, which
//     reparents it, so it outlives this process on its own.
//  2. We quit only AFTER powershell exits, not on a fixed timer. Start-Process
//     (without -Wait) returns once the elevated child has actually launched —
//     i.e. after the user accepts the UAC prompt — so powershell's exit is our
//     signal that the installer is running. A non-zero exit means the launch
//     failed (most often the user declined elevation); we surface that instead
//     of quitting into nothing.
export async function quitAndInstall(): Promise<boolean> {
    if (!downloadedInstaller) return false
    // Re-entrancy guard: installing takes a few seconds (UAC + file copy) before
    // the app quits, and the renderer's "Restart to update" button stays clickable
    // until the new state propagates. Without this, rapid clicks would each spawn
    // their own elevated installer — multiple UAC prompts and relaunches.
    if (installing) return false
    installing = true
    setState({
        status: 'installing',
        percent: 0,
        transferred: 0,
        total: 0,
        error: null,
    })
    if (selectedAssetKind === 'mac-dmg') {
        try {
            return await installMacDmg()
        } catch (err) {
            installing = false
            setState({
                status: 'error',
                error: toFriendlyError(err).message,
            })
            return false
        }
    }
    // Embed the path in a single-quoted PowerShell string, doubling any single
    // quotes so a stray "'" in the temp path can't break out of the literal.
    const psPath = downloadedInstaller.replace(/'/g, "''")
    const child = spawn(
        'powershell.exe',
        [
            '-NoProfile',
            '-NonInteractive',
            '-WindowStyle',
            'Hidden',
            '-Command',
            // -ErrorAction Stop + try/catch makes the exit code an explicit
            // contract: 0 = installer launched, 1 = launch failed (e.g. UAC
            // declined), rather than relying on PowerShell's default behavior.
            `try { Start-Process -FilePath '${psPath}' -ArgumentList '/AUTOUPDATE' -Verb RunAs -ErrorAction Stop } catch { exit 1 }`,
        ],
        {
            stdio: 'ignore',
        },
    )
    child.on('error', (err) => {
        // e.g. powershell.exe couldn't be launched. Don't quit into nothing —
        // report it so the user can re-download / retry.
        installing = false
        downloadedInstaller = null
        setState({
            status: 'error',
            error: `Couldn't launch the installer: ${err.message}`,
        })
    })
    child.on('exit', (code) => {
        if (code === 0) {
            // Installer is running under the AppInfo service; safe to quit so it
            // can replace our (now-unlocked) files and relaunch us.
            app.quit()
            return
        }
        // Launch failed — typically the UAC prompt was declined. The installer
        // is still downloaded, so drop back to "downloaded" (re-enabling the
        // Restart button) instead of quitting into nothing.
        installing = false
        setState({ status: 'downloaded' })
    })
    return true
}

// After a silent update the freshly-installed app relaunches while the old
// installer is still sitting in temp. We can't safely delete it from the
// quitting process (the installer is mid-run), so sweep the staging folder on
// the next startup instead. Call this once at launch, before any new download
// could begin — it's a no-op when the folder is absent or empty.
export async function cleanupStaleInstallers(): Promise<void> {
    await rm(updatesDir(), { recursive: true, force: true }).catch(
        () => undefined,
    )
}
