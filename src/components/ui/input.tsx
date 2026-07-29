import { Input as Base } from '@base-ui-components/react/input'

import { cn } from '#/lib/utils'

export type InputProps = React.ComponentPropsWithoutRef<typeof Base> & {
    /** Monospaced + tabular, for timecodes and other figures. */
    numeric?: boolean
}

export function Input({ className, numeric, ...props }: InputProps) {
    return (
        <Base
            className={cn(
                'border-border bg-surface text-foreground placeholder:text-muted-foreground/70 hover:border-border-strong focus:border-border-strong focus:ring-ring/40 h-8.5 w-full min-w-0 rounded-md border px-2.5 text-[13px] shadow-[0_1px_1px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] outline-none focus:ring-2 disabled:pointer-events-none disabled:opacity-50',
                numeric && 'font-mono',
                className,
            )}
            {...props}
        />
    )
}

type ColorInputProps = {
    value: string
    onValueChange: (value: string) => void
    'aria-label'?: string
}

/**
 * A colour swatch that opens the OS picker. `input[type=color]` is the only way
 * to get the native picker, so it stays — hidden behind a styled label.
 */
export function ColorInput({
    value,
    onValueChange,
    'aria-label': ariaLabel,
}: ColorInputProps) {
    return (
        // w-full so the swatch lines up with the selects and sliders sharing
        // the column in a Field row.
        <label className="border-border bg-surface hover:border-border-strong focus-within:ring-ring/40 flex h-8.5 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border px-2 shadow-[0_1px_1px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] focus-within:ring-2">
            <span
                className="size-4 shrink-0 rounded border border-black/15"
                style={{ backgroundColor: value }}
            />
            <span className="text-muted-foreground truncate font-mono text-[11px] uppercase">
                {value}
            </span>
            <input
                type="color"
                aria-label={ariaLabel}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                className="sr-only"
            />
        </label>
    )
}
