// Builds installers for macOS (arm64 & x64), Windows ARM64, and Windows 11 (x64).
//
// Usage:
//   node scripts/build-installers.mjs [target]
//   Targets: mac, win-arm, win-x64, win, all (default: all)

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const target = process.argv[2] ?? 'all'

console.log(`[build-installers] Target: ${target}`)
console.log(`[build-installers] Host OS: ${process.platform} (${process.arch})`)

const forgeCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function runForgeMake(platform, arch) {
    console.log(`\n==================================================`)
    console.log(`[build-installers] Building for ${platform} (${arch})...`)
    console.log(`==================================================\n`)
    const keepAlivePath = join(ROOT, 'scripts', 'keep-alive.cjs')
    const existingNodeOpts = process.env.NODE_OPTIONS ?? ''
    const nodeOpts = existingNodeOpts
        ? `${existingNodeOpts} --require "${keepAlivePath}"`
        : `--require "${keepAlivePath}"`

    const pathSep = process.platform === 'win32' ? ';' : ':'
    const extraPaths =
        process.platform === 'win32'
            ? ''
            : ':/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin'

    const result = spawnSync(
        forgeCmd,
        ['exec', 'electron-forge', 'make', '--platform', platform, '--arch', arch],
        {
            cwd: ROOT,
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_OPTIONS: nodeOpts,
                ELECTRON_GET_SKIP_SUMMARY: '1',
                PATH: `${process.env.PATH ?? ''}${extraPaths}`,
            },
        },
    )
    if (result.status !== 0) {
        console.error(
            `[build-installers] Failed to build for ${platform} (${arch}) with exit code ${result.status}`,
        )
        return false
    }
    return true
}

let success = true

if (target === 'mac' || target === 'all') {
    // macOS Apple Silicon (arm64) and Intel (x64)
    if (process.platform === 'darwin') {
        success = runForgeMake('darwin', 'arm64') && success
        success = runForgeMake('darwin', 'x64') && success
    } else {
        console.warn(
            '[build-installers] Warning: macOS DMG/App bundles can only be compiled on macOS host.',
        )
    }
}

if (target === 'win-arm' || target === 'win' || target === 'all') {
    // Windows ARM64 (Windows on ARM)
    success = runForgeMake('win32', 'arm64') && success
    if (process.platform === 'win32') {
        const nsisRes = spawnSync(
            forgeCmd,
            ['run', 'make:nsis', '--', '--arch=arm64'],
            { cwd: ROOT, stdio: 'inherit' },
        )
        if (nsisRes.status !== 0) {
            console.warn('[build-installers] Warning: NSIS build for arm64 failed.')
        }
    }
}

if (target === 'win-x64' || target === 'win' || target === 'all') {
    // Windows 11 / 10 64-bit (x64)
    success = runForgeMake('win32', 'x64') && success
    if (process.platform === 'win32') {
        const nsisRes = spawnSync(
            forgeCmd,
            ['run', 'make:nsis', '--', '--arch=x64'],
            { cwd: ROOT, stdio: 'inherit' },
        )
        if (nsisRes.status !== 0) {
            console.warn('[build-installers] Warning: NSIS build for x64 failed.')
        }
    }
}

// Summary of output artifacts
const makeDir = join(ROOT, 'out', 'make')
console.log(`\n==================================================`)
console.log(`[build-installers] Installer artifacts summary:`)
console.log(`==================================================`)

if (existsSync(makeDir)) {
    function getFilesRecursively(dir) {
        let results = []
        const list = readdirSync(dir)
        for (const file of list) {
            const fullPath = join(dir, file)
            const stat = statSync(fullPath)
            if (stat && stat.isDirectory()) {
                results = results.concat(getFilesRecursively(fullPath))
            } else {
                results.push({ path: fullPath, sizeMB: (stat.size / (1024 * 1024)).toFixed(2) })
            }
        }
        return results
    }

    const files = getFilesRecursively(makeDir)
    if (files.length === 0) {
        console.log('No files found in out/make.')
    } else {
        files.forEach((f) => {
            console.log(`- ${f.path.replace(ROOT + '/', '')} (${f.sizeMB} MB)`)
        })
    }
} else {
    console.log('out/make directory does not exist.')
}

if (!success) {
    process.exit(1)
}
