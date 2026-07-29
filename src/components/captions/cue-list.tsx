import type { Cue } from '#/lib/captions/types'

import { useEffect, useRef } from 'react'

import { Trash2 } from '#/components/icons'
import { ScrollArea } from '#/components/ui'
import { cn } from '#/lib/utils'

type CueListProps = {
    cues: Array<Cue>
    activeCueId: string | null
    onSeek: (time: number) => void
    onUpdate: (cue: Cue) => void
    onDelete: (id: string) => void
}

/** `0:04.5` — compact, and precise enough to nudge a cue by hand. */
function formatCueTime(seconds: number): string {
    const total = Math.max(0, seconds)
    const minutes = Math.floor(total / 60)
    const rest = total - minutes * 60
    return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

/** Accepts `12`, `1:02`, `1:02.5`. Returns null if it can't be read. */
function parseCueTime(text: string): number | null {
    const match = text.trim().match(/^(?:(\d+):)?(\d{1,2}(?:\.\d+)?)$/)
    if (!match) return null
    const minutes = match[1] ? Number(match[1]) : 0
    return minutes * 60 + Number(match[2])
}

export function CueList({
    cues,
    activeCueId,
    onSeek,
    onUpdate,
    onDelete,
}: CueListProps) {
    const listRef = useRef<HTMLDivElement>(null)

    // Follow playback, but never yank the list around while someone is editing
    // a cue in it.
    useEffect(() => {
        if (!activeCueId) return
        const list = listRef.current
        if (!list || list.contains(document.activeElement)) return
        const row = list.querySelector(`[data-cue="${activeCueId}"]`)
        row?.scrollIntoView({ block: 'nearest' })
    }, [activeCueId])

    if (cues.length === 0) {
        return (
            <div className="flex h-full items-center justify-center px-6">
                <p className="text-muted-foreground max-w-sm text-center text-[13px] leading-relaxed">
                    No captions yet. Generate them and they’ll show up here,
                    ready to edit.
                </p>
            </div>
        )
    }

    return (
        <ScrollArea className="h-full">
            <div ref={listRef} className="flex flex-col gap-0.5 px-3 py-2">
                {cues.map((cue) => (
                    <div
                        key={cue.id}
                        data-cue={cue.id}
                        className={cn(
                            'group flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors',
                            cue.id === activeCueId
                                ? 'bg-accent/70'
                                : 'hover:bg-accent/40',
                        )}
                    >
                        <div className="flex shrink-0 flex-col gap-0.5 pt-px">
                            <TimeInput
                                value={cue.start}
                                onSeek={() => onSeek(cue.start)}
                                onCommit={(start) =>
                                    onUpdate({
                                        ...cue,
                                        start: Math.min(start, cue.end - 0.1),
                                    })
                                }
                            />
                            <TimeInput
                                value={cue.end}
                                muted
                                onSeek={() => onSeek(cue.end)}
                                onCommit={(end) =>
                                    onUpdate({
                                        ...cue,
                                        end: Math.max(end, cue.start + 0.1),
                                    })
                                }
                            />
                        </div>

                        <textarea
                            value={cue.text}
                            rows={1}
                            onChange={(event) =>
                                onUpdate({ ...cue, text: event.target.value })
                            }
                            className="text-foreground focus:bg-surface focus:ring-ring/30 field-sizing-content min-w-0 flex-1 resize-none rounded border-0 bg-transparent px-1.5 py-0.5 text-[13px] leading-relaxed outline-none focus:ring-2"
                        />

                        <button
                            type="button"
                            aria-label="Delete caption"
                            onClick={() => onDelete(cue.id)}
                            className="text-muted-foreground hover:bg-accent hover:text-danger focus-visible:ring-ring/50 flex size-6 shrink-0 items-center justify-center rounded opacity-0 transition-[opacity,color,background-color] outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 [&_svg]:size-3.5"
                        >
                            <Trash2 />
                        </button>
                    </div>
                ))}
            </div>
        </ScrollArea>
    )
}

function TimeInput({
    value,
    muted,
    onSeek,
    onCommit,
}: {
    value: number
    muted?: boolean
    onSeek: () => void
    onCommit: (value: number) => void
}) {
    const ref = useRef<HTMLInputElement>(null)

    const commit = () => {
        const input = ref.current
        if (!input) return
        const parsed = parseCueTime(input.value)
        if (parsed == null) {
            input.value = formatCueTime(value)
            return
        }
        onCommit(parsed)
    }

    return (
        <input
            ref={ref}
            // Keyed by value so an external edit (or a rejected one) resets the
            // field without fighting the user's typing.
            key={value}
            defaultValue={formatCueTime(value)}
            onFocus={onSeek}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                }
            }}
            aria-label={muted ? 'End time' : 'Start time'}
            className={cn(
                'hover:bg-accent focus:bg-surface focus:ring-ring/30 w-[3.25rem] rounded px-1 py-px font-mono text-[11px] outline-none focus:ring-2',
                muted ? 'text-muted-foreground/60' : 'text-muted-foreground',
            )}
        />
    )
}
