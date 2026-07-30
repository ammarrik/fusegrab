import type {
    ActiveDownloadState,
    DownloadOptions,
    YoutubeFormatInfo,
    YoutubeVideoInfo,
} from './types'
import type { BrowserWindow } from 'electron'

import ffmpegPath from 'ffmpeg-static'
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rename, rm } from 'node:fs/promises'

import { ensureYtDlpBinary, getAntiRateLimitArgs } from './binary'

export async function getYoutubeVideoInfo(
    url: string,
): Promise<YoutubeVideoInfo> {
    const cleanUrl = url.trim()
    if (!cleanUrl) {
        throw new Error('Invalid YouTube video URL')
    }

    const ytDlpPath = await ensureYtDlpBinary()
    const antiRateLimitArgs = await getAntiRateLimitArgs()

    const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
            ytDlpPath,
            [
                ...antiRateLimitArgs,
                '--no-playlist',
                '--dump-single-json',
                '--js-runtimes',
                'node',
                cleanUrl,
            ],
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
    onProcessStart: (proc: any) => void,
    onProcessEnd: () => void,
    updateState: (patch: Partial<ActiveDownloadState>) => void,
    startPower: () => void,
    stopPower: () => void,
): Promise<{ filePath: string; size: number }> {
    const { url, savePath, qualityItag, height } = options

    const cleanUrl = url.trim()
    const ytDlpPath = await ensureYtDlpBinary()
    const antiRateLimitArgs = await getAntiRateLimitArgs(win)

    const args: string[] = [
        ...antiRateLimitArgs,
        '--js-runtimes',
        'node',
        '--newline',
        '--merge-output-format',
        'mp4',
        '--postprocessor-args',
        'ffmpeg:-c copy',
        '--no-mtime',
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
            args.push(
                '-f',
                `bestvideo[height<=${targetHeight}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${targetHeight}]+bestaudio/best`,
            )
        } else {
            args.push(
                '-f',
                'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
            )
        }
    }

    args.push('-o', savePath, cleanUrl)

    startPower()
    updateState({
        isDownloading: true,
        downloadType: 'video',
        url: cleanUrl,
        progress: { downloadedBytes: 0, totalBytes: 0, percent: 0 },
        channelProgress: null,
    })

    const proc = spawn(ytDlpPath, args)
    onProcessStart(proc)
    const stderrLines: string[] = []

    // Weighted multi-stream progress tracking
    // Video+audio downloads report two separate 0-100% streams.
    // We weight them: stream 1 (video) = 0-80%, stream 2 (audio) = 80-95%,
    // merge/finalize = 95-100%. For audio-only: single stream = 0-100%.
    let currentStream = 0
    let lastRawPercent = 0
    let maxEmittedPercent = 0

    const streamWeights = isAudioOnly
        ? [{ start: 0, end: 100 }]
        : [
              { start: 0, end: 80 },   // video stream
              { start: 80, end: 95 },   // audio stream
          ]

    const computeWeightedPercent = (rawPercent: number): number => {
        const streamIndex = Math.min(currentStream, streamWeights.length - 1)
        const weight = streamWeights[streamIndex]
        const mapped =
            weight.start +
            (rawPercent / 100) * (weight.end - weight.start)
        return Math.max(maxEmittedPercent, Math.min(95, mapped))
    }

    return new Promise((resolve, reject) => {
        proc.stdout.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n')
            for (const line of lines) {
                // Detect stream switch via "Destination:" line
                if (line.includes('[download] Destination:')) {
                    if (currentStream > 0 || lastRawPercent > 50) {
                        currentStream++
                    }
                    lastRawPercent = 0
                    continue
                }

                if (line.includes('[download]')) {
                    // Detect merge phase
                    if (
                        line.includes('[Merger]') ||
                        line.includes('Merging') ||
                        line.includes('[ffmpeg]') ||
                        line.includes('Deleting original file')
                    ) {
                        maxEmittedPercent = Math.max(maxEmittedPercent, 99)
                        const p = {
                            downloadedBytes: 0,
                            totalBytes: 0,
                            percent: maxEmittedPercent,
                        }
                        updateState({ progress: p })
                        if (win && !win.isDestroyed()) {
                            win.webContents.send('youtube:progress', p)
                        }
                        continue
                    }

                    const match = line.match(/\[download\]\s+([\d.]+)%/)
                    if (match) {
                        const rawPercent = parseFloat(match[1])
                        if (!isNaN(rawPercent)) {
                            // Detect stream switch via large percent drop
                            if (
                                rawPercent < lastRawPercent - 20 &&
                                lastRawPercent > 50
                            ) {
                                currentStream++
                            }
                            lastRawPercent = rawPercent

                            const weightedPercent =
                                computeWeightedPercent(rawPercent)
                            maxEmittedPercent = weightedPercent

                            const p = {
                                downloadedBytes: 0,
                                totalBytes: 0,
                                percent: Math.round(weightedPercent * 10) / 10,
                            }
                            updateState({ progress: p })
                            if (win && !win.isDestroyed()) {
                                win.webContents.send('youtube:progress', p)
                            }
                        }
                    }
                }

                // Detect merge/ffmpeg lines outside [download] blocks
                if (
                    line.includes('[Merger]') ||
                    line.includes('[ffmpeg]') ||
                    line.includes('Deleting original file')
                ) {
                    maxEmittedPercent = Math.max(maxEmittedPercent, 99)
                    const p = {
                        downloadedBytes: 0,
                        totalBytes: 0,
                        percent: maxEmittedPercent,
                    }
                    updateState({ progress: p })
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('youtube:progress', p)
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
            stopPower()
            onProcessEnd()
            updateState({ isDownloading: false })
            await rm(savePath, { force: true }).catch(() => undefined)
            reject(err)
        })

        proc.on('close', async (code) => {
            stopPower()
            onProcessEnd()
            updateState({ isDownloading: false })
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
