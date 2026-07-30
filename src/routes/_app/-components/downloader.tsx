import type { DownloadItem } from './types'

import { useEffect, useState } from 'react'

import { Download, Search } from '#/components/icons'
import { InputField, InputIcon, InputRoot } from '#/components/ui/input'
import { useWindowDrag } from '#/hooks/use-window-drag'

import { AddUrlModal } from './add-dialog'
import { DownloaderFooter } from './footer'
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
                return JSON.parse(saved)
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
    const [isDownloading, setIsDownloading] = useState(false)
    const [activeItemUrl, setActiveItemUrl] = useState<string | null>(null)

    useEffect(() => {
        localStorage.setItem('fuse_download_items_v2', JSON.stringify(items))
    }, [items])

    useEffect(() => {
        window.files.getDefaultDownloadDir().then((defaultPath) => {
            const saved = localStorage.getItem('yt_download_dir')
            setDownloadDir(saved || defaultPath)
        })
    }, [])

    useEffect(() => {
        window.api.youtube.getDownloadState().then((ds) => {
            if (ds.isDownloading && ds.url) {
                setIsDownloading(true)
                setActiveItemUrl(ds.url)
            }
        })

        const offSingle = window.api.youtube.onProgress((data) => {
            if (!data) return
            setIsDownloading(true)

            setItems((prev) =>
                prev.map((item) => {
                    if (
                        activeItemUrl
                            ? item.url === activeItemUrl
                            : item.status === 'Downloading'
                    ) {
                        return {
                            ...item,
                            status: 'Downloading',
                            percent: data.percent,
                            statusStage:
                                data.percent >= 99
                                    ? 'Combining parts...'
                                    : undefined,
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
                        activeItemUrl
                            ? item.url === activeItemUrl
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
    }, [activeItemUrl])

    const handleAddUrl = async () => {
        const cleanUrl = inputUrl.trim()
        if (!cleanUrl) return

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
                    channelName: info.author,
                    quality: '720p',
                    size: 'Calculating...',
                    status: 'Queued',
                    percent: 0,
                    timeLeft: '--',
                    dateModified: formatDate(new Date()),
                    selected: true,
                }
                setItems((prev) => [newItem, ...prev])
            } else if (type === 'channel') {
                const info = await window.api.youtube.getInfo(cleanUrl)
                const newItem: DownloadItem = {
                    id: String(Date.now()),
                    name: info.title || 'Channel Download',
                    url: cleanUrl,
                    type: 'channel',
                    channelName: info.author || 'YouTube Channel',
                    quality: '720p',
                    size: `Channel`,
                    status: 'Queued',
                    percent: 0,
                    timeLeft: '--',
                    dateModified: formatDate(new Date()),
                    selected: true,
                }
                setItems((prev) => [newItem, ...prev])
            }

            setInputUrl('')
            setShowAddUrlModal(false)
        } catch (err: any) {
            setError(err?.message || 'Failed to fetch YouTube info')
        } finally {
            setLoadingInfo(false)
        }
    }

    const handleStartSelectedDownloads = async (targetItemId?: string) => {
        const selectedItems = items.filter((i) =>
            targetItemId ? i.id === targetItemId : i.selected,
        )
        if (selectedItems.length === 0) return

        let targetDir = downloadDir
        if (!targetDir) {
            targetDir = await window.files.getDefaultDownloadDir()
            setDownloadDir(targetDir)
        }

        for (const item of selectedItems) {
            if (item.status === 'Complete' && !targetItemId) continue

            try {
                setIsDownloading(true)
                setActiveItemUrl(item.url)

                setItems((prev) =>
                    prev.map((i) =>
                        i.id === item.id
                            ? {
                                  ...i,
                                  status: 'Downloading',
                                  percent: 0,
                                  statusStage: 'Preparing...',
                              }
                            : i,
                    ),
                )

                if (item.type === 'video') {
                    const sanitized = sanitizeFilename(item.name)
                    const savePath = `${targetDir.replace(/\/$/, '')}/${sanitized}.mp4`

                    await window.api.youtube.download({
                        url: item.url,
                        savePath,
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
                setItems((prev) =>
                    prev.map((i) =>
                        i.id === item.id
                            ? {
                                  ...i,
                                  status: 'Error',
                                  statusStage:
                                      err?.message || 'Download failed',
                              }
                            : i,
                    ),
                )
            } finally {
                setIsDownloading(false)
                setActiveItemUrl(null)
            }
        }
    }

    const handleStopDownload = async () => {
        try {
            await window.api.youtube.cancelDownload()
            setIsDownloading(false)
            setActiveItemUrl(null)
            setItems((prev) =>
                prev.map((i) =>
                    i.status === 'Downloading'
                        ? { ...i, status: 'Paused', statusStage: undefined }
                        : i,
                ),
            )
        } catch {}
    }

    const handleDeleteSelected = () => {
        setItems((prev) => prev.filter((i) => !i.selected))
    }

    const handleSelectFolder = async () => {
        const selected = await window.files.chooseDirectory()
        if (selected) {
            setDownloadDir(selected)
            localStorage.setItem('yt_download_dir', selected)
        }
    }

    const filteredItems = items.filter((item) => {
        const matchesSearch =
            !searchQuery.trim() ||
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.channelName?.toLowerCase().includes(searchQuery.toLowerCase())

        if (!matchesSearch) return false

        if (activeFilter === 'individual') return item.type === 'video'
        if (activeFilter === 'channels') return item.type === 'channel'
        if (activeFilter.startsWith('channel:')) {
            const targetChannel = activeFilter.replace('channel:', '')
            return item.channelName === targetChannel
        }
        if (activeFilter === 'finished') return item.status === 'Complete'
        if (activeFilter === 'unfinished') return item.status !== 'Complete'
        if (activeFilter === 'paused') return item.status === 'Paused'

        return true
    })

    const allSelected =
        filteredItems.length > 0 && filteredItems.every((i) => i.selected)
    const someSelected = filteredItems.some((i) => i.selected)
    const isIndeterminate = someSelected && !allSelected

    const toggleSelectAll = (checked: boolean) => {
        const filteredIds = new Set(filteredItems.map((i) => i.id))
        setItems((prev) =>
            prev.map((i) =>
                filteredIds.has(i.id) ? { ...i, selected: checked } : i,
            ),
        )
    }

    const handleRefresh = async () => {
        try {
            const ds = await window.api.youtube.getDownloadState()
            if (ds.isDownloading && ds.url) {
                setIsDownloading(true)
                setActiveItemUrl(ds.url)
            }
            const saved = localStorage.getItem('fuse_download_items_v2')
            if (saved) {
                const parsed = JSON.parse(saved)
                if (Array.isArray(parsed)) {
                    setItems(
                        parsed.map((item) => ({
                            ...item,
                            selected: true,
                        })),
                    )
                }
            }
        } catch {}
    }

    return (
        <div className="bg-background text-foreground flex h-full w-full flex-col overflow-hidden font-sans select-none">
            {/* Top Bar / App Header */}
            <div
                className="border-border bg-surface flex h-11 w-full shrink-0 items-center justify-between border-b p-2"
                {...dragProps}
            >
                <div className="flex items-center gap-3">
                    {isMac && <div className="w-16 shrink-0" />}

                    <div className="flex items-center gap-2">
                        <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-lg shadow-sm">
                            <Download className="size-3.5" />
                        </div>
                        <span className="text-foreground text-sm font-semibold tracking-wide">
                            Fusemass{' '}
                            <span className="text-muted-foreground text-xs font-normal">
                                v1.0
                            </span>
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <InputRoot className="h-7 w-48 rounded-full lg:w-64">
                        <InputIcon>
                            <Search />
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
                items={items}
                isDownloading={isDownloading}
                onAddUrl={() => setShowAddUrlModal(true)}
                onStartSelected={() => handleStartSelectedDownloads()}
                onStop={handleStopDownload}
                onDeleteSelected={handleDeleteSelected}
                onOptions={() => setShowOptionsModal(true)}
                onRefresh={handleRefresh}
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
                        onAddUrl={() => setShowAddUrlModal(true)}
                        onStartItem={(id) => handleStartSelectedDownloads(id)}
                        onStopDownload={handleStopDownload}
                    />

                    <DownloaderFooter
                        items={items}
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
            />
        </div>
    )
}
