import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/')({
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <div className="@container h-full overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-12">
                <h1 className="text-foreground text-xl font-medium">
                    Free tools
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                    Pick a tool to get started.
                </p>

                <div className="mt-6 grid gap-3 @lg:grid-cols-2"></div>
            </div>
        </div>
    )
}
