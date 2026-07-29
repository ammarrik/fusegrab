import type { BurnUpdate } from '#/lib/captions/burn'

import { Check, Download, FolderOpen, Loader2 } from '#/components/icons'
import { Button, ProgressBar, SectionTitle } from '#/components/ui'

type ExportPanelProps = {
    hasCues: boolean
    hasVideo: boolean
    burn: BurnUpdate | null
    burnError: string | null
    savedPath: string | null
    onSaveSubtitles: (format: 'srt' | 'vtt') => void
    onBurn: () => void
    onCancelBurn: () => void
    onReveal: () => void
}

const BURN_LABELS: Record<BurnUpdate['stage'], string> = {
    preparing: 'Preparing',
    rendering: 'Rendering video',
    finishing: 'Finishing up',
}

export function ExportPanel({
    hasCues,
    hasVideo,
    burn,
    burnError,
    savedPath,
    onSaveSubtitles,
    onBurn,
    onCancelBurn,
    onReveal,
}: ExportPanelProps) {
    return (
        <div className="flex flex-col gap-5 p-4">
            <div className="flex flex-col gap-2">
                <SectionTitle>Subtitle file</SectionTitle>
                <p className="text-muted-foreground text-xs leading-relaxed">
                    Leaves the video untouched. Players and editors load it
                    alongside.
                </p>
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        disabled={!hasCues}
                        onClick={() => onSaveSubtitles('srt')}
                    >
                        <Download />
                        .srt
                    </Button>
                    <Button
                        disabled={!hasCues}
                        onClick={() => onSaveSubtitles('vtt')}
                    >
                        <Download />
                        .vtt
                    </Button>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <SectionTitle>Burned into the video</SectionTitle>
                <p className="text-muted-foreground text-xs leading-relaxed">
                    Re-encodes the video with the captions baked into the
                    picture, exactly as previewed.
                </p>

                {burn ? (
                    <div className="mt-1 flex flex-col gap-2.5">
                        <div className="flex items-center gap-2 text-xs">
                            <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
                            <span className="text-foreground/85">
                                {BURN_LABELS[burn.stage]}…
                            </span>
                            {burn.progress != null && (
                                <span className="text-muted-foreground ml-auto font-mono text-[11px]">
                                    {Math.round(burn.progress * 100)}%
                                </span>
                            )}
                        </div>
                        <ProgressBar value={burn.progress} />
                        <Button block onClick={onCancelBurn}>
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <Button
                        variant="primary"
                        block
                        className="mt-1"
                        disabled={!hasCues || !hasVideo}
                        onClick={onBurn}
                    >
                        Burn in and save
                    </Button>
                )}
            </div>

            {burnError && (
                <p className="text-danger text-xs leading-relaxed">
                    {burnError}
                </p>
            )}

            {savedPath && !burn && (
                <div className="border-border bg-muted/50 flex items-center gap-2 rounded-md border px-2.5 py-2">
                    <Check className="text-success size-3.5 shrink-0" />
                    <span
                        className="text-foreground/85 min-w-0 flex-1 truncate text-xs"
                        title={savedPath}
                    >
                        {savedPath.split(/[\\/]/).pop()}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onReveal}
                        aria-label="Show in folder"
                        className="px-1.5"
                    >
                        <FolderOpen />
                    </Button>
                </div>
            )}
        </div>
    )
}
