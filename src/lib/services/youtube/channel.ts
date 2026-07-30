import type {
    ActiveDownloadState,
    ChannelProgressEvent,
    DownloadChannelOptions,
    YoutubeChannelInfo,
    YoutubeChannelVideoItem,
} from './types'
import type { BrowserWindow } from 'electron'

import ffmpegPath from 'ffmpeg-static'
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import { ensureYtDlpBinary, getAntiRateLimitArgs } from './binary'
import { scrapeChannelWithBrowser } from './channel-scraper'

export async function getYoutubeUrlType(
    url: string,
): Promise<'video' | 'channel'> {
    const cleanUrl = url.trim()
    if (!cleanUrl) {
        throw new Error('Invalid YouTube URL')
    }

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

    const ytDlpPath = await ensureYtDlpBinary()
    try {
        const antiRateLimitArgs = await getAntiRateLimitArgs()
        const stdout = await new Promise<string>((resolve, reject) => {
            execFile(
                ytDlpPath,
                [
                    ...antiRateLimitArgs,
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
    } catch {}

    return 'video'
}

interface ChannelCache {
    channelTitle: string
    videos: YoutubeChannelVideoItem[]
    hasMore: boolean
    timestamp: number
}

const channelVideoCache = new Map<string, ChannelCache>()
const CACHE_TTL_MS = 5 * 60 * 1000

export async function getYoutubeChannelPage(
    url: string,
    page = 1,
    limit = 10,
): Promise<YoutubeChannelInfo> {
    const cleanUrl = url.trim()
    if (!cleanUrl) {
        throw new Error('Invalid YouTube channel URL')
    }

    const skipCount = (page - 1) * limit
    const targetNeeded = Math.max((page + 4) * limit, 50)

    const now = Date.now()
    let cached = channelVideoCache.get(cleanUrl)
    if (cached && now - cached.timestamp > CACHE_TTL_MS) {
        channelVideoCache.delete(cleanUrl)
        cached = undefined
    }

    if (
        !cached ||
        (cached.videos.length < skipCount + limit && cached.hasMore)
    ) {
        const result = await scrapeChannelWithBrowser(cleanUrl, targetNeeded)
        if (result && result.videos.length > 0) {
            cached = {
                channelTitle: result.channelTitle,
                videos: result.videos,
                hasMore: result.hasMore,
                timestamp: Date.now(),
            }
            channelVideoCache.set(cleanUrl, cached)
        }
    }

    if (cached && cached.videos.length > 0) {
        const pageVideos = cached.videos.slice(skipCount, skipCount + limit)
        const hasMore =
            pageVideos.length > 0 &&
            (cached.hasMore || cached.videos.length > skipCount + limit)

        return {
            id: cleanUrl,
            title: cached.channelTitle || 'YouTube Channel',
            author: cached.channelTitle || 'YouTube',
            totalVideos: cached.videos.length,
            videos: pageVideos,
            hasMore,
            nextPage: page + 1,
        }
    }

    return getChannelPageViaYtDlp(cleanUrl, page, limit)
}

async function getChannelPageViaYtDlp(
    url: string,
    page: number,
    limit: number,
): Promise<YoutubeChannelInfo> {
    const ytDlpPath = await ensureYtDlpBinary()
    const start = (page - 1) * limit + 1
    const end = page * limit

    const antiRateLimitArgs = await getAntiRateLimitArgs()
    const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
            ytDlpPath,
            [
                ...antiRateLimitArgs,
                '--dump-single-json',
                '--flat-playlist',
                '--playlist-start',
                String(start),
                '--playlist-end',
                String(end),
                '--js-runtimes',
                'node',
                url,
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
        id: data.id || url,
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
    onProcessStart: (proc: any) => void,
    onProcessEnd: () => void,
    updateState: (patch: Partial<ActiveDownloadState>) => void,
    startPower: () => void,
    stopPower: () => void,
): Promise<void> {
    const { channelUrl, saveDir, qualityHeight, isAudioOnly } = options

    const cleanUrl = channelUrl.trim()
    if (!existsSync(saveDir)) {
        mkdirSync(saveDir, { recursive: true })
    }
    const ytDlpPath = await ensureYtDlpBinary()
    const antiRateLimitArgs = await getAntiRateLimitArgs(win)

    const args: string[] = [
        ...antiRateLimitArgs,
        '--js-runtimes',
        'node',
        '--newline',
        '--merge-output-format',
        'mp4',
        '--sleep-requests',
        '1',
        '--sleep-interval',
        '2',
        '--max-sleep-interval',
        '5',
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

    startPower()
    updateState({
        isDownloading: true,
        downloadType: 'channel',
        url: cleanUrl,
        progress: null,
        channelProgress: {
            currentItem: 0,
            totalItems: 0,
            percent: 0,
            status: 'downloading',
        },
    })

    const proc = spawn(ytDlpPath, args)
    onProcessStart(proc)

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
                        if (!isNaN(percent)) {
                            const cp: ChannelProgressEvent = {
                                currentItem,
                                totalItems,
                                percent: Math.min(100, percent),
                                videoTitle,
                                status: 'downloading',
                            }
                            updateState({ channelProgress: cp })
                            if (win && !win.isDestroyed()) {
                                win.webContents.send(
                                    'youtube:channel-progress',
                                    cp,
                                )
                            }
                        }
                    }
                }
            }
        })

        proc.on('error', (err) => {
            stopPower()
            onProcessEnd()
            updateState({ isDownloading: false })
            reject(err)
        })

        proc.on('close', (code) => {
            stopPower()
            onProcessEnd()
            updateState({ isDownloading: false })
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
