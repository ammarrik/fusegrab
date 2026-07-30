import { useState } from 'react'

import { Folder, FolderOpen, Video } from '#/components/icons'

import type { DownloadItem } from './types'

interface DownloaderSidebarProps {
    items: DownloadItem[]
    activeFilter: string
    setActiveFilter: (filter: string) => void
}

export function DownloaderSidebar({
    items,
    activeFilter,
    setActiveFilter,
}: DownloaderSidebarProps) {
    const [isChannelsExpanded, setIsChannelsExpanded] = useState(true)

    const channelMap = new Map<string, number>()
    for (const item of items) {
        if (item.channelName) {
            channelMap.set(
                item.channelName,
                (channelMap.get(item.channelName) || 0) + 1,
            )
        }
    }
    const channelList = Array.from(channelMap.entries()).map(
        ([name, count]) => ({
            name,
            count,
        }),
    )

    const individualCount = items.filter((i) => !i.channelName).length

    return (
        <aside className="border-border bg-surface flex w-56 shrink-0 flex-col justify-between border-r p-3 select-none">
            <div className="flex flex-col gap-4 overflow-y-auto">
                {/* Main Category Filter */}
                <div>
                    <div className="text-muted-foreground mb-2 px-2 text-[10px] font-semibold tracking-wider uppercase">
                        Categories
                    </div>

                    <div className="flex flex-col gap-1">
                        <button
                            type="button"
                            onClick={() => setActiveFilter('all')}
                            className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                                activeFilter === 'all'
                                    ? 'bg-accent text-foreground'
                                    : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                            }`}
                        >
                            <div className="flex min-w-0 items-center gap-2.5">
                                <Folder className="text-primary h-4 w-4 shrink-0" />
                                <span className="truncate">All Downloads</span>
                            </div>
                            <span className="bg-muted text-muted-foreground ml-1.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                {items.length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveFilter('individual')}
                            className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                                activeFilter === 'individual'
                                    ? 'bg-accent text-foreground'
                                    : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                            }`}
                        >
                            <div className="flex min-w-0 items-center gap-2.5">
                                <Video className="text-primary h-4 w-4 shrink-0" />
                                <span className="truncate">Individual Videos</span>
                            </div>
                            <span className="bg-muted text-muted-foreground ml-1.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                {individualCount}
                            </span>
                        </button>

                        {/* Collapsible Channels & Playlists Section */}
                        <button
                            type="button"
                            onClick={() => setIsChannelsExpanded((prev) => !prev)}
                            className="text-foreground/80 hover:bg-muted hover:text-foreground flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer"
                        >
                            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                                {isChannelsExpanded ? (
                                    <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                                ) : (
                                    <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                                )}
                                <span className="truncate text-xs">
                                    Channels & Playlists
                                </span>
                            </div>
                            <span className="bg-muted text-muted-foreground ml-1.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                {channelList.length}
                            </span>
                        </button>

                        {/* Sub-channel Folders */}
                        {isChannelsExpanded && channelList.length > 0 && (
                            <div className="flex flex-col gap-1">
                                {channelList.map((ch) => (
                                    <button
                                        key={ch.name}
                                        type="button"
                                        onClick={() =>
                                            setActiveFilter(`channel:${ch.name}`)
                                        }
                                        className={`flex items-center justify-between rounded-lg pl-9 pr-2.5 py-2 text-xs font-medium transition-colors w-full ${
                                            activeFilter ===
                                            `channel:${ch.name}`
                                                ? 'bg-accent text-foreground'
                                                : 'text-foreground/75 hover:bg-muted hover:text-foreground'
                                        }`}
                                        title={ch.name}
                                    >
                                        <span className="truncate min-w-0">
                                            {ch.name}
                                        </span>
                                        <span className="bg-muted text-muted-foreground ml-1.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                            {ch.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    )
}
