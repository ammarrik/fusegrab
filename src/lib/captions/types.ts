/** A single subtitle, with times in seconds from the start of the video. */
export type Cue = {
    id: string
    start: number
    end: number
    text: string
}

export type CaptionAlign = 'left' | 'center' | 'right'
export type CaptionPosition = 'top' | 'middle' | 'bottom'
export type CaptionBackground = 'none' | 'box' | 'pill'

/**
 * How captions look. Every length is expressed as a percentage of the video's
 * own dimensions rather than in pixels, so one style renders identically on a
 * 480p preview and a 4K export.
 */
export type CaptionStyle = {
    fontFamily: string
    fontWeight: number
    /** Cap height of the text as a percentage of video height. */
    fontSize: number
    color: string
    uppercase: boolean
    /** Line box height as a multiple of the font size. */
    lineHeight: number
    align: CaptionAlign
    position: CaptionPosition
    /** Gap between the text block and the nearest edge, as a % of video height. */
    margin: number
    /** Width the text wraps at, as a % of video width. */
    maxWidth: number
    /** Outline thickness as a multiple of the font size. 0 disables it. */
    outline: number
    outlineColor: string
    /** Drop shadow strength, 0–1. 0 disables it. */
    shadow: number
    background: CaptionBackground
    backgroundColor: string
    /** Opacity of the background plate, 0–1. */
    backgroundOpacity: number
}

/** Whisper model sizes offered in the UI. */
export type ModelSize = 'tiny' | 'base' | 'small'

/** Which ONNX Runtime backend transcription ended up using. */
export type Backend = 'webgpu' | 'cpu'

export type TranscribeRequest = {
    size: ModelSize
    /**
     * A Whisper language name, lowercase — `english`, `hindi`, `urdu`. Required:
     * the model has to be told, since transformers.js cannot detect it and
     * silently assumes English when unset.
     */
    language: string
    task: 'transcribe' | 'translate'
}

export type TranscribeStage =
    | 'idle'
    | 'decoding'
    | 'loading'
    | 'transcribing'
    | 'done'
    | 'error'

export type TranscribeProgress = {
    stage: TranscribeStage
    /** 0–1 within the current stage, or null when it can't be measured. */
    progress: number | null
    /** Human-readable detail, e.g. the model download size. */
    detail: string | null
    /** Text produced so far, streamed while the model runs. */
    partial: string
    backend: Backend | null
    error: string | null
}

/** A raw Whisper segment, before it's turned into readable cues. */
export type SpeechChunk = {
    timestamp: [number, number | null]
    text: string
}
