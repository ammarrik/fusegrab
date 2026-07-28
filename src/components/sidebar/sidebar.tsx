import type { IconComponent } from '#/components/icons'

import { Link } from '@tanstack/react-router'

import { Home, Loader2, PanelLeft, RefreshCw } from '#/components/icons'
import { TOOLS } from '#/lib/tools'
import { cn } from '#/lib/utils'

import {
    activeItemClass,
    itemClass,
    SIDEBAR_COLLAPSED_WIDTH,
    SIDEBAR_EXPANDED_WIDTH,
} from './styles'
import { useUpdater } from './use-updater'

const isWindows =
    typeof window !== 'undefined' && window.windowControls?.platform === 'win32'

const MB = 1024 * 1024

const NAV_ITEMS: Array<{
    to: '/' | '/captions' | '/downloader'
    label: string
    icon: IconComponent
    exact?: boolean
}> = [
    { to: '/', label: 'Home', icon: Home, exact: true },
    ...TOOLS.map(({ to, label, icon }) => ({ to, label, icon })),
]

const updateItemClass =
    'text-foreground/80 [&_svg]:text-foreground/55 relative mb-0.5 flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-md border px-2 text-sm [&_svg]:size-4 [&_svg]:shrink-0'

type SidebarProps = {
    collapsed: boolean
    onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const { state: update, currentVersion, download, install } = useUpdater()
    const updatePercent = Math.max(0, Math.min(100, update?.percent ?? 0))

    return (
        <aside
            style={{
                width: collapsed
                    ? SIDEBAR_COLLAPSED_WIDTH
                    : SIDEBAR_EXPANDED_WIDTH,
            }}
            className={cn(
                'bg-sidebar-background text-sidebar-foreground border-sidebar-border relative flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out',
                !isWindows && 'border-r',
            )}
        >
            <div className="flex min-h-0 flex-1 flex-col">
                {!isWindows && (
                    // Chrome-style header: expanded, the toggle sits right
                    // after the traffic lights (which occupy x=12..64 of this
                    // row); collapsed, the lights live in the strip above the
                    // rail and the toggle is centered at the rail's top.
                    <header
                        className={cn(
                            'flex h-10 shrink-0 items-center',
                            collapsed ? 'justify-center' : 'pl-18',
                        )}
                    >
                        <button
                            type="button"
                            aria-label={
                                collapsed
                                    ? 'Expand sidebar'
                                    : 'Collapse sidebar'
                            }
                            onClick={onToggle}
                            onDoubleClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:bg-foreground/8 hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors"
                            style={
                                {
                                    WebkitAppRegion: 'no-drag',
                                } as React.CSSProperties
                            }
                        >
                            <PanelLeft className="size-4" />
                        </button>
                    </header>
                )}
                {!isWindows && collapsed && (
                    <div className="bg-sidebar-border mx-auto h-px w-8 shrink-0" />
                )}
                <nav className="flex flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-2">
                    {NAV_ITEMS.map(({ to, label, icon: Icon, exact }) => (
                        <Link
                            key={to}
                            to={to}
                            title={collapsed ? label : undefined}
                            activeOptions={{ exact }}
                            className={cn(
                                itemClass,
                                collapsed && 'mx-auto w-8 justify-center px-0',
                            )}
                            activeProps={{
                                className: cn(
                                    itemClass,
                                    activeItemClass,
                                    collapsed &&
                                        'mx-auto w-8 justify-center px-0',
                                ),
                            }}
                        >
                            <Icon />
                            {!collapsed && (
                                <span className="min-w-0 truncate whitespace-nowrap">
                                    {label}
                                </span>
                            )}
                        </Link>
                    ))}
                </nav>
            </div>

            <div className="shrink-0 px-2 pb-2">
                {update?.status === 'available' && (
                    <button
                        type="button"
                        onClick={() => download()}
                        title={collapsed ? 'Update available' : undefined}
                        className={cn(
                            updateItemClass,
                            'border-transparent transition-colors hover:bg-black/5',
                            collapsed && 'mx-auto w-8 justify-center px-0',
                        )}
                    >
                        <span className="relative flex">
                            <RefreshCw />
                            <span className="absolute -top-0.5 -right-0.5 flex size-1.5">
                                <span className="bg-foreground/70 absolute inline-flex size-full animate-ping rounded-full opacity-75" />
                                <span className="bg-foreground/70 relative inline-flex size-1.5 rounded-full" />
                            </span>
                        </span>
                        {!collapsed && (
                            <>
                                <span className="min-w-0 truncate whitespace-nowrap">
                                    Update available
                                </span>
                                {update.version && (
                                    <span className="text-muted-foreground ml-auto text-xs">
                                        v{update.version}
                                    </span>
                                )}
                            </>
                        )}
                    </button>
                )}

                {update?.status === 'downloading' && (
                    <div
                        title={collapsed ? 'Downloading update…' : undefined}
                        className={cn(
                            updateItemClass,
                            'border-sidebar-border',
                            collapsed && 'mx-auto w-8 justify-center px-0',
                        )}
                    >
                        <div
                            className="bg-foreground/8 absolute inset-y-0 left-0 transition-[width] duration-200 ease-out"
                            style={{ width: `${updatePercent}%` }}
                        />
                        <Loader2 className="relative animate-spin" />
                        {!collapsed && (
                            <>
                                <span className="relative min-w-0 truncate whitespace-nowrap">
                                    Downloading update…
                                </span>
                                <span className="text-muted-foreground relative ml-auto shrink-0 text-xs whitespace-nowrap tabular-nums">
                                    {(update.transferred / MB).toFixed(1)} /{' '}
                                    {(update.total / MB).toFixed(1)} MB
                                </span>
                            </>
                        )}
                    </div>
                )}

                {update?.status === 'downloaded' && (
                    <button
                        type="button"
                        onClick={() => install()}
                        title={collapsed ? 'Install update' : undefined}
                        className={cn(
                            updateItemClass,
                            'border-transparent transition-colors hover:bg-black/5',
                            collapsed && 'mx-auto w-8 justify-center px-0',
                        )}
                    >
                        <RefreshCw />
                        {!collapsed && (
                            <>
                                <span className="min-w-0 truncate whitespace-nowrap">
                                    Install update
                                </span>
                                {update.version && (
                                    <span className="text-muted-foreground ml-auto text-xs">
                                        v{update.version}
                                    </span>
                                )}
                            </>
                        )}
                    </button>
                )}

                {update?.status === 'installing' && (
                    <div
                        title={collapsed ? 'Installing update…' : undefined}
                        className={cn(
                            updateItemClass,
                            'border-sidebar-border',
                            collapsed && 'mx-auto w-8 justify-center px-0',
                        )}
                    >
                        {updatePercent > 0 && (
                            <div
                                className="bg-foreground/8 absolute inset-y-0 left-0 transition-[width] duration-200 ease-out"
                                style={{ width: `${updatePercent}%` }}
                            />
                        )}
                        <Loader2 className="relative animate-spin" />
                        {!collapsed && (
                            <>
                                <span className="relative min-w-0 truncate whitespace-nowrap">
                                    Installing update…
                                </span>
                                {updatePercent > 0 && (
                                    <span className="text-muted-foreground relative ml-auto shrink-0 text-xs tabular-nums">
                                        {Math.round(updatePercent)}%
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                )}

                {currentVersion && !collapsed && (
                    <p className="text-muted-foreground/70 px-2 pt-1 text-xs whitespace-nowrap">
                        v{currentVersion}
                    </p>
                )}
            </div>
        </aside>
    )
}
