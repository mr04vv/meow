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

interface TabCloseConfirmDialogProps {
  tabId: string | null;
  onClose: () => void;
}

export function TabCloseConfirmDialog({ tabId, onClose }: TabCloseConfirmDialogProps) {
  const { tabs, closeTab, saveTab } = useRequestStore();
  const tabToClose = tabId ? tabs.find((t) => t.id === tabId) ?? null : null;

  return (
    <AlertDialog open={tabId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            {tabToClose && (
              <>
                <span className="font-semibold text-foreground">{tabToClose.name}</span> has unsaved changes. What would you like to do?
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (tabId) closeTab(tabId);
              onClose();
            }}
          >
            Discard
          </AlertDialogAction>
          <AlertDialogAction
            onClick={async () => {
              if (tabId) {
                await saveTab(tabId);
                closeTab(tabId);
              }
              onClose();
            }}
          >
            Save &amp; Close
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
