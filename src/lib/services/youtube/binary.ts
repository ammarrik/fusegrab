import type { DownloadLogger } from '../logger/service'
import type { BrowserWindow } from 'electron'

import { app } from 'electron'
import { execFile } from 'node:child_process'
import {
    createWriteStream,
    existsSync,
    mkdirSync,
    readdirSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import { chmod, rename, rm } from 'node:fs/promises'
import path from 'node:path'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

function getBinaryName(): string {
    if (process.platform === 'win32') return 'yt-dlp.exe'
    if (process.platform === 'darwin') return 'yt-dlp_macos'
    return 'yt-dlp'
}

function getDownloadUrl(): string {
    const name = getBinaryName()
    return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${name}`
}

export async function ensureYtDlpBinary(
    forceUpdate = false,
    logger?: DownloadLogger,
): Promise<string> {
    const binDir = path.join(app.getPath('userData'), 'bin')
    const binName = getBinaryName()
    const binPath = path.join(binDir, binName)

    const now = Date.now()
    let needsDownload = true

    if (existsSync(binPath)) {
        try {
            const stat = statSync(binPath)
            // Treat empty or tiny files as corrupt
            if (stat.size < 1000) {
                logger?.warn(
                    `Existing yt-dlp binary at ${binPath} is corrupt or tiny (${stat.size} bytes). Redownloading...`,
                )
                needsDownload = true
            } else if (
                now - stat.mtimeMs > TWENTY_FOUR_HOURS_MS ||
                forceUpdate
            ) {
                logger?.info(
                    'yt-dlp binary is older than 24h or force update requested. Checking for update...',
                )
                needsDownload = true
            } else {
                logger?.info(`Using existing yt-dlp binary at: ${binPath}`)
                needsDownload = false
            }
        } catch (e: any) {
            logger?.warn(
                `Failed to stat yt-dlp binary at ${binPath}: ${e?.message}`,
            )
            needsDownload = true
        }
    } else {
        logger?.info(
            `yt-dlp binary not found at ${binPath}. Downloading latest release...`,
        )
    }

    if (!needsDownload) {
        return binPath
    }

    mkdirSync(binDir, { recursive: true })

    try {
        const url = getDownloadUrl()
        logger?.info(`Downloading yt-dlp binary from ${url}...`)
        const res = await fetch(url)
        if (res.ok && res.body) {
            const buffer = Buffer.from(await res.arrayBuffer())
            if (buffer.length < 1000) {
                const errMsg =
                    'Downloaded yt-dlp binary is too small, likely corrupt'
                logger?.error(errMsg)
                throw new Error(errMsg)
            }

            const tmpPath = `${binPath}.tmp_${now}`
            const ws = createWriteStream(tmpPath)
            await new Promise<void>((resolve, reject) => {
                ws.write(buffer, (writeErr) => {
                    if (writeErr) {
                        ws.destroy()
                        return reject(writeErr)
                    }
                    ws.end(() => resolve())
                })
                ws.on('error', reject)
            })

            if (process.platform !== 'win32') {
                await chmod(tmpPath, 0o755)
            }

            await rename(tmpPath, binPath)
            logger?.info(`yt-dlp binary updated successfully at ${binPath}`)
        } else {
            const errMsg = `Failed to fetch yt-dlp binary: HTTP ${res.status} ${res.statusText}`
            logger?.error(errMsg)
            throw new Error(errMsg)
        }
    } catch (err: any) {
        if (existsSync(binPath) && statSync(binPath).size > 1000) {
            logger?.warn(
                `Failed to download updated yt-dlp binary (${err?.message || String(err)}). Reusing existing binary at ${binPath}`,
            )
            return binPath
        }
        const errMsg = `Failed to download yt-dlp binary: ${err instanceof Error ? err.message : String(err)}`
        logger?.error(errMsg, err)
        throw new Error(errMsg)
    }

    return binPath
}

function getAria2BinaryName(): string {
    if (process.platform === 'win32') return 'aria2c.exe'
    return 'aria2c'
}

export async function ensureAria2Binary(
    logger?: DownloadLogger,
): Promise<string | null> {
    const binDir = path.join(app.getPath('userData'), 'bin')
    const binName = getAria2BinaryName()
    const binPath = path.join(binDir, binName)

    if (existsSync(binPath)) {
        try {
            const stat = statSync(binPath)
            if (stat.size > 1000) {
                logger?.info(`Found cached aria2c binary at: ${binPath}`)
                return binPath
            }
        } catch {}
    }

    try {
        const checkCmd = process.platform === 'win32' ? 'where' : 'which'
        const sysPath = await new Promise<string>((resolve, reject) => {
            execFile(checkCmd, [binName], (err, stdout) => {
                if (err || !stdout.trim()) return reject(err)
                resolve(stdout.trim().split('\n')[0].trim())
            })
        })
        if (sysPath && existsSync(sysPath)) {
            logger?.info(`Found system aria2c binary at: ${sysPath}`)
            return sysPath
        }
    } catch {}

    logger?.info(
        'aria2c binary not found locally or in PATH. Attempting automatic download...',
    )
    try {
        mkdirSync(binDir, { recursive: true })
        let downloadUrl = ''
        if (process.platform === 'win32') {
            downloadUrl =
                'https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip'
        } else if (process.platform === 'darwin') {
            downloadUrl =
                'https://github.com/abcfy2/aria2-static-build/releases/download/1.37.0/aria2-1.37.0-osx-darwin-64bit.tar.gz'
        } else {
            logger?.warn(
                'Automatic aria2 download is not supported on this platform.',
            )
            return null
        }

        logger?.info(`Downloading aria2 release archive from ${downloadUrl}...`)
        const res = await fetch(downloadUrl)
        if (!res.ok || !res.body) {
            const warnMsg = `Failed to fetch aria2 archive from ${downloadUrl}: HTTP ${res.status} ${res.statusText}`
            logger?.warn(warnMsg)
            return null
        }

        const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'
        const tmpArchive = path.join(binDir, `aria2_archive.${ext}`)
        const buffer = Buffer.from(await res.arrayBuffer())

        await new Promise<void>((resolve, reject) => {
            const ws = createWriteStream(tmpArchive)
            ws.write(buffer, (writeErr) => {
                if (writeErr) {
                    ws.destroy()
                    return reject(writeErr)
                }
                ws.end(() => resolve())
            })
            ws.on('error', reject)
        })

        if (process.platform === 'win32') {
            logger?.info(
                'Extracting Windows aria2 zip archive via PowerShell...',
            )
            await new Promise((resolve, reject) => {
                execFile(
                    'powershell',
                    [
                        '-command',
                        `Expand-Archive -Path "${tmpArchive}" -DestinationPath "${binDir}" -Force`,
                    ],
                    (err) => (err ? reject(err) : resolve(true)),
                )
            })
        } else {
            logger?.info('Extracting macOS aria2 tar archive...')
            await new Promise((resolve, reject) => {
                execFile('tar', ['-xzf', tmpArchive, '-C', binDir], (err) =>
                    err ? reject(err) : resolve(true),
                )
            })
        }

        const findBinary = (dir: string): string | null => {
            const entries = readdirSync(dir)
            for (const entry of entries) {
                const full = path.join(dir, entry)
                if (entry.toLowerCase() === binName.toLowerCase()) return full
                if (statSync(full).isDirectory()) {
                    const found = findBinary(full)
                    if (found) return found
                }
            }
            return null
        }

        const foundBin = findBinary(binDir)
        if (foundBin && foundBin !== binPath) {
            await rename(foundBin, binPath).catch(() => undefined)
        }

        if (process.platform !== 'win32' && existsSync(binPath)) {
            await chmod(binPath, 0o755).catch(() => undefined)
        }

        await rm(tmpArchive, { force: true }).catch(() => undefined)

        if (existsSync(binPath)) {
            logger?.info(
                `aria2 binary successfully downloaded and installed at ${binPath}`,
            )
            return binPath
        } else {
            logger?.warn(
                'Extracted aria2 binary was not found at expected destination.',
            )
        }
    } catch (err: any) {
        logger?.warn(
            `Failed to download/load aria2 binary: ${err?.message || String(err)}. Falling back to standard downloader.`,
            err,
        )
    }

    return null
}

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function getAntiRateLimitArgs(
    win?: BrowserWindow | null,
    logger?: DownloadLogger,
): Promise<string[]> {
    const userAgent =
        (win && !win.isDestroyed() && win.webContents.getUserAgent()) ||
        DEFAULT_USER_AGENT

    const args: string[] = [
        '--user-agent',
        userAgent,
        '--add-header',
        'Referer:https://www.youtube.com/',
        '--add-header',
        'Origin:https://www.youtube.com/',
        '--extractor-args',
        'youtube:player_client=ios,web,mweb',
        '--throttled-rate',
        '100K',
        '--socket-timeout',
        '15',
        '--retries',
        '5',
        '--fragment-retries',
        '5',
        '--file-access-retries',
        '3',
    ]

    const aria2Path = await ensureAria2Binary(logger)
    if (aria2Path) {
        logger?.info(`Using aria2 accelerator binary at: ${aria2Path}`)
        args.push(
            '--external-downloader',
            aria2Path,
            '--external-downloader-args',
            'aria2c:-j 16 -x 16 -s 16 -k 1M --connect-timeout=5 --timeout=5 --max-tries=3 --summary-interval=0',
        )
    } else {
        logger?.info(
            'aria2 accelerator is unavailable. Using standard concurrent fragment downloader.',
        )
        args.push('--concurrent-fragments', '5')
    }

    try {
        const { session } = await import('electron')
        const partitions = ['persist:yt-scraper']
        const allCookies: any[] = []
        const seenNames = new Set<string>()

        for (const part of partitions) {
            try {
                const ses = session.fromPartition(part)
                const cookies = await ses.cookies.get({
                    domain: '.youtube.com',
                })
                for (const c of cookies) {
                    if (!seenNames.has(c.name)) {
                        seenNames.add(c.name)
                        allCookies.push(c)
                    }
                }
            } catch {}
        }

        if (allCookies.length > 0) {
            const cookieFilePath = path.join(
                app.getPath('userData'),
                'yt_cookies.txt',
            )
            const cookieLines = [
                '# Netscape HTTP Cookie File',
                '# http://curl.haxx.se/rfc/cookie_spec.html',
                '# This is a generated file! Do not edit.',
                '',
            ]
            for (const c of allCookies) {
                const domain = c.domain.startsWith('.')
                    ? c.domain
                    : `.${c.domain}`
                const flag = 'TRUE'
                const cookiePath = c.path || '/'
                const secure = c.secure ? 'TRUE' : 'FALSE'
                const expiration = Math.floor(
                    c.expirationDate || Date.now() / 1000 + 86400 * 365,
                )
                cookieLines.push(
                    `${domain}\t${flag}\t${cookiePath}\t${secure}\t${expiration}\t${c.name}\t${c.value}`,
                )
            }
            writeFileSync(cookieFilePath, cookieLines.join('\n'), 'utf-8')
            args.push('--cookies', cookieFilePath)
            logger?.info(
                `Extracted ${allCookies.length} cookies to ${cookieFilePath}`,
            )
        }
    } catch (err: any) {
        logger?.warn(`Failed to export browser cookies: ${err?.message}`)
    }

    return args
}
