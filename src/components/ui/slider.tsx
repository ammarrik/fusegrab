import { Slider as Base } from '@base-ui-components/react/slider'

import { cn } from '#/lib/utils'

type SliderProps = {
    value: number
    min: number
    max: number
    step?: number
    onValueChange: (value: number) => void
    disabled?: boolean
    className?: string
    'aria-label'?: string
}

export function Slider({
    value,
    min,
    max,
    step = 1,
    onValueChange,
    disabled,
    className,
    'aria-label': ariaLabel,
}: SliderProps) {
    return (
        <Base.Root
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onValueChange={(next) => onValueChange(next)}
            className={cn('w-full', className)}
        >
            <Base.Control className="group/slider flex h-5 w-full touch-none items-center select-none">
                {/* A plumper, fully rounded track, and a thumb that springs up a
                    little under the cursor with a soft halo while you drag it.
                    Still an upright bar rather than a knob, so it reads as a
                    marker on the track. */}
                <Base.Track className="bg-muted group-hover/slider:bg-accent relative h-1.5 w-full rounded-full transition-colors">
                    <Base.Indicator className="bg-foreground/60 group-hover/slider:bg-foreground/75 absolute h-full rounded-full transition-colors" />
                    <Base.Thumb
                        aria-label={ariaLabel}
                        className={cn(
                            'border-border-strong bg-surface h-4 w-2 rounded-[3px] border shadow-sm outline-none',
                            // A slightly overshooting curve gives the grow a bit
                            // of bounce instead of a linear slide.
                            'transition-[transform,box-shadow,border-color] duration-150 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]',
                            'hover:border-foreground/50 hover:scale-115',
                            'data-dragging:border-foreground/60 data-dragging:ring-foreground/10 data-dragging:scale-115 data-dragging:ring-4',
                            'focus-visible:ring-ring/50 focus-visible:ring-2',
                            'data-disabled:scale-100 data-disabled:opacity-50',
                        )}
                    />
                </Base.Track>
            </Base.Control>
        </Base.Root>
    )
}
