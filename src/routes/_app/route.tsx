import { createFileRoute } from '@tanstack/react-router'

import { YoutubeDownloader } from './-components/downloader'

export const Route = createFileRoute('/_app/')({
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <div className="@container flex h-full flex-col overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col p-6">
                <YoutubeDownloader />
            </div>
        </div>
    )
}
