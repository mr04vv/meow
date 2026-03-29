import { useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2Icon, SaveIcon, SendHorizonalIcon } from "lucide-react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { AuthEditor } from "@/components/AuthEditor";
import { CodeMirrorUrlBar } from "@/components/CodeMirrorUrlBar";
import { KeyValueEditor } from "@/components/KeyValueEditor";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCollectionStore } from "@/store/collectionStore";
import type { AuthConfig, HttpMethod, RequestTab, ResponseData } from "@/store/requestStore";
import { useRequestStore } from "@/store/requestStore";

const bodyEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "#e5e5e5",
    fontSize: "13px",
    height: "100%",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "#737373",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  ".cm-cursor": {
    borderLeftColor: "#e5e5e5",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    overflow: "auto",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(255,255,255,0.1) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(255,255,255,0.15) !important",
  },
  "&.cm-focused": {
    outline: "none",
  },
}, { dark: true });

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "text-emerald-500",
  POST: "text-blue-500",
  PUT: "text-orange-500",
  PATCH: "text-purple-500",
  DELETE: "text-red-500",
};

interface Props {
  tab: RequestTab;
  hideUrlBar?: boolean;
}

export function RequestEditor({ tab, hideUrlBar }: Props) {
  const { updateTab, setResponse, setLoading, loading, pinTab, saveTab } = useRequestStore();
  const { collections, variables } = useCollectionStore();
  const isLoading = loading[tab.id] ?? false;

  // Build variable map for highlighting
  const variableMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of variables) {
      map[v.key] = v.is_secret ? "••••••" : v.value;
    }
    return map;
  }, [variables]);

  // Derive collection auth directly from the collection record
  const collection = tab.collectionId
    ? collections.find((c) => c.id === tab.collectionId)
    : null;

  const collectionSettings = collection
    ? { auth_type: collection.auth_type, auth_config: collection.auth_config }
    : null;

  const collectionAuthSummary =
    collection?.auth_type
      ? {
          type: collection.auth_type as AuthConfig["type"],
          collectionName: collection.name,
        }
      : null;

  const update = (updates: Partial<RequestTab>) => {
    updateTab(tab.id, updates);
  };

  const handleSend = useCallback(async () => {
    if (!tab.url.trim()) return;
    // Auto-pin the tab when a request is sent
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

      // Apply auth
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
  }, [tab, setLoading, setResponse, pinTab]);

  const handleSave = useCallback(async () => {
    await saveTab(tab.id);
  }, [tab.id, saveTab]);

  // Keyboard shortcuts: Cmd+Enter = send, Cmd+S = save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
      } else if (e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSend, handleSave]);

  return (
    <div className="flex flex-col h-full">
      {/* URL bar — hidden when parent renders it separately */}
      {!hideUrlBar && <div className="flex items-center gap-2 p-3 border-b">
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
      </div>}


      {/* Request config tabs */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs defaultValue="params" className="flex flex-col h-full">
          <div className="px-3 pt-2 border-b">
            <TabsList className="h-8 gap-0 bg-transparent p-0 border-b-0">
              <TabsTrigger
                value="params"
                className="h-8 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-3"
              >
                Params
                {tab.queryParams.filter((p) => p.key).length > 0 && (
                  <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5 py-0.5">
                    {tab.queryParams.filter((p) => p.key).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="headers"
                className="h-8 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-3"
              >
                Headers
                {tab.headers.filter((h) => h.key).length > 0 && (
                  <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5 py-0.5">
                    {tab.headers.filter((h) => h.key).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="body"
                className="h-8 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-3"
              >
                Body
              </TabsTrigger>
              <TabsTrigger
                value="auth"
                className="h-8 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-3"
              >
                Auth
                {(tab.auth.type !== "none" ||
                  (tab.inheritAuth && collectionSettings?.auth_type)) && (
                  <span className="ml-1.5 size-1.5 rounded-full bg-green-500 inline-block" />
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="params" className="p-3 m-0">
              <KeyValueEditor
                pairs={tab.queryParams}
                onChange={(queryParams) => update({ queryParams })}
                keyPlaceholder="Parameter"
              />
            </TabsContent>

            <TabsContent value="headers" className="p-3 m-0">
              <KeyValueEditor
                pairs={tab.headers}
                onChange={(headers) => update({ headers })}
                keyPlaceholder="Header name"
              />
            </TabsContent>

            <TabsContent value="body" className="m-0 h-full flex flex-col">
              <CodeMirror
                value={tab.body}
                onChange={(value) => update({ body: value })}
                extensions={[json(), bodyEditorTheme]}
                theme="dark"
                height="100%"
                className="flex-1 h-full text-sm"
                basicSetup={{
                  lineNumbers: true,
                  bracketMatching: true,
                  autocompletion: false,
                  foldGutter: true,
                  highlightActiveLine: true,
                }}
              />
            </TabsContent>

            <TabsContent value="auth" className="p-3 m-0">
              <AuthEditor
                auth={tab.auth}
                onChange={(auth) => update({ auth })}
                collectionAuth={collectionAuthSummary}
                inheritAuth={tab.inheritAuth}
                onInheritChange={(inherit) => update({ inheritAuth: inherit })}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
