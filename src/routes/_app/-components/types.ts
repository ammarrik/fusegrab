export interface DownloadItem {
    id: string
    name: string
    url: string
    type: 'video' | 'channel'
    channelName?: string
    quality?: string
    size: string
    status: 'Complete' | 'Downloading' | 'Paused' | 'Error' | 'Queued'
    statusStage?: string
    percent: number
    timeLeft: string
    dateModified: string
    savePath?: string
    selected: boolean
}

export function sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '').trim() || 'youtube-video'
}

export function formatDate(date: Date): string {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}/${mm}/${dd}`
}

export function getStatusText(item: DownloadItem): string {
    if (item.statusStage) return item.statusStage
    if (item.status === 'Queued') return 'Queued'
    if (item.status === 'Complete') return 'Complete'
    if (item.status === 'Error') return 'Error'
    if (item.status === 'Paused') return 'Paused'
    if (item.status === 'Downloading') {
        if (!item.percent || item.percent <= 0) return 'Preparing...'
        if (item.percent >= 99 && item.percent < 100)
            return 'Combining parts...'
        return `${Math.round(item.percent)}%`
    }
    return item.status
}
