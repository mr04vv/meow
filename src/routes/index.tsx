import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  GithubIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import notoCatSvg from "@/assets/noto-cat.svg";
import { CollectionView } from "@/components/CollectionView";
import { EnvironmentManagerDialog } from "@/components/EnvironmentManagerDialog";
import { GithubLoginDialog } from "@/components/GithubLoginDialog";
import { RepoSelector } from "@/components/RepoSelector";
import { RequestEditor } from "@/components/RequestEditor";
import { RequestUrlBar } from "@/components/RequestUrlBar";
import { ResponseViewer } from "@/components/ResponseViewer";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import { TabCloseConfirmDialog } from "@/components/TabCloseConfirmDialog";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCollectionStore } from "@/store/collectionStore";
import type { GithubRepo, GithubTreeEntry } from "@/store/githubStore";
import { useGithubStore } from "@/store/githubStore";
import { useRequestStore } from "@/store/requestStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import type { ParsedOpenApi } from "@/types/openapi";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { tabs, activeTabId, responses, loading, docs, addTab, setActiveTab, closeTab, isDirty } =
    useRequestStore();
  const { workspaces, activeWorkspaceId, loadWorkspaces, setActiveWorkspace, deleteWorkspace } =
    useWorkspaceStore();
  const {
    activeCollectionId,
    setActiveCollection,
    loadCollections,
    createCollection,
    generateFromOpenApi,
    generateFromProto,
    updateImportSource,
    environments,
    activeEnvironmentId,
    setActiveEnvironment,
  } = useCollectionStore();
  const { authStatus, checkAuthStatus } = useGithubStore();

  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [repoSelectorMode, setRepoSelectorMode] = useState<null | "workspace" | "collection">(null);
  const [envManagerOpen, setEnvManagerOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [tabCloseConfirmId, setTabCloseConfirmId] = useState<string | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Determine right panel view mode
  const viewMode: "collection" | "request" | "welcome" = activeTab
    ? "request"
    : activeCollectionId
      ? "collection"
      : "welcome";

  useEffect(() => {
    loadWorkspaces();
    checkAuthStatus();
  }, [loadWorkspaces, checkAuthStatus]);

  // Load collections when workspace changes
  useEffect(() => {
    if (activeWorkspaceId) {
      loadCollections(activeWorkspaceId);
    }
  }, [activeWorkspaceId, loadCollections]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "t" || e.key === "n") {
        e.preventDefault();
        addTab();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addTab]);

  // Window close confirmation when there are unsaved tabs
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      const unsaved = useRequestStore.getState().getUnsavedTabs();
      if (unsaved.length > 0) {
        event.preventDefault();
        setCloseConfirmOpen(true);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const tryCloseTab = useCallback((tabId: string) => {
    if (isDirty(tabId)) {
      setTabCloseConfirmId(tabId);
    } else {
      closeTab(tabId);
    }
  }, [isDirty, closeTab]);

  const handleImportFromGitHub = (mode: "workspace" | "collection" = "workspace") => {
    setWsMenuOpen(false);
    if (authStatus?.authenticated) {
      setRepoSelectorMode(mode);
    } else {
      setLoginOpen(true);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center px-3 h-10 border-b shrink-0 bg-muted/20 gap-2">
        <span className="text-sm font-semibold select-none flex items-center gap-1"><img src={notoCatSvg} alt="" className="size-4" /> Meow</span>

        <Separator orientation="vertical" className="h-5" />

        {/* Workspace selector */}
        <Popover open={wsMenuOpen} onOpenChange={setWsMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={wsMenuOpen}
              className="h-7 text-xs w-52 justify-between border-dashed"
            >
              <span className="truncate">
                {activeWorkspace?.name ?? "Select Workspace..."}
              </span>
              <ChevronsUpDownIcon className="size-3 opacity-50 shrink-0 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search workspaces..."
                className="h-8 text-xs"
              />
              <CommandList>
                <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                  No workspaces
                </CommandEmpty>
                {workspaces.length > 0 && (
                  <CommandGroup>
                    {workspaces.map((ws) => (
                      <CommandItem
                        key={ws.id}
                        value={ws.name}
                        onSelect={() => {
                          setActiveWorkspace(ws.id);
                          setActiveTab(null);
                          setWsMenuOpen(false);
                        }}
                        className="text-xs"
                      >
                        <CheckIcon
                          className={cn(
                            "size-3 mr-2 shrink-0",
                            activeWorkspaceId === ws.id
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        {ws.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => handleImportFromGitHub("workspace")}
                    className="text-xs gap-2"
                  >
                    <GithubIcon className="size-3 shrink-0" />
                    Import from GitHub
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              title="Manage Workspaces"
            >
              <SettingsIcon className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase px-2 py-1">
                Workspaces
              </p>
              {workspaces.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No workspaces</p>
              )}
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 group"
                >
                  <span className="text-xs flex-1 truncate">{ws.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={async () => {
                      await deleteWorkspace(ws.id);
                      if (activeWorkspaceId === ws.id) {
                        setActiveWorkspace(null);
                      }
                    }}
                    title="Delete workspace"
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {/* Environment selector (shown when a collection is active) */}
        {activeCollectionId && (
          <>
            <Select
              value={activeEnvironmentId ?? "__none__"}
              onValueChange={(v) => {
                if (v !== "__none__" && activeCollectionId) {
                  setActiveEnvironment(activeCollectionId, v);
                }
              }}
            >
              <SelectTrigger className="h-7 text-xs w-36 border-dashed">
                <SelectValue placeholder="No Environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">No Environment</span>
                </SelectItem>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setEnvManagerOpen(true)}
              title="Manage Environments"
            >
              <SettingsIcon className="size-3.5" />
            </Button>
          </>
        )}
      </header>

      {/* Main layout */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
          <Sidebar onImportFromGithub={() => handleImportFromGitHub("collection")} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="80%" minSize="40%">
          <div className="flex flex-col h-full">
            {/* TabBar — shown when there are any tabs */}
            {tabs.length > 0 && <TabBar onCloseTab={tryCloseTab} />}

            {/* Content area */}
            <div className="flex-1 min-h-0 flex flex-col">
              {viewMode === "request" && activeTab ? (
                <>
                  {/* URL bar — full width above request/response split */}
                  <RequestUrlBar tab={activeTab} />

                  {/* Request / Response split */}
                  <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
                    <ResizablePanel defaultSize="50%" minSize="20%">
                      <RequestEditor tab={activeTab} hideUrlBar />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize="50%" minSize="20%">
                      <ResponseViewer
                        response={
                          activeTabId
                            ? (responses[activeTabId] ?? null)
                            : null
                        }
                        loading={
                          activeTabId ? (loading[activeTabId] ?? false) : false
                        }
                        docsJson={
                          activeTabId ? (docs[activeTabId] ?? null) : null
                        }
                        tab={activeTab}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </>
              ) : viewMode === "collection" && activeCollectionId ? (
                <CollectionView />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <img src={notoCatSvg} alt="" className="size-12 select-none" />
                    <p className="text-sm font-medium">Welcome to Meow</p>
                    <p className="text-xs text-muted-foreground/70">
                      Select a workspace or import from GitHub to get started
                    </p>
                    {authStatus?.authenticated ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-xs"
                        onClick={() => handleImportFromGitHub(activeWorkspaceId ? "collection" : "workspace")}
                      >
                        <GithubIcon className="size-3.5" />
                        Import from GitHub
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-xs"
                        onClick={() => setLoginOpen(true)}
                      >
                        <GithubIcon className="size-3.5" />
                        Sign in with GitHub
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Dialogs */}
      <GithubLoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
      <RepoSelector
        open={repoSelectorMode !== null}
        onClose={() => setRepoSelectorMode(null)}
        onSelectFiles={async (repo: GithubRepo, branch: string, files: GithubTreeEntry[], collectionName: string) => {
          const importMode = repoSelectorMode;
          setRepoSelectorMode(null);
          if (files.length === 0) return;

          const [owner, repoName] = repo.full_name.split("/");
          try {
            let workspaceId: string;
            if (importMode === "collection" && activeWorkspaceId) {
              // Add collection to existing workspace
              workspaceId = activeWorkspaceId;
            } else {
              // Create new workspace
              const workspace = await useWorkspaceStore.getState().createWorkspace(collectionName);
              workspaceId = workspace.id;
              setActiveWorkspace(workspaceId);
            }
            const rootCollection = await createCollection(collectionName, workspaceId);
            const serverUrls = new Map<string, string>();

            // Separate files by type
            console.log("[Import] All files:", files.map(f => f.path));
            const openapiFiles = files.filter((f) => !f.path.endsWith(".proto"));
            const protoFiles = files.filter((f) => f.path.endsWith(".proto"));
            console.log("[Import] OpenAPI files:", openapiFiles.length, "Proto files:", protoFiles.length);

            // Process OpenAPI files
            for (const file of openapiFiles) {
              try {
                const content = (await invoke("github_get_file_content", {
                  owner,
                  repo: repoName,
                  path: file.path,
                  gitRef: branch,
                })) as { content: string; path: string };

                const spec = (await invoke("parse_openapi", {
                  content: content.content,
                  filename: file.path,
                })) as ParsedOpenApi;

                // Collect server URLs for env setup later
                const serverUrl = spec.servers[0]?.url;
                if (serverUrl && !serverUrls.has(serverUrl)) {
                  serverUrls.set(serverUrl, file.path);
                }
                // Use {{BASE_URL}} as placeholder — resolved via environment variables
                await generateFromOpenApi(spec, "{{BASE_URL}}", rootCollection.id, undefined, workspaceId);
              } catch (e) {
                toast.error(`Failed to process ${file.path}: ${String(e)}`);
              }
            }

            // Process Proto files
            if (protoFiles.length > 0) {
              try {
                // Fetch ALL .proto files in the repo for import resolution
                const { treeEntries } = useGithubStore.getState();
                const allProtoEntries = treeEntries.filter(
                  (e) => e.type === "blob" && e.path.endsWith(".proto")
                );
                const protoContents = await Promise.all(
                  allProtoEntries.map(async (file) => {
                    const content = (await invoke("github_get_file_content", {
                      owner,
                      repo: repoName,
                      path: file.path,
                      gitRef: branch,
                    })) as { content: string; path: string };
                    return { filename: file.path, content: content.content };
                  })
                );

                console.log("[Import Proto] Fetched contents for:", protoContents.map(p => p.filename));

                // Parse all proto files together (for import resolution)
                const parsedProto = await invoke("parse_proto", { files: protoContents }) as { package: string; services: unknown[]; descriptorBytes: number[] };
                console.log("[Import Proto] parsedProto:", JSON.stringify({ package: parsedProto.package, servicesCount: parsedProto.services.length, descriptorBytesLen: parsedProto.descriptorBytes?.length }));

                // Generate collection from parsed proto
                await generateFromProto(parsedProto, rootCollection.id, undefined, workspaceId, collectionName);
              } catch (e) {
                console.error("[Import Proto] Error:", e);
                toast.error(`Failed to process proto files: ${String(e)}`);
              }
            }

            // Create "local" environment with BASE_URL / GRPC_HOST
            const firstServerUrl = serverUrls.keys().next().value;
            const hasProto = protoFiles.length > 0;
            const needsEnv = firstServerUrl || hasProto;

            if (needsEnv) {
              try {
                await invoke("create_collection_environment", {
                  collectionId: rootCollection.id,
                  name: "local",
                });
                const envs = (await invoke("list_collection_environments", {
                  collectionId: rootCollection.id,
                })) as Array<{ id: string; name: string }>;
                const localEnv = envs.find((e) => e.name === "local");
                if (localEnv) {
                  if (firstServerUrl) {
                    const vk = (await invoke("create_variable_key", {
                      collectionId: rootCollection.id,
                      key: "BASE_URL",
                      isSecret: false,
                    })) as { id: string };
                    await invoke("upsert_variable_value", {
                      variableKeyId: vk.id,
                      environmentId: localEnv.id,
                      value: firstServerUrl,
                    });
                  }
                  if (hasProto) {
                    const vk = (await invoke("create_variable_key", {
                      collectionId: rootCollection.id,
                      key: "GRPC_HOST",
                      isSecret: false,
                    })) as { id: string };
                    await invoke("upsert_variable_value", {
                      variableKeyId: vk.id,
                      environmentId: localEnv.id,
                      value: "localhost:50051",
                    });
                  }
                  await invoke("set_active_collection_environment", {
                    collectionId: rootCollection.id,
                    environmentId: localEnv.id,
                  });
                }
              } catch (envErr) {
                console.error("[Import] Failed to set up environment:", envErr);
              }
            }

            // Save import source for future sync
            await updateImportSource(rootCollection.id, {
              owner,
              repo: repoName,
              branch,
              files: files.map((f) => f.path),
              spec_type: protoFiles.length > 0
                ? (openapiFiles.length > 0 ? "mixed" : "proto")
                : "openapi",
            });

            toast.success(`Imported "${collectionName}" successfully`);
            await loadCollections(workspaceId);
            setActiveCollection(rootCollection.id);
          } catch (e) {
            toast.error(`Failed to import: ${String(e)}`);
          }
        }}
      />

      <EnvironmentManagerDialog
        open={envManagerOpen}
        onClose={() => setEnvManagerOpen(false)}
        collectionId={activeCollectionId}
      />

      <UnsavedChangesDialog
        open={closeConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
      />

      <TabCloseConfirmDialog
        tabId={tabCloseConfirmId}
        onClose={() => setTabCloseConfirmId(null)}
      />

      <Toaster position="bottom-right" />
    </div>
  );
}
