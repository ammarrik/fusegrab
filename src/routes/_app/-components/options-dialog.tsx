import { Folder, X } from '#/components/icons'
import { Button } from '#/components/ui/button'
import {
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogIconButton,
    DialogTitle,
} from '#/components/ui/dialog'
import { InputField, InputIcon, InputRoot } from '#/components/ui/input'

interface DownloadOptionsModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    downloadDir: string
    onSelectFolder: () => void
}

export function DownloadOptionsModal({
    open,
    onOpenChange,
    downloadDir,
    onSelectFolder,
}: DownloadOptionsModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Download Settings</DialogTitle>
                    <DialogClose
                        render={
                            <DialogIconButton aria-label="Close">
                                <X className="h-4 w-4" />
                            </DialogIconButton>
                        }
                    />
                </DialogHeader>

                <DialogDescription>
                    Configure your default download location.
                </DialogDescription>

                <DialogBody>
                    <InputRoot
                        className="cursor-pointer"
                        onClick={onSelectFolder}
                    >
                        <InputIcon>
                            <Folder />
                        </InputIcon>
                        <InputField
                            readOnly
                            value={downloadDir}
                            placeholder="Select a folder..."
                            className="cursor-pointer"
                        />
                    </InputRoot>
                </DialogBody>

                <DialogFooter>
                    <Button
                        variant="primary"
                        block
                        onClick={() => onOpenChange(false)}
                    >
                        Continue
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
