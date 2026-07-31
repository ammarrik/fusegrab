import type { DownloadItem } from './types'

import { useEffect, useRef, useState } from 'react'

import { Search } from '#/components/icons'
import { InputField, InputIcon, InputRoot } from '#/components/ui/input'
import { useWindowDrag } from '#/hooks/use-window-drag'

import appLogo from '../../../../assets/icon.rounded.png'

import { AddUrlModal } from './add-dialog'
import { FileMissingDialog } from './file-missing-dialog'
import { DownloaderFooter } from './footer'
import {
    deleteItemById,
    deleteSelectedItems,
    pauseSelectedItems,
    stopItemById,
} from './handlers'
import { DownloadOptionsModal } from './options-dialog'
import { DownloaderSidebar } from './sidebar'
import { DownloaderTable } from './table'
import { DownloaderToolbar } from './toolbar'
import { formatDate, sanitizeFilename } from './types'

const isMac =
    typeof window !== 'undefined' &&
    (window.windowControls?.platform === 'darwin' ||
        (typeof navigator !== 'undefined' &&
            navigator.userAgent.includes('Mac')))

export function YoutubeDownloader() {
    const dragProps = useWindowDrag()

    const [items, setItems] = useState<DownloadItem[]>(() => {
        const saved = localStorage.getItem('fuse_download_items_v2')
        if (saved) {
            try {
                const parsed: DownloadItem[] = JSON.parse(saved)
                return parsed.map((item) => {
                    const isSingleUrl = item.isSingleUrl ?? (item.type === 'video')
                    if (
                        item.status === 'Downloading' ||
                        item.status === 'Queued' ||
                        item.statusStage === 'Preparing...'
                    ) {
                        return {
                            ...item,
                            isSingleUrl,
                            status: 'Ready' as const,
                            statusStage: undefined,
                        }
                    }
                    return { ...item, isSingleUrl }
                })
            } catch {}
        }
        return []
    })

    const [activeFilter, setActiveFilter] = useState('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [showAddUrlModal, setShowAddUrlModal] = useState(false)
    const [showOptionsModal, setShowOptionsModal] = useState(false)
    const [inputUrl, setInputUrl] = useState('')
    const [loadingInfo, setLoadingInfo] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [downloadDir, setDownloadDir] = useState<string>('')
    const downloadDirRef = useRef('')
    const [isDownloading, setIsDownloading] = useState(false)
    const [activeItemUrl, setActiveItemUrl] = useState<string | null>(null)
    const [missingFileItem, setMissingFileItem] = useState<DownloadItem | null>(
        null,
    )
    const [isFetchingVideos, setIsFetchingVideos] = useState(false)
    const [fetchingTitle, setFetchingTitle] = useState('')
    const [defaultQuality, setDefaultQuality] = useState<string>(() => {
        return localStorage.getItem('yt_default_quality') || 'Best'
    })

    const isDownloadingRef = useRef(false)

    const handleDefaultQualityChange = (quality: string) => {
        setDefaultQuality(quality)
        localStorage.setItem('yt_default_quality', quality)
        setItems((prev) =>
            prev.map((i) =>
                i.status !== 'Complete' && i.status !== 'Downloading'
                    ? { ...i, quality }
                    : i,
            ),
        )
    }

    const [selectedByFilter, setSelectedByFilter] = useState<
        Record<string, Set<string>>
    >(() => {
        const saved = localStorage.getItem('fuse_selected_by_filter')
        if (saved) {
            try {
                const parsed: Record<string, string[]> = JSON.parse(saved)
                const restored: Record<string, Set<string>> = {}
                for (const k of Object.keys(parsed)) {
                    restored[k] = new Set(parsed[k])
                }
                return restored
            } catch {}
        }
        return {}
    })

    useEffect(() => {
        const toSave: Record<string, string[]> = {}
        for (const k of Object.keys(selectedByFilter)) {
            if (selectedByFilter[k].size > 0) {
                toSave[k] = Array.from(selectedByFilter[k])
            }
        }
        localStorage.setItem('fuse_selected_by_filter', JSON.stringify(toSave))
    }, [selectedByFilter])

    useEffect(() => {
        localStorage.setItem('fuse_download_items_v2', JSON.stringify(items))
    }, [items])

    useEffect(() => {
        window.files.getDefaultDownloadDir().then((defaultPath) => {
            const saved = localStorage.getItem('yt_download_dir')
            const dir = saved || defaultPath
            setDownloadDir(dir)
            downloadDirRef.current = dir
        })
    }, [])

    const activeItemUrlRef = useRef<string | null>(null)
    useEffect(() => {
        activeItemUrlRef.current = activeItemUrl
    }, [activeItemUrl])

    // Mount-only: recover orphan statuses from crash/shutdown
    useEffect(() => {
        window.api.youtube.getDownloadState().then((ds) => {
            const isBackendDownloading = Boolean(
                ds && ds.isDownloading && ds.url,
            )
            if (isBackendDownloading && ds?.url) {
                isDownloadingRef.current = true
                setIsDownloading(true)
                setActiveItemUrl(ds.url)
            } else {
                isDownloadingRef.current = false
                setIsDownloading(false)
                setActiveItemUrl(null)
            }

            // Recovery: Cleanup orphan statuses left from sudden crash/shutdown
            setItems((prev) => {
                let changed = false
                const updated = prev.map((item) => {
                    const isItemActiveInBackend =
                        isBackendDownloading && ds?.url && item.url === ds.url

                    if (
                        !isItemActiveInBackend &&
                        (item.status === 'Downloading' ||
                            item.status === 'Queued' ||
                            item.statusStage === 'Preparing...')
                    ) {
                        changed = true
                        return {
                            ...item,
                            status: 'Ready' as const,
                            statusStage: undefined,
                        }
                    }
                    return item
                })
                return changed ? updated : prev
            })
        })
    }, [])

    // Progress listeners — use refs so we don't need to re-register
    useEffect(() => {
        const offSingle = window.api.youtube.onProgress((data) => {
            if (!data) return
            setIsDownloading(true)

            setItems((prev) =>
                prev.map((item) => {
                    if (
                        activeItemUrlRef.current
                            ? item.url === activeItemUrlRef.current
                            : item.status === 'Downloading'
                    ) {
                        const newPercent = Math.max(
                            item.percent || 0,
                            data.percent,
                        )
                        return {
                            ...item,
                            status: 'Downloading',
                            percent: newPercent,
                            statusStage:
                                newPercent >= 99 ? 'Finalizing...' : undefined,
                        }
                    }
                    return item
                }),
            )
        })

        const offChannel = window.api.youtube.onChannelProgress((data) => {
            if (!data) return
            setIsDownloading(data.status === 'downloading')

            setItems((prev) =>
                prev.map((item) => {
                    if (
                        activeItemUrlRef.current
                            ? item.url === activeItemUrlRef.current
                            : item.status === 'Downloading'
                    ) {
                        if (data.status === 'completed') {
                            return {
                                ...item,
                                status: 'Complete',
                                percent: 100,
                                statusStage: undefined,
                            }
                        }
                        return {
                            ...item,
                            status:
                                data.status === 'downloading'
                                    ? 'Downloading'
                                    : item.status,
                            percent: data.percent,
                            statusStage: data.videoTitle
                                ? `Downloading: ${data.videoTitle}`
                                : undefined,
                        }
                    }
                    return item
                }),
            )
        })

        return () => {
            offSingle()
            offChannel()
        }
    }, [])

    function extractVideoId(url: string): string | null {
        if (!url) return null
        const match = url.match(
            /(?:watch\?v=|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/,
        )
        return match ? match[1] : null
    }

    const handleAddUrl = async () => {
        const cleanUrl = inputUrl.trim()
        if (!cleanUrl) return

        const targetVidId = extractVideoId(cleanUrl)
        const alreadyExists = items.some((i) => {
            if (i.url === cleanUrl) return true
            const itemVidId = extractVideoId(i.url)
            return Boolean(
                targetVidId && itemVidId && targetVidId === itemVidId,
            )
        })

        if (alreadyExists) {
            setError('This video is already in your download list.')
            return
        }

        setLoadingInfo(true)
        setError(null)

        try {
            const type = await window.api.youtube.getUrlType(cleanUrl)

            if (type === 'video') {
                const info = await window.api.youtube.getInfo(cleanUrl)
                const newItem: DownloadItem = {
                    id: String(Date.now()),
                    name: info.title,
                    url: cleanUrl,
                    type: 'video',
                    isSingleUrl: true,
                    channelName: info.author,
                    quality: defaultQuality || 'Best',
                    size: 'Calculating...',
                    status: 'Queued',
                    percent: 0,
                    timeLeft: '--',
                    dateModified: formatDate(new Date()),
                    selected: true,
                }
                setItems((prev) => [newItem, ...prev])
                setSelectedByFilter((prev) => {
                    const currentSet = new Set(prev[activeFilter] || [])
                    currentSet.add(newItem.id)
                    return { ...prev, [activeFilter]: currentSet }
                })
            } else if (type === 'channel') {
                setIsFetchingVideos(true)
                // Await initial batch loading before closing dialog
                await window.api.youtube.getChannelPage(cleanUrl, 1, 20)
                setInputUrl('')
                setShowAddUrlModal(false)
                return
            }

            setInputUrl('')
            setShowAddUrlModal(false)
        } catch (err: any) {
            setIsFetchingVideos(false)
            setError(err?.message || 'Failed to fetch YouTube info')
        } finally {
            setLoadingInfo(false)
        }
    }

    useEffect(() => {
        const offBatch = window.api.youtube.onChannelVideoBatch((batch) => {
            if (!batch) return

            if (batch.channelTitle) {
                setFetchingTitle(batch.channelTitle)
            }

            if (batch.isDone) {
                setIsFetchingVideos(false)
                setFetchingTitle('')
            } else {
                setIsFetchingVideos(true)
            }

            if (!Array.isArray(batch.videos) || batch.videos.length === 0)
                return

            setItems((prev) => {
                const existingUrls = new Set(prev.map((i) => i.url))
                const existingVideoIds = new Set(
                    prev
                        .map((i) => extractVideoId(i.url))
                        .filter(Boolean) as string[],
                )
                const newItems: DownloadItem[] = []

                for (const v of batch.videos) {
                    const vId = extractVideoId(v.url) || v.id
                    if (
                        existingUrls.has(v.url) ||
                        (vId && existingVideoIds.has(vId))
                    ) {
                        continue
                    }
                    existingUrls.add(v.url)
                    if (vId) existingVideoIds.add(vId)

                    newItems.push({
                        id: `${v.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        name: v.title,
                        url: v.url,
                        type: 'video',
                        isSingleUrl: false,
                        channelName: v.author || batch.channelTitle,
                        quality: defaultQuality || 'Best',
                        size: 'Calculating...',
                        status: 'Ready',
                        percent: 0,
                        timeLeft: '--',
                        dateModified: formatDate(new Date()),
                        selected: false,
                    })
                }

                if (newItems.length === 0) return prev
                return [...prev, ...newItems]
            })
        })

        return () => {
            offBatch()
        }
    }, [])

    useEffect(() => {
        if (isDownloadingRef.current) return

        const queuedItem = items.find((i) => i.status === 'Queued')
        if (queuedItem) {
            isDownloadingRef.current = true
            setIsDownloading(true)
            setActiveItemUrl(queuedItem.url)

            setItems((prev) =>
                prev.map((i) =>
                    i.id === queuedItem.id
                        ? {
                              ...i,
                              status: 'Downloading',
                              percent: i.percent || 0,
                              statusStage:
                                  i.percent && i.percent > 0
                                      ? undefined
                                      : 'Preparing...',
                          }
                        : i,
                ),
            )
            processDownloadItem(queuedItem)
        }
    }, [items, isDownloading])

    const handleStartSelectedDownloads = (targetItemId?: string) => {
        const hasSelection = filteredItems.some((i) => i.selected)
        const eligible = filteredItems.filter((i) => {
            if (targetItemId) return i.id === targetItemId
            if (hasSelection) return i.selected && i.status !== 'Complete'
            return i.status !== 'Complete'
        })
        if (eligible.length === 0) return

        const firstItem = eligible[0]
        const canStartImmediately = !isDownloadingRef.current

        if (canStartImmediately) {
            isDownloadingRef.current = true
            setIsDownloading(true)
            setActiveItemUrl(firstItem.url)
        }

        const targetIds = new Set(eligible.map((e) => e.id))

        setItems((prev) =>
            prev.map((i) => {
                if (targetIds.has(i.id)) {
                    if (canStartImmediately && i.id === firstItem.id) {
                        return {
                            ...i,
                            status: 'Downloading',
                            percent: i.percent || 0,
                            statusStage:
                                i.percent && i.percent > 0
                                    ? undefined
                                    : 'Preparing...',
                        }
                    }
                    if (i.status !== 'Complete') {
                        return {
                            ...i,
                            status: 'Queued',
                            statusStage: undefined,
                        }
                    }
                }
                return i
            }),
        )

        if (canStartImmediately) {
            processDownloadItem(firstItem)
        }
    }

    const cancelledRef = useRef(false)

    const processDownloadItem = async (item: DownloadItem) => {
        let targetDir = downloadDirRef.current
        if (!targetDir) {
            targetDir = await window.files.getDefaultDownloadDir()
            downloadDirRef.current = targetDir
            setDownloadDir(targetDir)
        }

        cancelledRef.current = false

        try {
            isDownloadingRef.current = true
            setIsDownloading(true)
            setActiveItemUrl(item.url)

            setItems((prev) =>
                prev.map((i) =>
                    i.id === item.id
                        ? {
                              ...i,
                              status: 'Downloading',
                              percent: i.percent || 0,
                              statusStage:
                                  i.percent && i.percent > 0
                                      ? undefined
                                      : 'Preparing...',
                          }
                        : i,
                ),
            )

            if (item.type === 'video') {
                const sanitized = sanitizeFilename(item.name)
                const isAudio = item.quality?.toLowerCase().includes('audio')
                const ext = isAudio ? 'mp3' : 'mp4'

                let savePath: string
                if (item.isSingleUrl) {
                    savePath = `${targetDir.replace(/\/$/, '')}/${sanitized}.${ext}`
                } else {
                    const channelSubfolder = sanitizeFilename(
                        item.channelName || 'Uncategorized',
                    )
                    const channelDir = `${targetDir.replace(/\/$/, '')}/${channelSubfolder}`
                    savePath = `${channelDir}/${sanitized}.${ext}`
                }
                const isBest =
                    !item.quality ||
                    item.quality === 'Best Quality' ||
                    item.quality === 'Best'
                const heightVal = isAudio
                    ? -1
                    : isBest
                      ? undefined
                      : parseInt(item.quality || '', 10) || undefined

                await window.api.youtube.download({
                    url: item.url,
                    savePath,
                    height: heightVal,
                })

                setItems((prev) =>
                    prev.map((i) =>
                        i.id === item.id
                            ? {
                                  ...i,
                                  status: 'Complete',
                                  percent: 100,
                                  statusStage: undefined,
                                  savePath,
                              }
                            : i,
                    ),
                )
            } else if (item.type === 'channel') {
                const sanitized = sanitizeFilename(item.name)
                const saveDir = `${targetDir.replace(/\/$/, '')}/${sanitized}`

                await window.api.youtube.downloadChannel({
                    channelUrl: item.url,
                    saveDir,
                })

                setItems((prev) =>
                    prev.map((i) =>
                        i.id === item.id
                            ? {
                                  ...i,
                                  status: 'Complete',
                                  percent: 100,
                                  statusStage: undefined,
                                  savePath: saveDir,
                              }
                            : i,
                    ),
                )
            }
        } catch (err: any) {
            // If user explicitly cancelled (pause/stop/delete), don't overwrite
            // the status that the handler already set
            if (!cancelledRef.current) {
                const rawMsg = String(err?.message || '')
                const cleanMsg = rawMsg
                    .replace(/^Error invoking remote method '[^']*':\s*/, '')
                    .trim()

                setItems((prev) =>
                    prev.map((i) =>
                        i.id === item.id
                            ? {
                                  ...i,
                                  status: 'Error',
                                  statusStage: cleanMsg || 'Download failed',
                              }
                            : i,
                    ),
                )
            }
        } finally {
            isDownloadingRef.current = false
            setIsDownloading(false)
            setActiveItemUrl(null)
            cancelledRef.current = false
        }
    }

    const cleanupDeletedIds = (targetIds: string[]) => {
        const removeSet = new Set(targetIds)
        setSelectedByFilter((prev) => {
            const next: Record<string, Set<string>> = {}
            for (const key of Object.keys(prev)) {
                const updated = new Set(prev[key])
                for (const id of removeSet) {
                    updated.delete(id)
                }
                next[key] = updated
            }
            return next
        })
    }

    const handlePauseSelected = () => {
        cancelledRef.current = true
        pauseSelectedItems(filteredItems, setItems)
    }

    const handleStopItem = (id: string) => {
        cancelledRef.current = true
        stopItemById(id, items, setItems)
    }

    const handleDeleteItem = (id: string) => {
        cancelledRef.current = true
        cleanupDeletedIds([id])
        deleteItemById(id, items, setItems)
    }

    const handleDeleteSelected = () => {
        cancelledRef.current = true
        const selectedInView = filteredItems.filter((i) => i.selected)
        const targetIds =
            selectedInView.length > 0
                ? selectedInView.map((i) => i.id)
                : filteredItems.map((i) => i.id)
        cleanupDeletedIds(targetIds)
        deleteSelectedItems(filteredItems, setItems)
    }

    const handleSelectFolder = async () => {
        const selected = await window.files.chooseDirectory()
        if (selected) {
            downloadDirRef.current = selected
            setDownloadDir(selected)
            localStorage.setItem('yt_download_dir', selected)
        }
    }

    const currentSelectedIds =
        selectedByFilter[activeFilter] || new Set<string>()

    const filteredItems = items
        .filter((item) => {
            const matchesSearch =
                !searchQuery.trim() ||
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.channelName
                    ?.toLowerCase()
                    .includes(searchQuery.toLowerCase())

            if (!matchesSearch) return false

            if (activeFilter === 'individual') {
                return Boolean(item.isSingleUrl)
            }
            if (activeFilter.startsWith('channel:')) {
                const targetChannel = activeFilter.replace('channel:', '')
                return (
                    !item.isSingleUrl &&
                    (item.channelName || 'Uncategorized') === targetChannel
                )
            }
            if (activeFilter === 'finished') return item.status === 'Complete'
            if (activeFilter === 'unfinished') return item.status !== 'Complete'
            if (activeFilter === 'paused')
                return item.status === 'Paused' || item.status === 'Ready'

            return true
        })
        .map((item) => ({
            ...item,
            selected: currentSelectedIds.has(item.id),
        }))

    const allSelected =
        filteredItems.length > 0 && filteredItems.every((i) => i.selected)
    const someSelected = filteredItems.some((i) => i.selected)
    const isIndeterminate = someSelected && !allSelected

    const toggleSelectAll = (checked: boolean) => {
        const visibleIds = filteredItems.map((i) => i.id)
        setSelectedByFilter((prev) => {
            const nextSet = new Set(prev[activeFilter] || [])
            for (const id of visibleIds) {
                if (checked) {
                    nextSet.add(id)
                } else {
                    nextSet.delete(id)
                }
            }
            return { ...prev, [activeFilter]: nextSet }
        })
    }

    const handleToggleItemSelect = (id: string, checked: boolean) => {
        setSelectedByFilter((prev) => {
            const nextSet = new Set(prev[activeFilter] || [])
            if (checked) {
                nextSet.add(id)
            } else {
                nextSet.delete(id)
            }
            return { ...prev, [activeFilter]: nextSet }
        })
    }

    const handleOpenFolder = async (item: DownloadItem) => {
        if (!item.savePath) return
        const exists = await window.files.reveal(item.savePath)
        if (!exists) {
            setItems((prev) =>
                prev.map((i) =>
                    i.id === item.id
                        ? { ...i, status: 'Missing', statusStage: undefined }
                        : i,
                ),
            )
            setMissingFileItem(item)
        }
    }

    return (
        <div className="bg-background text-foreground flex h-full w-full flex-col overflow-hidden font-sans select-none">
            {/* Top Bar / App Header */}
            <div
                className="border-border bg-surface relative flex h-10 w-full shrink-0 items-center justify-between border-b px-3 pr-1.5 pl-1"
                {...dragProps}
            >
                <div className="flex items-center gap-3">
                    {isMac && <div className="w-16 shrink-0" />}
                </div>

                {/* Centered App Title */}
                <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-2">
                    <img
                        src={appLogo}
                        alt="FuseGrab"
                        className="h-5 w-5 rounded-xs object-contain shadow-xs"
                    />
                    <span className="text-foreground text-xs font-semibold tracking-wide">
                        FuseGrab
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <InputRoot className="h-6.5 w-44 rounded-full lg:w-56">
                        <InputIcon>
                            <Search className="size-3" />
                        </InputIcon>
                        <InputField
                            placeholder="Search in the List"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="text-xs"
                        />
                    </InputRoot>
                </div>
            </div>

            {/* Action Toolbar */}
            <DownloaderToolbar
                items={filteredItems}
                onAddUrl={() => !isFetchingVideos && setShowAddUrlModal(true)}
                onResumeSelected={() => handleStartSelectedDownloads()}
                onPauseSelected={handlePauseSelected}
                onDeleteSelected={handleDeleteSelected}
                onOptions={() => setShowOptionsModal(true)}
                isFetchingVideos={isFetchingVideos}
                fetchingTitle={fetchingTitle}
            />

            {/* Main Body */}
            <div className="flex min-h-0 w-full flex-1 overflow-hidden">
                <DownloaderSidebar
                    items={items}
                    activeFilter={activeFilter}
                    setActiveFilter={setActiveFilter}
                />

                <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
                    <DownloaderTable
                        filteredItems={filteredItems}
                        setItems={setItems}
                        allSelected={allSelected}
                        isIndeterminate={isIndeterminate}
                        toggleSelectAll={toggleSelectAll}
                        onToggleItemSelect={handleToggleItemSelect}
                        onAddUrl={() =>
                            !isFetchingVideos && setShowAddUrlModal(true)
                        }
                        onStartItem={(id) => handleStartSelectedDownloads(id)}
                        onStopItem={handleStopItem}
                        onDeleteItem={handleDeleteItem}
                        onOpenFolder={handleOpenFolder}
                        isFetchingVideos={isFetchingVideos}
                    />

                    <DownloaderFooter
                        items={filteredItems}
                        activeFilter={activeFilter}
                        setActiveFilter={setActiveFilter}
                    />
                </main>
            </div>

            {/* Modals */}
            <AddUrlModal
                open={showAddUrlModal}
                onOpenChange={setShowAddUrlModal}
                inputUrl={inputUrl}
                setInputUrl={setInputUrl}
                loadingInfo={loadingInfo}
                error={error}
                onSubmit={handleAddUrl}
            />

            <DownloadOptionsModal
                open={showOptionsModal}
                onOpenChange={setShowOptionsModal}
                downloadDir={downloadDir}
                onSelectFolder={handleSelectFolder}
                defaultQuality={defaultQuality}
                onDefaultQualityChange={handleDefaultQualityChange}
            />

            <FileMissingDialog
                item={missingFileItem}
                onClose={() => setMissingFileItem(null)}
                onRedownload={(id) => handleStartSelectedDownloads(id)}
            />
        </div>
    )
}
