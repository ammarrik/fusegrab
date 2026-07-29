import type { BurnSession, BurnUpdate } from '#/lib/captions/burn'
import type { TranscribeSession } from '#/lib/captions/transcribe'
import type {
    CaptionStyle,
    Cue,
    TranscribeProgress,
    TranscribeRequest,
} from '#/lib/captions/types'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createFileRoute } from '@tanstack/react-router'

import { CueList } from '#/components/captions/cue-list'
import { DropZone } from '#/components/captions/drop-zone'
import { ExportPanel } from '#/components/captions/export-panel'
import { Preview } from '#/components/captions/preview'
import { StylePanel } from '#/components/captions/style-panel'
import { TranscribePanel } from '#/components/captions/transcribe-panel'
import {
    Button,
    ScrollArea,
    Tab,
    TabList,
    TabPanel,
    Tabs,
} from '#/components/ui'
import { startBurn } from '#/lib/captions/burn'
import { CAPTION_FONTS, DEFAULT_STYLE } from '#/lib/captions/style'
import { toSrt, toVtt } from '#/lib/captions/subtitles'
import {
    disposeTranscriber,
    startTranscription,
} from '#/lib/captions/transcribe'

export const Route = createFileRoute('/_app/captions')({
    component: RouteComponent,
})

const STYLE_KEY = 'captions:style'

type SidebarTab = 'transcribe' | 'style' | 'export'

const IDLE: TranscribeProgress = {
    stage: 'idle',
    progress: null,
    detail: null,
    partial: '',
    backend: null,
    error: null,
}

function loadStyle(): CaptionStyle {
    try {
        const stored = localStorage.getItem(STYLE_KEY)
        if (!stored) return DEFAULT_STYLE
        // Merged over the defaults so a style saved by an older version, before
        // a field existed, still opens.
        const style = {
            ...DEFAULT_STYLE,
            ...(JSON.parse(stored) as CaptionStyle),
        }
        // The font stacks gained script fallbacks, so a stack saved before that
        // no longer matches any option — it would leave the font picker blank
        // and, worse, keep rendering Hindi and Urdu as empty boxes.
        const known = CAPTION_FONTS.some(
            (font) => font.value === style.fontFamily,
        )
        return known
            ? style
            : { ...style, fontFamily: DEFAULT_STYLE.fontFamily }
    } catch {
        return DEFAULT_STYLE
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function RouteComponent() {
    const [file, setFile] = useState<File | null>(null)
    const [videoUrl, setVideoUrl] = useState<string | null>(null)
    const [cues, setCues] = useState<Array<Cue>>([])
    const [activeCueId, setActiveCueId] = useState<string | null>(null)
    const [style, setStyle] = useState<CaptionStyle>(loadStyle)
    const [request, setRequest] = useState<TranscribeRequest>({
        size: 'base',
        language: 'english',
        task: 'transcribe',
    })
    const [progress, setProgress] = useState<TranscribeProgress>(IDLE)
    const [burn, setBurn] = useState<BurnUpdate | null>(null)
    const [burnError, setBurnError] = useState<string | null>(null)
    const [savedPath, setSavedPath] = useState<string | null>(null)
    const [tab, setTab] = useState<SidebarTab>('transcribe')

    const videoRef = useRef<HTMLVideoElement | null>(null)
    const pickerRef = useRef<HTMLInputElement>(null)
    const transcription = useRef<TranscribeSession | null>(null)
    const burning = useRef<BurnSession | null>(null)
    const lastPartialAt = useRef(0)

    useEffect(() => {
        localStorage.setItem(STYLE_KEY, JSON.stringify(style))
    }, [style])

    useEffect(() => {
        if (!file) {
            setVideoUrl(null)
            return
        }
        const url = URL.createObjectURL(file)
        setVideoUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [file])

    // Leaving the tool releases the model — it's a few hundred megabytes of
    // resident memory that nothing else in the app needs.
    useEffect(
        () => () => {
            transcription.current?.cancel()
            burning.current?.cancel()
            disposeTranscriber()
        },
        [],
    )

    const filePath = useMemo(() => {
        if (!file) return null
        try {
            return window.files.pathForFile(file) || null
        } catch {
            return null
        }
    }, [file])

    const baseName = file ? file.name.replace(/\.[^.]+$/, '') : 'captions'
    const defaultDir = useMemo(() => {
        if (!filePath) return null
        const cut = Math.max(
            filePath.lastIndexOf('/'),
            filePath.lastIndexOf('\\'),
        )
        return cut > 0 ? filePath.slice(0, cut) : null
    }, [filePath])

    const openFile = (next: File) => {
        transcription.current?.cancel()
        transcription.current = null
        setFile(next)
        setCues([])
        setActiveCueId(null)
        setProgress(IDLE)
        setBurnError(null)
        setSavedPath(null)
    }

    const startRun = () => {
        if (!file) return
        transcription.current?.cancel()
        setProgress({ ...IDLE, stage: 'decoding' })
        setCues([])
        setActiveCueId(null)

        const session = startTranscription(file, request, (patch) => {
            // Streamed text arrives token by token. Repainting on every one is
            // wasted work, so let it through a few times a second.
            const partialOnly =
                Object.keys(patch).length === 1 && patch.partial !== undefined
            if (partialOnly) {
                const now = performance.now()
                if (now - lastPartialAt.current < 120) return
                lastPartialAt.current = now
            }
            setProgress((previous) => ({ ...previous, ...patch }))
        })
        transcription.current = session

        session.result
            .then((result) => {
                if (transcription.current !== session) return
                if (!result) {
                    setProgress((previous) => ({
                        ...IDLE,
                        backend: previous.backend,
                    }))
                    return
                }
                setCues(result.cues)
            })
            .catch((error: unknown) => {
                if (transcription.current !== session) return
                setProgress((previous) => ({
                    ...previous,
                    stage: 'error',
                    progress: null,
                    detail: null,
                    error: messageOf(error),
                }))
            })
    }

    const saveSubtitles = async (format: 'srt' | 'vtt') => {
        const contents = format === 'srt' ? toSrt(cues) : toVtt(cues)
        try {
            const written = await window.files.saveText(
                {
                    defaultName: `${baseName}.${format}`,
                    defaultDir,
                    filters: [
                        {
                            name: format === 'srt' ? 'SubRip' : 'WebVTT',
                            extensions: [format],
                        },
                    ],
                },
                contents,
            )
            if (written) {
                setSavedPath(written)
                setBurnError(null)
            }
        } catch (error) {
            setBurnError(messageOf(error))
        }
    }

    const burnIn = async () => {
        if (!file) return
        setBurnError(null)
        const outputPath = await window.files.chooseSavePath({
            defaultName: `${baseName} (captions).mp4`,
            defaultDir,
            filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
        })
        if (!outputPath) return

        // Decoding for playback while also decoding for the export just makes
        // both slower.
        videoRef.current?.pause()
        setBurn({ stage: 'preparing', progress: null })

        const session = startBurn({
            file,
            cues,
            style,
            outputPath,
            onUpdate: setBurn,
        })
        burning.current = session
        try {
            const written = await session.result
            if (written) setSavedPath(written)
        } catch (error) {
            setBurnError(messageOf(error))
        } finally {
            if (burning.current === session) burning.current = null
            setBurn(null)
        }
    }

    const seek = useCallback((time: number) => {
        const video = videoRef.current
        if (video) video.currentTime = time
    }, [])

    const updateCue = useCallback((next: Cue) => {
        setCues((previous) =>
            previous
                .map((cue) => (cue.id === next.id ? next : cue))
                // Hand-edited times can reorder cues, and lookup by playhead
                // assumes they're in order.
                .sort((a, b) => a.start - b.start),
        )
    }, [])

    const deleteCue = useCallback((id: string) => {
        setCues((previous) => previous.filter((cue) => cue.id !== id))
    }, [])

    const busy =
        progress.stage === 'decoding' ||
        progress.stage === 'loading' ||
        progress.stage === 'transcribing'

    if (!file || !videoUrl) {
        return <DropZone onFile={openFile} />
    }

    return (
        <div className="flex h-full min-h-0">
            <div className="flex min-w-0 flex-1 flex-col">
                <header className="border-border flex h-12 shrink-0 items-center gap-3 border-b px-4">
                    <span
                        className="text-foreground min-w-0 truncate text-sm font-medium"
                        title={filePath ?? file.name}
                    >
                        {file.name}
                    </span>
                    {cues.length > 0 && (
                        <span className="text-muted-foreground shrink-0 text-xs">
                            {cues.length} captions
                        </span>
                    )}
                    <Button
                        className="ml-auto"
                        onClick={() => pickerRef.current?.click()}
                    >
                        Change video
                    </Button>
                    <input
                        ref={pickerRef}
                        type="file"
                        accept="video/*,audio/*,.mkv,.mov,.m4v,.webm,.mp4,.avi"
                        className="hidden"
                        onChange={(event) => {
                            const next = event.target.files?.[0]
                            if (next) openFile(next)
                            event.target.value = ''
                        }}
                    />
                </header>

                <Preview
                    videoRef={videoRef}
                    src={videoUrl}
                    cues={cues}
                    style={style}
                    onActiveCueChange={setActiveCueId}
                />

                <div className="border-border h-[34%] min-h-33 shrink-0 border-t">
                    {busy ? (
                        <LiveTranscript progress={progress} />
                    ) : (
                        <CueList
                            cues={cues}
                            activeCueId={activeCueId}
                            onSeek={seek}
                            onUpdate={updateCue}
                            onDelete={deleteCue}
                        />
                    )}
                </div>
            </div>

            {/* Tabs rather than one long scroll: each step of the job —
                transcribe, style, export — fits without scrolling at all, so
                nothing shifts under the cursor when a control reveals extra
                options. */}
            <Tabs
                value={tab}
                onValueChange={(next) => setTab(next as SidebarTab)}
                render={
                    <aside className="border-border flex w-84 shrink-0 flex-col overflow-hidden border-l" />
                }
            >
                <TabList>
                    <Tab value="transcribe">Transcribe</Tab>
                    <Tab value="style">Style</Tab>
                    <Tab value="export">Export</Tab>
                </TabList>

                <TabPanel value="transcribe">
                    <ScrollArea className="h-full">
                        <TranscribePanel
                            request={request}
                            onRequestChange={setRequest}
                            progress={progress}
                            hasCues={cues.length > 0}
                            onStart={startRun}
                            onCancel={() => transcription.current?.cancel()}
                        />
                    </ScrollArea>
                </TabPanel>

                <TabPanel value="style">
                    <ScrollArea className="h-full">
                        <StylePanel style={style} onChange={setStyle} />
                    </ScrollArea>
                </TabPanel>

                <TabPanel value="export">
                    <ScrollArea className="h-full">
                        <ExportPanel
                            hasCues={cues.length > 0}
                            hasVideo={Boolean(file)}
                            burn={burn}
                            burnError={burnError}
                            savedPath={savedPath}
                            onSaveSubtitles={(format) =>
                                void saveSubtitles(format)
                            }
                            onBurn={() => void burnIn()}
                            onCancelBurn={() => burning.current?.cancel()}
                            onReveal={() => {
                                if (savedPath)
                                    void window.files.reveal(savedPath)
                            }}
                        />
                    </ScrollArea>
                </TabPanel>
            </Tabs>
        </div>
    )
}

/** What the model has produced so far, while it's still working. */
function LiveTranscript({ progress }: { progress: TranscribeProgress }) {
    const endRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' })
    }, [progress.partial])

    return (
        <ScrollArea className="h-full">
            <div className="px-5 py-4">
                {progress.partial ? (
                    <p className="text-foreground/85 text-[13px] leading-relaxed">
                        {progress.partial}
                        <span className="bg-foreground/50 ml-0.5 inline-block h-3.5 w-1.5 animate-pulse align-middle" />
                    </p>
                ) : (
                    <p className="text-muted-foreground text-[13px] leading-relaxed">
                        {progress.stage === 'loading'
                            ? 'Downloading the speech model. This happens once — after that it works offline.'
                            : 'Listening to the audio…'}
                    </p>
                )}
                <div ref={endRef} />
            </div>
        </ScrollArea>
    )
}
