import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckIcon, ChevronsUpDownIcon, GitBranchIcon, Loader2Icon, RefreshCwIcon, RotateCcwIcon, SaveIcon, SendHorizonalIcon } from "lucide-react";
import { toast } from "sonner";
import { CodeMirrorUrlBar } from "@/components/CodeMirrorUrlBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCollectionStore } from "@/store/collectionStore";
import type { ImportSource } from "@/store/collectionStore";
import type { AuthConfig, HttpMethod, RequestTab, ResponseData } from "@/store/requestStore";
import { useRequestStore } from "@/store/requestStore";

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "text-emerald-500",
  POST: "text-blue-500",
  PUT: "text-orange-500",
  PATCH: "text-purple-500",
  DELETE: "text-red-500",
  GRPC: "text-teal-500",
};

interface Props {
  tab: RequestTab;
}

export function RequestUrlBar({ tab }: Props) {
  const { updateTab, setResponse, setLoading, loading, pinTab, saveTab } = useRequestStore();
  const { collections, variables, variableKeys } = useCollectionStore();
  const isLoading = loading[tab.id] ?? false;

  const collection = tab.collectionId
    ? collections.find((c) => c.id === tab.collectionId)
    : null;

  const collectionSettings = collection
    ? { auth_type: collection.auth_type, auth_config: collection.auth_config }
    : null;

  const variableMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of variables) {
      map[v.key] = v.is_secret ? "••••••" : v.value;
    }
    return map;
  }, [variables]);

  const variableKeyMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const vk of variableKeys) {
      map[vk.key] = vk.id;
    }
    return map;
  }, [variableKeys]);

  const update = (updates: Partial<RequestTab>) => {
    updateTab(tab.id, updates);
  };

  const handleSend = useCallback(async () => {
    if (!tab.url.trim()) return;
    pinTab(tab.id);
    setLoading(tab.id, true);
    setResponse(tab.id, null);

    try {
      const headers: Record<string, string> = {};
      for (const h of tab.headers) {
        if (h.enabled && h.key) headers[h.key] = h.value;
      }

      const effectiveAuth = tab.inheritAuth && collectionSettings?.auth_type
        ? (() => {
            try {
              return {
                type: collectionSettings.auth_type as AuthConfig["type"],
                ...(collectionSettings.auth_config
                  ? (JSON.parse(collectionSettings.auth_config) as Omit<AuthConfig, "type">)
                  : {}),
              } as AuthConfig;
            } catch {
              return tab.auth;
            }
          })()
        : tab.auth;

      if (effectiveAuth.type === "bearer" && effectiveAuth.bearerToken) {
        headers["Authorization"] = `Bearer ${effectiveAuth.bearerToken}`;
      } else if (effectiveAuth.type === "basic") {
        const encoded = btoa(
          `${effectiveAuth.basicUsername ?? ""}:${effectiveAuth.basicPassword ?? ""}`
        );
        headers["Authorization"] = `Basic ${encoded}`;
      } else if (
        effectiveAuth.type === "api_key" &&
        effectiveAuth.apiKeyName &&
        effectiveAuth.apiKeyIn === "header"
      ) {
        headers[effectiveAuth.apiKeyName] = effectiveAuth.apiKeyValue ?? "";
      }

      const queryParams: Record<string, string> = {};
      for (const p of tab.queryParams) {
        if (p.enabled && p.key) queryParams[p.key] = p.value;
      }
      if (
        effectiveAuth.type === "api_key" &&
        effectiveAuth.apiKeyName &&
        effectiveAuth.apiKeyIn === "query"
      ) {
        queryParams[effectiveAuth.apiKeyName] = effectiveAuth.apiKeyValue ?? "";
      }

      if (tab.requestType === "grpc") {
        const grpcResponse = (await invoke("send_grpc_request", {
          request: {
            url: tab.url,
            serviceName: tab.grpcService ?? "",
            methodName: tab.grpcMethod ?? "",
            metadata: Object.keys(headers).length > 0 ? headers : null,
            body: tab.body || null,
            requestId: tab.savedRequestId ?? null,
            collectionId: tab.collectionId ?? null,
          },
        })) as { grpcStatus: number; grpcMessage: string; headers: Record<string, string>; trailers: Record<string, string>; body: string; responseTimeMs: number; bodySizeBytes: number; isJson: boolean };

        setResponse(tab.id, {
          status: grpcResponse.grpcStatus === 0 ? 200 : 500,
          statusText: grpcResponse.grpcMessage || (grpcResponse.grpcStatus === 0 ? "OK" : "Error"),
          headers: grpcResponse.headers,
          body: grpcResponse.body,
          responseTimeMs: grpcResponse.responseTimeMs,
          bodySizeBytes: grpcResponse.bodySizeBytes,
          isJson: grpcResponse.isJson,
          grpcStatus: grpcResponse.grpcStatus,
          grpcMessage: grpcResponse.grpcMessage,
          trailers: grpcResponse.trailers,
        });
      } else {
        const response = (await invoke("send_rest_request", {
          request: {
            method: tab.method,
            url: tab.url,
            headers: Object.keys(headers).length > 0 ? headers : null,
            queryParams: Object.keys(queryParams).length > 0 ? queryParams : null,
            body: tab.body || null,
            collectionId: tab.collectionId ?? null,
          },
        })) as ResponseData;

        setResponse(tab.id, response);
      }
    } catch (err) {
      setResponse(tab.id, {
        status: 0,
        statusText: "",
        headers: {},
        body: String(err),
        responseTimeMs: 0,
        bodySizeBytes: 0,
        isJson: false,
      });
    } finally {
      setLoading(tab.id, false);
    }
  }, [tab, setLoading, setResponse, pinTab, collectionSettings]);

  const handleSave = useCallback(async () => {
    await saveTab(tab.id);
  }, [tab.id, saveTab]);

  return (
    <div className="shrink-0">
      {/* URL bar — full width */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <div className="flex flex-1 items-center border rounded-lg overflow-hidden h-9">
          {tab.requestType === "grpc" ? (
            <div className="flex items-center gap-1.5 px-3 h-full border-r shrink-0">
              <span className="font-mono text-sm font-bold text-teal-500">gRPC</span>
              {tab.grpcService && tab.grpcMethod && (
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
                  {tab.grpcMethod}
                </span>
              )}
            </div>
          ) : (
          <Select
            value={tab.method}
            onValueChange={(v) => update({ method: v as HttpMethod })}
          >
            <SelectTrigger className="w-24 h-full border-0 border-r rounded-none font-mono text-sm font-bold focus:ring-0 shrink-0">
              <SelectValue>
                <span className={METHOD_COLORS[tab.method]}>{tab.method}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(["GET", "POST", "PUT", "PATCH", "DELETE"] as HttpMethod[]).map((m) => (
                <SelectItem key={m} value={m}>
                  <span className={METHOD_COLORS[m]}>{m}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          )}

          <div className="flex-1 h-full overflow-hidden">
            <CodeMirrorUrlBar
              value={tab.url}
              onChange={(value) => update({ url: value })}
              onSend={handleSend}
              variables={variableMap}
              onUpdateVariable={async (key, value) => {
                const { activeEnvironmentId, activeCollectionId } = useCollectionStore.getState();
                const keyId = variableKeyMap[key];
                if (activeEnvironmentId && keyId) {
                  await useCollectionStore.getState().upsertVariableValue(keyId, activeEnvironmentId, value);
                  if (activeCollectionId) {
                    await useCollectionStore.getState().loadVariables(activeCollectionId, activeEnvironmentId);
                  }
                }
              }}
              placeholder="https://api.example.com/endpoint"
            />
          </div>
        </div>

        {tab.savedRequestId && (
          <ResetButton requestId={tab.savedRequestId} collectionId={tab.collectionId} tabId={tab.id} />
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground shrink-0"
          onClick={handleSave}
          title="Save request (⌘S)"
          disabled={!tab.url.trim()}
          aria-label="Save request"
        >
          <SaveIcon className="size-3.5" />
        </Button>

        <Button
          onClick={handleSend}
          className="h-9 gap-1.5 shrink-0"
          disabled={isLoading || !tab.url.trim()}
          title="Send request (⌘↵)"
        >
          {isLoading ? (
            <>
              <Loader2Icon className="size-3.5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <SendHorizonalIcon className="size-3.5" />
              Send
            </>
          )}
        </Button>

        {/* Sync button — shown when collection has import_source */}
        <SyncButton collectionId={tab.collectionId} />
      </div>

    </div>
  );
}

function SyncButton({ collectionId }: { collectionId: string | null }) {
  const { collections, generateFromOpenApi, generateFromProto, loadRequests, updateImportSource } = useCollectionStore();
  const [syncing, setSyncing] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branches, setBranches] = useState<Array<{ name: string }>>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  // Walk up parent chain to find root collection with import_source
  const findImportSourceCollection = () => {
    if (!collectionId) return null;
    let current = collections.find((c) => c.id === collectionId);
    for (let i = 0; i < 10 && current; i++) {
      if (current.import_source) return current;
      if (!current.parent_id) break;
      current = collections.find((c) => c.id === current!.parent_id);
    }
    return null;
  };
  const sourceCollection = findImportSourceCollection();
  const importSource: ImportSource | null = sourceCollection?.import_source
    ? (() => { try { return JSON.parse(sourceCollection.import_source) as ImportSource; } catch { return null; } })()
    : null;
  const syncCollectionId = sourceCollection?.id ?? collectionId;

  useEffect(() => {
    if (importSource) {
      setSelectedBranch(importSource.branch);
    }
  }, [sourceCollection?.import_source]);

  // Load branches when popover opens
  const loadBranches = async () => {
    if (!importSource || branches.length > 0) return;
    try {
      const b = (await invoke("github_list_branches", {
        owner: importSource.owner,
        repo: importSource.repo,
      })) as Array<{ name: string }>;
      setBranches(b);
    } catch {
      setBranches([]);
    }
  };

  if (!importSource || !syncCollectionId) return null;

  const handleSync = async (branch: string) => {
    setSyncing(true);
    try {
      const { owner, repo, files, spec_type } = importSource;
      const openapiFiles = files.filter((f) => !f.endsWith(".proto"));
      const protoFiles = files.filter((f) => f.endsWith(".proto"));

      if (spec_type === "proto" || (spec_type === "mixed" && protoFiles.length > 0)) {
        const protoContents = await Promise.all(
          protoFiles.map(async (path) => {
            const content = (await invoke("github_get_file_content", {
              owner, repo, path, gitRef: branch,
            })) as { content: string; path: string };
            return { filename: path, content: content.content };
          })
        );
        const parsedProto = await invoke("parse_proto", { files: protoContents });
        await generateFromProto(parsedProto, syncCollectionId, undefined, sourceCollection?.workspace_id ?? undefined);
      }

      if (spec_type === "openapi" || (spec_type === "mixed" && openapiFiles.length > 0)) {
        for (const path of openapiFiles) {
          const content = (await invoke("github_get_file_content", {
            owner, repo, path, gitRef: branch,
          })) as { content: string; path: string };
          const spec = await invoke("parse_openapi", { content: content.content, filename: path });
          await generateFromOpenApi(spec as never, "{{BASE_URL}}", syncCollectionId, undefined, sourceCollection?.workspace_id ?? undefined);
        }
      }

      // Update branch in import_source if changed
      if (branch !== importSource.branch) {
        await updateImportSource(syncCollectionId, { ...importSource, branch });
      }

      await loadRequests(collectionId ?? undefined);
      toast.success("Sync completed");
    } catch (e) {
      toast.error(`Sync failed: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center shrink-0">
      <Popover open={branchMenuOpen} onOpenChange={(open) => { setBranchMenuOpen(open); if (open) loadBranches(); }}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs gap-1 font-mono text-muted-foreground px-2"
          >
            <GitBranchIcon className="size-3" />
            {selectedBranch || importSource.branch}
            <ChevronsUpDownIcon className="size-2.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="end">
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
                      setSelectedBranch(b.name);
                      setBranchMenuOpen(false);
                    }}
                    className="text-xs font-mono"
                  >
                    <CheckIcon
                      className={cn(
                        "size-3 mr-2 shrink-0",
                        selectedBranch === b.name ? "opacity-100" : "opacity-0"
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

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-muted-foreground"
        onClick={() => handleSync(selectedBranch || importSource.branch)}
        disabled={syncing}
        title={`Sync ${importSource.owner}/${importSource.repo}@${selectedBranch || importSource.branch}`}
      >
        {syncing ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

function ResetButton({ requestId, collectionId, tabId }: { requestId: string; collectionId: string | null; tabId: string }) {
  const { loadRequests } = useCollectionStore();
  const { updateTab } = useRequestStore();
  const [resetting, setResetting] = useState(false);

  if (!requestId) return null;

  const handleReset = async () => {
    setResetting(true);
    try {
      // 1. Reset request to original spec values in DB
      await invoke("reset_request_to_original", { requestId });

      // 2. Reload from DB and update tab
      const req = (await invoke("get_request", { id: requestId })) as {
        url: string;
        body: string | null;
        headers: Record<string, string>;
        query_params: Record<string, string>;
      };

      updateTab(tabId, {
        url: req.url,
        body: req.body ?? "",
        headers: Object.entries(req.headers ?? {}).map(([key, value]) => ({ id: crypto.randomUUID(), key, value, enabled: true })),
        queryParams: Object.entries(req.query_params ?? {}).map(([key, value]) => ({ id: crypto.randomUUID(), key, value, enabled: true })),
      });

      if (collectionId) await loadRequests(collectionId);
      toast.success("Reset to spec");
    } catch (e) {
      toast.error(`Reset failed: ${String(e)}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 text-muted-foreground shrink-0"
      onClick={handleReset}
      disabled={resetting}
      title="Reset to spec definition"
    >
      {resetting ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <RotateCcwIcon className="size-3.5" />
      )}
    </Button>
  );
}
