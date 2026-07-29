import type { Cue, SpeechChunk } from './types'

/** Shortest cue we'll ever show; anything briefer flashes past unreadably. */
const MIN_DURATION = 0.7
/** Longest a single cue may stay on screen before it gets split. */
const MAX_DURATION = 6
/** Characters per line, and lines per cue — the usual subtitling budget. */
const MAX_CHARS_PER_LINE = 42
const MAX_LINES = 2

const MAX_CHARS = MAX_CHARS_PER_LINE * MAX_LINES

let idCounter = 0
function nextId(): string {
    idCounter += 1
    return `cue-${idCounter}`
}

export function makeCue(start: number, end: number, text: string): Cue {
    return { id: nextId(), start, end, text }
}

/**
 * Turns Whisper's raw segments into cues that are actually readable.
 *
 * Whisper emits whatever it feels like: a two-word fragment here, a
 * forty-second run-on there, and a trailing segment with an open-ended
 * timestamp. This normalizes the timing, splits anything too long or too wordy
 * at sentence boundaries (falling back to word boundaries), and merges
 * fragments that are too brief to read on their own.
 */
export function chunksToCues(
    chunks: Array<SpeechChunk>,
    duration: number,
): Array<Cue> {
    const deduped = chunks.map((chunk) => ({
        ...chunk,
        text: collapseRepeats(chunk.text),
    }))
    const normalized = normalize(deduped, duration)
    const split = normalized.flatMap((chunk) => splitChunk(chunk))
    return dropRepeatRuns(merge(split)).map((chunk) =>
        makeCue(chunk.start, chunk.end, chunk.text),
    )
}

/**
 * Reduces a phrase repeated back-to-back to a single instance:
 * "say I'm going to say I'm going to say I'm going to" → "say I'm going to".
 *
 * The model has guards against looping, but they're not a guarantee — Whisper
 * still occasionally gets stuck, and when it does the honest thing to show is
 * the phrase once, not forty times. Only runs of three or more are touched, so
 * deliberate repetition ("no, no, don't") survives.
 */
export function collapseRepeats(text: string): string {
    const words = text.replace(/\s+/g, ' ').trim().split(' ')
    if (words.length < 6) return text.replace(/\s+/g, ' ').trim()

    // Try short phrase lengths first so the smallest repeating unit wins.
    for (let unit = 1; unit <= Math.floor(words.length / 3); unit++) {
        const phrase = words.slice(0, unit).join(' ').toLowerCase()
        let repeats = 1
        while (
            words
                .slice(repeats * unit, (repeats + 1) * unit)
                .join(' ')
                .toLowerCase() === phrase &&
            phrase !== ''
        ) {
            repeats++
        }
        if (repeats >= 3) {
            const tail = words.slice(repeats * unit)
            return [words.slice(0, unit).join(' '), ...tail].join(' ').trim()
        }
    }
    return words.join(' ')
}

/** Folds a run of cues with the same text into the first of them. */
function dropRepeatRuns(spans: Array<Span>): Array<Span> {
    const kept: Array<Span> = []
    for (const span of spans) {
        const previous = kept[kept.length - 1]
        if (
            previous &&
            previous.text.toLowerCase() === span.text.toLowerCase()
        ) {
            previous.end = span.end
            continue
        }
        kept.push(span)
    }
    return kept
}

type Span = { start: number; end: number; text: string }

function normalize(chunks: Array<SpeechChunk>, duration: number): Array<Span> {
    const spans: Array<Span> = []
    for (const [index, chunk] of chunks.entries()) {
        const text = chunk.text.replace(/\s+/g, ' ').trim()
        if (!text) continue

        const start = Math.max(0, chunk.timestamp[0] ?? 0)
        // The final segment (and occasionally one mid-stream) comes back without
        // an end time. Borrow the next segment's start, or the audio duration.
        const nextStart = chunks[index + 1]?.timestamp[0]
        const rawEnd =
            chunk.timestamp[1] ?? (nextStart != null ? nextStart : duration)
        const end = Math.min(
            duration || rawEnd,
            Math.max(rawEnd, start + MIN_DURATION),
        )
        if (end <= start) continue
        spans.push({ start, end, text })
    }

    spans.sort((a, b) => a.start - b.start)

    // Overlapping segments would make two captions fight for the screen.
    for (let i = 0; i < spans.length - 1; i++) {
        const current = spans[i]
        const next = spans[i + 1]
        if (current.end > next.start) {
            current.end = Math.max(current.start + 0.2, next.start)
        }
    }
    return spans
}

/** Splits one span into pieces that fit the character and duration budget. */
function splitChunk(span: Span): Array<Span> {
    if (
        span.text.length <= MAX_CHARS &&
        span.end - span.start <= MAX_DURATION
    ) {
        return [span]
    }

    const pieces = splitText(span.text)
    if (pieces.length <= 1) return [span]

    // Distribute the span's time across the pieces by character count: a
    // reasonable proxy for how long each takes to say.
    const totalChars = pieces.reduce((sum, piece) => sum + piece.length, 0)
    const totalTime = span.end - span.start
    const spans: Array<Span> = []
    let cursor = span.start
    for (const [index, piece] of pieces.entries()) {
        const share = (piece.length / totalChars) * totalTime
        const end =
            index === pieces.length - 1
                ? span.end
                : Math.min(span.end, cursor + share)
        spans.push({ start: cursor, end, text: piece })
        cursor = end
    }
    return spans.filter((piece) => piece.end > piece.start)
}

function splitText(text: string): Array<string> {
    // Prefer breaking where the speaker paused: sentence enders, then clause
    // punctuation, then anywhere between words.
    const sentences = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [
        text,
    ]
    const pieces: Array<string> = []
    for (const sentence of sentences.map((s) => s.trim()).filter(Boolean)) {
        if (sentence.length <= MAX_CHARS) {
            pieces.push(sentence)
            continue
        }
        pieces.push(...splitOnClauses(sentence))
    }
    return pieces
}

function splitOnClauses(sentence: string): Array<string> {
    const parts = sentence.split(/(?<=[,;:—–])\s+/)
    const pieces: Array<string> = []
    let buffer = ''
    for (const part of parts) {
        const candidate = buffer ? `${buffer} ${part}` : part
        if (candidate.length <= MAX_CHARS) {
            buffer = candidate
            continue
        }
        if (buffer) pieces.push(buffer)
        buffer = part.length <= MAX_CHARS ? part : ''
        if (!buffer) pieces.push(...splitOnWords(part))
    }
    if (buffer) pieces.push(buffer)
    return pieces
}

function splitOnWords(text: string): Array<string> {
    const words = text.split(/\s+/).filter(Boolean)
    const pieces: Array<string> = []
    let buffer = ''
    for (const word of words) {
        const candidate = buffer ? `${buffer} ${word}` : word
        if (candidate.length <= MAX_CHARS) {
            buffer = candidate
        } else {
            if (buffer) pieces.push(buffer)
            buffer = word
        }
    }
    if (buffer) pieces.push(buffer)
    return pieces
}

/** Folds cues too short to read into the one that follows them. */
function merge(spans: Array<Span>): Array<Span> {
    const merged: Array<Span> = []
    for (const span of spans) {
        const previous = merged[merged.length - 1]
        const tooShort = span.end - span.start < MIN_DURATION
        const joinable =
            previous &&
            tooShort &&
            `${previous.text} ${span.text}`.length <= MAX_CHARS &&
            span.end - previous.start <= MAX_DURATION &&
            span.start - previous.end < 0.4

        if (joinable) {
            previous.text = `${previous.text} ${span.text}`
            previous.end = span.end
            continue
        }
        merged.push({ ...span })
    }

    // A cue that's still too brief just gets held on screen a little longer,
    // stopping short of the next one.
    for (const [index, span] of merged.entries()) {
        if (span.end - span.start >= MIN_DURATION) continue
        const limit = merged[index + 1]?.start ?? Infinity
        span.end = Math.min(limit, span.start + MIN_DURATION)
    }
    return merged.filter((span) => span.end > span.start)
}
