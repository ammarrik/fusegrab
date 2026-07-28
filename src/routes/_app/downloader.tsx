import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/downloader')({
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-sm">
                Video Downloader coming soon.
            </p>
        </div>
    )
}
