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

/**
 * Normalises a YouTube channel/playlist URL so it points at the /videos tab.
 * Playlist URLs (list=…) are returned as-is since they don't have a /videos tab.
 */
function toChannelVideosUrl(raw: string): string {
    if (raw.includes('list=')) return raw
    const base = raw
        .replace(/\/(videos|shorts|streams|playlists|community|about|channels)\s*$/i, '')
        .replace(/\/+$/, '')
    return `${base}/videos`
}

/**
 * Parses a YouTube duration string like "12:34" or "1:02:03" into seconds.
 */
function parseDurationText(text: string): number {
    if (!text) return 0
    const clean = text.replace(/\s/g, '')
    const parts = clean.split(':').map(Number)
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return parts[0] || 0
}


// ─── Browser-based channel video scraping ─────────────────────────────────────

interface ChannelCache {
    channelTitle: string
    videos: YoutubeChannelVideoItem[]
    hasMore: boolean
    timestamp: number
}

const channelVideoCache = new Map<string, ChannelCache>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Scrapes channel videos using a hidden BrowserWindow.
 *
 * Uses a persistent session partition so YouTube consent cookies are
 * remembered across scrapes. Auto-dismisses consent dialogs if they appear.
 * Does NOT use offscreen: true (which cripples IntersectionObserver) or
 * sandbox: true (which can block network in custom partitions).
 */
async function scrapeChannelWithBrowser(
    url: string,
    targetNeeded: number,
): Promise<{ channelTitle: string; videos: YoutubeChannelVideoItem[]; hasMore: boolean } | null> {
    const { BrowserWindow, session } = await import('electron')

    const targetUrl = toChannelVideosUrl(url)

    // Persistent partition so YouTube consent cookies survive between scrapes
    const ses = session.fromPartition('persist:yt-scraper')

    const win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: {
            backgroundThrottling: false,
            session: ses,
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    win.webContents.setAudioMuted(true)
    win.webContents.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    )

    try {
        await win.loadURL(targetUrl)

        // Auto-dismiss YouTube consent dialog if present.
        await win.webContents.executeJavaScript(`
            new Promise((resolve) => {
                const dismiss = () => {
                    const consentBtn =
                        document.querySelector('button[aria-label*="Accept"], button[aria-label*="accept"], tp-yt-paper-button[aria-label*="Accept"]') ||
                        document.querySelector('form[action*="consent"] button') ||
                        document.querySelector('[class*="consent"] button:last-child') ||
                        document.querySelector('ytd-consent-bump-v2-lightbox button.yt-spec-button-shape-next--filled');
                    if (consentBtn) {
                        consentBtn.click();
                        setTimeout(resolve, 2000);
                    } else {
                        resolve(true);
                    }
                };
                setTimeout(dismiss, 1500);
            });
        `)

        // Wait for video elements to render
        const hasVideos = await win.webContents.executeJavaScript(`
            new Promise((resolve) => {
                let attempts = 0;
                const check = () => {
                    const items = Array.from(document.querySelectorAll(
                        'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-playlist-video-renderer'
                    )).filter(item => {
                        const link = item.querySelector('a[href*="watch?v="], a[href*="/shorts/"]');
                        if (!link) return false;
                        const href = link.getAttribute('href') || link.href || '';
                        return /(?:watch\\?v=|\\/shorts\\/)([a-zA-Z0-9_-]{11})/.test(href);
                    });

                    if (items.length > 0) {
                        resolve(true);
                        return;
                    }
                    if (attempts > 60) {
                        resolve(false);
                        return;
                    }
                    attempts++;
                    setTimeout(check, 500);
                };
                check();
            });
        `)

        if (!hasVideos) {
            return null
        }

        // Scroll down to load videos up to targetNeeded.
        // Returns whether more videos exist on YouTube ({ count, reachedEnd })
        const scrollResult = await win.webContents.executeJavaScript(`
            new Promise((resolve) => {
                const totalNeeded = ${targetNeeded};
                let lastCount = 0;
                let stale = 0;
                let scrollAttempts = 0;

                const doScroll = () => {
                    const items = Array.from(document.querySelectorAll(
                        'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-playlist-video-renderer'
                    )).filter(item => {
                        const link = item.querySelector('a[href*="watch?v="], a[href*="/shorts/"]');
                        if (!link) return false;
                        const href = link.getAttribute('href') || link.href || '';
                        return /(?:watch\\?v=|\\/shorts\\/)([a-zA-Z0-9_-]{11})/.test(href);
                    });
                    const count = items.length;

                    if (count >= totalNeeded) {
                        resolve({ count, reachedEnd: false });
                        return;
                    }

                    if (scrollAttempts >= 60) {
                        resolve({ count, reachedEnd: false });
                        return;
                    }

                    if (count === lastCount) {
                        stale++;
                        if (stale >= 5) {
                            resolve({ count, reachedEnd: true });
                            return;
                        }
                    } else {
                        stale = 0;
                        lastCount = count;
                    }

                    scrollAttempts++;

                    const continuation = document.querySelector(
                        'ytd-continuation-item-renderer, tp-yt-paper-spinner'
                    );
                    if (continuation) {
                        continuation.scrollIntoView({ behavior: 'instant', block: 'center' });
                    }
                    window.scrollTo(0, 999999);
                    window.dispatchEvent(new Event('scroll', { bubbles: true }));

                    setTimeout(doScroll, 1200);
                };

                setTimeout(doScroll, 800);
            });
        `)

        // Scrape video data from the DOM
        const scraped = await win.webContents.executeJavaScript(`
            (() => {
                const channelTitle = (
                    document.querySelector('yt-formatted-string#text.ytd-channel-name')?.textContent ||
                    document.querySelector('#channel-name yt-formatted-string')?.textContent ||
                    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                    ''
                ).trim();

                const rawItems = Array.from(document.querySelectorAll(
                    'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-playlist-video-renderer'
                ));

                const videos = [];
                const seen = new Set();

                rawItems.forEach(item => {
                    try {
                        const link = item.querySelector('a[href*="watch?v="], a[href*="/shorts/"]');
                        if (!link) return;
                        const href = link.getAttribute('href') || link.href || '';
                        const match = href.match(/(?:watch\\?v=|\\/shorts\\/)([a-zA-Z0-9_-]{11})/);
                        if (!match) return;
                        const videoId = match[1];
                        if (seen.has(videoId)) return;

                        const titleEl = item.querySelector('#video-title-link, #video-title, h3, yt-formatted-string#video-title') || link;
                        const title = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
                        if (!title || title.toLowerCase().includes(' - videos') || title.toLowerCase().includes(' - shorts')) return;

                        seen.add(videoId);

                        let thumbnail = '';
                        const thumbEl = item.querySelector('ytd-thumbnail img, img#img, img.yt-core-image');
                        if (thumbEl) {
                            thumbnail = thumbEl.src || thumbEl.getAttribute('src') || '';
                        }
                        if (!thumbnail || thumbnail.startsWith('data:')) {
                            thumbnail = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
                        }

                        const durationEl = item.querySelector(
                            'ytd-thumbnail-overlay-time-status-renderer #text,' +
                            'ytd-thumbnail-overlay-time-status-renderer span, badge-shape .badge-shape-wiz__text'
                        );
                        const durationText = (durationEl?.textContent || '').trim();

                        const authorEl = item.querySelector('ytd-channel-name #text a, ytd-channel-name a');
                        const author = (authorEl?.textContent || channelTitle || 'YouTube').trim();

                        videos.push({
                            id: videoId,
                            title: title || 'Untitled Video',
                            url: 'https://www.youtube.com/watch?v=' + videoId,
                            thumbnail,
                            durationText,
                            author,
                        });
                    } catch {}
                });

                return { channelTitle, videos };
            })();
        `)

        if (!scraped || !Array.isArray(scraped.videos) || scraped.videos.length === 0) {
            return null
        }

        const allVideos: YoutubeChannelVideoItem[] = scraped.videos.map(
            (v: any) => ({
                id: v.id,
                title: v.title,
                url: v.url,
                thumbnail: v.thumbnail,
                durationSeconds: parseDurationText(v.durationText || ''),
                author: v.author,
            }),
        )

        const reachedEnd = scrollResult?.reachedEnd ?? false

        return {
            channelTitle: scraped.channelTitle || 'YouTube Channel',
            videos: allVideos,
            hasMore: !reachedEnd,
        }
    } catch {
        return null
    } finally {
        try {
            win.destroy()
        } catch {}
    }
}

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

    // 1. Check in-memory cache
    const now = Date.now()
    let cached = channelVideoCache.get(cleanUrl)
    if (cached && now - cached.timestamp > CACHE_TTL_MS) {
        channelVideoCache.delete(cleanUrl)
        cached = undefined
    }

    // 2. If we don't have enough cached videos for this page and YouTube has more, scrape
    if (!cached || (cached.videos.length < skipCount + limit && cached.hasMore)) {
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

    // 3. Serve from cache if available
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

    // 4. Fallback to yt-dlp
    return getChannelPageViaYtDlp(cleanUrl, page, limit)
}

/**
 * Fallback: uses yt-dlp --flat-playlist to list channel videos.
 */
async function getChannelPageViaYtDlp(
    url: string,
    page: number,
    limit: number,
): Promise<YoutubeChannelInfo> {
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
