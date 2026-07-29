import type { Backend, SpeechChunk } from './types'

export type WorkerRequest =
    | {
          type: 'transcribe'
          model: string
          /**
           * English-only models throw if either is supplied, so both arrive as
           * null for those and are left off the call.
           */
          language: string | null
          task: 'transcribe' | 'translate' | null
          samples: Float32Array
          duration: number
      }
    | { type: 'cancel' }

export type WorkerResponse =
    | { type: 'backend'; backend: Backend }
    | { type: 'download'; loaded: number; total: number }
    | { type: 'loaded' }
    | { type: 'progress'; progress: number }
    | { type: 'partial'; text: string }
    | { type: 'result'; chunks: Array<SpeechChunk>; text: string }
    | { type: 'cancelled' }
    | { type: 'error'; message: string }
