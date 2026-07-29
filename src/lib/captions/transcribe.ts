import type {
    Cue,
    SpeechChunk,
    TranscribeProgress,
    TranscribeRequest,
} from './types'
import type { WorkerRequest, WorkerResponse } from './worker-protocol'

import { extractAudio } from './audio'
import { isEnglishOnly, modelId } from './models'
import { chunksToCues } from './segment'

export type TranscribeResult = {
    cues: Array<Cue>
    text: string
}

export type TranscribeSession = {
    /** Resolves with the cues, or null if the run was cancelled. */
    result: Promise<TranscribeResult | null>
    cancel: () => void
}

const MB = 1024 * 1024

// Kept alive between runs: tearing the worker down would drop the loaded model,
// and re-initializing a session costs several seconds even when the weights are
// already cached.
let worker: Worker | null = null

function getWorker(): Worker {
    worker ??= new Worker(new URL('./transcriber.worker.ts', import.meta.url), {
        type: 'module',
    })
    return worker
}

/** Drops the worker and the model it holds, freeing a few hundred MB. */
export function disposeTranscriber(): void {
    worker?.terminate()
    worker = null
}

export function startTranscription(
    file: File,
    request: TranscribeRequest,
    onUpdate: (patch: Partial<TranscribeProgress>) => void,
): TranscribeSession {
    let cancelled = false
    let active: Worker | null = null

    const cancel = () => {
        cancelled = true
        active?.postMessage({ type: 'cancel' } satisfies WorkerRequest)
    }

    const result = (async (): Promise<TranscribeResult | null> => {
        onUpdate({
            stage: 'decoding',
            progress: null,
            detail: null,
            error: null,
            partial: '',
        })
        const audio = await extractAudio(file)
        if (cancelled) return null

        onUpdate({ stage: 'loading', progress: 0, detail: null })
        const instance = getWorker()
        active = instance

        type WorkerOutput = { chunks: Array<SpeechChunk>; text: string }
        const output = await new Promise<WorkerOutput | null>(
            (resolve, reject) => {
                const onMessage = (event: MessageEvent<WorkerResponse>) => {
                    const message = event.data
                    switch (message.type) {
                        case 'backend':
                            onUpdate({ backend: message.backend })
                            break
                        case 'download': {
                            const total = message.total || 0
                            onUpdate({
                                stage: 'loading',
                                progress: total ? message.loaded / total : null,
                                detail: total
                                    ? `${(message.loaded / MB).toFixed(0)} of ${(total / MB).toFixed(0)} MB`
                                    : null,
                            })
                            break
                        }
                        case 'loaded':
                            onUpdate({
                                stage: 'transcribing',
                                progress: 0,
                                detail: null,
                            })
                            break
                        case 'progress':
                            onUpdate({
                                stage: 'transcribing',
                                progress: message.progress,
                            })
                            break
                        case 'partial':
                            onUpdate({ partial: message.text })
                            break
                        case 'result':
                            cleanup()
                            resolve({
                                chunks: message.chunks,
                                text: message.text,
                            })
                            break
                        case 'cancelled':
                            cleanup()
                            resolve(null)
                            break
                        case 'error':
                            cleanup()
                            reject(new Error(message.message))
                            break
                    }
                }
                const onError = (event: ErrorEvent) => {
                    cleanup()
                    // A worker that dies outright (out of memory, a wasm trap) gives
                    // us little to go on, so say what's actionable.
                    reject(
                        new Error(
                            event.message ||
                                'The transcription engine stopped unexpectedly. Try a smaller model.',
                        ),
                    )
                }
                const cleanup = () => {
                    instance.removeEventListener('message', onMessage)
                    instance.removeEventListener('error', onError)
                }

                instance.addEventListener('message', onMessage)
                instance.addEventListener('error', onError)

                const englishOnly = isEnglishOnly(request)
                instance.postMessage({
                    type: 'transcribe',
                    model: modelId(request),
                    language: englishOnly ? null : request.language,
                    task: englishOnly ? null : request.task,
                    samples: audio.samples,
                    duration: audio.duration,
                } satisfies WorkerRequest)

                if (cancelled) cancel()
            },
        )

        if (!output || cancelled) return null

        const cues = chunksToCues(output.chunks, audio.duration)
        onUpdate({ stage: 'done', progress: 1, detail: null })
        return { cues, text: output.text.trim() }
    })()

    return { result, cancel }
}
