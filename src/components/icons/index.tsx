import type { HugeiconsIconProps } from '@hugeicons/react'

import {
    Add01Icon,
    AiMagicIcon,
    Album02Icon,
    ArrowDown01Icon,
    ArrowLeft01Icon,
    ArrowRight01Icon,
    ArrowUp01Icon,
    ArrowUp02Icon,
    AudioWave02Icon,
    BulbIcon,
    Cancel01Icon,
    Clock01Icon,
    ClosedCaptionIcon,
    Copy01Icon,
    Delete02Icon,
    Download04Icon,
    Folder01Icon,
    Folder03Icon,
    FolderAddIcon,
    Globe02Icon,
    Home01Icon,
    Image01Icon,
    LinkSquare02Icon,
    Loading03Icon,
    Mic02Icon,
    MoreHorizontalSquareIcon,
    MoreVerticalIcon,
    MusicNote01Icon,
    PanelLeftIcon,
    PanelRightIcon,
    PauseIcon,
    PencilEdit02Icon,
    PlayIcon,
    PlugSocketIcon,
    RefreshIcon,
    Robot01Icon,
    ScrollIcon,
    Search01Icon,
    Sent02Icon,
    Settings01Icon,
    SlidersHorizontalIcon,
    StopIcon,
    Tick02Icon,
    Video02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export type IconProps = Omit<HugeiconsIconProps, 'icon'>
export type IconComponent = (props: IconProps) => React.ReactElement

function makeIcon(icon: HugeiconsIconProps['icon']): IconComponent {
    const Component = (props: IconProps) => (
        <HugeiconsIcon icon={icon} {...props} />
    )
    return Component
}

export const Plus = makeIcon(Add01Icon)
export const Send = makeIcon(Sent02Icon)
export const ArrowLeft = makeIcon(ArrowLeft01Icon)
export const ArrowRight = makeIcon(ArrowRight01Icon)
export const ArrowUp = makeIcon(ArrowUp02Icon)
export const AudioLines = makeIcon(AudioWave02Icon)
export const Bot = makeIcon(Robot01Icon)
export const Check = makeIcon(Tick02Icon)
export const CheckIcon = makeIcon(Tick02Icon)
export const ChevronUpIcon = makeIcon(ArrowUp01Icon)
export const ChevronDownIcon = makeIcon(ArrowDown01Icon)
export const Clock = makeIcon(Clock01Icon)
export const ClosedCaption = makeIcon(ClosedCaptionIcon)
export const Copy = makeIcon(Copy01Icon)
export const Download = makeIcon(Download04Icon)
export const ExternalLink = makeIcon(LinkSquare02Icon)
export const Video = makeIcon(Video02Icon)
export const Folder = makeIcon(Folder01Icon)
export const FolderOpen = makeIcon(Folder03Icon)
export const FolderPlus = makeIcon(FolderAddIcon)
export const Globe = makeIcon(Globe02Icon)
export const Home = makeIcon(Home01Icon)
export const Image = makeIcon(Image01Icon)
export const Images = makeIcon(Album02Icon)
export const Lightbulb = makeIcon(BulbIcon)
export const Loader2 = makeIcon(Loading03Icon)
export const Mic = makeIcon(Mic02Icon)
export const MoreHorizontal = makeIcon(MoreHorizontalSquareIcon)
export const MoreVertical = makeIcon(MoreVerticalIcon)
export const Music = makeIcon(MusicNote01Icon)
export const PanelLeft = makeIcon(PanelLeftIcon)
export const PanelRight = makeIcon(PanelRightIcon)
export const Pause = makeIcon(PauseIcon)
export const Pencil = makeIcon(PencilEdit02Icon)
export const Play = makeIcon(PlayIcon)
export const Plug = makeIcon(PlugSocketIcon)
export const RefreshCw = makeIcon(RefreshIcon)
export const Square = makeIcon(StopIcon)
export const ScrollText = makeIcon(ScrollIcon)
export const Search = makeIcon(Search01Icon)
export const Settings = makeIcon(Settings01Icon)
export const Sliders = makeIcon(SlidersHorizontalIcon)
export const Sparkles = makeIcon(AiMagicIcon)
export const SquarePen = makeIcon(PencilEdit02Icon)
export const Trash2 = makeIcon(Delete02Icon)
export const X = makeIcon(Cancel01Icon)
