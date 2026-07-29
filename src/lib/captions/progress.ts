/**
 * Whisper only sees 30 seconds at a time, so longer audio is processed as a
 * series of overlapping windows. These are the values handed to the pipeline;
 * they live here so the progress arithmetic below can't drift out of step with
 * the call that does the work.
 */
export const WINDOW_SECONDS = 30
export const STRIDE_SECONDS = 5

/**
 * How far the window moves each step. The pipeline overlaps windows by `stride`
 * on both sides and advances by `window - 2 * stride`, so window `k` begins at
 * `k * WINDOW_JUMP` seconds into the audio.
 */
export const WINDOW_JUMP = WINDOW_SECONDS - 2 * STRIDE_SECONDS

/**
 * Turns the streamer's per-window timestamps into progress across the whole
 * file.
 *
 * The catch this exists to handle: the timestamps reported while decoding are
 * relative to the *current window*, not to the recording. Treating them as
 * absolute makes the bar climb to `30 / duration` and then snap back to zero
 * once for every window — on a ten-minute video, thirty resets at about 5%
 * each, which is what it used to do.
 *
 * A window boundary is detectable without any cooperation from the library: the
 * offsets only ever move forward within a window, so any decrease means a new
 * one has started. Progress is also held monotonic, since Whisper can emit
 * timestamps slightly out of order and a bar that twitches backwards looks
 * broken even when the work is fine.
 *
 * Returns the new fraction, or null when there's nothing worth reporting.
 */
export function createWindowProgress(
    duration: number,
): (offsetInWindow: number) => number | null {
    let windowIndex = 0
    let lastOffset = 0
    let reported = 0

    return (offsetInWindow) => {
        if (!(duration > 0)) return null

        // A tiny epsilon so floating-point noise in equal timestamps doesn't
        // read as a window boundary.
        if (offsetInWindow + 1e-3 < lastOffset) windowIndex++
        lastOffset = offsetInWindow

        const seconds = windowIndex * WINDOW_JUMP + offsetInWindow
        // Capped below 1: the last stretch belongs to assembling the cues, and
        // only actual completion should show 100%.
        const next = Math.min(0.99, seconds / duration)
        if (next <= reported) return null
        reported = next
        return next
    }
}
