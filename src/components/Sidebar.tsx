import { useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  Trash2Icon,
  UserCircle2Icon,
  XIcon,
} from "lucide-react";
import { MethodBadge } from "@/components/MethodBadge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Collection, SavedRequest } from "@/store/collectionStore";
import { useCollectionStore } from "@/store/collectionStore";
import { useGithubStore } from "@/store/githubStore";
import type { HttpMethod, KeyValuePair, RequestTab } from "@/store/requestStore";
import { useRequestStore } from "@/store/requestStore";
import { useWorkspaceStore } from "@/store/workspaceStore";

export function Sidebar() {
  const { authStatus, checkAuthStatus, logout } = useGithubStore();
  const {
    collections,
    requests,
    loading: collLoading,
    loadCollections,
    loadRequests,
    deleteCollection,
    setActiveCollection,
  } = useCollectionStore();
  const {
    activeWorkspaceId,
  } = useWorkspaceStore();
  const { addTab, openPreviewTab, setActiveTab, updateTab } = useRequestStore();

  const [parseError, setParseError] = useState<string | null>(null);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const toggleExpand = (id: string) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCollectionRequests = async (collectionId: string) => {
    if (!requests[collectionId]) {
      await loadRequests(collectionId);
    }
    setExpandedCollections((prev) => new Set([...prev, collectionId]));
  };



  const buildRequestTabData = (req: SavedRequest): Omit<RequestTab, "id" | "isPreview"> => {
    const headerPairs: KeyValuePair[] = Object.entries(req.headers).map(([k, v]) => ({
      id: `kv-${Date.now()}-${k}`,
      key: k,
      value: v,
      enabled: true,
    }));
    const queryPairs: KeyValuePair[] = Object.entries(req.query_params).map(([k, v]) => ({
      id: `kv-${Date.now()}-${k}`,
      key: k,
      value: v,
      enabled: true,
    }));
    return {
      name: req.name,
      method: req.method as HttpMethod,
      url: req.url,
      headers: headerPairs,
      queryParams: queryPairs,
      body: req.body ?? "",
      auth: { type: "none" },
      collectionId: req.collection_id,
      inheritAuth: req.collection_id !== null,
      savedRequestId: req.id,
    };
  };

  // Single click: open as preview tab
  const openRequestPreview = (req: SavedRequest) => {
    openPreviewTab(buildRequestTabData(req));
  };

  // Double click: open as pinned tab
  const openRequestPinned = (req: SavedRequest) => {
    addTab();
    const newTab = useRequestStore.getState().tabs.at(-1);
    if (!newTab) return;
    updateTab(newTab.id, buildRequestTabData(req));
    setActiveTab(newTab.id);
  };

  // Filter collections for active workspace
  const wsCollections = activeWorkspaceId
    ? collections.filter((c) => c.workspace_id === activeWorkspaceId)
    : [];
  const rootCollections = wsCollections.filter((c) => c.parent_id === null);

  const childrenOf = (parentId: string) =>
    wsCollections.filter((c) => c.parent_id === parentId);

  return (
    <div className="flex flex-col h-full bg-muted/20">
      {/* Parse error banner */}
      {parseError && (
        <div className="flex items-start gap-2 px-3 py-2 bg-destructive/10 border-b border-destructive/20">
          <p className="text-[10px] text-destructive leading-snug flex-1">{parseError}</p>
          <button
            onClick={() => setParseError(null)}
            className="text-destructive/70 hover:text-destructive shrink-0 mt-0.5"
            aria-label="Dismiss error"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Collections
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground"
          onClick={async () => {
            await loadCollections(activeWorkspaceId ?? undefined);
          }}
          title="Refresh"
          disabled={collLoading}
        >
          <RefreshCwIcon className={`size-3 ${collLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Collection tree for active workspace */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="py-1">
            {activeWorkspaceId ? (
              <>
                {rootCollections.map((col) => (
                  <CollectionNode
                    key={col.id}
                    collection={col}
                    children={childrenOf(col.id)}
                    requests={requests}
                    expanded={expandedCollections}
                    onCollectionClick={async (id) => {
                      // Root collection click: show collection settings, clear active tab
                      setActiveCollection(id);
                      setActiveTab(null);
                      // Expand and load requests for this collection and its children
                      setExpandedCollections((prev) => new Set([...prev, id]));
                      await loadRequests(id);
                      // Also load requests for child collections (subfolders)
                      const children = wsCollections.filter((c) => c.parent_id === id);
                      for (const child of children) {
                        if (!requests[child.id]) {
                          await loadRequests(child.id);
                        }
                        setExpandedCollections((prev) => new Set([...prev, child.id]));
                      }
                    }}
                    onSubfolderToggle={toggleExpand}
                    onOpenCollection={openCollectionRequests}
                    onOpenRequest={openRequestPreview}
                    onOpenRequestPinned={openRequestPinned}
                    onDelete={() => deleteCollection(col.id)}
                    loadRequests={loadRequests}
                    depth={0}
                  />
                ))}

                {rootCollections.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
                    <FolderIcon className="size-8 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">No collections</p>
                    <p className="text-[10px] text-muted-foreground/60">
                      Import OpenAPI specs to create collections
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
                <FolderIcon className="size-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No workspace selected</p>
                <p className="text-[10px] text-muted-foreground/60">
                  Select or create a workspace from the header
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {authStatus?.authenticated && (
        <>
          <Separator />
          <div className="p-2 flex items-center gap-2 px-3 shrink-0 min-w-0">
            <UserCircle2Icon className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground truncate">
              {authStatus.login}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-destructive shrink-0 ml-auto"
              onClick={logout}
              title="Sign out"
            >
              <LogOutIcon className="size-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Collection tree node ──────────────────────────────────────────────────────

interface CollectionNodeProps {
  collection: Collection;
  children: Collection[];
  requests: Record<string, SavedRequest[]>;
  expanded: Set<string>;
  onCollectionClick: (id: string) => void;
  onSubfolderToggle: (id: string) => void;
  onOpenCollection: (id: string) => Promise<void>;
  onOpenRequest: (req: SavedRequest) => void;
  onOpenRequestPinned: (req: SavedRequest) => void;
  onDelete: () => void;
  loadRequests: (id: string) => Promise<void>;
  depth?: number;
  isSubfolder?: boolean;
}

function CollectionNode({
  collection,
  children,
  requests,
  expanded,
  onCollectionClick,
  onSubfolderToggle,
  onOpenCollection,
  onOpenRequest,
  onOpenRequestPinned,
  onDelete,
  loadRequests,
  depth = 0,
  isSubfolder = false,
}: CollectionNodeProps) {
  const isExpanded = expanded.has(collection.id);
  const collRequests = requests[collection.id] ?? [];

  const handleChevronClick = async (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (isSubfolder) {
      if (!isExpanded && !requests[collection.id]) {
        await loadRequests(collection.id);
      }
      onSubfolderToggle(collection.id);
    } else {
      // Root collection chevron: toggle expand/collapse only
      if (!isExpanded && !requests[collection.id]) {
        await loadRequests(collection.id);
      }
      onSubfolderToggle(collection.id);
    }
  };

  const handleRowClick = async () => {
    if (isSubfolder) {
      // Subfolder: expand/collapse only
      if (!isExpanded && !requests[collection.id]) {
        await loadRequests(collection.id);
      }
      onSubfolderToggle(collection.id);
    } else {
      // Root collection: show settings view + expand
      onCollectionClick(collection.id);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 hover:bg-muted/50 cursor-pointer group pr-2"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={handleRowClick}
      >
        <button
          onClick={handleChevronClick}
          className="shrink-0 text-muted-foreground p-0.5 hover:text-foreground"
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )}
        </button>
        {isExpanded ? (
          <FolderOpenIcon className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs flex-1 truncate">
          {collection.name}
        </span>
        {!isSubfolder && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5 transition-opacity"
            title="Delete collection"
          >
            <Trash2Icon className="size-3" />
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          {children.map((child) => (
            <CollectionNode
              key={child.id}
              collection={child}
              children={[]}
              requests={requests}
              expanded={expanded}
              onCollectionClick={onCollectionClick}
              onSubfolderToggle={onSubfolderToggle}
              onOpenCollection={async (id) => {
                if (!requests[id]) await loadRequests(id);
                await onOpenCollection(id);
              }}
              onOpenRequest={onOpenRequest}
              onOpenRequestPinned={onOpenRequestPinned}
              onDelete={onDelete}
              loadRequests={loadRequests}
              depth={depth + 1}
              isSubfolder={true}
            />
          ))}

          {collRequests.map((req) => (
            <RequestItem
              key={req.id}
              request={req}
              depth={depth + 1}
              onOpen={() => onOpenRequest(req)}
              onOpenPinned={() => onOpenRequestPinned(req)}
            />
          ))}

          {children.length === 0 && collRequests.length === 0 && (
            <div
              className="text-[10px] text-muted-foreground/60 py-1"
              style={{ paddingLeft: `${20 + (depth + 1) * 12}px` }}
            >
              Empty
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Request item ──────────────────────────────────────────────────────────────

interface RequestItemProps {
  request: SavedRequest;
  depth: number;
  onOpen: () => void;
  onOpenPinned: () => void;
}

function RequestItem({ request, depth, onOpen, onOpenPinned }: RequestItemProps) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onOpenPinned();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onOpen();
      }, 250);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 py-1 w-full hover:bg-muted/50 transition-colors group text-left pr-2"
      style={{ paddingLeft: `${20 + depth * 12}px` }}
    >
      <MethodBadge method={request.method} size="xs" />
      <span className="text-xs truncate flex-1 text-muted-foreground">
        {request.name}
      </span>
      <MoreHorizontalIcon className="size-3 opacity-0 group-hover:opacity-100 text-muted-foreground shrink-0" />
    </button>
  );
}
