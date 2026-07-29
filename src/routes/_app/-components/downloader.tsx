import type { YoutubeVideoInfo } from '#/lib/services/youtube/service'

import { useEffect, useState } from 'react'

import {
    Folder,
    FolderOpen,
    Loader2,
    Plus,
    RefreshCw,
    Send,
} from '#/components/icons'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '#/components/ui/popover'

import { VideoCard } from './video-card'

function sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '').trim() || 'youtube-video'
}

export function YoutubeDownloader() {
    const [url, setUrl] = useState('')
    const [loadingInfo, setLoadingInfo] = useState(false)
    const [info, setInfo] = useState<YoutubeVideoInfo | null>(null)
    const [selectedItag, setSelectedItag] = useState<number | undefined>(
        undefined,
    )
    const [error, setError] = useState<string | null>(null)

    const [isDownloading, setIsDownloading] = useState(false)
    const [progress, setProgress] = useState<{
        downloadedBytes: number
        totalBytes: number
        percent: number
    } | null>(null)

    const [downloadedPath, setDownloadedPath] = useState<string | null>(null)

    // Save Directory & Dropdown State
    const [downloadDir, setDownloadDir] = useState<string>('')
    const [showFolderDropdown, setShowFolderDropdown] = useState(false)

    useEffect(() => {
        const savedDir = localStorage.getItem('yt_download_dir')
        if (savedDir) {
            setDownloadDir(savedDir)
        } else {
            window.files.getDefaultDownloadDir().then((def) => {
                if (def) setDownloadDir(def)
            })
        }

        const off = window.api.youtube.onProgress((p) => {
            setProgress(p)
        })

        return () => {
            off()
        }
    }, [])

    const handleFetchInfo = async (targetUrl: string) => {
        const clean = targetUrl.trim()
        if (!clean) {
            setInfo(null)
            setError(null)
            return
        }

        setLoadingInfo(true)
        setError(null)
        setInfo(null)
        setDownloadedPath(null)

        try {
            const data = await window.api.youtube.getInfo(clean)
            setInfo(data)
            if (data.formats.length > 0) {
                setSelectedItag(data.formats[0].itag)
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to fetch YouTube video info')
        } finally {
            setLoadingInfo(false)
        }
    }

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setUrl(val)
        if (val.includes('youtube.com/') || val.includes('youtu.be/')) {
            handleFetchInfo(val)
        }
    }

    const handleBrowseDirectory = async () => {
        const selected = await window.files.chooseDirectory(downloadDir)
        if (selected) {
            setDownloadDir(selected)
            localStorage.setItem('yt_download_dir', selected)
        }
    }

    const handleResetDirectory = async () => {
        const def = await window.files.getDefaultDownloadDir()
        setDownloadDir(def)
        localStorage.removeItem('yt_download_dir')
    }

    const handleDownload = async () => {
        let videoInfo = info
        if (!videoInfo) {
            if (!url.trim()) return
            setLoadingInfo(true)
            setError(null)
            try {
                videoInfo = await window.api.youtube.getInfo(url.trim())
                setInfo(videoInfo)
                if (videoInfo.formats.length > 0) {
                    setSelectedItag(videoInfo.formats[0].itag)
                }
            } catch (err: any) {
                setError(err?.message || 'Failed to fetch video info')
                setLoadingInfo(false)
                return
            } finally {
                setLoadingInfo(false)
            }
        }

        if (!videoInfo) return

        try {
            setIsDownloading(true)
            setProgress({ downloadedBytes: 0, totalBytes: 0, percent: 0 })
            setError(null)
            setDownloadedPath(null)

            const isAudio = selectedItag === -1
            const ext = isAudio ? 'mp3' : 'mp4'
            const filename = `${sanitizeFilename(videoInfo.title)}.${ext}`

            let targetDir = downloadDir
            if (!targetDir) {
                targetDir = await window.files.getDefaultDownloadDir()
                setDownloadDir(targetDir)
            }

            const savePath =
                targetDir.endsWith('/') || targetDir.endsWith('\\')
                    ? `${targetDir}${filename}`
                    : `${targetDir}/${filename}`

            const result = await window.api.youtube.download({
                url: videoInfo.url,
                savePath,
                qualityItag: selectedItag,
            })

            setDownloadedPath(result.filePath)
        } catch (err: any) {
            setError(err?.message || 'Failed to download video')
        } finally {
            setIsDownloading(false)
        }
    }

    const hasContent = Boolean(url.trim() || info || loadingInfo)

    return (
        <div
            className={`flex w-full flex-1 flex-col transition-all duration-500 ease-out ${
                hasContent
                    ? 'justify-start pt-2'
                    : 'items-center justify-center pb-12'
            }`}
        >
            <div className="mx-auto w-full max-w-xl space-y-4">
                {/* Heading text on top of input field */}
                <div
                    className={`transition-all duration-300 ease-out ${
                        hasContent
                            ? 'pointer-events-none max-h-0 overflow-hidden opacity-0'
                            : 'mb-6 max-h-24 opacity-100'
                    }`}
                >
                    <h1 className="text-foreground text-center text-2xl tracking-tight">
                        Where should we begin?
                    </h1>
                </div>

                {/* Pill Search Bar */}
                <div className="relative">
                    <div className="border-border/80 bg-surface focus-within:border-border-strong focus-within:ring-ring/20 flex h-12 w-full items-center gap-2 rounded-full border px-2 shadow-[0_2px_12px_rgb(0_0_0/0.06)] transition-[border-color,box-shadow] focus-within:ring-2">
                        {/* Plus button with Base UI Popover dropdown */}
                        <Popover
                            open={showFolderDropdown}
                            onOpenChange={setShowFolderDropdown}
                        >
                            <PopoverTrigger
                                type="button"
                                className="text-foreground/70 hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-full transition-colors outline-none"
                                title={`Save location: ${downloadDir || 'Default'}`}
                                aria-label="Select save location"
                            >
                                <Plus className="size-4" />
                            </PopoverTrigger>
                            <PopoverContent
                                sideOffset={12}
                                className="w-64 space-y-2.5 p-3.5"
                            >
                                {/* Title header with Reset icon button on right */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Folder className="text-muted-foreground size-4 shrink-0" />
                                        <span className="text-foreground text-[11px] font-semibold tracking-wider uppercase">
                                            Save Location
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleResetDirectory}
                                        className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-6.5 items-center justify-center rounded-md transition-colors outline-none"
                                        title="Reset to default location"
                                        aria-label="Reset save location"
                                    >
                                        <RefreshCw className="size-3.5" />
                                    </button>
                                </div>

                                {/* Location row with Change Folder icon button on right */}
                                <div className="flex items-center gap-2">
                                    <div
                                        className="bg-muted/50 border-border/40 text-foreground/80 min-w-0 flex-1 truncate rounded-xl border px-3 py-2 font-mono text-[11px]"
                                        title={
                                            downloadDir || 'Downloads Folder'
                                        }
                                    >
                                        {downloadDir || 'Downloads Folder'}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleBrowseDirectory}
                                        className="border-border/60 bg-surface text-foreground hover:bg-muted flex size-8 shrink-0 items-center justify-center rounded-xl border transition-colors outline-none"
                                        title="Change folder"
                                        aria-label="Change save folder"
                                    >
                                        <FolderOpen className="size-4" />
                                    </button>
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* Main Input with requested placeholder */}
                        <input
                            type="url"
                            placeholder="Paste YouTube channel or video link"
                            value={url}
                            onChange={handleUrlChange}
                            onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    url.trim() &&
                                    !loadingInfo &&
                                    !isDownloading
                                ) {
                                    handleFetchInfo(url)
                                }
                            }}
                            disabled={isDownloading}
                            className="text-foreground placeholder:text-muted-foreground/60 flex-1 border-none bg-transparent px-1 text-sm outline-none focus:ring-0 focus:outline-none"
                        />

                        {/* Fetch / Submit icon in circular button */}
                        <button
                            type="button"
                            onClick={() => handleFetchInfo(url)}
                            disabled={
                                !url.trim() || isDownloading || loadingInfo
                            }
                            className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-full transition-all hover:opacity-90 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
                            title="Fetch Video Info"
                        >
                            {loadingInfo ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Send className="size-4" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Error Notification */}
                {error && (
                    <div className="border-danger/30 bg-danger/10 text-danger rounded-xl border p-3.5 text-xs font-medium">
                        {error}
                    </div>
                )}

                {/* Video Info Preview Card */}
                {info && !loadingInfo && (
                    <VideoCard
                        info={info}
                        selectedItag={selectedItag}
                        onSelectItag={setSelectedItag}
                        isDownloading={isDownloading}
                        progress={progress}
                        downloadedPath={downloadedPath}
                        onDownload={handleDownload}
                    />
                )}
            </div>
        </div>
    )
}
