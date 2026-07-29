import type {
    YoutubeChannelVideoItem,
    YoutubeVideoInfo,
} from '#/lib/services/youtube/service'

import { useState } from 'react'

import { Check, Download, Loader2 } from '#/components/icons'
import { Button } from '#/components/ui/button'
import { ProgressBar } from '#/components/ui/progress'
import { Select } from '#/components/ui/select'

function formatSeconds(seconds: number): string {
    if (!seconds || seconds <= 0) return ''
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
}

function sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '').trim() || 'youtube-video'
}

export interface VideoCardProps {
    info: YoutubeVideoInfo
    selectedItag?: number
    onSelectItag: (itag: number) => void
    isDownloading: boolean
    progress: {
        downloadedBytes: number
        totalBytes: number
        percent: number
    } | null
    downloadedPath: string | null
    onDownload: () => void
}

export function VideoCard({
    info,
    selectedItag,
    onSelectItag,
    isDownloading,
    progress,
    downloadedPath,
    onDownload,
}: VideoCardProps) {
    return (
        <div className="w-full space-y-3">
            {/* Full-width 16:9 Thumbnail with Top-Right Single White Badge */}
            {info.thumbnail && (
                <div className="border-border/20 relative aspect-video w-full overflow-hidden rounded-2xl border bg-black/5">
                    <img
                        src={info.thumbnail}
                        alt={info.title}
                        className="h-full w-full object-cover"
                    />

                    {/* Top Right Single White Badge Container for Resolution & Download */}
                    <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-white p-1 text-zinc-900 shadow-[0_0_6px_rgba(0,0,0,0.08)]">
                        {info.formats.length > 0 && !isDownloading && (
                            <Select
                                value={
                                    selectedItag !== undefined
                                        ? String(selectedItag)
                                        : ''
                                }
                                options={info.formats.map((f) => ({
                                    value: String(f.itag),
                                    label: f.qualityLabel,
                                }))}
                                onValueChange={(val) =>
                                    onSelectItag(Number(val))
                                }
                                sideOffset={8}
                                aria-label="Select resolution"
                                className="h-7 rounded-full border-none bg-transparent px-2 text-xs font-semibold text-zinc-900 shadow-none transition-colors hover:bg-zinc-100"
                            />
                        )}

                        <button
                            type="button"
                            onClick={onDownload}
                            disabled={isDownloading}
                            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                            title="Download Video"
                            aria-label="Download Video"
                        >
                            {isDownloading ? (
                                <Loader2 className="size-3.5 animate-spin text-white" />
                            ) : (
                                <Download className="size-3.5 text-white" />
                            )}
                        </button>
                    </div>

                    {/* Duration Badge Overlay */}
                    {info.durationSeconds > 0 && (
                        <div className="absolute right-3 bottom-3 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[11px] font-medium text-white shadow-sm backdrop-blur-xs">
                            {formatSeconds(info.durationSeconds)}
                        </div>
                    )}
                </div>
            )}

            {/* Video Metadata (Title & Author) */}
            <div className="space-y-1 px-0.5">
                <h3 className="text-foreground line-clamp-2 text-base leading-snug font-semibold">
                    {info.title}
                </h3>
                <p className="text-muted-foreground text-xs font-medium">
                    {info.author}
                </p>
            </div>

            {/* Download Progress Bar */}
            {isDownloading && (
                <div className="space-y-1.5 pt-1">
                    <ProgressBar value={(progress?.percent ?? 0) / 100} />
                    <div className="text-muted-foreground flex items-center justify-between font-mono text-[11px]">
                        <span>Downloading...</span>
                        <span>{progress?.percent ?? 0}%</span>
                    </div>
                </div>
            )}

            {/* Download Completion State */}
            {downloadedPath && (
                <div className="border-success/30 bg-success/10 text-success flex items-center justify-between rounded-xl border p-3 text-xs">
                    <div className="flex items-center space-x-2">
                        <Check className="text-success size-4 shrink-0" />
                        <span className="font-medium">
                            Saved automatically!
                        </span>
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.files.reveal(downloadedPath)}
                    >
                        Reveal in Folder
                    </Button>
                </div>
            )}
        </div>
    )
}

export interface ChannelVideoCardProps {
    video: YoutubeChannelVideoItem
    downloadDir: string
}

export function ChannelVideoCard({
    video,
    downloadDir,
}: ChannelVideoCardProps) {
    const [selectedQualityHeight, setSelectedQualityHeight] = useState<
        number | null
    >(null)
    const [isDownloading, setIsDownloading] = useState(false)
    const [progressPercent, setProgressPercent] = useState<number | null>(null)
    const [downloadedPath, setDownloadedPath] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleDownload = async () => {
        setIsDownloading(true)
        setProgressPercent(0)
        setError(null)
        setDownloadedPath(null)

        try {
            let targetDir = downloadDir
            if (!targetDir) {
                targetDir = await window.files.getDefaultDownloadDir()
            }

            const isAudioOnly = selectedQualityHeight === -1
            const ext = isAudioOnly ? 'mp3' : 'mp4'
            const filename = `${sanitizeFilename(video.title)} [${video.id}].${ext}`
            const savePath =
                targetDir.endsWith('/') || targetDir.endsWith('\\')
                    ? `${targetDir}${filename}`
                    : `${targetDir}/${filename}`

            const unsub = window.api.youtube.onProgress((p) => {
                setProgressPercent(p.percent)
            })

            const height =
                selectedQualityHeight && selectedQualityHeight > 0
                    ? selectedQualityHeight
                    : undefined

            const res = await window.api.youtube.download({
                url: video.url,
                savePath,
                height,
            })

            unsub()
            setDownloadedPath(res.filePath)
        } catch (err: any) {
            setError(err?.message || 'Download failed')
        } finally {
            setIsDownloading(false)
            setProgressPercent(null)
        }
    }

    return (
        <div className="w-full space-y-2.5">
            {/* 16:9 Thumbnail with Top-Right Single White Badge */}
            <div className="border-border/20 relative aspect-video w-full overflow-hidden rounded-xl border bg-black/5">
                {video.thumbnail ? (
                    <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="bg-muted text-muted-foreground flex h-full w-full items-center justify-center text-xs">
                        No Preview
                    </div>
                )}

                {/* Top Right Single White Badge Container for Resolution & Download */}
                <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-white p-1 text-zinc-900 shadow-[0_0_6px_rgba(0,0,0,0.08)]">
                    {!isDownloading && !downloadedPath && (
                        <Select
                            value={
                                selectedQualityHeight !== null
                                    ? String(selectedQualityHeight)
                                    : 'best'
                            }
                            options={[
                                { value: 'best', label: 'Best' },
                                { value: '1080', label: '1080p' },
                                { value: '720', label: '720p' },
                                { value: '480', label: '480p' },
                                { value: '-1', label: 'Audio' },
                            ]}
                            onValueChange={(val) =>
                                setSelectedQualityHeight(
                                    val === 'best' ? null : Number(val),
                                )
                            }
                            sideOffset={8}
                            aria-label="Select resolution"
                            className="h-6.5 rounded-full border-none bg-transparent px-2 text-[11px] font-semibold text-zinc-900 shadow-none transition-colors hover:bg-zinc-100"
                        />
                    )}

                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={isDownloading || Boolean(downloadedPath)}
                        className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-all hover:bg-zinc-800 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                        title={downloadedPath ? 'Downloaded' : 'Download Video'}
                        aria-label="Download Video"
                    >
                        {isDownloading ? (
                            <Loader2 className="size-3 animate-spin text-white" />
                        ) : downloadedPath ? (
                            <Check className="size-3 text-emerald-400" />
                        ) : (
                            <Download className="size-3 text-white" />
                        )}
                    </button>
                </div>

                {/* Duration Badge Overlay */}
                {video.durationSeconds > 0 && (
                    <div className="absolute right-2.5 bottom-2.5 rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white shadow-sm backdrop-blur-xs">
                        {formatSeconds(video.durationSeconds)}
                    </div>
                )}
            </div>

            {/* Video Metadata (Title & Author) */}
            <div className="space-y-0.5 px-0.5">
                <h4
                    className="text-foreground line-clamp-2 text-sm leading-snug font-semibold"
                    title={video.title}
                >
                    {video.title}
                </h4>
                <p className="text-muted-foreground text-xs font-medium">
                    {video.author}
                </p>
            </div>

            {/* Download Progress Bar */}
            {isDownloading && progressPercent !== null && (
                <div className="space-y-1 pt-0.5">
                    <ProgressBar value={progressPercent / 100} />
                    <div className="text-muted-foreground flex items-center justify-between font-mono text-[10px]">
                        <span>Downloading...</span>
                        <span>{Math.round(progressPercent)}%</span>
                    </div>
                </div>
            )}

            {/* Download Completion State */}
            {downloadedPath && (
                <div className="border-success/30 bg-success/10 text-success flex items-center justify-between rounded-xl border p-2.5 text-xs">
                    <div className="flex items-center space-x-1.5">
                        <Check className="text-success size-3.5 shrink-0" />
                        <span className="font-medium">
                            Saved automatically!
                        </span>
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.files.reveal(downloadedPath)}
                        className="h-6 px-2 text-[11px]"
                    >
                        Reveal in Folder
                    </Button>
                </div>
            )}

            {error && (
                <p className="line-clamp-1 text-[10px] font-medium text-rose-500">
                    {error}
                </p>
            )}
        </div>
    )
}
