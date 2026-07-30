import {
    Download,
    Folder,
    FolderOpen,
    MoreHorizontal,
    Pause,
    Play,
    RefreshCw,
    Trash2,
    Video,
} from '#/components/icons'
import { Checkbox } from '#/components/ui/checkbox'
import {
    Menu,
    MenuContent,
    MenuItem,
    MenuSeparator,
    MenuTrigger,
} from '#/components/ui/menu'
import type { DownloadItem } from './types'
import { getStatusText } from './types'

interface DownloaderTableProps {
    filteredItems: DownloadItem[]
    setItems: React.Dispatch<React.SetStateAction<DownloadItem[]>>
    allSelected: boolean
    isIndeterminate: boolean
    toggleSelectAll: (checked: boolean) => void
    onAddUrl: () => void
    onStartItem: (id: string) => void
    onStopDownload: () => void
}

export function DownloaderTable({
    filteredItems,
    setItems,
    allSelected,
    isIndeterminate,
    toggleSelectAll,
    onAddUrl,
    onStartItem,
    onStopDownload,
}: DownloaderTableProps) {
    return (
        <div className="flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs table-fixed">
                <thead>
                    <tr className="border-border bg-surface text-muted-foreground/80 sticky top-0 z-10 border-b font-normal select-none text-xs">
                        <th className="w-10 px-3 py-2.5 text-center font-normal">
                            <Checkbox
                                checked={allSelected}
                                indeterminate={isIndeterminate}
                                onCheckedChange={(c) =>
                                    toggleSelectAll(Boolean(c))
                                }
                                aria-label="Select all"
                            />
                        </th>
                        <th className="px-3 py-2.5 font-normal">Name</th>
                        <th className="w-24 px-3 py-2.5 font-normal">Quality</th>
                        <th className="w-24 px-3 py-2.5 font-normal">Size</th>
                        <th className="w-48 px-3 py-2.5 font-normal">Status</th>
                        <th className="w-32 px-3 py-2.5 font-normal">
                            Last Modification
                        </th>
                        <th className="w-10 px-3 py-2.5 text-center font-normal"></th>
                    </tr>
                </thead>
                <tbody>
                    {filteredItems.length === 0 ? (
                        <tr>
                            <td
                                colSpan={7}
                                className="text-muted-foreground py-12 text-center"
                            >
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <Download className="h-8 w-8 opacity-40" />
                                    <p className="text-xs">
                                        No downloads in this list.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={onAddUrl}
                                        className="bg-accent text-foreground border-border hover:bg-muted mt-1 rounded-full border px-3 py-1 text-xs"
                                    >
                                        + Add YouTube Link
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        filteredItems.map((item) => (
                            <tr
                                key={item.id}
                                className={`group transition-colors ${
                                    item.selected
                                        ? 'bg-accent/40 hover:bg-accent/60'
                                        : 'hover:bg-muted/50'
                                }`}
                            >
                                {/* Checkbox */}
                                <td className="w-10 px-3 py-3.5 text-center">
                                    <Checkbox
                                        checked={item.selected}
                                        onCheckedChange={(checked) => {
                                            setItems((prev) =>
                                                prev.map((i) =>
                                                    i.id === item.id
                                                        ? {
                                                              ...i,
                                                              selected:
                                                                  Boolean(
                                                                      checked,
                                                                  ),
                                                          }
                                                        : i,
                                                ),
                                            )
                                        }}
                                        aria-label={`Select ${item.name}`}
                                    />
                                </td>

                                {/* Name */}
                                <td className="px-3 py-3.5 min-w-0">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        {item.type === 'channel' ? (
                                            <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                                        ) : (
                                            <Video className="text-primary h-4 w-4 shrink-0" />
                                        )}
                                        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                            <span
                                                className="text-foreground truncate font-medium text-xs block"
                                                title={item.name}
                                            >
                                                {item.name}
                                            </span>
                                            {item.channelName && (
                                                <span className="text-muted-foreground truncate text-[10px] block">
                                                    {item.channelName}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>

                                {/* Quality */}
                                <td className="px-3 py-3.5 text-muted-foreground truncate">
                                    {item.quality || '720p'}
                                </td>

                                {/* Size */}
                                <td className="px-3 py-3.5 text-muted-foreground font-mono text-[11px] truncate">
                                    {item.size}
                                </td>

                                {/* Status & Progress */}
                                <td className="w-48 px-3 py-3.5 min-w-0">
                                    <div className="flex w-full min-w-0 flex-col gap-1 overflow-hidden">
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span
                                                className={`truncate font-medium ${
                                                    item.status === 'Complete'
                                                        ? 'text-success'
                                                        : item.status === 'Error'
                                                          ? 'text-danger'
                                                          : item.status ===
                                                              'Downloading'
                                                            ? 'text-primary font-semibold'
                                                            : 'text-muted-foreground'
                                                }`}
                                            >
                                                {getStatusText(item)}
                                            </span>
                                        </div>

                                        {item.status !== 'Queued' && (
                                            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                                                <div
                                                    className={`h-full transition-all duration-300 ${
                                                        item.status ===
                                                        'Complete'
                                                            ? 'bg-success'
                                                            : item.status ===
                                                              'Error'
                                                              ? 'bg-danger'
                                                              : 'bg-primary'
                                                    }`}
                                                    style={{
                                                        width: `${
                                                            item.status ===
                                                            'Complete'
                                                                ? 100
                                                                : item.percent ||
                                                                  0
                                                        }%`,
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </td>

                                {/* Last Modification */}
                                <td className="px-3 py-3.5 text-muted-foreground font-mono text-[11px] truncate">
                                    {item.dateModified}
                                </td>

                                {/* Actions / Menu */}
                                <td className="w-10 px-3 py-3.5 text-center">
                                    <Menu>
                                        <MenuTrigger className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-md transition-colors">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </MenuTrigger>
                                        <MenuContent sideOffset={4} align="end">
                                            {item.savePath && (
                                                <MenuItem
                                                    onClick={() =>
                                                        window.files.reveal(
                                                            item.savePath!,
                                                        )
                                                    }
                                                >
                                                    <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
                                                    <span>Open Folder</span>
                                                </MenuItem>
                                            )}
                                            {item.status === 'Downloading' ? (
                                                <MenuItem
                                                    onClick={onStopDownload}
                                                >
                                                    <Pause className="h-3.5 w-3.5 text-amber-500" />
                                                    <span>Pause</span>
                                                </MenuItem>
                                            ) : item.status === 'Paused' ? (
                                                <MenuItem
                                                    onClick={() =>
                                                        onStartItem(item.id)
                                                    }
                                                >
                                                    <Play className="text-success h-3.5 w-3.5" />
                                                    <span>Resume</span>
                                                </MenuItem>
                                            ) : item.status === 'Complete' ? (
                                                <MenuItem
                                                    onClick={() =>
                                                        onStartItem(item.id)
                                                    }
                                                >
                                                    <RefreshCw className="text-primary h-3.5 w-3.5" />
                                                    <span>Redownload</span>
                                                </MenuItem>
                                            ) : (
                                                <MenuItem
                                                    onClick={() =>
                                                        onStartItem(item.id)
                                                    }
                                                >
                                                    <Download className="text-primary h-3.5 w-3.5" />
                                                    <span>Download</span>
                                                </MenuItem>
                                            )}
                                            <MenuSeparator />
                                            <MenuItem
                                                onClick={() => {
                                                    setItems((prev) =>
                                                        prev.filter(
                                                            (i) =>
                                                                i.id !== item.id,
                                                        ),
                                                    )
                                                }}
                                                className="text-danger hover:bg-danger/10 focus:bg-danger/10"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                <span>Delete from List</span>
                                            </MenuItem>
                                        </MenuContent>
                                    </Menu>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    )
}
