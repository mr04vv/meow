import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRequestStore } from "@/store/requestStore";

interface UnsavedChangesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function UnsavedChangesDialog({ open, onClose }: UnsavedChangesDialogProps) {
  const { saveAllDirty, getUnsavedTabs } = useRequestStore();

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            The following requests have unsaved changes:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc list-inside space-y-1.5 text-sm text-muted-foreground py-2">
          {getUnsavedTabs().map((tab) => (
            <li key={tab.id} className="text-xs">
              <span className="font-mono font-semibold text-foreground">{tab.name}</span>
              <span className="text-muted-foreground/60 ml-1.5">{tab.method} {tab.url}</span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              onClose();
              await getCurrentWindow().close();
            }}
          >
            Discard &amp; Close
          </AlertDialogAction>
          <AlertDialogAction
            onClick={async () => {
              onClose();
              await saveAllDirty();
              await getCurrentWindow().close();
            }}
          >
            Save &amp; Close
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
