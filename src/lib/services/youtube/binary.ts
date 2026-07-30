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

export async function ensureYtDlpBinary(forceUpdate = false): Promise<string> {
    const binDir = path.join(app.getPath('userData'), 'bin')
    const binName = getBinaryName()
    const binPath = path.join(binDir, binName)

    const now = Date.now()
    let isStale = false

    if (existsSync(binPath)) {
        try {
            const stat = statSync(binPath)
            if (now - stat.mtimeMs > TWENTY_FOUR_HOURS_MS) {
                isStale = true
            }
        } catch {
            isStale = true
        }

        if (!isStale && !forceUpdate) {
            return binPath
        }
    }

    mkdirSync(binDir, { recursive: true })

    try {
        const url = getDownloadUrl()
        const res = await fetch(url)
        if (res.ok && res.body) {
            const buffer = Buffer.from(await res.arrayBuffer())
            const tmpPath = `${binPath}.tmp_${now}`
            const ws = createWriteStream(tmpPath)
            await new Promise((resolve, reject) => {
                ws.write(buffer, (err) => (err ? reject(err) : resolve(true)))
            })

            if (process.platform !== 'win32') {
                await chmod(tmpPath, 0o755).catch(() => undefined)
            }

            await rename(tmpPath, binPath).catch(() => undefined)
        }
    } catch {
        if (existsSync(binPath)) {
            return binPath
        }
        throw new Error('Failed to download yt-dlp binary')
    }

    return binPath
}

function getAria2BinaryName(): string {
    if (process.platform === 'win32') return 'aria2c.exe'
    return 'aria2c'
}

export async function ensureAria2Binary(): Promise<string | null> {
    const binDir = path.join(app.getPath('userData'), 'bin')
    const binName = getAria2BinaryName()
    const binPath = path.join(binDir, binName)

    if (existsSync(binPath)) {
        return binPath
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
            return sysPath
        }
    } catch {}

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
            return null
        }

        const res = await fetch(downloadUrl)
        if (!res.ok || !res.body) return null

        const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'
        const tmpArchive = path.join(binDir, `aria2_archive.${ext}`)
        const buffer = Buffer.from(await res.arrayBuffer())

        await new Promise((resolve, reject) => {
            const ws = createWriteStream(tmpArchive)
            ws.write(buffer, (err) => (err ? reject(err) : resolve(true)))
        })

        if (process.platform === 'win32') {
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
            return binPath
        }
    } catch {}

    return null
}

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function getAntiRateLimitArgs(
    win?: BrowserWindow | null,
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
        '--retries',
        '10',
        '--fragment-retries',
        '10',
        '--file-access-retries',
        '5',
    ]

    const aria2Path = await ensureAria2Binary()
    if (aria2Path) {
        args.push(
            '--external-downloader',
            aria2Path,
            '--external-downloader-args',
            'aria2c:-j 16 -x 16 -s 16 -k 1M',
        )
    } else {
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
        }
    } catch {}

    return args
}
