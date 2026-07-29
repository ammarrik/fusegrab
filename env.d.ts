/// <reference types="vite/client" />
import type { SaveTarget } from '#/lib/services/files/service'
import type { UpdateState } from '#/lib/services/updater/service'
import type {
    DownloadOptions,
    YoutubeVideoInfo,
} from '#/lib/services/youtube/service'

declare module 'electron-squirrel-startup' {
    const value: boolean
    export default value
}

declare global {
    interface Window {
        api: {
            updater: {
                getState: () => Promise<UpdateState>
                currentVersion: () => Promise<string>
                check: () => Promise<UpdateState>
                download: () => Promise<UpdateState>
                install: () => Promise<boolean>
                onState: (cb: (state: UpdateState) => void) => () => void
            }
            youtube: {
                getInfo: (url: string) => Promise<YoutubeVideoInfo>
                download: (
                    options: DownloadOptions,
                ) => Promise<{ filePath: string; size: number }>
                onProgress: (
                    cb: (progress: {
                        downloadedBytes: number
                        totalBytes: number
                        percent: number
                    }) => void,
                ) => () => void
            }
        }
        files: {
            pathForFile: (file: File) => string
            chooseSavePath: (target: SaveTarget) => Promise<string | null>
            chooseDirectory: (defaultPath?: string) => Promise<string | null>
            getDefaultDownloadDir: () => Promise<string>
            saveText: (
                target: SaveTarget,
                contents: string,
            ) => Promise<string | null>
            openWrite: (filePath: string) => Promise<number>
            write: (
                id: number,
                position: number,
                data: Uint8Array,
            ) => Promise<void>
            closeWrite: (
                id: number,
                discard?: boolean,
            ) => Promise<{ filePath: string; size: number } | null>
            reveal: (filePath: string) => Promise<void>
        }
        windowControls: {
            platform: NodeJS.Platform
            minimize: () => Promise<void>
            toggleMaximize: () => Promise<void>
            close: () => Promise<void>
            isMaximized: () => Promise<boolean>
            moveBy: (dx: number, dy: number) => Promise<void>
            onMaximizedChange: (cb: (maximized: boolean) => void) => () => void
        }
    }
}

export {}
