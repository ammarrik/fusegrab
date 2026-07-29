import { describe, expect, it } from 'vitest'

import { chunksToCues, collapseRepeats } from './segment'

describe('collapseRepeats', () => {
    it('reduces a looped phrase to one instance', () => {
        // The exact shape Whisper produces when its decoder gets stuck.
        const looped = Array.from({ length: 12 }, () => "say I'm going to")
            .join(' ')
            .trim()
        expect(collapseRepeats(looped)).toBe("say I'm going to")
    })

    it('keeps the tail that follows a loop', () => {
        expect(
            collapseRepeats('thanks thanks thanks for watching the video'),
        ).toBe('thanks for watching the video')
    })

    it('collapses a single repeated word', () => {
        expect(collapseRepeats('you you you you you you')).toBe('you')
    })

    it('leaves ordinary speech alone', () => {
        const text =
            'Good morning. Today I want to talk about three things that changed how our team ships software.'
        expect(collapseRepeats(text)).toBe(text)
    })

    it('leaves a deliberate double alone', () => {
        expect(collapseRepeats('no no do not open that door yet please')).toBe(
            'no no do not open that door yet please',
        )
    })

    it('normalizes whitespace without otherwise changing short text', () => {
        expect(collapseRepeats('  hello   there  ')).toBe('hello there')
    })
})

describe('chunksToCues', () => {
    it('folds a run of identical cues into one span', () => {
        const cues = chunksToCues(
            [
                { timestamp: [0, 3], text: 'Thank you.' },
                { timestamp: [3, 6], text: 'Thank you.' },
                { timestamp: [6, 9], text: 'Thank you.' },
                { timestamp: [9, 12], text: 'And now the news.' },
            ],
            12,
        )
        expect(cues.map((cue) => cue.text)).toEqual([
            'Thank you.',
            'And now the news.',
        ])
        // The folded cue keeps the whole span it covered.
        expect(cues[0].start).toBe(0)
        expect(cues[0].end).toBe(9)
    })

    it('fills in a missing final timestamp from the duration', () => {
        const cues = chunksToCues(
            [{ timestamp: [0, null], text: 'Only line.' }],
            8,
        )
        expect(cues).toHaveLength(1)
        expect(cues[0].end).toBe(8)
    })

    it('splits an over-long chunk at sentence boundaries', () => {
        const long =
            'The first is small pull requests. When a change is under two hundred lines, reviewers actually read it. The second is writing the test before the fix.'
        const cues = chunksToCues([{ timestamp: [0, 15], text: long }], 15)
        expect(cues.length).toBeGreaterThan(1)
        // Timings stay ordered and inside the source span.
        for (const [index, cue] of cues.entries()) {
            expect(cue.end).toBeGreaterThan(cue.start)
            if (index > 0) {
                expect(cue.start).toBeGreaterThanOrEqual(cues[index - 1].start)
            }
        }
        expect(cues[cues.length - 1].end).toBeLessThanOrEqual(15)
    })
})
