import { describe, expect, it } from 'vitest'

import { createWindowProgress, WINDOW_JUMP, WINDOW_SECONDS } from './progress'

/**
 * Replays what the streamer emits for a recording of `duration`: a run of
 * within-window timestamps for each window, restarting from zero every time the
 * pipeline advances.
 */
function replay(duration: number, step = 3): Array<number | null> {
    const track = createWindowProgress(duration)
    const out: Array<number | null> = []
    for (let start = 0; ; start += WINDOW_JUMP) {
        const covered = Math.min(WINDOW_SECONDS, duration - start)
        for (let offset = 0; offset <= covered; offset += step) {
            out.push(track(offset))
        }
        if (start + WINDOW_SECONDS >= duration) break
    }
    return out
}

describe('createWindowProgress', () => {
    it('never goes backwards across a ten-minute file', () => {
        const values = replay(600).filter((v): v is number => v !== null)
        expect(values.length).toBeGreaterThan(20)
        for (const [index, value] of values.entries()) {
            if (index > 0) expect(value).toBeGreaterThan(values[index - 1])
        }
    })

    it('reaches the end of a long file instead of stalling early', () => {
        const values = replay(600).filter((v): v is number => v !== null)
        // The old bug capped progress at one window's worth — 30/600 = 5%.
        expect(values[values.length - 1]).toBeGreaterThan(0.9)
    })

    it('holds back the final percent for completion', () => {
        const values = replay(600).filter((v): v is number => v !== null)
        for (const value of values) expect(value).toBeLessThanOrEqual(0.99)
    })

    it('tracks real elapsed audio, not window-relative time', () => {
        const track = createWindowProgress(600)
        // First window: 15s in is 15/600.
        expect(track(15)).toBeCloseTo(15 / 600, 5)
        // The drop to 2s means window two started, which begins at 20s.
        expect(track(2)).toBeCloseTo(22 / 600, 5)
        // Still window two: 25s in is 45s absolute.
        expect(track(25)).toBeCloseTo(45 / 600, 5)
    })

    it('handles a file shorter than one window', () => {
        const values = replay(12).filter((v): v is number => v !== null)
        expect(values[values.length - 1]).toBeGreaterThan(0.9)
        for (const value of values) expect(value).toBeLessThanOrEqual(0.99)
    })

    it('ignores out-of-order timestamps rather than twitching backwards', () => {
        const track = createWindowProgress(600)
        expect(track(30)).toBeCloseTo(30 / 600, 5)
        // A repeat of the same offset is not a new window and not progress.
        expect(track(30)).toBeNull()
    })

    it('reports nothing when the duration is unknown', () => {
        const track = createWindowProgress(0)
        expect(track(5)).toBeNull()
    })
})
