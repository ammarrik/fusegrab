import { ScrollArea as Base } from '@base-ui/react/scroll-area'

import { cn } from '#/lib/utils'

type ScrollAreaProps = {
    children: React.ReactNode
    className?: string
    /** Padding applied inside the viewport, so content clears the scrollbar. */
    contentClassName?: string
    orientation?: 'vertical' | 'horizontal' | 'both'
}

/**
 * Scroll container whose scrollbars float *over* the content instead of taking
 * layout width.
 *
 * That distinction matters beyond looks: a classic scrollbar narrows its own
 * container, which can push the content wide enough to need a second scrollbar
 * on the other axis — the kind of cascade where picking one extra option in a
 * panel makes a horizontal bar appear out of nowhere. Overlaid scrollbars can't
 * start it.
 */
export function ScrollArea({
    children,
    className,
    contentClassName,
    orientation = 'vertical',
}: ScrollAreaProps) {
    return (
        <Base.Root className={cn('relative min-h-0', className)}>
            <Base.Viewport
                className={cn(
                    'h-full w-full overscroll-contain',
                    // Base UI's viewport applies overflow itself; the native
                    // scrollbars would double up with ours.
                    '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    contentClassName,
                )}
            >
                {children}
            </Base.Viewport>

            {orientation !== 'horizontal' && (
                <Scrollbar orientation="vertical" />
            )}
            {orientation !== 'vertical' && (
                <Scrollbar orientation="horizontal" />
            )}
            {orientation === 'both' && (
                <Base.Corner className="bg-transparent" />
            )}
        </Base.Root>
    )
}

function Scrollbar({
    orientation,
}: {
    orientation: 'vertical' | 'horizontal'
}) {
    const vertical = orientation === 'vertical'
    return (
        <Base.Scrollbar
            orientation={orientation}
            className={cn(
                'z-10 flex touch-none p-0.5 opacity-0 transition-opacity delay-150 duration-200 select-none',
                // Visible while scrolling or hovering the area, faded out
                // otherwise — the panel never wears a permanent grey stripe.
                'data-hovering:opacity-100 data-hovering:delay-0 data-hovering:duration-75',
                'data-scrolling:opacity-100 data-scrolling:delay-0 data-scrolling:duration-75',
                vertical
                    ? 'w-2.5 justify-center'
                    : 'h-2.5 flex-col items-center',
            )}
        >
            <Base.Thumb
                className={cn(
                    'bg-foreground/20 hover:bg-foreground/35 rounded-full transition-colors',
                    vertical ? 'w-1' : 'h-1',
                )}
            />
        </Base.Scrollbar>
    )
}
