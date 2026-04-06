import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { MethodBadge } from "@/components/MethodBadge";
import { cn } from "@/lib/utils";
import { useRequestStore } from "@/store/requestStore";


interface TabBarProps {
  onCloseTab?: (tabId: string) => void;
}

export function TabBar({ onCloseTab }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab, pinTab, isDirty, originalSnapshots, reorderTabs } = useRequestStore();
  void originalSnapshots;

  const [dragState, setDragState] = useState<{
    dragging: boolean;
    fromIndex: number;
    currentIndex: number;
    startX: number;
  } | null>(null);

  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleCloseTab = (tabId: string) => {
    if (onCloseTab) {
      onCloseTab(tabId);
    } else {
      closeTab(tabId);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "w") {
        e.preventDefault();
        if (activeTabId) handleCloseTab(activeTabId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTabId, handleCloseTab]);

  const handleMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    // Only left mouse button, ignore close button clicks
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("[aria-label]")) return;

    setDragState({
      dragging: false,
      fromIndex: index,
      currentIndex: index,
      startX: e.clientX,
    });
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragState((prev) => {
        if (!prev) return null;
        const isDragging = prev.dragging || Math.abs(e.clientX - prev.startX) > 5;
        if (!isDragging) return prev;

        // Find which tab we're over
        let newIndex = prev.fromIndex;
        for (let i = 0; i < tabRefs.current.length; i++) {
          const el = tabRefs.current[i];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const mid = rect.left + rect.width / 2;
          if (e.clientX < mid) {
            newIndex = i;
            break;
          }
          newIndex = i;
        }

        return { ...prev, dragging: true, currentIndex: newIndex };
      });
    };

    const handleMouseUp = () => {
      if (dragState?.dragging && dragState.fromIndex !== dragState.currentIndex) {
        reorderTabs(dragState.fromIndex, dragState.currentIndex);
      }
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, reorderTabs]);

  return (
    <div className="flex items-center border-b bg-muted/10 overflow-x-auto shrink-0">
      {tabs.map((tab, index) => {
        const isActive = activeTabId === tab.id;
        const dirty = isDirty(tab.id);
        const isPreview = tab.isPreview;
        const isDragging = dragState?.dragging && dragState.fromIndex === index;
        const isDropTarget = dragState?.dragging && dragState.currentIndex === index && dragState.fromIndex !== index;
        return (
          <div
            key={tab.id}
            ref={(el) => { tabRefs.current[index] = el; }}
            onMouseDown={(e) => handleMouseDown(e, index)}
            onClick={() => {
              if (!dragState?.dragging) setActiveTab(tab.id);
            }}
            onDoubleClick={() => {
              if (isPreview) pinTab(tab.id);
            }}
            className={cn(
              "flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 border-r cursor-grab min-w-0 max-w-48 shrink-0 group hover:bg-muted/40 transition-colors relative select-none",
              isActive && "bg-background",
              isDragging && "opacity-40",
              isDropTarget && "border-l-2 border-l-primary"
            )}
          >
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

            <div className="shrink-0 w-5 h-5 flex items-center justify-center">
              {dirty ? (
                <span
                  className="text-amber-400 text-[9px] leading-none cursor-pointer hover:text-amber-300"
                  title="Unsaved changes (click to close)"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                >●</span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
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
