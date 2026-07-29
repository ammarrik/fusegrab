import { useEffect, useState } from 'react'

import { createRootRoute, Outlet } from '@tanstack/react-router'

import { PanelLeft } from '#/components/icons'
import {
    Sidebar,
    SIDEBAR_COLLAPSED_WIDTH,
    SIDEBAR_EXPANDED_WIDTH,
} from '#/components/sidebar'
import { useWindowDrag } from '#/hooks/use-window-drag'
import { cn } from '#/lib/utils'

import appIcon from '../../../assets/icon.rounded.png'

const isWindows =
    typeof window !== 'undefined' && window.windowControls?.platform === 'win32'

export const Route = createRootRoute({
    component: Layout,
})

const SIDEBAR_COLLAPSED_KEY = 'sidebar:collapsed'

function Layout() {
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
    )

    useEffect(() => {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    }, [collapsed])

    const drag = useWindowDrag()

    const sidebarToggle = (
        <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((c) => !c)}
            onDoubleClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:bg-foreground/8 hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
            <PanelLeft className="size-4" />
        </button>
    )

    return (
        <div className="bg-background flex h-full w-full flex-col overflow-hidden">
            {isWindows && (
                <div
                    className="bg-sidebar-background z-30 flex h-10 w-full shrink-0 items-center"
                    style={drag.style}
                    onMouseDown={drag.onMouseDown}
                    onDoubleClick={drag.onDoubleClick}
                >
                    <div
                        className={cn(
                            'flex h-full items-center gap-2 transition-[width] duration-200 ease-out',
                            collapsed ? 'justify-center' : 'pl-2.5',
                        )}
                        style={{
                            width: collapsed
                                ? SIDEBAR_COLLAPSED_WIDTH
                                : SIDEBAR_EXPANDED_WIDTH,
                        }}
                    >
                        {!collapsed && (
                            <img
                                src={appIcon}
                                alt="Fuse"
                                className="size-6 shrink-0 rounded-md"
                                draggable={false}
                                style={
                                    {
                                        WebkitAppRegion: 'no-drag',
                                    } as React.CSSProperties
                                }
                            />
                        )}
                        {sidebarToggle}
                    </div>
                </div>
            )}

            {/* Chrome-style strip: when the sidebar collapses to a rail
                narrower than the traffic lights, the lights get their own
                full-width row above everything, like Chrome's toolbar. */}
            {!isWindows && collapsed && (
                <div className="border-sidebar-border h-10 w-full shrink-0 border-b" />
            )}

            <div
                className={cn(
                    'flex min-h-0 flex-1 overflow-hidden',
                    isWindows && 'bg-sidebar-background',
                )}
            >
                {!isWindows && (
                    /* The negative z-index is load-bearing. Chromium builds the
                       window's draggable region by walking the tree in paint
                       order, adding `drag` rects and subtracting `no-drag` ones,
                       so a control only carves itself out of this strip if it
                       paints *after* it. A positioned element — even at z-index
                       0 — paints above in-flow content, which would leave the
                       whole strip draggable and every control beneath it dead.
                       At a negative z-index the strip paints first and the
                       controls win. It's invisible and click-through regardless. */
                    <div
                        className="window-drag-region pointer-events-none fixed top-0 left-0 -z-10 h-10 w-full shrink-0"
                        style={drag.style}
                    />
                )}

                <Sidebar
                    collapsed={collapsed}
                    onToggle={() => setCollapsed((c) => !c)}
                />

                <main
                    className={cn(
                        'bg-background min-w-0 flex-1 overflow-hidden',
                        isWindows && 'border-sidebar-border border-t border-l',
                    )}
                >
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
