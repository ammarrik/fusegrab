import type { CaptionStyle, Cue } from './types'
import type { StreamTargetChunk } from 'mediabunny'

import {
    ALL_FORMATS,
    BlobSource,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    QUALITY_HIGH,
    StreamTarget,
} from 'mediabunny'

import { cueAt, drawCaption } from './render'

export type BurnStage = 'preparing' | 'rendering' | 'finishing'

export type BurnUpdate = {
    stage: BurnStage
    /** 0–1, or null while the length of the job isn't known yet. */
    progress: number | null
}

export type BurnSession = {
    /** Resolves with the written path, or null if cancelled. */
    result: Promise<string | null>
    cancel: () => void
}

export type BurnOptions = {
    file: File
    cues: Array<Cue>
    style: CaptionStyle
    /** Where to write the result. Chosen by the user before we start. */
    outputPath: string
    onUpdate: (update: BurnUpdate) => void
}

/**
 * Re-encodes the video with the captions painted into the frames, using the
 * browser's own H.264 encoder through WebCodecs — no ffmpeg, no native
 * dependency. Audio is copied across untouched whenever the output container
 * accepts it as-is.
 *
 * The result streams to disk as it's produced, so a long export doesn't have to
 * fit in memory.
 */
export function startBurn(options: BurnOptions): BurnSession {
    const { file, cues, style, outputPath, onUpdate } = options
    let cancelled = false
    let conversion: Conversion | null = null

    const cancel = () => {
        cancelled = true
        void conversion?.cancel()
    }

    const result = (async (): Promise<string | null> => {
        onUpdate({ stage: 'preparing', progress: null })

        const input = new Input({
            formats: ALL_FORMATS,
            source: new BlobSource(file),
        })
        const track = await input.getPrimaryVideoTrack()
        if (!track) {
            throw new Error(
                "This file has no video track, so there's nothing to burn captions into. Save an .srt instead.",
            )
        }
        if (!(await track.canDecode())) {
            throw new Error(
                `This video's codec (${track.codec ?? 'unknown'}) can't be decoded here. Try an MP4 or MOV.`,
            )
        }

        const width = track.displayWidth
        const height = track.displayHeight
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx)
            throw new Error("Couldn't create a canvas to draw captions on.")

        const streamId = await window.files.openWrite(outputPath)
        let finished = false
        const discard = async () => {
            if (finished) return
            finished = true
            await window.files.closeWrite(streamId, true)
        }

        try {
            const target = new StreamTarget(
                new WritableStream<StreamTargetChunk>({
                    write: (chunk) =>
                        window.files.write(
                            streamId,
                            chunk.position,
                            chunk.data,
                        ),
                }),
                { chunked: true },
            )

            const output = new Output({
                format: new Mp4OutputFormat(),
                target,
            })

            conversion = await Conversion.init({
                input,
                output,
                video: {
                    codec: 'avc',
                    bitrate: QUALITY_HIGH,
                    // Bake any rotation into the pixels. Otherwise a portrait
                    // phone video stays landscape-with-metadata and the captions
                    // would end up drawn along the wrong edge.
                    allowRotationMetadata: false,
                    processedWidth: width,
                    processedHeight: height,
                    process: (sample) => {
                        sample.draw(ctx, 0, 0, width, height)
                        // Nudge past the frame's start so a cue that begins
                        // exactly on this timestamp counts as showing.
                        const cue = cueAt(cues, sample.timestamp + 1e-6)
                        if (cue) {
                            drawCaption(ctx, cue.text, style, width, height)
                        }
                        return canvas
                    },
                },
            })

            const droppedVideo = conversion.discardedTracks.find(
                (dropped) => dropped.track === track,
            )
            if (droppedVideo || !conversion.isValid) {
                throw new Error(
                    droppedVideo?.reason === 'no_encodable_target_codec'
                        ? "This device can't encode H.264 video, so captions can't be burned in. Save an .srt file alongside the video instead."
                        : "This video can't be re-encoded here. Save an .srt file alongside it instead.",
                )
            }

            conversion.onProgress = (progress) => {
                onUpdate({
                    stage: progress >= 1 ? 'finishing' : 'rendering',
                    progress,
                })
            }

            await conversion.execute()
            if (cancelled) {
                await discard()
                return null
            }

            onUpdate({ stage: 'finishing', progress: 1 })
            finished = true
            await window.files.closeWrite(streamId, false)
            return outputPath
        } catch (error) {
            await discard()
            // A cancel surfaces as a thrown ConversionCanceledError; that's an
            // expected outcome, not a failure to report.
            if (cancelled) return null
            throw error
        }
    })()

    return { result, cancel }
}
