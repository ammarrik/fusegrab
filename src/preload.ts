import { contextBridge, ipcRenderer } from 'electron'

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
