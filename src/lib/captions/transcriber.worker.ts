/// <reference lib="webworker" />
import type { Backend, SpeechChunk } from './types'
import type { WorkerRequest, WorkerResponse } from './worker-protocol'
import type { WhisperTokenizer } from '@huggingface/transformers'

import {
    env,
    InterruptableStoppingCriteria,
    pipeline,
    WhisperTextStreamer,
} from '@huggingface/transformers'

import { TARGET_SAMPLE_RATE } from './audio'
import {
    createWindowProgress,
    STRIDE_SECONDS,
    WINDOW_SECONDS,
} from './progress'

// Whisper runs here, in a worker, because a single inference call occupies its
// thread for as long as it takes — on the UI thread the window would be frozen
// for the whole transcription.

// Models come from the Hugging Face CDN on first use and are cached by the
// browser Cache API afterwards. Local file lookups would just 404 against the
// app bundle, so don't attempt them.
env.allowLocalModels = false

type OnnxWasmEnv = {
    wasmPaths?: unknown
    numThreads?: number
}

type Transcriber = Awaited<
    ReturnType<typeof pipeline<'automatic-speech-recognition'>>
>

let transcriber: Transcriber | null = null
let loadedModel: string | null = null
let loadedBackend: Backend | null = null
const stopping = new InterruptableStoppingCriteria()

function send(message: WorkerResponse): void {
    self.postMessage(message)
}

/**
 * Whisper degenerates into repeating a phrase forever when the decoder gets into
 * a bad state — the failure mode where a whole video transcribes as "say I'm
 * going to say I'm going to say I'm going to…". These are the guards against it:
 *
 *  - `no_repeat_ngram_size` forbids emitting any 6-token sequence twice, which
 *    breaks a verbatim loop the moment it tries to close. Natural speech rarely
 *    repeats five or six words exactly, so legitimate output is unaffected.
 *  - `max_new_tokens` is Whisper's own decoder limit, stated explicitly so a
 *    runaway chunk terminates on a known bound rather than whatever the model
 *    config happens to carry.
 *
 * Two things are deliberately *not* here. `repetition_penalty` reweights every
 * token, including the timestamp tokens Whisper's decoding depends on, so it
 * risks distorting ordinary output to fix a rare failure. And
 * `condition_on_prev_tokens` isn't implemented in this build of transformers.js,
 * so passing it would only look reassuring.
 *
 * These guards are a backstop, not the fix — the repetition users saw came from
 * a broken precision, not from unguarded decoding. Measured: removing them
 * changed nothing about the bad output. See {@link CANDIDATES}.
 */
const REPETITION_GUARDS = {
    no_repeat_ngram_size: 6,
    max_new_tokens: 448,
} as const

/**
 * Backend and precision combinations to try, in order. Every entry here was
 * checked against this stack, because most of the plausible ones don't work:
 *
 *  - `wasm` + int8 fails to build a session at all against the prerelease
 *    onnxruntime-web that transformers.js pins — `TransposeDQWeightsForMatMulNBits
 *    / Missing required scale`. Identical for the `Xenova` and `onnx-community`
 *    conversions, so it's the Runtime and not the weights. Kept in the list
 *    because it's much the smallest download if a later Runtime accepts it.
 *  - `wasm` + fp16 also fails: the WebAssembly backend has no fp16 kernels.
 *  - `webgpu` + fp16 *loads*, and is a trap. It transcribes a short clip
 *    correctly and then returns near-empty gibberish for anything long enough to
 *    be split into windows — the same audio that yields a clean transcript at 7
 *    seconds came back as "I'm I" at 40. Since virtually every real video is
 *    longer than one 30-second window, that made the tool useless. An fp16
 *    encoder is the difference; hence the mixed precision below, which is the
 *    configuration transformers.js's own WebGPU Whisper demo ships.
 *  - `wasm` + fp32 is unquantized and always loads, so it's the backstop for
 *    machines without a usable GPU — at several hundred MB and a good deal
 *    slower.
 */
const CANDIDATES = [
    {
        device: 'webgpu',
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    },
    { device: 'wasm', dtype: 'q8' },
    { device: 'wasm', dtype: 'fp32' },
] as const

/** Whether the GPU can run fp16 shaders; without that, WebGPU is not worth trying. */
async function hasFp16Gpu(): Promise<boolean> {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu
    if (!gpu) return false
    try {
        const adapter = await gpu.requestAdapter()
        return Boolean(adapter?.features.has('shader-f16'))
    } catch {
        return false
    }
}

async function loadWithFallback(
    model: string,
    progress_callback: (event: {
        status: string
        file?: string
        loaded?: number
        total?: number
    }) => void,
    /** Called before each attempt, so the download total starts over. */
    onAttempt: (backend: Backend) => void,
): Promise<{ transcriber: Transcriber; backend: Backend }> {
    const gpuUsable = await hasFp16Gpu()
    const candidates = CANDIDATES.filter(
        (candidate) => candidate.device !== 'webgpu' || gpuUsable,
    )

    let lastError: unknown
    for (const { device, dtype } of candidates) {
        const backend: Backend = device === 'webgpu' ? 'webgpu' : 'cpu'
        onAttempt(backend)
        try {
            const transcriber = await pipeline(
                'automatic-speech-recognition',
                model,
                { device, dtype, progress_callback },
            )
            // Building the pipeline only fetches weights; ONNX Runtime defers
            // creating the session until the first inference, so an unusable
            // combination throws long after this loop would have moved on.
            // Half a second of silence forces the session to exist here, where
            // a failure can still fall through to the next candidate.
            await transcriber(new Float32Array(TARGET_SAMPLE_RATE / 2), {
                return_timestamps: false,
                max_new_tokens: 1,
            })
            return { transcriber, backend }
        } catch (error) {
            lastError = error
            console.warn(
                `Whisper weights (${device}/${dtype}) wouldn't load, trying the next combination:`,
                error,
            )
        }
    }
    throw lastError instanceof Error
        ? lastError
        : new Error(
              "Couldn't load the speech model on this machine. Try a smaller model.",
          )
}

function configureWasm(): void {
    const wasm = (env.backends.onnx as { wasm?: OnnxWasmEnv }).wasm
    if (!wasm) return

    // On import, transformers.js points ONNX Runtime's WebAssembly binary at a
    // jsDelivr URL pinned to an exact prerelease version — the tool would then
    // need the network on every cold start and would break outright the day that
    // version disappears. Clearing the override hands resolution back to ONNX
    // Runtime, whose own `new URL(..., import.meta.url)` reference the bundler
    // rewrites to the copy it emits beside this worker. So the binary is served
    // by the dev server in development and read from the app bundle once
    // packaged, and it ships exactly once.
    delete wasm.wasmPaths

    // Multi-threaded wasm needs SharedArrayBuffer (enabled via a Chromium
    // switch in the main process). Half the cores keeps the machine usable while
    // a transcription runs; past four threads Whisper stops scaling anyway.
    const cores = navigator.hardwareConcurrency || 2
    wasm.numThreads =
        typeof SharedArrayBuffer === 'undefined'
            ? 1
            : Math.max(1, Math.min(4, Math.floor(cores / 2)))
}

async function load(request: Extract<WorkerRequest, { type: 'transcribe' }>) {
    if (transcriber && loadedModel === request.model) {
        // Re-announce the backend: the UI resets its status for each run, and
        // this path skips the resolution below.
        if (loadedBackend) send({ type: 'backend', backend: loadedBackend })
        send({ type: 'loaded' })
        return transcriber
    }

    configureWasm()

    // Downloads arrive file by file; report them as one number so the UI can
    // show a single progress bar for "getting the model".
    const files = new Map<string, { loaded: number; total: number }>()
    const progress_callback = (event: {
        status: string
        file?: string
        loaded?: number
        total?: number
    }) => {
        if (event.status !== 'progress' || !event.file) return
        files.set(event.file, {
            loaded: event.loaded ?? 0,
            total: event.total ?? 0,
        })
        let loaded = 0
        let total = 0
        for (const entry of files.values()) {
            loaded += entry.loaded
            total += entry.total
        }
        send({ type: 'download', loaded, total })
    }

    const loaded = await loadWithFallback(
        request.model,
        progress_callback,
        (backend) => {
            // Each attempt is a fresh set of files, and the UI should say which
            // backend is being tried before the (slow) download begins.
            files.clear()
            send({ type: 'backend', backend })
        },
    )
    transcriber = loaded.transcriber
    loadedBackend = loaded.backend
    loadedModel = request.model
    send({ type: 'backend', backend: loaded.backend })
    send({ type: 'loaded' })
    return transcriber
}

async function transcribe(
    request: Extract<WorkerRequest, { type: 'transcribe' }>,
) {
    const model = await load(request)
    stopping.reset()

    // Whisper's decoder emits timestamps quantized to the audio frames behind
    // one encoder position; the streamer needs that scale to turn tokens into
    // seconds.
    const config = model.model.config as { max_source_positions?: number }
    const extractor = model.processor?.feature_extractor as
        | { config?: { chunk_length?: number } }
        | undefined
    const chunkLength = extractor?.config?.chunk_length
    const timePrecision =
        chunkLength && config.max_source_positions
            ? chunkLength / config.max_source_positions
            : 0.02

    let partial = ''
    const duration =
        request.duration || request.samples.length / TARGET_SAMPLE_RATE
    // Converts the streamer's per-window timestamps into progress over the whole
    // recording; see the note in progress.ts on why that isn't a plain divide.
    const trackProgress = createWindowProgress(duration)
    const reportProgress = (offsetInWindow: number) => {
        const progress = trackProgress(offsetInWindow)
        if (progress !== null) send({ type: 'progress', progress })
    }

    // The pipeline types its tokenizer as the generic base class; for a Whisper
    // model it is always the Whisper one, which is what the streamer needs.
    const streamer = new WhisperTextStreamer(
        model.tokenizer as WhisperTokenizer,
        {
            skip_prompt: true,
            time_precision: timePrecision,
            on_chunk_start: reportProgress,
            callback_function: (text: string) => {
                partial += text
                send({ type: 'partial', text: partial })
            },
            on_chunk_end: reportProgress,
        },
    )

    const output = await model(request.samples, {
        // Greedy decoding: reproducible, and noticeably faster than sampling.
        top_k: 0,
        do_sample: false,
        // Whisper only sees 30 seconds at a time. The pipeline slides a window
        // across longer audio and stitches the overlap back together. These come
        // from progress.ts, which needs the same numbers to place a window's
        // timestamps on the recording's timeline.
        chunk_length_s: WINDOW_SECONDS,
        stride_length_s: STRIDE_SECONDS,
        return_timestamps: true,
        ...REPETITION_GUARDS,
        // Both or neither: a multilingual model needs the language token and the
        // task token, and an English-only model rejects both. `task` used to be
        // gated on `language` being set, so choosing "as spoken" with the
        // language left unset sent neither — and the model defaulted to
        // translating into English.
        ...(request.language ? { language: request.language } : {}),
        ...(request.task ? { task: request.task } : {}),
        streamer,
        stopping_criteria: stopping,
    })

    if (stopping.interrupted) {
        send({ type: 'cancelled' })
        return
    }

    const result = Array.isArray(output) ? output[0] : output
    send({
        type: 'result',
        chunks: (result.chunks ?? []).map(
            (chunk: SpeechChunk): SpeechChunk => ({
                timestamp: chunk.timestamp,
                text: chunk.text,
            }),
        ),
        text: result.text,
    })
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    const request = event.data
    if (request.type === 'cancel') {
        stopping.interrupt()
        return
    }
    transcribe(request).catch((error: unknown) => {
        send({
            type: 'error',
            message:
                error instanceof Error
                    ? error.message
                    : 'Transcription failed unexpectedly.',
        })
    })
})
