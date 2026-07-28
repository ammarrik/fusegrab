import type { UpdateState } from '#/lib/services/updater/service'

import { useEffect, useState } from 'react'

// Mirrors the main-process updater state and exposes the actions the sidebar
// button needs. The main process owns the state machine and pushes changes via
// the `updater:state` channel, so the renderer just reflects whatever it gets.
export function useUpdater() {
    const [state, setState] = useState<UpdateState | null>(null)
    const [currentVersion, setCurrentVersion] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        window.api.updater.getState().then((s) => {
            if (active) setState(s)
        })
        window.api.updater.currentVersion().then((v) => {
            if (active) setCurrentVersion(v)
        })
        const off = window.api.updater.onState(setState)
        return () => {
            active = false
            off()
        }
    }, [])

    return {
        state,
        currentVersion,
        check: () => window.api.updater.check(),
        download: () => window.api.updater.download(),
        install: () => window.api.updater.install(),
    }
}
