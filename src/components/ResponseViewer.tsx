import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { selectAll } from "@codemirror/commands";
import { AlertTriangleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResponseData } from "@/store/requestStore";
import { DocsViewer } from "@/components/DocsViewer";
import type { RequestTab } from "@/store/requestStore";
import { useRequestStore } from "@/store/requestStore";

interface Props {
  response: ResponseData | null;
  loading: boolean;
  docsJson: string | null;
  tab: RequestTab;
}

function getStatusColorClass(status: number): string {
  if (status >= 100 && status < 200) return "text-zinc-400";
  if (status >= 200 && status < 300) return "text-emerald-400";
  if (status >= 300 && status < 400) return "text-blue-400";
  if (status >= 400 && status < 500) return "text-yellow-400";
  if (status >= 500) return "text-red-400";
  return "text-muted-foreground";
}

function getStatusText(status: number): string {
  const map: Record<number, string> = {
    200: "OK", 201: "Created", 204: "No Content",
    301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 405: "Method Not Allowed", 422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
  };
  return map[status] ?? "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}



export function ResponseViewer({ response, loading, docsJson, tab }: Props) {
  const { loadDocs, docs } = useRequestStore();

  // Default to "docs" if no response yet, switch to "response" when response arrives
  const [outerTab, setOuterTab] = useState<"response" | "docs">(
    response === null ? "docs" : "response"
  );

  // Auto-switch to response tab when a response is received
  useEffect(() => {
    if (response !== null) {
      setOuterTab("response");
    }
  }, [response]);

  // Load docs when tab has a savedRequestId and docs not yet loaded
  useEffect(() => {
    if (tab.savedRequestId && !(tab.id in docs)) {
      loadDocs(tab.id, tab.savedRequestId);
    }
  }, [tab.id, tab.savedRequestId]);

  const tabTriggerClass =
    "h-8 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-3";

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/30">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="flex-1 p-4 flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Outer tabs: Response | Docs */}
      <Tabs
        value={outerTab}
        onValueChange={(v) => setOuterTab(v as "response" | "docs")}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <div className="px-3 pt-2 border-b shrink-0">
          <TabsList className="h-8 gap-0 bg-transparent p-0">
            <TabsTrigger value="response" className={tabTriggerClass}>
              Response
            </TabsTrigger>
            <TabsTrigger value="docs" className={tabTriggerClass}>
              Docs
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Response tab content */}
        <TabsContent value="response" className="flex-1 overflow-hidden m-0 flex flex-col">
          {!response ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="flex flex-col items-center gap-2 text-center px-8">
                <p className="text-sm">Enter a URL and click Send</p>
                <p className="text-xs text-muted-foreground/60">or press ⌘↵</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Status bar */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/30 shrink-0">
                {response.status > 0 || response.grpcStatus !== undefined ? (
                  <>
                    <span
                      className={cn(
                        "font-mono font-bold text-lg leading-none",
                        response.grpcStatus !== undefined
                          ? (response.grpcStatus === 0 ? "text-emerald-400" : "text-red-400")
                          : getStatusColorClass(response.status)
                      )}
                    >
                      {response.grpcStatus !== undefined ? (
                        <>
                          gRPC {response.grpcStatus}
                          {response.grpcMessage && (
                            <span className="text-sm font-normal ml-1.5 opacity-80">
                              {response.grpcMessage}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          {response.status}
                          {(response.statusText || getStatusText(response.status)) && (
                            <span className="text-sm font-normal ml-1.5 opacity-80">
                              {response.statusText || getStatusText(response.status)}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    <span className="text-muted-foreground/40 select-none">·</span>
                    <span className="text-xs text-muted-foreground">{response.responseTimeMs} ms</span>
                    <span className="text-muted-foreground/40 select-none">·</span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(
                        response.bodySizeBytes > 0
                          ? response.bodySizeBytes
                          : new TextEncoder().encode(response.body).length
                      )}
                    </span>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangleIcon className="size-4" />
                    <span className="text-sm font-medium">Could not send request</span>
                  </div>
                )}
              </div>

              {/* Inner response tabs: Body | Headers */}
              <Tabs defaultValue="body" className="flex flex-col flex-1 overflow-hidden">
                <div className="px-3 pt-2 border-b shrink-0">
                  <TabsList className="h-8 gap-0 bg-transparent p-0">
                    <TabsTrigger value="body" className={tabTriggerClass}>
                      Body
                    </TabsTrigger>
                    <TabsTrigger value="headers" className={tabTriggerClass}>
                      Headers
                      {Object.keys(response.headers).length > 0 && (
                        <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 h-4">
                          {Object.keys(response.headers).length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="body" className="flex-1 overflow-hidden m-0">
                  {response.status === 0 ? (
                    <ScrollArea className="h-full">
                      <div className="p-4">
                        <p className="text-[13px] text-destructive font-mono whitespace-pre-wrap break-all leading-relaxed">
                          {response.body}
                        </p>
                      </div>
                    </ScrollArea>
                  ) : (
                    <ResponseBodyViewer body={response.body} isJson={response.isJson} />
                  )}
                </TabsContent>

                <TabsContent value="headers" className="flex-1 overflow-hidden m-0">
                  <ScrollArea className="h-full">
                    <div className="p-4 flex flex-col gap-1.5">
                      {Object.entries(response.headers).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-[13px] font-mono">
                          <span className="text-muted-foreground shrink-0">{k}:</span>
                          <span className="break-all">{v}</span>
                        </div>
                      ))}
                      {Object.keys(response.headers).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No headers</p>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

              </Tabs>
            </div>
          )}
        </TabsContent>

        {/* Docs tab content */}
        <TabsContent value="docs" className="flex-1 overflow-hidden m-0">
          <DocsViewer docsJson={docsJson} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const responseBodyTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "#e5e5e5",
    fontSize: "13px",
    height: "100%",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "#525252",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-cursor": {
    display: "none",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    overflow: "auto",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(255,255,255,0.1) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(255,255,255,0.15) !important",
  },
}, { dark: true });

function ResponseBodyViewer({ body, isJson }: { body: string; isJson: boolean }) {
  const displayValue = useMemo(() => {
    if (isJson) {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }
    return body;
  }, [body, isJson]);

  const extensions = useMemo(() => {
    const exts = [
      responseBodyTheme,
      EditorState.readOnly.of(true),
      Prec.highest(keymap.of([{ key: "Mod-a", run: selectAll }])),
    ];
    if (isJson) {
      exts.push(json());
    }
    return exts;
  }, [isJson]);

  return (
    <CodeMirror
      value={displayValue}
      extensions={extensions}
      theme="dark"
      readOnly
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: false,
        bracketMatching: true,
      }}
      className="h-full overflow-hidden cm-response-body"
    />
  );
}
