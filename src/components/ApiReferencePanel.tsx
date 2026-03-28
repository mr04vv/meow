import { useState } from "react";
import { ChevronRightIcon, GlobeIcon, ServerIcon, ShieldIcon } from "lucide-react";
import { MethodBadge } from "@/components/MethodBadge";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OperationInfo, ParsedOpenApi, PathInfo } from "@/types/openapi";

interface Props {
  spec: ParsedOpenApi;
  onUseEndpoint?: (operation: OperationInfo, path: PathInfo) => void;
}

export function ApiReferencePanel({ spec, onUseEndpoint }: Props) {
  const [selectedOp, setSelectedOp] = useState<{
    operation: OperationInfo;
    path: PathInfo;
  } | null>(null);

  // Group paths by tag
  const tagGroups: Record<string, Array<{ path: PathInfo; operation: OperationInfo }>> = {};
  for (const path of spec.paths) {
    for (const op of path.operations) {
      const tags = op.tags.length > 0 ? op.tags : ["default"];
      for (const tag of tags) {
        if (!tagGroups[tag]) tagGroups[tag] = [];
        tagGroups[tag].push({ path, operation: op });
      }
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: endpoint list */}
      <div className="w-72 shrink-0 flex flex-col border-r">
        <div className="px-3 py-2 border-b">
          <p className="text-sm font-semibold truncate">{spec.title}</p>
          <p className="text-[10px] text-muted-foreground">
            OpenAPI {spec.version}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {Object.entries(tagGroups).map(([tag, items]) => (
              <div key={tag} className="mb-3">
                <div className="flex items-center gap-1 px-1 py-1 mb-1">
                  <ChevronRightIcon className="size-3 text-muted-foreground" />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                    {tag}
                  </span>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 ml-auto">
                    {items.length}
                  </Badge>
                </div>
                {items.map(({ path, operation }) => {
                  const isSelected =
                    selectedOp?.operation.method === operation.method &&
                    selectedOp?.path.path === path.path;
                  return (
                    <button
                      key={`${operation.method}-${path.path}`}
                      onClick={() => setSelectedOp({ operation, path })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-muted/60 transition-colors mb-0.5 ${
                        isSelected ? "bg-muted" : ""
                      }`}
                    >
                      <MethodBadge method={operation.method} size="xs" />
                      <span className="font-mono text-[10px] truncate flex-1 text-muted-foreground">
                        {path.path}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Servers */}
        {spec.servers.length > 0 && (
          <>
            <Separator />
            <div className="p-2">
              <div className="flex items-center gap-1 px-1 py-1 mb-1">
                <ServerIcon className="size-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Servers
                </span>
              </div>
              {spec.servers.map((server, i) => (
                <div key={i} className="px-2 py-1">
                  <p className="font-mono text-[10px] text-muted-foreground truncate">
                    {server.url}
                  </p>
                  {server.description && (
                    <p className="text-[9px] text-muted-foreground/60 truncate">
                      {server.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Right: operation detail */}
      <div className="flex-1 overflow-hidden">
        {selectedOp ? (
          <OperationDetail
            operation={selectedOp.operation}
            path={selectedOp.path}
            onUseEndpoint={() => onUseEndpoint?.(selectedOp.operation, selectedOp.path)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            Select an endpoint to view details
          </div>
        )}
      </div>
    </div>
  );
}

interface OperationDetailProps {
  operation: OperationInfo;
  path: PathInfo;
  onUseEndpoint?: () => void;
}

function OperationDetail({ operation, path, onUseEndpoint }: OperationDetailProps) {
  const parameters = operation.parameters as Array<Record<string, unknown>>;
  const pathParams = parameters.filter((p) => p.in === "path");
  const queryParams = parameters.filter((p) => p.in === "query");
  const headerParams = parameters.filter((p) => p.in === "header");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <MethodBadge method={operation.method} />
        <span className="font-mono text-sm text-muted-foreground">{path.path}</span>
        <div className="flex-1" />
        {onUseEndpoint && (
          <button
            onClick={onUseEndpoint}
            className="text-xs text-primary hover:underline"
          >
            Use in editor
          </button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 flex flex-col gap-4">
          {operation.summary && (
            <p className="text-sm font-medium">{operation.summary}</p>
          )}
          {operation.description && (
            <p className="text-xs text-muted-foreground">{operation.description}</p>
          )}

          <Tabs defaultValue="params">
            <TabsList className="h-8">
              <TabsTrigger value="params" className="text-xs h-7">
                Parameters
              </TabsTrigger>
              <TabsTrigger value="body" className="text-xs h-7">
                Request Body
              </TabsTrigger>
              <TabsTrigger value="responses" className="text-xs h-7">
                Responses
              </TabsTrigger>
              <TabsTrigger value="security" className="text-xs h-7">
                Security
              </TabsTrigger>
            </TabsList>

            <TabsContent value="params" className="mt-3">
              {parameters.length === 0 ? (
                <p className="text-xs text-muted-foreground">No parameters</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {pathParams.length > 0 && (
                    <ParameterGroup label="Path" params={pathParams} />
                  )}
                  {queryParams.length > 0 && (
                    <ParameterGroup label="Query" params={queryParams} />
                  )}
                  {headerParams.length > 0 && (
                    <ParameterGroup label="Header" params={headerParams} />
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="body" className="mt-3">
              {operation.request_body ? (
                <JsonValue value={operation.request_body} />
              ) : (
                <p className="text-xs text-muted-foreground">No request body</p>
              )}
            </TabsContent>

            <TabsContent value="responses" className="mt-3">
              <div className="flex flex-col gap-2">
                {Object.entries(operation.responses).map(([code, response]) => (
                  <div key={code}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`font-mono text-xs font-semibold ${
                          code.startsWith("2")
                            ? "text-green-500"
                            : code.startsWith("4")
                            ? "text-yellow-500"
                            : code.startsWith("5")
                            ? "text-red-500"
                            : "text-muted-foreground"
                        }`}
                      >
                        {code}
                      </span>
                      {(response as Record<string, unknown>).description != null && (
                        <span className="text-xs text-muted-foreground">
                          {String((response as Record<string, unknown>).description)}
                        </span>
                      )}
                    </div>
                    <JsonValue value={response} collapsed />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="security" className="mt-3">
              {operation.security.length === 0 ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GlobeIcon className="size-3.5" />
                  No security requirements
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {operation.security.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <ShieldIcon className="size-3.5 text-muted-foreground" />
                      <JsonValue value={s} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}

function ParameterGroup({
  label,
  params,
}: {
  label: string;
  params: Array<Record<string, unknown>>;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">
        {label}
      </p>
      <div className="flex flex-col gap-1.5">
        {params.map((p, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="font-mono text-xs font-medium min-w-[100px] truncate">
              {String(p.name ?? "")}
              {p.required === true && (
                <span className="text-destructive ml-0.5">*</span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {String((p.schema as Record<string, unknown>)?.type ?? p.type ?? "string")}
            </span>
            {p.description != null && (
              <span className="text-[10px] text-muted-foreground/70 flex-1">
                — {String(p.description)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function JsonValue({ value, collapsed = false }: { value: unknown; collapsed?: boolean }) {
  const [expanded, setExpanded] = useState(!collapsed);
  const json = JSON.stringify(value, null, 2);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 mb-1"
      >
        <ChevronRightIcon
          className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        {expanded ? "Collapse" : "Expand"}
      </button>
      {expanded && (
        <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
          {json}
        </pre>
      )}
    </div>
  );
}
