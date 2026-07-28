import { createFileRoute, Link } from '@tanstack/react-router'

import { TOOLS } from '#/lib/tools'

export const Route = createFileRoute('/_app/')({
    component: RouteComponent,
})

function RouteComponent() {
    return (
        // Container query, not a viewport breakpoint: the sidebar eats a
        // couple hundred pixels, so the viewport is a poor proxy for how much
        // room the grid actually has.
        <div className="@container h-full overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-12">
                <h1 className="text-foreground text-xl font-medium">
                    Free tools
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                    Pick a tool to get started.
                </p>

                <div className="mt-6 grid gap-3 @lg:grid-cols-2">
                    {TOOLS.map(({ to, label, description, icon: Icon }) => (
                        <Link
                            key={to}
                            to={to}
                            className="border-border hover:border-foreground/20 group flex flex-col gap-1.5 rounded-lg border p-4 transition-colors hover:bg-black/3"
                        >
                            <span className="text-foreground [&_svg]:text-foreground/55 group-hover:[&_svg]:text-foreground flex items-center gap-2 text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-colors">
                                <Icon />
                                {label}
                            </span>
                            <span className="text-muted-foreground text-sm">
                                {description}
                            </span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}
