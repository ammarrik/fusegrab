import type { SelectOption } from '#/components/ui'
import type {
    ModelSize,
    TranscribeProgress,
    TranscribeRequest,
} from '#/lib/captions/types'

import { Loader2, Sparkles } from '#/components/icons'
import { Button, Field, ProgressBar, Segmented, Select } from '#/components/ui'
import { LANGUAGES, MODELS } from '#/lib/captions/models'

type TranscribePanelProps = {
    request: TranscribeRequest
    onRequestChange: (request: TranscribeRequest) => void
    progress: TranscribeProgress
    hasCues: boolean
    onStart: () => void
    onCancel: () => void
}

const STAGE_LABELS: Record<string, string> = {
    decoding: 'Reading the audio',
    loading: 'Getting the model',
    transcribing: 'Transcribing',
}

const MODEL_OPTIONS: Array<SelectOption<ModelSize>> = MODELS.map((model) => ({
    value: model.size,
    label: model.label,
    hint: model.hint,
}))

// No "detect automatically" entry: Whisper has to be told the language, and
// leaving it unset silently means English rather than detection.
const LANGUAGE_OPTIONS: Array<SelectOption<string>> = LANGUAGES.map(
    (language) => ({ value: language.value, label: language.label }),
)

const LANGUAGE_LABELS = new Map(
    LANGUAGES.map((language) => [language.value, language.label]),
)

/**
 * Languages where the small models fall down badly. Measured with Hindi: Tiny
 * grasps the speech and then writes it out in English instead of Devanagari, so
 * the transcript is useless even though recognition worked. Scripts other than
 * Latin need the extra capacity to be written back correctly.
 */
const NEEDS_LARGE_MODEL = new Set(['hindi', 'urdu'])

export function TranscribePanel({
    request,
    onRequestChange,
    progress,
    hasCues,
    onStart,
    onCancel,
}: TranscribePanelProps) {
    const busy =
        progress.stage === 'decoding' ||
        progress.stage === 'loading' ||
        progress.stage === 'transcribing'

    return (
        <div className="flex flex-col gap-4 p-4">
            {/* The hint slot is sized for a value readout, so the one-time
                download note lives in the footer instead. */}
            <Field label="Model">
                <Select
                    value={request.size}
                    options={MODEL_OPTIONS}
                    disabled={busy}
                    aria-label="Speech model"
                    onValueChange={(size) =>
                        onRequestChange({ ...request, size })
                    }
                />
            </Field>

            <Field label="Spoken">
                <Select
                    value={request.language}
                    options={LANGUAGE_OPTIONS}
                    disabled={busy}
                    aria-label="Spoken language"
                    onValueChange={(language) =>
                        onRequestChange({
                            ...request,
                            language,
                            // Nothing to translate when the audio is already
                            // English.
                            task:
                                language === 'english'
                                    ? 'transcribe'
                                    : request.task,
                        })
                    }
                />
            </Field>

            <Field label="Captions">
                <Segmented
                    value={request.task}
                    aria-label="Caption language"
                    disabled={busy || request.language === 'english'}
                    onValueChange={(task) =>
                        onRequestChange({ ...request, task })
                    }
                    options={[
                        { label: 'As spoken', value: 'transcribe' },
                        { label: 'English', value: 'translate' },
                    ]}
                />
            </Field>

            {/* One idea per line. Both of these are easy to get wrong and the
                result looks like the tool is broken rather than misconfigured,
                so they're worth the space. */}
            {request.language !== 'english' && (
                <div className="text-muted-foreground/80 -mt-1 flex flex-col gap-1.5 text-xs leading-relaxed">
                    <p>
                        Make sure this matches the language spoken in the video.
                        It isn’t detected — pick the wrong one and the captions
                        come out as nonsense.
                    </p>
                    {NEEDS_LARGE_MODEL.has(request.language) &&
                        request.size !== 'small' && (
                            <p>
                                Also switch the model to{' '}
                                <span className="text-foreground/85 font-medium">
                                    Small
                                </span>
                                . Tiny and Base understand{' '}
                                {LANGUAGE_LABELS.get(request.language)} but
                                spell it out in the English alphabet instead of{' '}
                                {LANGUAGE_LABELS.get(request.language)} script.
                            </p>
                        )}
                </div>
            )}

            {busy ? (
                <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2 text-xs">
                        <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
                        <span className="text-foreground/85 min-w-0 truncate">
                            {STAGE_LABELS[progress.stage] ?? 'Working'}…
                        </span>
                        <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[11px]">
                            {progress.detail ??
                                (progress.progress != null
                                    ? `${Math.round(progress.progress * 100)}%`
                                    : '')}
                        </span>
                    </div>
                    <ProgressBar value={progress.progress} />
                    <Button block onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            ) : (
                <Button variant="primary" block onClick={onStart}>
                    <Sparkles />
                    {hasCues ? 'Transcribe again' : 'Generate captions'}
                </Button>
            )}

            {progress.error && (
                <p className="text-danger text-xs leading-relaxed">
                    {progress.error}
                </p>
            )}

            <p className="text-muted-foreground/80 text-xs leading-relaxed">
                {progress.backend === 'webgpu'
                    ? 'Running on this machine’s GPU.'
                    : progress.backend === 'cpu'
                      ? 'Running on this machine’s CPU.'
                      : 'Speech recognition runs on this machine.'}{' '}
                The model downloads once, then works offline. Nothing is
                uploaded.
            </p>
        </div>
    )
}
