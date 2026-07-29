import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('files', {
    // Electron 32 removed the non-standard `File.path`; this is the sanctioned
    // replacement. The tools need the real path of a dropped/picked file to
    // suggest an output location next to the original.
    pathForFile: (file: File) => webUtils.getPathForFile(file),
    chooseSavePath: (target: unknown) =>
        ipcRenderer.invoke('files:choose-save-path', target) as Promise<
            string | null
        >,
    saveText: (target: unknown, contents: string) =>
        ipcRenderer.invoke('files:save-text', target, contents) as Promise<
            string | null
        >,
    openWrite: (filePath: string) =>
        ipcRenderer.invoke('files:open-write', filePath) as Promise<number>,
    write: (id: number, position: number, data: Uint8Array) =>
        ipcRenderer.invoke('files:write', id, position, data) as Promise<void>,
    closeWrite: (id: number, discard = false) =>
        ipcRenderer.invoke('files:close-write', id, discard) as Promise<{
            filePath: string
            size: number
        } | null>,
    reveal: (filePath: string) => ipcRenderer.invoke('files:reveal', filePath),
})

contextBridge.exposeInMainWorld('api', {
    updater: {
        getState: () => ipcRenderer.invoke('updater:get-state'),
        currentVersion: () =>
            ipcRenderer.invoke('app:get-version') as Promise<string>,
        check: () => ipcRenderer.invoke('updater:check'),
        download: () => ipcRenderer.invoke('updater:download'),
        install: () =>
            ipcRenderer.invoke('updater:install') as Promise<boolean>,
        onState: (cb: (state: any) => void) => {
            const handler = (_: unknown, state: unknown) => cb(state)
            ipcRenderer.on('updater:state', handler)
            return () => {
                ipcRenderer.off('updater:state', handler)
            }
        },
    },
})

contextBridge.exposeInMainWorld('windowControls', {
    platform: process.platform,
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () =>
        ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
    moveBy: (dx: number, dy: number) =>
        ipcRenderer.invoke('window:move-by', dx, dy),
    onMaximizedChange: (cb: (maximized: boolean) => void) => {
        const handler = (_: unknown, maximized: boolean) => cb(maximized)
        ipcRenderer.on('window:maximized-changed', handler)
        return () => {
            ipcRenderer.off('window:maximized-changed', handler)
        }
    },
})
