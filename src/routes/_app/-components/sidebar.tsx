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
                            <div className="flex items-center gap-2.5">
                                <Folder className="text-primary h-4 w-4" />
                                <span>All Downloads</span>
                            </div>
                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold">
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
                            <div className="flex items-center gap-2.5">
                                <Video className="text-primary h-4 w-4" />
                                <span>Individual Videos</span>
                            </div>
                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                {items.filter((i) => i.type === 'video').length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveFilter('channels')}
                            className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                                activeFilter === 'channels'
                                    ? 'bg-accent text-foreground'
                                    : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <FolderOpen className="h-4 w-4 text-amber-500" />
                                <span>Channels & Playlists</span>
                            </div>
                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                {
                                    items.filter((i) => i.type === 'channel')
                                        .length
                                }
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    )
}
