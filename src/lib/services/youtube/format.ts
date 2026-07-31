export function buildVideoFormatSelector(height?: number | null): string {
    const targetHeight =
        typeof height === 'number' && Number.isFinite(height) && height > 0
            ? Math.floor(height)
            : null
    const heightFilter = targetHeight ? `[height<=${targetHeight}]` : ''

    const selectors = [
        `bestvideo${heightFilter}+bestaudio`,
        `bestvideo${heightFilter}[ext=mp4]+bestaudio[ext=m4a]`,
    ]

    if (targetHeight) {
        selectors.push(`best[height<=${targetHeight}]`)
    }
    selectors.push('best')

    return selectors.join('/')
}
