import type { DownloadItem } from './types'

export async function pauseSelectedItems(
    items: DownloadItem[],
    setItems: React.Dispatch<React.SetStateAction<DownloadItem[]>>,
    setIsDownloading: (val: boolean) => void,
    setActiveItemUrl: (val: string | null) => void,
) {
    const selectedItems = items.filter((i) => i.selected)
    const hasDownloadingSelected = selectedItems.some(
        (i) => i.status === 'Downloading',
    )

    if (hasDownloadingSelected) {
        try {
            await window.api.youtube.cancelDownload()
        } catch {}
        setIsDownloading(false)
        setActiveItemUrl(null)
    }

    setItems((prev) =>
        prev.map((i) =>
            i.selected && (i.status === 'Downloading' || i.status === 'Queued')
                ? { ...i, status: 'Paused', statusStage: undefined }
                : i,
        ),
    )
}



export async function stopItemById(
    id: string,
    items: DownloadItem[],
    setItems: React.Dispatch<React.SetStateAction<DownloadItem[]>>,
    setIsDownloading: (val: boolean) => void,
    setActiveItemUrl: (val: string | null) => void,
) {
    const item = items.find((i) => i.id === id)
    if (item?.status === 'Downloading') {
        try {
            await window.api.youtube.cancelDownload()
        } catch {}
        setIsDownloading(false)
        setActiveItemUrl(null)
    }

    if (item?.savePath && item.status !== 'Complete') {
        await window.files
            .deletePartialFile(item.savePath)
            .catch(() => undefined)
    }

    setItems((prev) =>
        prev.map((i) =>
            i.id === id
                ? { ...i, status: 'Stopped', percent: 0, statusStage: undefined }
                : i,
        ),
    )
}

export async function deleteItemById(
    id: string,
    items: DownloadItem[],
    setItems: React.Dispatch<React.SetStateAction<DownloadItem[]>>,
    setIsDownloading: (val: boolean) => void,
    setActiveItemUrl: (val: string | null) => void,
) {
    const item = items.find((i) => i.id === id)
    if (item?.status === 'Downloading') {
        try {
            await window.api.youtube.cancelDownload()
        } catch {}
        setIsDownloading(false)
        setActiveItemUrl(null)
    }

    if (item?.savePath && item.status !== 'Complete') {
        await window.files
            .deletePartialFile(item.savePath)
            .catch(() => undefined)
    }

    setItems((prev) => prev.filter((i) => i.id !== id))
}

export async function deleteSelectedItems(
    items: DownloadItem[],
    setItems: React.Dispatch<React.SetStateAction<DownloadItem[]>>,
    setIsDownloading: (val: boolean) => void,
    setActiveItemUrl: (val: string | null) => void,
) {
    const selectedItems = items.filter((i) => i.selected)
    const hasDownloadingSelected = selectedItems.some(
        (i) => i.status === 'Downloading',
    )

    if (hasDownloadingSelected) {
        try {
            await window.api.youtube.cancelDownload()
        } catch {}
        setIsDownloading(false)
        setActiveItemUrl(null)
    }

    for (const item of selectedItems) {
        if (item.savePath && item.status !== 'Complete') {
            await window.files
                .deletePartialFile(item.savePath)
                .catch(() => undefined)
        }
    }

    setItems((prev) => prev.filter((i) => !i.selected))
}
