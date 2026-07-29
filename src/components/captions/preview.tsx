import type { CaptionStyle, Cue } from '#/lib/captions/types'

import { useEffect, useRef, useState } from 'react'

import { AudioLines, Pause, Play } from '#/components/icons'
import { Button, Slider } from '#/components/ui'
import { cueAt, drawCaption } from '#/lib/captions/render'
import { formatTime } from '#/lib/captions/subtitles'

type PreviewProps = {
    videoRef: React.RefObject<HTMLVideoElement | null>
    src: string
    cues: Array<Cue>
    style: CaptionStyle
    /** Called only when the cue under the playhead changes. */
    onActiveCueChange: (id: string | null) => void
}

export function Preview({
    videoRef,
    src,
    cues,
    style,
    onActiveCueChange,
}: PreviewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [playing, setPlaying] = useState(false)
    const [time, setTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [hasPicture, setHasPicture] = useState(true)

    // Assume there's a picture until the new file's metadata says otherwise,
    // so the placeholder doesn't flash on every load.
    useEffect(() => {
        setHasPicture(true)
    }, [src])

    // One loop drives the caption overlay. It keeps the canvas aligned with the
    // letterboxed video area and redraws only when the visible caption (or the
    // size) actually changes, so an idle preview costs nothing. Style and cue
    // edits land via the effect re-running.
    useEffect(() => {
        let frame = 0
        let lastKey = ''
        let lastTick = 0

        const tick = () => {
            frame = requestAnimationFrame(tick)
            const video = videoRef.current
            const canvas = canvasRef.current
            if (!video || !canvas) return

            const boxWidth = video.clientWidth
            const boxHeight = video.clientHeight
            const intrinsicWidth = video.videoWidth
            const intrinsicHeight = video.videoHeight
            if (
                !boxWidth ||
                !boxHeight ||
                !intrinsicWidth ||
                !intrinsicHeight
            ) {
                // Nothing to draw over — an audio-only file, or metadata that
                // hasn't arrived yet. Wipe the canvas so a caption from the
                // previous file can't linger on screen.
                if (lastKey !== '' && canvas.width > 0) {
                    canvas
                        .getContext('2d')
                        ?.clearRect(0, 0, canvas.width, canvas.height)
                }
                lastKey = ''
                return
            }

            // `object-contain` letterboxes the video inside its element; the
            // overlay has to cover the picture, not the element.
            const scale = Math.min(
                boxWidth / intrinsicWidth,
                boxHeight / intrinsicHeight,
            )
            const cssWidth = intrinsicWidth * scale
            const cssHeight = intrinsicHeight * scale
            const dpr = window.devicePixelRatio || 1
            const width = Math.max(1, Math.round(cssWidth * dpr))
            const height = Math.max(1, Math.round(cssHeight * dpr))

            canvas.style.left = `${(boxWidth - cssWidth) / 2}px`
            canvas.style.top = `${(boxHeight - cssHeight) / 2}px`
            canvas.style.width = `${cssWidth}px`
            canvas.style.height = `${cssHeight}px`

            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width
                canvas.height = height
                lastKey = ''
            }

            const cue = cueAt(cues, video.currentTime)
            const key = `${cue?.id ?? ''}|${cue?.text ?? ''}|${width}x${height}`
            if (key !== lastKey) {
                lastKey = key
                const ctx = canvas.getContext('2d')
                if (ctx) {
                    ctx.clearRect(0, 0, width, height)
                    if (cue) drawCaption(ctx, cue.text, style, width, height)
                }
                onActiveCueChange(cue?.id ?? null)
            }

            // The scrubber only needs to look smooth, not frame-accurate.
            const now = performance.now()
            if (now - lastTick > 100) {
                lastTick = now
                setTime(video.currentTime)
            }
        }

        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [cues, style, videoRef, onActiveCueChange])

    const toggle = () => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) void video.play()
        else video.pause()
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 bg-black">
                <video
                    ref={videoRef}
                    src={src}
                    playsInline
                    onClick={toggle}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onLoadedMetadata={(event) =>
                        setHasPicture(event.currentTarget.videoWidth > 0)
                    }
                    onDurationChange={(event) =>
                        setDuration(event.currentTarget.duration || 0)
                    }
                    className="absolute inset-0 h-full w-full object-contain"
                />
                <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute"
                />
                {!hasPicture && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                        <AudioLines className="size-7 text-white/50" />
                        <p className="text-sm text-white/60">
                            Audio only — transcribe it and save a subtitle file.
                        </p>
                    </div>
                )}
            </div>

            <div className="border-border flex shrink-0 items-center gap-3 border-t px-3 py-2">
                <Button
                    variant="ghost"
                    onClick={toggle}
                    aria-label={playing ? 'Pause' : 'Play'}
                    className="px-1.5"
                >
                    {playing ? <Pause /> : <Play />}
                </Button>
                <Slider
                    min={0}
                    max={duration || 1}
                    step={0.01}
                    value={Math.min(time, duration || 0)}
                    aria-label="Seek"
                    className="min-w-0 flex-1"
                    onValueChange={(next) => {
                        setTime(next)
                        if (videoRef.current)
                            videoRef.current.currentTime = next
                    }}
                />
                <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                    {formatTime(time)} / {formatTime(duration)}
                </span>
            </div>
        </div>
    )
}
