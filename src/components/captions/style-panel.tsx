import type { SelectOption } from '#/components/ui'
import type { CaptionStyle } from '#/lib/captions/types'

import {
    ColorInput,
    Field,
    SectionTitle,
    Segmented,
    Select,
    Slider,
} from '#/components/ui'
import { CAPTION_FONTS, matchPreset, STYLE_PRESETS } from '#/lib/captions/style'
import { cn } from '#/lib/utils'

const WEIGHTS = [400, 600, 800]

const FONT_OPTIONS: Array<SelectOption<string>> = CAPTION_FONTS.map((font) => ({
    value: font.value,
    label: font.label,
}))

type StylePanelProps = {
    style: CaptionStyle
    onChange: (style: CaptionStyle) => void
}

export function StylePanel({ style, onChange }: StylePanelProps) {
    const set = <TKey extends keyof CaptionStyle>(
        key: TKey,
        value: CaptionStyle[TKey],
    ) => {
        onChange({ ...style, [key]: value })
    }
    const activePreset = matchPreset(style)
    // A preset (or a style saved by an earlier version) can carry a weight that
    // isn't one of the three buttons; highlight the closest one rather than none.
    const activeWeight = WEIGHTS.reduce((closest, weight) =>
        Math.abs(weight - style.fontWeight) <
        Math.abs(closest - style.fontWeight)
            ? weight
            : closest,
    )

    return (
        <div className="flex flex-col gap-5 p-4">
            <div className="flex flex-col gap-2">
                <SectionTitle>Preset</SectionTitle>
                {/* Full width rather than a labelled row: picking a preset
                    replaces every setting below, so it isn't one property
                    among the others. */}
                <div className="grid grid-cols-4 gap-1.5">
                    {STYLE_PRESETS.map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => onChange(preset.style)}
                            className={cn(
                                'focus-visible:ring-ring/50 flex h-8 min-w-0 items-center justify-center rounded-md border text-xs font-medium transition-[background-color,border-color,color] outline-none focus-visible:ring-2',
                                preset.id === activePreset
                                    ? 'border-border-strong bg-accent text-foreground'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/60',
                            )}
                        >
                            <span className="truncate">{preset.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <SectionTitle className="mb-1">Text</SectionTitle>

                <Field label="Font">
                    <Select
                        value={style.fontFamily}
                        options={FONT_OPTIONS}
                        aria-label="Caption font"
                        onValueChange={(value) => set('fontFamily', value)}
                    />
                </Field>

                <Field label="Weight">
                    <Segmented
                        value={String(activeWeight)}
                        aria-label="Font weight"
                        onValueChange={(value) =>
                            set('fontWeight', Number(value))
                        }
                        options={[
                            { label: 'Regular', value: '400' },
                            { label: 'Medium', value: '600' },
                            { label: 'Bold', value: '800' },
                        ]}
                    />
                </Field>

                <Field label="Size" hint={`${style.fontSize.toFixed(1)}%`}>
                    <Slider
                        min={2.5}
                        max={14}
                        step={0.1}
                        value={style.fontSize}
                        aria-label="Font size"
                        onValueChange={(value) => set('fontSize', value)}
                    />
                </Field>

                <Field label="Fill">
                    <ColorInput
                        value={style.color}
                        aria-label="Text colour"
                        onValueChange={(value) => set('color', value)}
                    />
                </Field>

                <Field label="Outline">
                    <ColorInput
                        value={style.outlineColor}
                        aria-label="Outline colour"
                        onValueChange={(value) => set('outlineColor', value)}
                    />
                </Field>

                <Field
                    label="Outline width"
                    hint={
                        style.outline === 0 ? 'off' : style.outline.toFixed(2)
                    }
                >
                    <Slider
                        min={0}
                        max={0.28}
                        step={0.01}
                        value={style.outline}
                        aria-label="Outline width"
                        onValueChange={(value) => set('outline', value)}
                    />
                </Field>

                <Field
                    label="Shadow"
                    hint={
                        style.shadow === 0
                            ? 'off'
                            : `${Math.round(style.shadow * 100)}%`
                    }
                >
                    <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={style.shadow}
                        aria-label="Shadow strength"
                        onValueChange={(value) => set('shadow', value)}
                    />
                </Field>
            </div>

            <div className="flex flex-col gap-2">
                <SectionTitle className="mb-1">Backdrop</SectionTitle>

                <Field label="Shape">
                    <Segmented
                        value={style.background}
                        aria-label="Backdrop shape"
                        onValueChange={(value) => set('background', value)}
                        options={[
                            { label: 'None', value: 'none' },
                            { label: 'Box', value: 'box' },
                            { label: 'Pill', value: 'pill' },
                        ]}
                    />
                </Field>

                {style.background !== 'none' && (
                    <>
                        <Field label="Colour">
                            <ColorInput
                                value={style.backgroundColor}
                                aria-label="Backdrop colour"
                                onValueChange={(value) =>
                                    set('backgroundColor', value)
                                }
                            />
                        </Field>

                        <Field
                            label="Opacity"
                            hint={`${Math.round(style.backgroundOpacity * 100)}%`}
                        >
                            <Slider
                                min={0.1}
                                max={1}
                                step={0.05}
                                value={style.backgroundOpacity}
                                aria-label="Backdrop opacity"
                                onValueChange={(value) =>
                                    set('backgroundOpacity', value)
                                }
                            />
                        </Field>
                    </>
                )}
            </div>

            <div className="flex flex-col gap-2">
                <SectionTitle className="mb-1">Placement</SectionTitle>

                <Field label="Position">
                    <Segmented
                        value={style.position}
                        aria-label="Vertical position"
                        onValueChange={(value) => set('position', value)}
                        options={[
                            { label: 'Top', value: 'top' },
                            { label: 'Middle', value: 'middle' },
                            { label: 'Bottom', value: 'bottom' },
                        ]}
                    />
                </Field>

                <Field label="Alignment">
                    <Segmented
                        value={style.align}
                        aria-label="Text alignment"
                        onValueChange={(value) => set('align', value)}
                        options={[
                            { label: 'Left', value: 'left' },
                            { label: 'Center', value: 'center' },
                            { label: 'Right', value: 'right' },
                        ]}
                    />
                </Field>

                {style.position !== 'middle' && (
                    <Field
                        label="Edge gap"
                        hint={`${style.margin.toFixed(0)}%`}
                    >
                        <Slider
                            min={0}
                            max={40}
                            value={style.margin}
                            aria-label="Edge gap"
                            onValueChange={(value) => set('margin', value)}
                        />
                    </Field>
                )}

                <Field
                    label="Text width"
                    hint={`${style.maxWidth.toFixed(0)}%`}
                >
                    <Slider
                        min={30}
                        max={100}
                        value={style.maxWidth}
                        aria-label="Text width"
                        onValueChange={(value) => set('maxWidth', value)}
                    />
                </Field>
            </div>
        </div>
    )
}
