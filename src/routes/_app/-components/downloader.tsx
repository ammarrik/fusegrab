import type {
    ChannelProgressEvent,
    YoutubeChannelInfo,
    YoutubeChannelVideoItem,
    YoutubeVideoInfo,
} from '#/lib/services/youtube/service'

import { useEffect, useRef, useState } from 'react'

import {
    Download,
    Folder,
    FolderOpen,
    Loader2,
    Plus,
    RefreshCw,
    Send,
    X,
} from '#/components/icons'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '#/components/ui/popover'
import { ProgressBar } from '#/components/ui/progress'
import { Select } from '#/components/ui/select'

import { ChannelVideoCard, VideoCard } from './video-card'

function sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '').trim() || 'youtube-video'
}

export function YoutubeDownloader() {
    const [url, setUrl] = useState('')
    const [urlType, setUrlType] = useState<'unknown' | 'video' | 'channel'>(
        'unknown',
    )
    const [loadingInfo, setLoadingInfo] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Single Video state
    const [info, setInfo] = useState<YoutubeVideoInfo | null>(null)
    const [selectedItag, setSelectedItag] = useState<number | undefined>(
        undefined,
    )
    const [isDownloading, setIsDownloading] = useState(false)
    const [progress, setProgress] = useState<{
        downloadedBytes: number
        totalBytes: number
        percent: number
    } | null>(null)
    const [downloadedPath, setDownloadedPath] = useState<string | null>(null)

    // Channel state
    const [channelInfo, setChannelInfo] = useState<YoutubeChannelInfo | null>(
        null,
    )
    const [videos, setVideos] = useState<YoutubeChannelVideoItem[]>([])
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [selectedQualityHeight, setSelectedQualityHeight] = useState<
        number | null
    >(null)
    const [isDownloadingChannel, setIsDownloadingChannel] = useState(false)
    const [channelProgress, setChannelProgress] =
        useState<ChannelProgressEvent | null>(null)

    // Save Directory & Dropdown State
    const [downloadDir, setDownloadDir] = useState<string>('')
    const [showFolderDropdown, setShowFolderDropdown] = useState(false)

    // Infinite scroll observer reference
    const observerTargetRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const savedDir = localStorage.getItem('yt_download_dir')
        if (savedDir) {
            setDownloadDir(savedDir)
        } else {
            window.files.getDefaultDownloadDir().then((def) => {
                if (def) setDownloadDir(def)
            })
        }

        const offSingle = window.api.youtube.onProgress((p) => {
            setProgress(p)
        })

        const offChannel = window.api.youtube.onChannelProgress((cp) => {
            setChannelProgress(cp)
        })

        return () => {
            offSingle()
            offChannel()
        }
    }, [])

    // Fetch single video or channel page 1 based on URL type
    const handleFetchInfo = async (targetUrl: string) => {
        const clean = targetUrl.trim()
        if (!clean) {
            setInfo(null)
            setChannelInfo(null)
            setVideos([])
            setUrlType('unknown')
            setError(null)
            return
        }

        setLoadingInfo(true)
        setError(null)
        setInfo(null)
        setChannelInfo(null)
        setVideos([])
        setDownloadedPath(null)
        setChannelProgress(null)
        setPage(1)

        try {
            const detectedType = await window.api.youtube.getUrlType(clean)
            setUrlType(detectedType)

            if (detectedType === 'channel') {
                const data = await window.api.youtube.getChannelPage(
                    clean,
                    1,
                    20,
                )
                setChannelInfo(data)
                setVideos(data.videos)
                setHasMore(data.hasMore)
                setPage(1)
            } else {
                const data = await window.api.youtube.getInfo(clean)
                setInfo(data)
                if (data.formats.length > 0) {
                    setSelectedItag(data.formats[0].itag)
                }
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to fetch YouTube info')
        } finally {
            setLoadingInfo(false)
        }
    }

    // Fetch subsequent channel pages for infinite scroll
    const fetchNextChannelPage = async () => {
        if (
            !url.trim() ||
            urlType !== 'channel' ||
            !hasMore ||
            loadingMore ||
            loadingInfo
        ) {
            return
        }

        setLoadingMore(true)
        try {
            const nextPageNum = page + 1
            const data = await window.api.youtube.getChannelPage(
                url.trim(),
                nextPageNum,
                20,
            )

            setVideos((prev) => {
                const existingIds = new Set(prev.map((v) => v.id))
                const newItems = data.videos.filter(
                    (v) => !existingIds.has(v.id),
                )
                return [...prev, ...newItems]
            })

            setHasMore(data.hasMore)
            setPage(nextPageNum)
        } catch (err: any) {
            console.error('Failed to load more videos:', err)
        } finally {
            setLoadingMore(false)
        }
    }

    // Setup IntersectionObserver for Infinite Scroll
    useEffect(() => {
        const target = observerTargetRef.current
        if (!target || urlType !== 'channel' || !hasMore) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    fetchNextChannelPage()
                }
            },
            { threshold: 0.1, rootMargin: '200px' },
        )

        observer.observe(target)
        return () => {
            observer.disconnect()
        }
    }, [urlType, hasMore, page, loadingMore, loadingInfo, url])

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

    // Single video download handler
    const handleDownloadSingle = async () => {
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

    // Channel Bulk Download handler
    const handleDownloadAllChannel = async () => {
        if (!url.trim()) return

        try {
            setIsDownloadingChannel(true)
            setError(null)
            setChannelProgress({
                currentItem: 0,
                totalItems: channelInfo?.totalVideos || videos.length,
                percent: 0,
                status: 'downloading',
            })

            let targetDir = downloadDir
            if (!targetDir) {
                targetDir = await window.files.getDefaultDownloadDir()
                setDownloadDir(targetDir)
            }

            const isAudioOnly = selectedQualityHeight === -1
            const qualityHeight =
                selectedQualityHeight && selectedQualityHeight > 0
                    ? selectedQualityHeight
                    : undefined

            await window.api.youtube.downloadChannel({
                channelUrl: url.trim(),
                saveDir: targetDir,
                qualityHeight,
                isAudioOnly,
            })
        } catch (err: any) {
            if (
                err?.message?.includes('SIGTERM') ||
                err?.message?.includes('exited with code null')
            ) {
                setChannelProgress((prev) =>
                    prev ? { ...prev, status: 'cancelled' } : null,
                )
            } else {
                setError(err?.message || 'Failed to download channel videos')
            }
        } finally {
            setIsDownloadingChannel(false)
        }
    }

    const handleCancelChannelDownload = async () => {
        await window.api.youtube.cancelDownload()
        setIsDownloadingChannel(false)
        setChannelProgress((prev) =>
            prev ? { ...prev, status: 'cancelled' } : null,
        )
    }

    const hasContent = Boolean(url.trim() || info || channelInfo || loadingInfo)

    return (
        <div
            className={`flex w-full flex-1 flex-col transition-all duration-500 ease-out ${
                hasContent
                    ? 'justify-start pt-2 pb-12'
                    : 'items-center justify-center pb-12'
            }`}
        >
            <div
                className={`mx-auto w-full space-y-4 transition-all duration-300 ${
                    urlType === 'channel' ? 'max-w-4xl' : 'max-w-xl'
                }`}
            >
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
                                    !isDownloading &&
                                    !isDownloadingChannel
                                ) {
                                    handleFetchInfo(url)
                                }
                            }}
                            disabled={isDownloading || isDownloadingChannel}
                            className="text-foreground placeholder:text-muted-foreground/60 flex-1 border-none bg-transparent px-1 text-sm outline-none focus:ring-0 focus:outline-none"
                        />

                        {/* Fetch / Submit icon in circular button */}
                        <button
                            type="button"
                            onClick={() => handleFetchInfo(url)}
                            disabled={
                                !url.trim() ||
                                isDownloading ||
                                isDownloadingChannel ||
                                loadingInfo
                            }
                            className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-full transition-all hover:opacity-90 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
                            title="Fetch Info"
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

                {/* Loading State Skeleton (Clean Soft Pulsing Video Cards UI) */}
                {loadingInfo && (
                    <>
                        {urlType === 'channel' ||
                        url.includes('/@') ||
                        url.includes('/channel/') ||
                        url.includes('/c/') ||
                        url.includes('/user/') ||
                        url.includes('list=') ? (
                            <div className="w-full space-y-4 pt-2">
                                {/* Channel Header Skeleton */}
                                <div className="flex items-center justify-between px-0 py-1 animate-pulse">
                                    <div className="bg-zinc-300/50 dark:bg-zinc-700/50 h-5 w-40 rounded-md" />
                                    <div className="bg-zinc-300/50 dark:bg-zinc-700/50 h-8 w-28 rounded-full" />
                                </div>

                                {/* 2-Column Grid (2 videos in a row pulsing cards) */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div
                                            key={i}
                                            className="w-full animate-pulse space-y-2.5"
                                        >
                                            <div className="bg-zinc-300/50 dark:bg-zinc-700/50 aspect-video w-full rounded-xl" />
                                            <div className="space-y-1.5 px-0.5">
                                                <div className="bg-zinc-300/50 dark:bg-zinc-700/50 h-4 w-4/5 rounded-md" />
                                                <div className="bg-zinc-300/35 dark:bg-zinc-700/35 h-3 w-1/3 rounded-md" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="mx-auto w-full max-w-xl animate-pulse space-y-3 pt-2">
                                <div className="bg-zinc-300/50 dark:bg-zinc-700/50 aspect-video w-full rounded-2xl" />
                                <div className="space-y-2 px-0.5">
                                    <div className="bg-zinc-300/50 dark:bg-zinc-700/50 h-4.5 w-4/5 rounded-md" />
                                    <div className="bg-zinc-300/35 dark:bg-zinc-700/35 h-3.5 w-1/3 rounded-md" />
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Single Video Info Preview Card (1 video in a row) */}
                {urlType === 'video' && info && !loadingInfo && (
                    <div className="mx-auto w-full max-w-xl">
                        <VideoCard
                            info={info}
                            selectedItag={selectedItag}
                            onSelectItag={setSelectedItag}
                            isDownloading={isDownloading}
                            progress={progress}
                            downloadedPath={downloadedPath}
                            onDownload={handleDownloadSingle}
                        />
                    </div>
                )}

                {/* YouTube Channel View (Header + 2 videos in a row grid + Infinite Scroll) */}
                {urlType === 'channel' && channelInfo && !loadingInfo && (
                    <div className="w-full space-y-4 pt-2">
                        {/* Channel Options Header (No borders, no shadows, no inner side paddings) */}
                        <div className="flex items-center justify-between px-0 py-1">
                            {/* Left side: Channel Name (shorter) */}
                            <h2
                                className="text-foreground line-clamp-1 max-w-50 truncate text-base font-medium tracking-tight sm:max-w-xs md:max-w-sm"
                                title={channelInfo.title}
                            >
                                {channelInfo.title}
                            </h2>

                            {/* Right side: White Badge with Resolution Selector & Download Button (Exact same UI) */}
                            <div className="flex items-center gap-1 rounded-full bg-white p-1 text-zinc-900 shadow-[0_0_6px_rgba(0,0,0,0.08)]">
                                <Select
                                    value={
                                        selectedQualityHeight !== null
                                            ? String(selectedQualityHeight)
                                            : 'best'
                                    }
                                    options={[
                                        {
                                            value: 'best',
                                            label: 'Best Quality',
                                        },
                                        { value: '1080', label: '1080p' },
                                        { value: '720', label: '720p' },
                                        { value: '480', label: '480p' },
                                        {
                                            value: '-1',
                                            label: 'Audio Only',
                                        },
                                    ]}
                                    onValueChange={(val) =>
                                        setSelectedQualityHeight(
                                            val === 'best' ? null : Number(val),
                                        )
                                    }
                                    sideOffset={8}
                                    aria-label="Bulk quality"
                                    className="h-7 rounded-full border-none bg-transparent px-2.5 text-xs font-semibold text-zinc-900 shadow-none transition-colors hover:bg-zinc-100"
                                />

                                <button
                                    type="button"
                                    onClick={handleDownloadAllChannel}
                                    disabled={isDownloadingChannel}
                                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                                    title="Download All Videos"
                                    aria-label="Download All Videos"
                                >
                                    {isDownloadingChannel ? (
                                        <Loader2 className="size-3.5 animate-spin text-white" />
                                    ) : (
                                        <Download className="size-3.5 text-white" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Global Channel Batch Progress Status Card */}
                        {channelProgress && (
                            <div className="border-border/60 bg-surface/90 relative space-y-2 overflow-hidden rounded-2xl border p-4 shadow-sm">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-foreground font-semibold">
                                            {channelProgress.status ===
                                            'completed'
                                                ? 'Batch Download Completed!'
                                                : channelProgress.status ===
                                                    'cancelled'
                                                  ? 'Download Cancelled'
                                                  : 'Downloading Channel Videos...'}
                                        </span>
                                        {channelProgress.totalItems > 0 && (
                                            <span className="text-muted-foreground font-mono text-[11px]">
                                                ({channelProgress.currentItem} /{' '}
                                                {channelProgress.totalItems})
                                            </span>
                                        )}
                                    </div>

                                    {isDownloadingChannel && (
                                        <button
                                            type="button"
                                            onClick={
                                                handleCancelChannelDownload
                                            }
                                            className="text-muted-foreground hover:text-danger flex items-center gap-1 font-medium transition-colors"
                                        >
                                            <X className="size-4" />
                                            <span>Cancel</span>
                                        </button>
                                    )}
                                </div>

                                <ProgressBar
                                    value={(channelProgress.percent ?? 0) / 100}
                                />

                                <div className="text-muted-foreground flex items-center justify-between font-mono text-[11px]">
                                    <span className="truncate pr-4">
                                        {channelProgress.videoTitle ||
                                            'Preparing...'}
                                    </span>
                                    <span>{channelProgress.percent}%</span>
                                </div>
                            </div>
                        )}

                        {/* 2-Column Grid (2 videos in a row) */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {videos.map((video) => (
                                <ChannelVideoCard
                                    key={video.id}
                                    video={video}
                                    downloadDir={downloadDir}
                                />
                            ))}
                        </div>

                        {/* Infinite Scroll Bottom Intersection Trigger */}
                        <div
                            ref={observerTargetRef}
                            className="flex h-16 w-full items-center justify-center pt-4"
                        >
                            {loadingMore && (
                                <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                                    <Loader2 className="text-foreground size-4 animate-spin" />
                                    <span>Loading more videos...</span>
                                </div>
                            )}
                            {!hasMore && videos.length > 0 && (
                                <p className="text-muted-foreground/60 text-xs font-medium">
                                    All channel videos loaded
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
