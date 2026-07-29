import { useRef, useState } from 'react'

import { Video } from '#/components/icons'
import { cn } from '#/lib/utils'

/** Extensions offered in the picker. Anything Chromium or mediabunny can demux. */
const ACCEPT = 'video/*,audio/*,.mkv,.mov,.m4v,.webm,.mp4,.avi,.mp3,.wav,.m4a'

export function DropZone({ onFile }: { onFile: (file: File) => void }) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [dragging, setDragging] = useState(false)

    const take = (files: FileList | null) => {
        const file = files?.[0]
        if (file) onFile(file)
    }

    return (
        <div className="flex h-full items-center justify-center p-8">
            <div
                onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    take(event.dataTransfer.files)
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                    'flex w-full max-w-lg cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed px-8 py-14 text-center transition-colors',
                    dragging
                        ? 'border-foreground/40 bg-foreground/3'
                        : 'border-border hover:border-foreground/25 hover:bg-black/2',
                )}
            >
                <Video className="text-foreground/40 size-7" />
                <div>
                    <p className="text-foreground text-sm font-medium">
                        Drop a video here
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                        or click to choose one — MP4, MOV, MKV, WebM
                    </p>
                </div>
                <p className="text-muted-foreground/80 mt-2 max-w-xs text-xs">
                    Transcription runs entirely on this computer. Your video is
                    never uploaded anywhere.
                </p>
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    onChange={(event) => {
                        take(event.target.files)
                        // Let the same file be picked again after a reset.
                        event.target.value = ''
                    }}
                />
            </div>
        </div>
    )
}
