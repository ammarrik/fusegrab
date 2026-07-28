/// <reference types="vite/client" />
import type { UpdateState } from '#/lib/services/updater/service'

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
