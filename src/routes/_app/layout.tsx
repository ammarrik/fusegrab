import { createRootRoute, Outlet } from '@tanstack/react-router'

import { useWindowDrag } from '#/hooks/use-window-drag'

export const Route = createRootRoute({
    component: Layout,
})

function Layout() {
    const dragProps = useWindowDrag()

    return (
        <div className="bg-background flex h-full w-full flex-col overflow-hidden">
            <header
                className="bg-background h-9 w-full shrink-0 select-none"
                {...dragProps}
            />
            <main className="bg-background min-w-0 flex-1 overflow-hidden">
                <Outlet />
            </main>
        </div>
    )
}
