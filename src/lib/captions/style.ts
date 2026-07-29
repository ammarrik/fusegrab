import type { CaptionStyle } from './types'

/**
 * Fonts to fall through to for scripts the display faces don't cover. None of
 * Inter, Impact, Georgia or Courier carries a single Devanagari or Arabic glyph,
 * so without these a Hindi or Urdu caption burns in as a row of empty boxes.
 * Browsers resolve a font stack per glyph, so Latin still renders in the chosen
 * face and only the uncovered characters reach these.
 *
 * Two entries per script and platform: Devanagari is Kohinoor/Sangam on macOS
 * and Nirmala/Mangal on Windows; Urdu is Geeza Pro on macOS and Urdu
 * Typesetting on Windows, with Segoe UI and Arial as broad Arabic backstops.
 */
const SCRIPT_FALLBACKS = [
    '"Kohinoor Devanagari"',
    '"Devanagari Sangam MN"',
    '"Nirmala UI"',
    'Mangal',
    '"Noto Sans Devanagari"',
    '"Noto Nastaliq Urdu"',
    '"Urdu Typesetting"',
    '"Geeza Pro"',
    '"Segoe UI"',
    'Arial',
    '"Noto Sans"',
].join(', ')

/**
 * Fonts that exist on both Windows and macOS out of the box, plus Inter, which
 * the app bundles. Anything else risks silently falling back to a different
 * typeface in the burned-in export than the one shown in the preview.
 */
export const CAPTION_FONTS: Array<{ label: string; value: string }> = [
    { label: 'Inter', value: '"Inter Variable", Inter' },
    { label: 'Arial', value: 'Arial, Helvetica' },
    { label: 'Impact', value: 'Impact, "Arial Black"' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Verdana', value: 'Verdana, Geneva' },
    { label: 'Courier', value: '"Courier New", Courier, monospace' },
].map((font) => ({
    label: font.label,
    value: `${font.value}, ${SCRIPT_FALLBACKS}, sans-serif`,
}))

export const DEFAULT_STYLE: CaptionStyle = {
    fontFamily: CAPTION_FONTS[0].value,
    fontWeight: 600,
    fontSize: 6,
    color: '#ffffff',
    uppercase: false,
    lineHeight: 1.25,
    align: 'center',
    position: 'bottom',
    margin: 8,
    maxWidth: 84,
    outline: 0.1,
    outlineColor: '#000000',
    shadow: 0.35,
    background: 'none',
    backgroundColor: '#000000',
    backgroundOpacity: 0.6,
}

export type StylePreset = {
    id: string
    label: string
    style: CaptionStyle
}

export const STYLE_PRESETS: Array<StylePreset> = [
    {
        id: 'clean',
        label: 'Clean',
        style: DEFAULT_STYLE,
    },
    {
        id: 'outline',
        label: 'Bold',
        style: {
            ...DEFAULT_STYLE,
            fontWeight: 800,
            fontSize: 7,
            uppercase: true,
            outline: 0.16,
            shadow: 0,
            maxWidth: 76,
        },
    },
    {
        id: 'boxed',
        label: 'Boxed',
        style: {
            ...DEFAULT_STYLE,
            fontWeight: 600,
            fontSize: 5.5,
            outline: 0,
            shadow: 0,
            background: 'box',
            backgroundOpacity: 0.65,
            maxWidth: 80,
        },
    },
    {
        id: 'impact',
        label: 'Punch',
        style: {
            ...DEFAULT_STYLE,
            fontFamily: CAPTION_FONTS[2].value,
            fontWeight: 400,
            fontSize: 8,
            uppercase: true,
            color: '#ffe14d',
            outline: 0.14,
            shadow: 0,
            position: 'middle',
            maxWidth: 72,
        },
    },
]

/** Returns the id of the preset `style` matches exactly, if any. */
export function matchPreset(style: CaptionStyle): string | null {
    const keys = Object.keys(DEFAULT_STYLE) as Array<keyof CaptionStyle>
    const found = STYLE_PRESETS.find((preset) =>
        keys.every((key) => preset.style[key] === style[key]),
    )
    return found?.id ?? null
}
