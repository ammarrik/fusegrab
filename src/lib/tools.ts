import type { IconComponent } from '#/components/icons'

import { ClosedCaption, Download } from '#/components/icons'

export type Tool = {
    to: '/captions' | '/downloader'
    label: string
    description: string
    icon: IconComponent
}

export const TOOLS: Array<Tool> = [
    {
        to: '/captions',
        label: 'Auto Captions',
        description:
            'Transcribe a video and burn styled subtitles straight into it.',
        icon: ClosedCaption,
    },
    {
        to: '/downloader',
        label: 'Video Downloader',
        description:
            'Paste a link to save a video or its audio at the quality you pick.',
        icon: Download,
    },
]
