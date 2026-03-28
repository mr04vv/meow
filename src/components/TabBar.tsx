import { useEffect } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { MethodBadge } from "@/components/MethodBadge";
import { cn } from "@/lib/utils";
import { useRequestStore } from "@/store/requestStore";


export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab, pinTab, isDirty, originalSnapshots } = useRequestStore();
  // Subscribe to originalSnapshots to re-render when dirty state changes
  void originalSnapshots;

  // Cmd+W = close active tab, Cmd+T/N = new tab (handled in parent, here for close)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "w") {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTabId, closeTab]);

  return (
    <div className="flex items-center border-b bg-muted/10 overflow-x-auto shrink-0">
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        const dirty = isDirty(tab.id);
        const isPreview = tab.isPreview;
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => {
              if (isPreview) pinTab(tab.id);
            }}
            className={cn(
              "flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 border-r cursor-pointer min-w-0 max-w-48 shrink-0 group hover:bg-muted/40 transition-colors relative",
              isActive && "bg-background"
            )}
          >
            {/* Active indicator */}
            {isActive && (
              <span className="absolute top-0 left-0 right-0 h-0.5 bg-primary" />
            )}

            <MethodBadge method={tab.method} size="xs" />

            <span
              className="text-xs truncate flex-1 min-w-0 text-muted-foreground"
              style={isPreview ? { transform: "skewX(-12deg)", display: "inline-block" } : undefined}
            >
              {tab.name}
            </span>

            {/* Close / dirty indicator area */}
            <div className="shrink-0 w-5 h-5 flex items-center justify-center">
              {dirty ? (
                <span
                  className="text-amber-400 text-[9px] leading-none cursor-pointer hover:text-amber-300"
                  title="Unsaved changes (click to close)"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >●</span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={cn(
                    "text-muted-foreground hover:text-foreground rounded-sm p-0.5 hover:bg-muted/60 opacity-0 group-hover:opacity-100 transition-opacity",
                    isPreview && "text-muted-foreground/40"
                  )}
                  aria-label="Close tab"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      <button
        onClick={addTab}
        className="flex items-center justify-center px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
        title="New Tab (⌘T)"
        aria-label="New Tab"
      >
        <PlusIcon className="size-3.5" />
      </button>
    </div>
  );
}
