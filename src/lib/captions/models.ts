import type { ModelSize, TranscribeRequest } from './types'

export type ModelOption = {
    size: ModelSize
    label: string
    hint: string
}

/**
 * Whisper, converted to ONNX by the community. The weights are downloaded once
 * on first use and then cached on disk, so every run after that works offline.
 * Nothing about a transcription ever leaves the machine.
 *
 * The `Xenova/*` conversions specifically, because they're the ones the
 * transformers.js documentation uses and are therefore exercised against it. The
 * newer `onnx-community/*` whisper repos look like drop-in equivalents and are
 * not: their int8 decoder fails to build a session at all against the ONNX
 * Runtime here, with `TransposeDQWeightsForMatMulNBits / Missing required
 * scale`. Verify a session actually loads before swapping a repo.
 *
 * No download size is quoted here on purpose: which weight files a model needs
 * depends on the model, the precision, and whether it runs on the GPU or the
 * CPU, so any figure baked in would be wrong for most combinations. The progress
 * readout reports the real total as it downloads.
 */
export const MODELS: Array<ModelOption> = [
    { size: 'tiny', label: 'Tiny', hint: 'Fastest, roughest' },
    { size: 'base', label: 'Base', hint: 'Good balance' },
    { size: 'small', label: 'Small', hint: 'Most accurate, slowest' },
]

/**
 * Whisper ships English-only variants that beat the multilingual ones at the
 * same size, so they're worth using whenever we know the audio is English and
 * we're not translating. They reject `language`/`task` arguments — see
 * {@link isEnglishOnly}.
 */
export function modelId(request: TranscribeRequest): string {
    const suffix = isEnglishOnly(request) ? '.en' : ''
    return `Xenova/whisper-${request.size}${suffix}`
}

export function isEnglishOnly(request: TranscribeRequest): boolean {
    return request.language === 'english' && request.task === 'transcribe'
}

/**
 * Languages to offer, by the names transformers.js accepts. Whisper knows 99;
 * this is the subset worth surfacing.
 *
 * The spoken language has to be chosen, not guessed: this build of
 * transformers.js has no language detection whatsoever. Leaving the language
 * unset does not auto-detect — `_retrieve_init_tokens` quietly substitutes
 * English, which is why Hindi audio used to come back as English-ish text with
 * the decoder tying itself in knots. Pick wrong and you get that same garbage,
 * so this list is the one control the user must get right.
 */
export const LANGUAGES: Array<{ label: string; value: string }> = [
    { label: 'English', value: 'english' },
    { label: 'Hindi', value: 'hindi' },
    { label: 'Urdu', value: 'urdu' },
]
