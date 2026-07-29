import * as React from 'react'

import { Popover as Base } from '@base-ui/react/popover'

import { cn } from '#/lib/utils'

export const Popover = Base.Root
export const PopoverTrigger = Base.Trigger
export const PopoverClose = Base.Close

export interface PopoverContentProps extends React.ComponentPropsWithoutRef<
    typeof Base.Popup
> {
    sideOffset?: number
}

export const PopoverContent = React.forwardRef<
    HTMLDivElement,
    PopoverContentProps
>(({ className, sideOffset = 8, children, ...props }, ref) => (
    <Base.Portal>
        <Base.Positioner sideOffset={sideOffset}>
            <Base.Popup
                ref={ref}
                className={cn(
                    'border-border bg-popover text-foreground z-50 w-72 rounded-2xl border p-4 shadow-2xl transition-[opacity,transform] outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
                    className,
                )}
                {...props}
            >
                {children}
            </Base.Popup>
        </Base.Positioner>
    </Base.Portal>
))
PopoverContent.displayName = 'PopoverContent'
