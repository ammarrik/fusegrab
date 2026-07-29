import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'

/** Whisper is trained on 16 kHz mono audio; anything else has to be converted. */
export const TARGET_SAMPLE_RATE = 16000

export type ExtractedAudio = {
    /** Mono PCM at {@link TARGET_SAMPLE_RATE}, in −1…1. */
    samples: Float32Array
    duration: number
}

/**
 * Pulls the audio out of a video (or audio) file as the PCM Whisper expects.
 *
 * The fast path hands the whole file to Web Audio, which decodes and resamples
 * in one go. That covers MP4/MOV/M4A/MP3/WAV/WebM — everything most people
 * have. Containers Chromium won't decode wholesale (MKV, AVI, and MP4s with
 * unusual track layouts) fall back to demuxing the audio track ourselves.
 */
export async function extractAudio(file: File): Promise<ExtractedAudio> {
    try {
        return await decodeWholeFile(file)
    } catch {
        return await decodeAudioTrack(file)
    }
}

async function decodeWholeFile(file: File): Promise<ExtractedAudio> {
    const bytes = await file.arrayBuffer()
    // An OfflineAudioContext accepts any sample rate (a realtime AudioContext
    // can refuse one the output device doesn't support), and decodeAudioData
    // resamples to the context's rate for us.
    const context = new OfflineAudioContext({
        numberOfChannels: 1,
        length: 1,
        sampleRate: TARGET_SAMPLE_RATE,
    })
    const decoded = await context.decodeAudioData(bytes)
    return { samples: toMono(decoded), duration: decoded.duration }
}

async function decodeAudioTrack(file: File): Promise<ExtractedAudio> {
    const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(file),
    })
    const track = await input.getPrimaryAudioTrack()
    if (!track) {
        throw new Error(
            "This file doesn't seem to have an audio track, so there's nothing to transcribe.",
        )
    }
    if (!(await track.canDecode())) {
        throw new Error(
            `This file's audio (${track.codec ?? 'unknown codec'}) can't be decoded here. Try an MP4 or MOV.`,
        )
    }

    const duration = await input.computeDuration()
    // One extra second of headroom: container durations are often rounded, and
    // running off the end of the buffer would clip the last words.
    const samples = new Float32Array(
        Math.ceil((duration + 1) * TARGET_SAMPLE_RATE),
    )
    let written = 0

    const sink = new AudioBufferSink(track)
    for await (const { buffer, timestamp } of sink.buffers()) {
        const mono = toMono(buffer)
        const offset = Math.round(timestamp * TARGET_SAMPLE_RATE)
        const end = resampleInto(
            mono,
            buffer.sampleRate,
            samples,
            offset,
            TARGET_SAMPLE_RATE,
        )
        written = Math.max(written, end)
    }

    if (written === 0) {
        throw new Error("Couldn't read any audio out of this file.")
    }
    return { samples: samples.subarray(0, written), duration }
}

function toMono(buffer: AudioBuffer): Float32Array {
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
    const mono = new Float32Array(buffer.length)
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel)
        for (let i = 0; i < data.length; i++) mono[i] += data[i]
    }
    for (let i = 0; i < mono.length; i++) mono[i] /= buffer.numberOfChannels
    return mono
}

/**
 * Writes `source` into `target` at `offset`, converting sample rates by
 * averaging each output sample's worth of input. The averaging doubles as the
 * low-pass filter that decimation needs — dropping samples outright would fold
 * high frequencies back down as aliasing noise and confuse the model.
 *
 * Returns the index one past the last sample written.
 */
function resampleInto(
    source: Float32Array,
    sourceRate: number,
    target: Float32Array,
    offset: number,
    targetRate: number,
): number {
    if (sourceRate === targetRate) {
        const length = Math.min(source.length, target.length - offset)
        if (length > 0) target.set(source.subarray(0, length), offset)
        return offset + Math.max(0, length)
    }

    const ratio = sourceRate / targetRate
    const count = Math.floor(source.length / ratio)
    let index = offset
    for (let i = 0; i < count && index < target.length; i++, index++) {
        const from = Math.floor(i * ratio)
        const to = Math.min(source.length, Math.floor((i + 1) * ratio))
        let sum = 0
        for (let j = from; j < to; j++) sum += source[j]
        target[index] = to > from ? sum / (to - from) : 0
    }
    return index
}
