import type { BrowserWindow } from 'electron'
import type { ChildProcess } from 'node:child_process'

import { app } from 'electron'
import ffmpegPath from 'ffmpeg-static'
import { execFile, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { chmod, rename, rm } from 'node:fs/promises'
import path from 'node:path'

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

export interface YoutubeChannelVideoItem {
    id: string
    title: string
    url: string
    thumbnail: string
    durationSeconds: number
    author: string
}

export interface YoutubeChannelInfo {
    id: string
    title: string
    author: string
    totalVideos: number
    videos: YoutubeChannelVideoItem[]
    hasMore: boolean
    nextPage: number
}

export interface DownloadOptions {
    url: string
    savePath: string
    qualityItag?: number
    height?: number
}

export interface DownloadChannelOptions {
    channelUrl: string
    saveDir: string
    qualityHeight?: number
    isAudioOnly?: boolean
}

export interface ChannelProgressEvent {
    currentItem: number
    totalItems: number
    percent: number
    videoTitle?: string
    status: 'downloading' | 'completed' | 'cancelled' | 'error'
}

let activeChildProcess: ChildProcess | null = null

export function cancelYoutubeDownload() {
    if (activeChildProcess) {
        try {
            activeChildProcess.kill('SIGTERM')
        } catch {
            // ignore
        }
        activeChildProcess = null
    }
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

export async function getYoutubeUrlType(
    url: string,
): Promise<'video' | 'channel'> {
    const cleanUrl = url.trim()
    if (!cleanUrl) {
        throw new Error('Invalid YouTube URL')
    }

    // Upfront URL pattern checks for fast response
    if (
        cleanUrl.includes('/@') ||
        cleanUrl.includes('/channel/') ||
        cleanUrl.includes('/c/') ||
        cleanUrl.includes('/user/') ||
        cleanUrl.includes('list=')
    ) {
        return 'channel'
    }

    if (
        cleanUrl.includes('/watch?v=') ||
        cleanUrl.includes('youtu.be/') ||
        cleanUrl.includes('/shorts/')
    ) {
        return 'video'
    }

    // Fallback probe with yt-dlp
    const ytDlpPath = await ensureYtDlpBinary()
    try {
        const stdout = await new Promise<string>((resolve, reject) => {
            execFile(
                ytDlpPath,
                [
                    '--dump-single-json',
                    '--flat-playlist',
                    '--playlist-start',
                    '1',
                    '--playlist-end',
                    '1',
                    '--js-runtimes',
                    'node',
                    cleanUrl,
                ],
                { maxBuffer: 50 * 1024 * 1024 },
                (err, out) => {
                    if (err) return reject(err)
                    resolve(out)
                },
            )
        })

        const data = JSON.parse(stdout)
        if (
            data._type === 'playlist' ||
            Array.isArray(data.entries) ||
            data.playlist_count
        ) {
            return 'channel'
        }
    } catch {
        // Default to video if probe fails
    }

    return 'video'
}

export async function getYoutubeChannelPage(
    url: string,
    page = 1,
    limit = 20,
): Promise<YoutubeChannelInfo> {
    const cleanUrl = url.trim()
    if (!cleanUrl) {
        throw new Error('Invalid YouTube channel URL')
    }

    const ytDlpPath = await ensureYtDlpBinary()
    const start = (page - 1) * limit + 1
    const end = page * limit

    const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
            ytDlpPath,
            [
                '--dump-single-json',
                '--flat-playlist',
                '--playlist-start',
                String(start),
                '--playlist-end',
                String(end),
                '--js-runtimes',
                'node',
                cleanUrl,
            ],
            { maxBuffer: 50 * 1024 * 1024 },
            (err, out) => {
                if (err)
                    return reject(
                        new Error(
                            err.message ||
                                'Failed to fetch YouTube channel info',
                        ),
                    )
                resolve(out)
            },
        )
    })

    const data = JSON.parse(stdout)
    const rawEntries = Array.isArray(data.entries) ? data.entries : []
    const totalVideos =
        data.playlist_count || data.n_entries || rawEntries.length

    const videos: YoutubeChannelVideoItem[] = rawEntries.map((e: any) => {
        const videoId = e.id || e.url?.replace(/.*v=/, '') || ''
        let thumb = ''
        if (Array.isArray(e.thumbnails) && e.thumbnails.length > 0) {
            thumb = e.thumbnails[e.thumbnails.length - 1].url
        } else if (videoId) {
            thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        }

        const videoUrl = e.url
            ? e.url.startsWith('http')
                ? e.url
                : `https://www.youtube.com/watch?v=${e.url}`
            : `https://www.youtube.com/watch?v=${videoId}`

        return {
            id: videoId,
            title: e.title || 'Untitled Video',
            url: videoUrl,
            thumbnail: thumb,
            durationSeconds: Math.round(e.duration || 0),
            author:
                e.uploader ||
                e.channel ||
                data.uploader ||
                data.channel ||
                data.title ||
                'YouTube',
        }
    })

    const hasMore = rawEntries.length >= limit || totalVideos > end

    return {
        id: data.id || cleanUrl,
        title: data.title || data.uploader || 'YouTube Channel',
        author: data.uploader || data.channel || 'YouTube',
        totalVideos: totalVideos || videos.length,
        videos,
        hasMore,
        nextPage: page + 1,
    }
}

export async function downloadYoutubeChannel(
    win: BrowserWindow | null,
    options: DownloadChannelOptions,
): Promise<void> {
    const { channelUrl, saveDir, qualityHeight, isAudioOnly } = options

    const cleanUrl = channelUrl.trim()
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

    if (isAudioOnly) {
        args.push('-f', 'bestaudio', '-x', '--audio-format', 'mp3')
    } else if (qualityHeight) {
        args.push('-f', `bestvideo[height<=${qualityHeight}]+bestaudio/best`)
    } else {
        args.push('-f', 'bestvideo+bestaudio/best')
    }

    const outputTemplate = path.join(saveDir, '%(title)s [%(id)s].%(ext)s')
    args.push('-o', outputTemplate, cleanUrl)

    cancelYoutubeDownload()

    const proc = spawn(ytDlpPath, args)
    activeChildProcess = proc

    let currentItem = 0
    let totalItems = 0
    let videoTitle = ''

    return new Promise((resolve, reject) => {
        proc.stdout.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n')
            for (const line of lines) {
                const itemMatch = line.match(
                    /\[download\]\s+Downloading\s+(?:item|video)\s+(\d+)\s+of\s+(\d+)/i,
                )
                if (itemMatch) {
                    currentItem = parseInt(itemMatch[1], 10)
                    totalItems = parseInt(itemMatch[2], 10)
                }

                const destMatch = line.match(
                    /\[download\]\s+Destination:\s+(.+)/i,
                )
                if (destMatch) {
                    videoTitle = path.basename(destMatch[1])
                }

                if (line.includes('[download]')) {
                    const match = line.match(/\[download\]\s+([\d.]+)%/)
                    if (match) {
                        const percent = parseFloat(match[1])
                        if (!isNaN(percent) && win && !win.isDestroyed()) {
                            win.webContents.send('youtube:channel-progress', {
                                currentItem,
                                totalItems,
                                percent: Math.min(100, percent),
                                videoTitle,
                                status: 'downloading',
                            } satisfies ChannelProgressEvent)
                        }
                    }
                }
            }
        })

        proc.on('error', (err) => {
            activeChildProcess = null
            reject(err)
        })

        proc.on('close', (code) => {
            activeChildProcess = null
            if (code === 0) {
                if (win && !win.isDestroyed()) {
                    win.webContents.send('youtube:channel-progress', {
                        currentItem: totalItems || currentItem,
                        totalItems: totalItems || currentItem,
                        percent: 100,
                        videoTitle,
                        status: 'completed',
                    } satisfies ChannelProgressEvent)
                }
                resolve()
            } else {
                reject(new Error(`Channel download exited with code ${code}`))
            }
        })
    })
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
                        new Error(
                            err.message || 'Failed to fetch YouTube video info',
                        ),
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

    cancelYoutubeDownload()

    const proc = spawn(ytDlpPath, args)
    activeChildProcess = proc
    const stderrLines: string[] = []

    return new Promise((resolve, reject) => {
        proc.stdout.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n')
            for (const line of lines) {
                if (line.includes('[download]')) {
                    const match = line.match(/\[download\]\s+([\d.]+)%/)
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
            activeChildProcess = null
            await rm(savePath, { force: true }).catch(() => undefined)
            reject(err)
        })

        proc.on('close', async (code) => {
            activeChildProcess = null
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
