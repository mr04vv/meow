import { useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2Icon, SaveIcon, SendHorizonalIcon } from "lucide-react";
import { CodeMirrorUrlBar } from "@/components/CodeMirrorUrlBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCollectionStore } from "@/store/collectionStore";
import type { AuthConfig, HttpMethod, RequestTab, ResponseData } from "@/store/requestStore";
import { useRequestStore } from "@/store/requestStore";

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "text-emerald-500",
  POST: "text-blue-500",
  PUT: "text-orange-500",
  PATCH: "text-purple-500",
  DELETE: "text-red-500",
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

      const response = (await invoke("send_rest_request", {
        request: {
          method: tab.method,
          url: tab.url,
          headers: Object.keys(headers).length > 0 ? headers : null,
          query_params: Object.keys(queryParams).length > 0 ? queryParams : null,
          body: tab.body || null,
          collection_id: tab.collectionId ?? null,
        },
      })) as ResponseData;

      setResponse(tab.id, response);
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
      </div>

    </div>
  );
}
