import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/captions')({
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-sm">
                Auto Captions coming soon.
            </p>
        </div>
    )
}
