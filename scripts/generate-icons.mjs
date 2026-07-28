// Generates the macOS (.icns) and Windows (.ico) application icons from a
// single source PNG at assets/icon.png.
//
// The source is center-cropped to a square, given the standard macOS
// rounded-square ("squircle"-style) corner mask so it looks native in the
// Dock, then encoded into both icon formats with png2icons (pure JS, no
// native build step required).
//
// Run with: pnpm run generate-icons

import png2icons from 'png2icons'
import { PNG } from 'pngjs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const SRC = path.join(root, 'assets', 'icon.png')
const OUT_ICNS = path.join(root, 'assets', 'icon.icns')
const OUT_ICO = path.join(root, 'assets', 'icon.ico')
const OUT_ROUNDED = path.join(root, 'assets', 'icon.rounded.png')
const INDEX_HTML = path.join(root, 'index.html')

// Size of the desaturated icon inlined into index.html's loading splash.
const SPLASH_SIZE = 168
// The splash icon is remapped into this gray band so the (near-black) source
// art reads as a muted gray, never solid black, at the pulse's peak opacity.
const SPLASH_GRAY_MIN = 150 // darkest tone (was black in the source)
const SPLASH_GRAY_MAX = 255 // keep white/background pixels white (untinted)

// Apple's icon grid uses a corner radius of ~22.37% of the icon's width.
const CORNER_RADIUS_RATIO = 0.2237

function centerCropSquare(png) {
    const size = Math.min(png.width, png.height)
    if (size === png.width && size === png.height) return png
    const offsetX = Math.floor((png.width - size) / 2)
    const offsetY = Math.floor((png.height - size) / 2)
    const out = new PNG({ width: size, height: size })
    PNG.bitblt(png, out, offsetX, offsetY, size, size, 0, 0)
    return out
}

// Sets alpha = 0 for any pixel outside the rounded-rectangle, so the corners
// become transparent. Uses a small supersampled coverage test on the corner
// arcs for smooth anti-aliased edges.
function applyRoundedCorners(png) {
    const { width: w, height: h, data } = png
    const r = Math.round(Math.min(w, h) * CORNER_RADIUS_RATIO)
    if (r <= 0) return png

    // Centers of the four corner arcs.
    const corners = [
        { cx: r, cy: r, sx: -1, sy: -1 }, // top-left
        { cx: w - r, cy: r, sx: 1, sy: -1 }, // top-right
        { cx: r, cy: h - r, sx: -1, sy: 1 }, // bottom-left
        { cx: w - r, cy: h - r, sx: 1, sy: 1 }, // bottom-right
    ]

    const SS = 4 // supersampling factor per axis
    const r2 = r * r

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Only the corner squares can fall outside the rounded rect.
            let corner = null
            for (const c of corners) {
                const inCornerBox =
                    (c.sx < 0 ? x < c.cx : x >= c.cx) &&
                    (c.sy < 0 ? y < c.cy : y >= c.cy)
                if (inCornerBox) {
                    corner = c
                    break
                }
            }
            if (!corner) continue

            // Estimate coverage of this pixel inside the corner circle.
            let covered = 0
            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const px = x + (sx + 0.5) / SS
                    const py = y + (sy + 0.5) / SS
                    const dx = px - corner.cx
                    const dy = py - corner.cy
                    if (dx * dx + dy * dy <= r2) covered++
                }
            }
            const coverage = covered / (SS * SS)
            const idx = (w * y + x) << 2
            data[idx + 3] = Math.round(data[idx + 3] * coverage)
        }
    }
    return png
}

// Area-average ("box") downscale of an RGBA PNG to a square `size`. Good enough
// for the small, blurred-by-pulse splash icon and avoids a native image dep.
function resizeSquare(src, size) {
    const { width: sw, height: sh, data: sd } = src
    const out = new PNG({ width: size, height: size })
    const od = out.data
    const sxStep = sw / size
    const syStep = sh / size
    for (let y = 0; y < size; y++) {
        const y0 = Math.floor(y * syStep)
        const y1 = Math.max(y0 + 1, Math.floor((y + 1) * syStep))
        for (let x = 0; x < size; x++) {
            const x0 = Math.floor(x * sxStep)
            const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sxStep))
            let r = 0,
                g = 0,
                b = 0,
                a = 0,
                n = 0
            for (let yy = y0; yy < y1; yy++) {
                for (let xx = x0; xx < x1; xx++) {
                    const i = (sw * yy + xx) << 2
                    r += sd[i]
                    g += sd[i + 1]
                    b += sd[i + 2]
                    a += sd[i + 3]
                    n++
                }
            }
            const o = (size * y + x) << 2
            od[o] = Math.round(r / n)
            od[o + 1] = Math.round(g / n)
            od[o + 2] = Math.round(b / n)
            od[o + 3] = Math.round(a / n)
        }
    }
    return out
}

// Desaturate in place, remapping luminance into [SPLASH_GRAY_MIN, MAX] so the
// near-black source icon becomes a muted gray (and stays gray, not black, even
// at the pulse animation's peak opacity). Alpha is left untouched.
function toGrayscale(png) {
    const d = png.data
    const span = SPLASH_GRAY_MAX - SPLASH_GRAY_MIN
    for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        const gray = Math.round(SPLASH_GRAY_MIN + (lum / 255) * span)
        d[i] = gray
        d[i + 1] = gray
        d[i + 2] = gray
    }
    return png
}

// Inline a desaturated, downscaled copy of the rounded icon as the splash
// image's data URI in index.html (replacing whatever src it currently holds).
async function writeSplashIcon(roundedPng) {
    const gray = toGrayscale(resizeSquare(roundedPng, SPLASH_SIZE))
    const dataUri = `data:image/png;base64,${PNG.sync.write(gray).toString('base64')}`
    const html = await readFile(INDEX_HTML, 'utf8')
    const next = html.replace(
        /(<img id="splash-icon"[^>]*\ssrc=")[^"]*(")/,
        `$1${dataUri}$2`,
    )
    if (next === html) {
        console.warn(
            'Warning: could not find <img id="splash-icon" ... src="…"> in index.html; splash icon not updated.',
        )
        return
    }
    await writeFile(INDEX_HTML, next)
}

async function main() {
    let srcBuffer
    try {
        srcBuffer = await readFile(SRC)
    } catch {
        console.error(
            `\nMissing source image: ${SRC}\n` +
                `Save your icon as a square PNG (ideally 1024x1024) at that path, then re-run:\n` +
                `  pnpm run generate-icons\n`,
        )
        process.exit(1)
    }

    const png = PNG.sync.read(srcBuffer)
    const square = centerCropSquare(png)
    const rounded = applyRoundedCorners(square)
    const roundedBuffer = PNG.sync.write(rounded)

    // Keep the rounded master around for the runtime window icon.
    await writeFile(OUT_ROUNDED, roundedBuffer)

    const icns = png2icons.createICNS(roundedBuffer, png2icons.BILINEAR, 0)
    if (!icns) throw new Error('Failed to generate ICNS')
    await writeFile(OUT_ICNS, icns)

    // PNG = true stores each ICO chunk as PNG so the full 8-bit alpha (and our
    // anti-aliased rounded corners) survives. With BMP storage (false) Windows
    // uses a 1-bit AND transparency mask, which produces hard, jagged corners.
    const ico = png2icons.createICO(roundedBuffer, png2icons.BILINEAR, 0, true)
    if (!ico) throw new Error('Failed to generate ICO')
    await writeFile(OUT_ICO, ico)

    await writeSplashIcon(rounded)

    console.log('Generated:')
    console.log(`  ${path.relative(root, OUT_ICNS)}  (macOS)`)
    console.log(`  ${path.relative(root, OUT_ICO)}  (Windows)`)
    console.log(`  ${path.relative(root, OUT_ROUNDED)}  (runtime window icon)`)
    console.log(`  ${path.relative(root, INDEX_HTML)}  (inlined loading-splash icon)`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
