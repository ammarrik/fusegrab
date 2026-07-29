import type { CaptionStyle, Cue } from './types'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Hebrew, Arabic (so Urdu and Persian), Syriac, Thaana and their presentation forms. */
const RTL_SCRIPT = /[֐-׿؀-ۿ܀-ݏހ-޿ࢠ-ࣿיִ-﷿ﹰ-\uFEFF]/

/**
 * The single source of truth for what a caption looks like. Both the live
 * preview and the burned-in export call this with the same style, so what the
 * user tweaks is exactly what lands in the file — the only difference is the
 * size of the canvas it's drawn onto.
 */
export function drawCaption(
    ctx: Ctx,
    text: string,
    style: CaptionStyle,
    width: number,
    height: number,
): void {
    const content = (style.uppercase ? text.toUpperCase() : text).trim()
    if (!content) return

    const fontSize = (style.fontSize / 100) * height
    if (fontSize <= 0) return

    ctx.save()
    ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    // Urdu, Arabic, Persian and Hebrew read right to left. Lines are still
    // placed by their left edge, but the direction has to be right for the
    // engine to order a line's runs and place its punctuation correctly.
    ctx.direction = RTL_SCRIPT.test(content) ? 'rtl' : 'ltr'

    const areaWidth = Math.max(1, (style.maxWidth / 100) * width)
    const areaLeft = (width - areaWidth) / 2
    const lines = wrapText(ctx, content, areaWidth)
    const lineHeight = fontSize * style.lineHeight
    const blockHeight = lines.length * lineHeight
    const margin = (style.margin / 100) * height

    let top: number
    if (style.position === 'top') {
        top = margin
    } else if (style.position === 'middle') {
        top = (height - blockHeight) / 2
    } else {
        top = height - margin - blockHeight
    }

    const metrics = lines.map((line) => ({
        line,
        width: ctx.measureText(line).width,
    }))
    const xFor = (lineWidth: number): number => {
        if (style.align === 'left') return areaLeft
        if (style.align === 'right') return areaLeft + areaWidth - lineWidth
        return areaLeft + (areaWidth - lineWidth) / 2
    }

    if (style.background !== 'none' && style.backgroundOpacity > 0) {
        ctx.fillStyle = withAlpha(
            style.backgroundColor,
            style.backgroundOpacity,
        )
        const padX = fontSize * 0.42
        const padY = fontSize * 0.2
        if (style.background === 'pill') {
            // One rounded plate per line, hugging the text — the look used for
            // social captions.
            for (const [index, { width: lineWidth }] of metrics.entries()) {
                const x = xFor(lineWidth)
                const y = top + index * lineHeight
                const plateHeight = lineHeight + padY
                ctx.beginPath()
                ctx.roundRect(
                    x - padX,
                    y + (lineHeight - plateHeight) / 2,
                    lineWidth + padX * 2,
                    plateHeight,
                    plateHeight / 2,
                )
                ctx.fill()
            }
        } else {
            const left = Math.min(...metrics.map((m) => xFor(m.width)))
            const right = Math.max(
                ...metrics.map((m) => xFor(m.width) + m.width),
            )
            ctx.beginPath()
            ctx.roundRect(
                left - padX,
                top - padY,
                right - left + padX * 2,
                blockHeight + padY * 2,
                fontSize * 0.16,
            )
            ctx.fill()
        }
    }

    const outlineWidth = style.outline * fontSize
    for (const [index, { line, width: lineWidth }] of metrics.entries()) {
        const x = xFor(lineWidth)
        const y = top + index * lineHeight + lineHeight / 2

        // The shadow is attached to whichever shape is outermost, so it reads as
        // one shadow cast by the caption rather than a halo behind every glyph.
        if (style.shadow > 0) {
            ctx.shadowColor = `rgba(0, 0, 0, ${style.shadow})`
            ctx.shadowBlur = fontSize * 0.22
            ctx.shadowOffsetY = fontSize * 0.06
        }

        if (outlineWidth > 0) {
            ctx.strokeStyle = style.outlineColor
            // Canvas strokes straddle the glyph edge, so half the width falls
            // inside the letter. Doubling keeps the visible outline equal to the
            // requested thickness.
            ctx.lineWidth = outlineWidth * 2
            ctx.lineJoin = 'round'
            ctx.miterLimit = 2
            ctx.strokeText(line, x, y)
            clearShadow(ctx)
        }

        ctx.fillStyle = style.color
        ctx.fillText(line, x, y)
        clearShadow(ctx)
    }

    ctx.restore()
}

function clearShadow(ctx: Ctx): void {
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
}

function wrapText(ctx: Ctx, text: string, maxWidth: number): Array<string> {
    const lines: Array<string> = []
    for (const paragraph of text.split('\n')) {
        const words = paragraph.split(/\s+/).filter(Boolean)
        if (words.length === 0) continue
        let line = ''
        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word
            if (line && ctx.measureText(candidate).width > maxWidth) {
                lines.push(line)
                line = word
            } else {
                line = candidate
            }
            // A single word wider than the box (a URL, a long compound) would
            // otherwise run off the edge.
            while (ctx.measureText(line).width > maxWidth && line.length > 1) {
                let cut = line.length - 1
                while (
                    cut > 1 &&
                    ctx.measureText(line.slice(0, cut)).width > maxWidth
                ) {
                    cut--
                }
                lines.push(line.slice(0, cut))
                line = line.slice(cut)
            }
        }
        if (line) lines.push(line)
    }
    return lines
}

/** Converts `#rgb`/`#rrggbb` to an `rgba()` string. Passes anything else through. */
function withAlpha(color: string, alpha: number): string {
    const hex = color.trim().replace('#', '')
    const full =
        hex.length === 3
            ? hex
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : hex
    if (!/^[0-9a-f]{6}$/i.test(full)) return color
    const value = parseInt(full, 16)
    const r = (value >> 16) & 255
    const g = (value >> 8) & 255
    const b = value & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** The cue covering `time`, or null during a gap. */
export function cueAt(cues: Array<Cue>, time: number): Cue | null {
    let low = 0
    let high = cues.length - 1
    while (low <= high) {
        const mid = (low + high) >> 1
        const cue = cues[mid]
        if (time < cue.start) high = mid - 1
        else if (time >= cue.end) low = mid + 1
        else return cue
    }
    return null
}
