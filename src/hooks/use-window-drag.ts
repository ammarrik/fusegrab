import { useRef } from 'react'

const isWindows =
    typeof window !== 'undefined' && window.windowControls?.platform === 'win32'

export function useWindowDrag() {
    const lastPosRef = useRef<{ x: number; y: number } | null>(null)

    const onMouseDown = (e: React.MouseEvent) => {
        if (!isWindows) return
        if (e.button !== 0) return
        lastPosRef.current = { x: e.screenX, y: e.screenY }

        const handleMove = (ev: MouseEvent) => {
            const last = lastPosRef.current
            if (!last) return
            const dx = ev.screenX - last.x
            const dy = ev.screenY - last.y
            if (dx === 0 && dy === 0) return
            lastPosRef.current = { x: ev.screenX, y: ev.screenY }
            window.windowControls?.moveBy(dx, dy)
        }

        const handleUp = () => {
            lastPosRef.current = null
            document.removeEventListener('mousemove', handleMove)
            document.removeEventListener('mouseup', handleUp)
        }

        document.addEventListener('mousemove', handleMove)
        document.addEventListener('mouseup', handleUp)
    }

    const onDoubleClick = () => {
        if (!isWindows) return
        window.windowControls?.toggleMaximize()
    }

    const style = {
        WebkitAppRegion: isWindows ? 'no-drag' : 'drag',
    } as React.CSSProperties

    return { style, onMouseDown, onDoubleClick }
}
