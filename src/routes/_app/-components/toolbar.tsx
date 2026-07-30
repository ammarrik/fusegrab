import type { DownloadItem } from './types'

import {
    Pause,
    Play,
    Plus,
    RefreshCw,
    Settings,
    Square,
    Trash2,
} from '#/components/icons'

interface DownloaderToolbarProps {
    items: DownloadItem[]
    isDownloading: boolean
    onAddUrl: () => void
    onStartSelected: () => void
    onStop: () => void
    onDeleteSelected: () => void
    onOptions: () => void
    onRefresh: () => void
}

export function DownloaderToolbar({
    items,
    isDownloading,
    onAddUrl,
    onStartSelected,
    onStop,
    onDeleteSelected,
    onOptions,
    onRefresh,
}: DownloaderToolbarProps) {
    return (
        <div className="border-border bg-surface flex w-full shrink-0 items-center justify-between gap-2 overflow-x-auto border-b p-2 select-none">
            <div className="flex items-center gap-1.5">
                {/* Add URL Primary Button */}
                <button
                    type="button"
                    onClick={onAddUrl}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium shadow-xs transition-all active:scale-95"
                    title="Add URL"
                    aria-label="Add URL"
                >
                    <Plus className="size-3.5" />
                    <span>Add URL</span>
                </button>

                <div className="bg-border/60 mx-1 h-4 w-px" />

                {/* Resume */}
                <button
                    type="button"
                    onClick={onStartSelected}
                    disabled={
                        isDownloading ||
                        items.length === 0 ||
                        !items.some((i) => i.status !== 'Complete')
                    }
                    className="hover:bg-muted text-foreground/90 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
                    title="Resume Download"
                    aria-label="Resume Download"
                >
                    <Play className="text-success size-3.5" />
                    <span>Resume</span>
                </button>

                {/* Stop */}
                <button
                    type="button"
                    onClick={onStop}
                    disabled={!isDownloading}
                    className="hover:bg-muted text-foreground/90 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
                    title="Stop Active Download"
                    aria-label="Stop Active Download"
                >
                    <Pause className="h-3.5 w-3.5 text-amber-500" />
                    <span>Stop</span>
                </button>

                {/* Stop All */}
                <button
                    type="button"
                    onClick={onStop}
                    disabled={!isDownloading}
                    className="hover:bg-muted text-foreground/90 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
                    title="Stop All Downloads"
                    aria-label="Stop All Downloads"
                >
                    <Square className="text-danger size-3.5" />
                    <span>Stop All</span>
                </button>

                {/* Delete */}
                <button
                    type="button"
                    onClick={onDeleteSelected}
                    disabled={items.length === 0}
                    className="hover:bg-muted text-foreground/90 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
                    title="Delete Selected Items"
                    aria-label="Delete Selected Items"
                >
                    <Trash2 className="text-danger size-3.5" />
                    <span>Delete</span>
                </button>

                {/* Options */}
                <button
                    type="button"
                    onClick={onOptions}
                    className="hover:bg-muted text-foreground/90 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
                    title="Download Settings"
                    aria-label="Download Settings"
                >
                    <Settings className="text-muted-foreground size-3.5" />
                    <span>Options</span>
                </button>
            </div>

            <div className="flex items-center gap-1.5">
                {/* Refresh */}
                <button
                    type="button"
                    onClick={onRefresh}
                    className="hover:bg-muted text-foreground flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
                    title="Refresh List"
                    aria-label="Refresh List"
                >
                    <RefreshCw className="text-primary size-3.5" />
                    <span>Refresh</span>
                </button>
            </div>
        </div>
    )
}
