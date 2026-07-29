import { Switch as Base } from '@base-ui/react/switch'

import { cn } from '#/lib/utils'

type SwitchProps = {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    disabled?: boolean
    className?: string
    'aria-label'?: string
}

/**
 * Just the toggle. Wrap it in a {@link Field} for a label — Base UI associates
 * the two automatically, so the label stays clickable.
 */
export function Switch({
    checked,
    onCheckedChange,
    disabled,
    className,
    'aria-label': ariaLabel,
}: SwitchProps) {
    return (
        <Base.Root
            checked={checked}
            disabled={disabled}
            aria-label={ariaLabel}
            onCheckedChange={onCheckedChange}
            className={cn(
                'bg-muted focus-visible:ring-ring/50 relative h-4.5 w-8 shrink-0 rounded-full border border-transparent p-px transition-colors outline-none focus-visible:ring-2',
                'data-checked:bg-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
                className,
            )}
        >
            <Base.Thumb className="bg-surface block size-3.5 rounded-full shadow-sm transition-[translate] duration-150 ease-out data-checked:translate-x-3.5 data-unchecked:translate-x-0" />
        </Base.Root>
    )
}
