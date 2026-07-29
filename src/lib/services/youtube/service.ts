import type { BrowserWindow } from 'electron'
import { spawn, execFile } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { chmod, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import ffmpegPath from 'ffmpeg-static'

export interface YoutubeFormatInfo {
    qualityLabel: string
    container: string
    hasVideo: boolean
    hasAudio: boolean
    itag: number
    height?: number
    isAudioOnly?: boolean
}

export interface YoutubeVideoInfo {
    title: string
    thumbnail: string
    durationSeconds: number
    author: string
    url: string
    formats: YoutubeFormatInfo[]
}

export interface DownloadOptions {
    url: string
    savePath: string
    qualityItag?: number
    height?: number
}

function getBinaryName(): string {
    if (process.platform === 'win32') return 'yt-dlp.exe'
    if (process.platform === 'darwin') return 'yt-dlp_macos'
    return 'yt-dlp'
}

function getDownloadUrl(): string {
    const name = getBinaryName()
    return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${name}`
}

async function ensureYtDlpBinary(): Promise<string> {
    // Check local /tmp pre-downloaded binary first if running in dev
    if (process.platform === 'darwin' && existsSync('/tmp/yt-dlp_macos')) {
        return '/tmp/yt-dlp_macos'
    }

    const binDir = path.join(app.getPath('userData'), 'bin')
    const binName = getBinaryName()
    const binPath = path.join(binDir, binName)

    if (existsSync(binPath)) {
        return binPath
    }

    mkdirSync(binDir, { recursive: true })

    const url = getDownloadUrl()
    const res = await fetch(url)
    if (!res.ok || !res.body) {
        throw new Error(`Failed to download yt-dlp binary: ${res.statusText}`)
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    const ws = createWriteStream(binPath)
    await new Promise((resolve, reject) => {
        ws.write(buffer, (err) => (err ? reject(err) : resolve(true)))
    })

    if (process.platform !== 'win32') {
        await chmod(binPath, 0o755)
    }

    return binPath
}

export async function getYoutubeVideoInfo(
    url: string,
): Promise<YoutubeVideoInfo> {
    const cleanUrl = url.trim()
    if (!cleanUrl) {
        throw new Error('Invalid YouTube video URL')
    }

    const ytDlpPath = await ensureYtDlpBinary()

    const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
            ytDlpPath,
            ['--dump-json', '--js-runtimes', 'node', cleanUrl],
            { maxBuffer: 50 * 1024 * 1024 },
            (err, out) => {
                if (err)
                    return reject(
                        new Error(err.message || 'Failed to fetch YouTube video info'),
                    )
                resolve(out)
            },
        )
    })

    const data = JSON.parse(stdout)
    const seenHeights = new Set<number>()
    const formats: YoutubeFormatInfo[] = []

    if (Array.isArray(data.formats)) {
        const videoFormats = data.formats
            .filter((f: any) => f.vcodec !== 'none' && f.height)
            .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))

        for (const f of videoFormats) {
            const h = f.height
            if (h && !seenHeights.has(h)) {
                seenHeights.add(h)
                const label = `${h}p${f.fps > 30 ? f.fps : ''}`
                formats.push({
                    qualityLabel: label,
                    container: 'mp4',
                    hasVideo: true,
                    hasAudio: f.acodec !== 'none',
                    itag: h,
                    height: h,
                })
            }
        }
    }

    formats.push({
        qualityLabel: 'Audio Only (MP3)',
        container: 'mp3',
        hasVideo: false,
        hasAudio: true,
        itag: -1,
        isAudioOnly: true,
    })

    return {
        title: data.title || 'YouTube Video',
        thumbnail:
            data.thumbnail ||
            `https://i.ytimg.com/vi/${data.id}/maxresdefault.jpg`,
        durationSeconds: Math.round(data.duration || 0),
        author: data.uploader || data.channel || 'YouTube',
        url: data.webpage_url || cleanUrl,
        formats:
            formats.length > 0
                ? formats
                : [
                      {
                          qualityLabel: '720p',
                          container: 'mp4',
                          hasVideo: true,
                          hasAudio: true,
                          itag: 720,
                          height: 720,
                      },
                  ],
    }
}

export async function downloadYoutubeVideo(
    win: BrowserWindow | null,
    options: DownloadOptions,
): Promise<{ filePath: string; size: number }> {
    const { url, savePath, qualityItag, height } = options

    const cleanUrl = url.trim()
    const ytDlpPath = await ensureYtDlpBinary()

    const args: string[] = [
        '--js-runtimes',
        'node',
        '--newline',
        '--merge-output-format',
        'mp4',
    ]

    if (ffmpegPath && existsSync(ffmpegPath)) {
        args.push('--ffmpeg-location', ffmpegPath)
    }

    const isAudioOnly =
        qualityItag === -1 || savePath.toLowerCase().endsWith('.mp3')

    if (isAudioOnly) {
        args.push('-f', 'bestaudio', '-x', '--audio-format', 'mp3')
    } else {
        const targetHeight =
            height ||
            (typeof qualityItag === 'number' && qualityItag > 0
                ? qualityItag
                : null)
        if (targetHeight) {
            args.push('-f', `bestvideo[height<=${targetHeight}]+bestaudio/best`)
        } else {
            args.push('-f', 'bestvideo+bestaudio/best')
        }
    }

    args.push('-o', savePath, cleanUrl)

    const proc = spawn(ytDlpPath, args)
    const stderrLines: string[] = []

    return new Promise((resolve, reject) => {
        proc.stdout.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n')
            for (const line of lines) {
                if (line.includes('[download]')) {
                    const match = line.match(/\[download\]\s+([\d\.]+)%/)
                    if (match) {
                        const percent = parseFloat(match[1])
                        if (!isNaN(percent)) {
                            if (win && !win.isDestroyed()) {
                                win.webContents.send('youtube:progress', {
                                    downloadedBytes: 0,
                                    totalBytes: 0,
                                    percent: Math.min(100, percent),
                                })
                            }
                        }
                    }
                }
            }
        })

        proc.stderr.on('data', (data: Buffer) => {
            const str = data.toString()
            if (!str.includes('WARNING:')) {
                stderrLines.push(str.trim())
            }
        })

        proc.on('error', async (err) => {
            await rm(savePath, { force: true }).catch(() => undefined)
            reject(err)
        })

        proc.on('close', async (code) => {
            let finalPath = savePath
            if (!existsSync(finalPath)) {
                const candidates = [
                    savePath + '.mp4',
                    savePath + '.mkv',
                    savePath + '.webm',
                    savePath.replace(/\.mp4$/i, '.mkv'),
                    savePath.replace(/\.mp4$/i, '.webm'),
                ]
                for (const c of candidates) {
                    if (existsSync(c)) {
                        await rename(c, savePath).catch(() => {
                            finalPath = c
                        })
                        if (existsSync(savePath)) finalPath = savePath
                        break
                    }
                }
            }

            if (code === 0 && existsSync(finalPath)) {
                if (win && !win.isDestroyed()) {
                    win.webContents.send('youtube:progress', {
                        downloadedBytes: 100,
                        totalBytes: 100,
                        percent: 100,
                    })
                }
                resolve({ filePath: finalPath, size: 0 })
            } else {
                await rm(savePath, { force: true }).catch(() => undefined)
                const errMsg =
                    stderrLines.length > 0
                        ? stderrLines.slice(-3).join(' ')
                        : `Video download failed with exit code ${code}`
                reject(new Error(errMsg))
            }
        })
    })
}
