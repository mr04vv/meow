import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpenIcon,
  CheckIcon,
  CheckSquareIcon,
  ChevronsUpDownIcon,
  GitBranchIcon,
  LockIcon,
  SearchIcon,
  SquareIcon,
  UnlockIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { GithubBranch, GithubRepo, GithubTreeEntry } from "@/store/githubStore";
import { useGithubStore } from "@/store/githubStore";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectFiles?: (
    repo: GithubRepo,
    branch: string,
    files: GithubTreeEntry[],
    collectionName: string
  ) => void;
}

export function RepoSelector({ open, onClose, onSelectFiles }: Props) {
  const {
    repos,
    selectedRepo,
    branches,
    selectedBranch,
    openApiFiles,
    protoFiles,
    loading,
    loadingMore,
    hasMoreRepos,
    includeExternal,
    error,
    loadRepos,
    loadMoreRepos,
    setIncludeExternal,
    setSearchQuery,
    selectRepo,
    selectBranch,
    resetSelection,
  } = useGithubStore();

  const [localSearch, setLocalSearch] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [collectionName, setCollectionName] = useState("");

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      resetSelection();
      setLocalSearch("");
      setSelectedFiles(new Set());
      setCollectionName("");
      loadRepos();
    }
  }, [open, resetSelection, loadRepos]);

  // Reset file selection when repo or branch changes
  useEffect(() => {
    setSelectedFiles(new Set());
  }, [selectedRepo?.id, selectedBranch]);

  // Set default collection name when repo is selected
  useEffect(() => {
    if (selectedRepo) {
      setCollectionName(`${selectedRepo.name} APIs`);
    }
  }, [selectedRepo?.name]);

  // Infinite scroll: observe a sentinel element at the bottom of the repo list
  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && hasMoreRepos && !loadingMore && !loading) {
            loadMoreRepos();
          }
        },
        { threshold: 0.1 }
      );
      observerRef.current.observe(node);
    },
    [hasMoreRepos, loadingMore, loading, loadMoreRepos]
  );

  // Debounced search: trigger API call after typing stops or includeExternal changes
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
      loadRepos(localSearch || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, open, includeExternal]);

  const handleSearch = () => {
    setSearchQuery(localSearch);
    loadRepos(localSearch || undefined);
  };

  const filteredRepos = repos;

  const repoOwner = selectedRepo?.full_name.split("/")[0];
  const repoName = selectedRepo?.full_name.split("/")[1];

  const totalSpecFiles = openApiFiles.length + protoFiles.length;
  const allSelected =
    totalSpecFiles > 0 && selectedFiles.size === totalSpecFiles;
  const someSelected = selectedFiles.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set([...openApiFiles, ...protoFiles].map((f) => f.sha)));
    }
  };

  const toggleFile = (sha: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(sha)) {
        next.delete(sha);
      } else {
        next.add(sha);
      }
      return next;
    });
  };

  const handleGenerateCollection = () => {
    if (!selectedRepo || !selectedBranch || selectedFiles.size === 0) return;
    const allSpecFiles = [...openApiFiles, ...protoFiles];
    const files = allSpecFiles.filter((f) => selectedFiles.has(f.sha));
    onSelectFiles?.(selectedRepo, selectedBranch, files, collectionName);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-5xl w-[90vw] h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BookOpenIcon className="size-4" />
            Select Repository
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Left: Repo list */}
          <div className="w-80 shrink-0 flex flex-col gap-2 min-h-0">
            <div className="flex gap-1.5">
              <Input
                placeholder="Search repos..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSearch();
                  }
                }}
                className="h-8 text-xs"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleSearch}
              >
                <SearchIcon className="size-3.5" />
              </Button>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={includeExternal}
                onCheckedChange={(checked) => setIncludeExternal(checked === true)}
                className="size-3.5"
              />
              <span className="text-[11px] text-muted-foreground select-none">
                Include external repos
              </span>
            </label>

            <div className="flex-1 min-h-0 border rounded-md overflow-hidden relative">
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </span>
                </div>
              )}
              <ScrollArea className="h-full">
                <div className="p-1 flex flex-col gap-0.5">
                    {filteredRepos.map((repo) => (
                      <button
                        key={repo.id}
                        onClick={() => selectRepo(repo)}
                        className={`flex items-start gap-2 px-2 py-2 rounded text-left w-full hover:bg-muted/60 transition-colors ${
                          selectedRepo?.id === repo.id
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {repo.private ? (
                          <LockIcon className="size-3 mt-0.5 shrink-0" />
                        ) : (
                          <UnlockIcon className="size-3 mt-0.5 shrink-0 opacity-50" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">
                            {repo.name}
                          </p>
                          {repo.description && (
                            <p className="text-[10px] opacity-60 mt-0.5 line-clamp-2 break-words">
                              {repo.description}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                    {filteredRepos.length === 0 && !loading && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No repositories found
                      </p>
                    )}
                    {/* Sentinel for infinite scroll */}
                    {hasMoreRepos && (
                      <div ref={sentinelCallback} className="py-2 flex justify-center">
                        {loadingMore && (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Loading...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
              </ScrollArea>
            </div>
          </div>

          <Separator orientation="vertical" />

          {/* Right: Branches + OpenAPI files */}
          <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
            {selectedRepo ? (
              <>
                <BranchSelector
                  branches={branches}
                  selectedBranch={selectedBranch}
                  onSelect={(branch) =>
                    repoOwner &&
                    repoName &&
                    selectBranch(branch, repoOwner, repoName)
                  }
                />

                {error && (
                  <p className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded">
                    {error}
                  </p>
                )}

                <div className="flex flex-col gap-1.5 flex-1 min-h-0">
                  {(() => {
                    const allSpecFiles = [
                      ...openApiFiles.map(f => ({ ...f, specType: "openapi" as const })),
                      ...protoFiles.map(f => ({ ...f, specType: "proto" as const })),
                    ];
                    return (
                      <>
                        <div className="flex items-center justify-between shrink-0">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">
                            Spec Files
                          </span>
                          {loading ? (
                            <span className="size-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                          ) : allSpecFiles.length > 0 ? (
                            <button
                              onClick={toggleSelectAll}
                              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {allSelected ? (
                                <CheckSquareIcon className="size-3" />
                              ) : someSelected ? (
                                <CheckSquareIcon className="size-3 opacity-50" />
                              ) : (
                                <SquareIcon className="size-3" />
                              )}
                              {allSelected ? "Deselect All" : "Select All"}
                            </button>
                          ) : null}
                        </div>

                        <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                          <ScrollArea className="h-full">
                            <div className="p-2 flex flex-col gap-1">
                              {allSpecFiles.length === 0 && !loading && (
                                <p className="text-xs text-muted-foreground text-center py-4">
                                  No spec files detected
                                </p>
                              )}
                              {allSpecFiles.map((file) => (
                                <div
                                  key={file.sha}
                                  className="flex items-start gap-2 px-2 py-2 rounded hover:bg-muted/60 transition-colors cursor-pointer"
                                  onClick={() => toggleFile(file.sha)}
                                >
                                  <Checkbox
                                    checked={selectedFiles.has(file.sha)}
                                    onCheckedChange={() => toggleFile(file.sha)}
                                    className="mt-0.5 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <BookOpenIcon className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                                  <span className="font-mono text-xs flex-1 break-all">
                                    {file.path}
                                  </span>
                                  <span className={`text-[9px] px-1 py-0 rounded-sm font-mono shrink-0 ${
                                    file.specType === "proto" ? "bg-teal-600/20 text-teal-400" : "bg-blue-600/20 text-blue-400"
                                  }`}>
                                    {file.specType === "proto" ? "proto" : "openapi"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Collection name + generate */}
                <div className="shrink-0 flex flex-col gap-2 border-t pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                      Collection Name
                    </span>
                    <Input
                      value={collectionName}
                      onChange={(e) => setCollectionName(e.target.value)}
                      placeholder="My Collection"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {selectedFiles.size > 0
                        ? `${selectedFiles.size} file${selectedFiles.size > 1 ? "s" : ""} selected`
                        : "No files selected"}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={onClose}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        disabled={
                          selectedFiles.size === 0 || !collectionName.trim()
                        }
                        onClick={handleGenerateCollection}
                      >
                        <BookOpenIcon className="size-3.5" />
                        Generate Collection
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                Select a repository to browse its branches and OpenAPI files
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Branch selector with search ──────────────────────────────────────────────

function BranchSelector({
  branches,
  selectedBranch,
  onSelect,
}: {
  branches: GithubBranch[];
  selectedBranch: string | null;
  onSelect: (branch: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <GitBranchIcon className="size-3.5 text-muted-foreground shrink-0" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 text-xs flex-1 justify-between font-mono"
          >
            {selectedBranch ?? "Select branch..."}
            <ChevronsUpDownIcon className="size-3 opacity-50 shrink-0 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search branches..." className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                No branches found
              </CommandEmpty>
              <CommandGroup>
                {branches.map((b) => (
                  <CommandItem
                    key={b.name}
                    value={b.name}
                    onSelect={() => {
                      onSelect(b.name);
                      setOpen(false);
                    }}
                    className="text-xs font-mono"
                  >
                    <CheckIcon
                      className={cn(
                        "size-3 mr-2 shrink-0",
                        selectedBranch === b.name ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {b.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
