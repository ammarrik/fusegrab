import type { Cue } from './types'

/** `1:23` / `1:02:03` — for the UI, not for subtitle files. */
export function formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const secs = total % 60
    const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
    return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(secs).padStart(2, '0')}`
}

function stamp(seconds: number, msSeparator: string): string {
    const clamped = Math.max(0, seconds)
    const hours = Math.floor(clamped / 3600)
    const minutes = Math.floor((clamped % 3600) / 60)
    const secs = Math.floor(clamped % 60)
    const ms = Math.round((clamped - Math.floor(clamped)) * 1000)
    return (
        `${String(hours).padStart(2, '0')}:` +
        `${String(minutes).padStart(2, '0')}:` +
        `${String(secs).padStart(2, '0')}${msSeparator}` +
        `${String(ms).padStart(3, '0')}`
    )
}

/** Wraps a cue onto at most two lines, the convention for subtitle files. */
function layoutText(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean.length <= 42) return clean
    const words = clean.split(' ')
    let best = clean
    let bestDelta = Infinity
    // Pick the break that leaves the two lines closest in length.
    for (let i = 1; i < words.length; i++) {
        const first = words.slice(0, i).join(' ')
        const second = words.slice(i).join(' ')
        const delta = Math.abs(first.length - second.length)
        if (delta < bestDelta) {
            bestDelta = delta
            best = `${first}\n${second}`
        }
    }
    return best
}

export function toSrt(cues: Array<Cue>): string {
    return (
        cues
            .map((cue, index) =>
                [
                    String(index + 1),
                    `${stamp(cue.start, ',')} --> ${stamp(cue.end, ',')}`,
                    layoutText(cue.text),
                ].join('\n'),
            )
            .join('\n\n') + '\n'
    )
}

export function toVtt(cues: Array<Cue>): string {
    return (
        'WEBVTT\n\n' +
        cues
            .map((cue) =>
                [
                    `${stamp(cue.start, '.')} --> ${stamp(cue.end, '.')}`,
                    layoutText(cue.text),
                ].join('\n'),
            )
            .join('\n\n') +
        '\n'
    )
}
