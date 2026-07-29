import { Select as Base } from '@base-ui/react/select'

import { Check, ChevronDownIcon } from '#/components/icons'
import { cn } from '#/lib/utils'

export type SelectOption<T extends string> = {
    value: T
    label: string
    /** Muted text after the label — for a hint like "Fastest, roughest". */
    hint?: string
}

type SelectProps<T extends string> = {
    value: T
    options: Array<SelectOption<T>>
    onValueChange: (value: T) => void
    disabled?: boolean
    placeholder?: string
    className?: string
    'aria-label'?: string
}

export function Select<T extends string>({
    value,
    options,
    onValueChange,
    disabled,
    placeholder,
    className,
    'aria-label': ariaLabel,
}: SelectProps<T>) {
    return (
        <Base.Root
            value={value}
            disabled={disabled}
            onValueChange={(next) => {
                if (next != null) onValueChange(next)
            }}
        >
            <Base.Trigger
                aria-label={ariaLabel}
                className={cn(
                    'border-border bg-surface text-foreground hover:border-border-strong focus-visible:ring-ring/50 data-popup-open:border-border-strong flex h-8.5 w-full items-center gap-2 rounded-md border px-2.5 text-left text-[13px] shadow-[0_1px_1px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] outline-none focus-visible:ring-2 data-disabled:pointer-events-none data-disabled:opacity-50',
                    className,
                )}
            >
                <Base.Value className="min-w-0 flex-1 truncate">
                    {(selected: unknown) => {
                        const option = options.find(
                            (entry) => entry.value === selected,
                        )
                        if (!option) {
                            return (
                                <span className="text-muted-foreground">
                                    {placeholder ?? 'Select…'}
                                </span>
                            )
                        }
                        return (
                            <span className="flex min-w-0 items-baseline gap-1.5">
                                <span className="truncate">{option.label}</span>
                                {option.hint && (
                                    <span className="text-muted-foreground truncate text-xs">
                                        {option.hint}
                                    </span>
                                )}
                            </span>
                        )
                    }}
                </Base.Value>
                <Base.Icon className="text-muted-foreground shrink-0">
                    <ChevronDownIcon className="size-3.5" />
                </Base.Icon>
            </Base.Trigger>

            <Base.Portal>
                <Base.Positioner
                    sideOffset={4}
                    alignItemWithTrigger={false}
                    className="z-50 outline-none"
                >
                    <Base.Popup className="border-border bg-popover max-h-[min(22rem,var(--available-height))] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-hidden rounded-lg border p-1 shadow-lg shadow-black/8 transition-[transform,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
                        <Base.List className="max-h-[inherit] overflow-y-auto">
                            {options.map((option) => (
                                <Base.Item
                                    key={option.value}
                                    value={option.value}
                                    className="text-foreground data-highlighted:bg-accent flex cursor-default items-center gap-2 rounded-[5px] py-1.5 pr-2 pl-2 text-[13px] outline-none select-none data-disabled:opacity-50"
                                >
                                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                                        <Base.ItemText className="truncate">
                                            {option.label}
                                        </Base.ItemText>
                                        {option.hint && (
                                            <span className="text-muted-foreground truncate text-xs">
                                                {option.hint}
                                            </span>
                                        )}
                                    </span>
                                    <Base.ItemIndicator className="shrink-0">
                                        <Check className="size-3.5" />
                                    </Base.ItemIndicator>
                                </Base.Item>
                            ))}
                        </Base.List>
                    </Base.Popup>
                </Base.Positioner>
            </Base.Portal>
        </Base.Root>
    )
}
