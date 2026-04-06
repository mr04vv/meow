import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, LockIcon } from "lucide-react";
import { MethodBadge } from "@/components/MethodBadge";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SchemaObject {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  enum?: unknown[];
  example?: unknown;
  nullable?: boolean;
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  allOf?: SchemaObject[];
  $ref?: string;
}

interface Parameter {
  name: string;
  in: string;
  required: boolean;
  description: string | null;
  schema: SchemaObject | null;
}

interface RequestBody {
  required: boolean;
  description: string | null;
  content: Record<string, { schema: SchemaObject }> | null;
}

interface ResponseDef {
  description: string | null;
  content?: Record<string, { schema: SchemaObject }> | null;
}

interface OpenApiDocs {
  summary: string | null;
  description: string | null;
  path: string;
  method: string;
  parameters: Parameter[] | null;
  request_body: RequestBody | null;
  responses: Record<string, ResponseDef> | null;
  security: unknown[] | null;
  schemas?: Record<string, SchemaObject>;
}

export interface DocsViewerProps {
  docsJson: string | null;
}

/** Resolve $ref references in a schema using the schemas map */
function resolveRef(
  schema: SchemaObject | null | undefined,
  schemas: Record<string, SchemaObject>,
): SchemaObject | null {
  if (!schema) return null;
  if (schema.$ref) {
    // $ref format: "#/components/schemas/ModelName" or just "ModelName"
    const refName = schema.$ref.split("/").pop() ?? schema.$ref;
    const resolved = schemas[refName];
    if (resolved) return resolveRef(resolved, schemas);
    return { type: "object", description: `Unresolved: ${schema.$ref}` };
  }
  // Deep resolve properties
  const result: SchemaObject = { ...schema };
  if (result.properties) {
    const resolved: Record<string, SchemaObject> = {};
    for (const [key, val] of Object.entries(result.properties)) {
      resolved[key] = resolveRef(val, schemas) ?? val;
    }
    result.properties = resolved;
  }
  if (result.items) {
    result.items = resolveRef(result.items, schemas) ?? result.items;
  }
  if (result.allOf) {
    // Merge allOf into a single object
    const merged: SchemaObject = { type: "object", properties: {}, required: [] };
    for (const sub of result.allOf) {
      const r = resolveRef(sub, schemas) ?? sub;
      if (r.properties) {
        merged.properties = { ...merged.properties, ...r.properties };
      }
      if (r.required) {
        merged.required = [...(merged.required ?? []), ...r.required];
      }
      if (r.description && !merged.description) {
        merged.description = r.description;
      }
    }
    return merged;
  }
  if (result.oneOf) {
    result.oneOf = result.oneOf.map((s) => resolveRef(s, schemas) ?? s);
  }
  if (result.anyOf) {
    result.anyOf = result.anyOf.map((s) => resolveRef(s, schemas) ?? s);
  }
  return result;
}

/** Resolve $ref in response/requestBody content schemas */
function resolveContentSchemas(
  content: Record<string, { schema: SchemaObject }> | null | undefined,
  schemas: Record<string, SchemaObject>,
): Record<string, { schema: SchemaObject }> {
  if (!content) return {};
  const result: Record<string, { schema: SchemaObject }> = {};
  for (const [mediaType, val] of Object.entries(content)) {
    result[mediaType] = {
      schema: resolveRef(val?.schema, schemas) ?? val?.schema ?? { type: "unknown" },
    };
  }
  return result;
}

function getStatusCodeColor(code: string): string {
  const n = parseInt(code, 10);
  if (n >= 200 && n < 300) return "bg-emerald-600 text-white";
  if (n >= 400 && n < 500) return "bg-yellow-600 text-white";
  if (n >= 500) return "bg-red-600 text-white";
  return "bg-zinc-600 text-white";
}

function getTypeLabel(schema: SchemaObject | null | undefined): string {
  if (!schema) return "unknown";
  if (schema.$ref) return schema.$ref.split("/").pop() ?? schema.$ref;
  if (schema.oneOf) return "oneOf";
  if (schema.anyOf) return "anyOf";
  if (schema.allOf) return "allOf";
  const base = schema.type ?? "";
  const fmt = schema.format ? ` (${schema.format})` : "";
  return `${base}${fmt}`;
}

interface SchemaNodeProps {
  name?: string;
  schema: SchemaObject;
  required?: boolean;
  depth?: number;
}

function SchemaNode({ name, schema, required = false, depth = 0 }: SchemaNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  const props = schema.properties ?? {};
  const hasChildren = schema.type === "object" && Object.keys(props).length > 0;
  const isArray = schema.type === "array";
  const typeLabel = getTypeLabel(schema);
  const indent = depth * 12;

  return (
    <div>
      <div
        className="flex items-start gap-1 py-0.5 group"
        style={{ paddingLeft: `${indent}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
          </button>
        ) : (
          <span className="size-3 shrink-0 inline-block" />
        )}

        {name && (
          <span className={cn("font-mono text-[12px] shrink-0", required ? "text-foreground" : "text-muted-foreground")}>
            {name}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </span>
        )}

        <span className="font-mono text-[11px] text-blue-400 ml-1 shrink-0">
          {isArray ? `array[${schema.items ? getTypeLabel(schema.items) : ""}]` : typeLabel}
        </span>

        {schema.enum && schema.enum.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-1 truncate">
            enum: {(schema.enum as string[]).join(", ")}
          </span>
        )}

        {schema.description && (
          <span className="text-[10px] text-muted-foreground/70 ml-1 truncate">
            — {schema.description}
          </span>
        )}
      </div>

      {hasChildren && expanded && (
        <div>
          {Object.entries(props).map(([propName, propSchema]) => (
            <SchemaNode
              key={propName}
              name={propName}
              schema={propSchema}
              required={schema.required?.includes(propName) ?? false}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {isArray && schema.items?.type === "object" && schema.items.properties && expanded && (
        <div>
          {Object.entries(schema.items.properties).map(([propName, propSchema]) => (
            <SchemaNode
              key={propName}
              name={propName}
              schema={propSchema}
              required={schema.items?.required?.includes(propName) ?? false}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-4 mb-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function SchemaBlock({ schema }: { schema: SchemaObject | null | undefined }) {
  if (!schema) return null;
  const props = schema.properties ?? {};
  if (Object.keys(props).length === 0 && schema.type !== "array") {
    return <SchemaNode schema={schema} depth={0} />;
  }
  return (
    <div className="rounded border border-border p-2">
      {Object.keys(props).length > 0 ? (
        Object.entries(props).map(([propName, propSchema]) => (
          <SchemaNode
            key={propName}
            name={propName}
            schema={propSchema}
            required={schema.required?.includes(propName) ?? false}
            depth={0}
          />
        ))
      ) : (
        <SchemaNode schema={schema} depth={0} />
      )}
    </div>
  );
}

export function DocsViewer({ docsJson }: DocsViewerProps) {
  if (!docsJson) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">No documentation available</p>
      </div>
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(docsJson) as Record<string, unknown>;
  } catch {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Failed to parse documentation</p>
      </div>
    );
  }

  // gRPC docs
  if (parsed.type === "grpc") {
    return <GrpcDocsView data={parsed} />;
  }

  const docs = parsed as unknown as OpenApiDocs;

  const schemas = (docs.schemas ?? {}) as Record<string, SchemaObject>;
  const parameters = (docs.parameters ?? []).filter((p) => p.name);
  const responses = docs.responses ?? {};
  const responseEntries = Object.entries(responses);
  const requestBodyContent = resolveContentSchemas(docs.request_body?.content, schemas);
  const requestBodyEntries = Object.entries(requestBodyContent);
  const security = docs.security ?? [];

  // Resolve $ref in response schemas
  const resolvedResponseEntries = responseEntries.map(([code, resp]) => {
    const resolvedContent = resolveContentSchemas(resp?.content, schemas);
    return [code, { ...resp, content: Object.keys(resolvedContent).length > 0 ? resolvedContent : undefined }] as [string, ResponseDef];
  });

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-1">
        {/* Method + Path */}
        <div className="flex items-center gap-2 flex-wrap">
          <MethodBadge method={docs.method} size="sm" />
          <span className="font-mono text-sm text-foreground break-all">{docs.path}</span>
        </div>

        {/* Summary */}
        {docs.summary && (
          <p className="text-sm text-foreground mt-1">{docs.summary}</p>
        )}

        {/* Description */}
        {docs.description && docs.description !== docs.summary && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{docs.description}</p>
        )}

        {/* Parameters */}
        {parameters.length > 0 && (
          <>
            <SectionHeader label="Parameters" />
            <div className="rounded border border-border overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-1.5 font-mono font-semibold text-muted-foreground">Name</th>
                    <th className="text-left px-3 py-1.5 font-mono font-semibold text-muted-foreground w-16">In</th>
                    <th className="text-left px-3 py-1.5 font-mono font-semibold text-muted-foreground w-24">Type</th>
                    <th className="text-left px-3 py-1.5 font-mono font-semibold text-muted-foreground w-10">Req</th>
                    {parameters.some((p) => p.description) && (
                      <th className="text-left px-3 py-1.5 font-mono font-semibold text-muted-foreground">Description</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {parameters.map((param, idx) => (
                    <tr key={`${param.name}-${idx}`} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-1.5">
                        <span className={cn("font-mono", param.required ? "text-foreground" : "text-muted-foreground")}>
                          {param.name}
                          {param.required && <span className="text-red-400 ml-0.5">*</span>}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-muted-foreground">{param.in}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-blue-400">{getTypeLabel(param.schema)}</span>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {param.required ? <span className="text-red-400">✓</span> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      {parameters.some((p) => p.description) && (
                        <td className="px-3 py-1.5">
                          <span className="text-muted-foreground">{param.description ?? ""}</span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Request Body */}
        {requestBodyEntries.length > 0 && (
          <>
            <SectionHeader label="Request Body" />
            {docs.request_body?.description && (
              <p className="text-xs text-muted-foreground mb-2">{docs.request_body.description}</p>
            )}
            {requestBodyEntries.map(([mediaType, content]) => (
              <div key={mediaType}>
                <p className="text-[11px] font-mono text-muted-foreground mb-1">{mediaType}</p>
                <SchemaBlock schema={content?.schema} />
              </div>
            ))}
          </>
        )}

        {/* Responses */}
        {resolvedResponseEntries.length > 0 && (
          <>
            <SectionHeader label="Responses" />
            <div className="space-y-3">
              {resolvedResponseEntries.map(([code, resp]) => {
                const respContent = resp?.content ?? {};
                const respContentEntries = Object.entries(respContent);
                return (
                  <div key={code}>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={cn("font-mono text-[11px] px-1.5 py-0 h-5 rounded-sm", getStatusCodeColor(code))}>
                        {code}
                      </Badge>
                      {resp?.description && (
                        <span className="text-xs text-muted-foreground">{resp.description}</span>
                      )}
                    </div>
                    {respContentEntries.map(([mediaType, content]) => (
                      <div key={mediaType} className="ml-1">
                        <p className="text-[10px] font-mono text-muted-foreground/60 mb-1">{mediaType}</p>
                        <SchemaBlock schema={content?.schema} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Security */}
        {security.length > 0 && (
          <>
            <SectionHeader label="Security" />
            <div className="space-y-1">
              {security.map((sec, idx) => {
                if (typeof sec === "object" && sec !== null) {
                  const keys = Object.keys(sec as Record<string, unknown>);
                  if (keys.length > 0) {
                    return (
                      <div key={idx} className="flex items-center gap-1.5 text-[12px]">
                        <LockIcon className="size-3 text-muted-foreground shrink-0" />
                        <span className="font-mono text-muted-foreground">{keys.join(", ")}</span>
                      </div>
                    );
                  }
                }
                return null;
              })}
            </div>
          </>
        )}

        {/* Empty state if nothing to show */}
        {parameters.length === 0 && requestBodyEntries.length === 0 && resolvedResponseEntries.length === 0 && security.length === 0 && !docs.summary && !docs.description && (
          <p className="text-xs text-muted-foreground mt-4">No additional documentation available for this endpoint.</p>
        )}
      </div>
    </ScrollArea>
  );
}

// ─── gRPC Docs ──────────────────────────────────────────────────────────────

interface GrpcField {
  name: string;
  number: number;
  type: string | GrpcMessageSchema;
  repeated: boolean;
  map: boolean;
  oneof?: string;
}

interface GrpcMessageSchema {
  name: string;
  fields: GrpcField[];
  enum?: string;
  values?: Array<{ name: string; number: number }>;
}

function GrpcDocsView({ data }: { data: Record<string, unknown> }) {
  const service = data.service as string;
  const method = data.method as string;
  const inputType = data.input_type as string;
  const outputType = data.output_type as string;
  const inputSchema = data.input_schema as GrpcMessageSchema | null;
  const outputSchema = data.output_schema as GrpcMessageSchema | null;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-teal-600 text-white">gRPC</span>
            <span className="font-mono text-sm font-medium">{method}</span>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{service}/{method}</p>
        </div>

        {/* Request message */}
        {inputSchema && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Request</h3>
            <p className="text-xs font-mono text-muted-foreground">{inputType}</p>
            <div className="border rounded-md overflow-hidden">
              <GrpcFieldTable schema={inputSchema} />
            </div>
          </div>
        )}

        {/* Response message */}
        {outputSchema && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Response</h3>
            <p className="text-xs font-mono text-muted-foreground">{outputType}</p>
            <div className="border rounded-md overflow-hidden">
              <GrpcFieldTable schema={outputSchema} />
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function GrpcFieldTable({ schema, depth = 0 }: { schema: GrpcMessageSchema; depth?: number }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!schema.fields || schema.fields.length === 0) {
    return <p className="text-xs text-muted-foreground p-2">No fields</p>;
  }

  const toggle = (name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b bg-muted/30">
          <th className="text-left font-medium text-muted-foreground px-2 py-1.5">#</th>
          <th className="text-left font-medium text-muted-foreground px-2 py-1.5">Field</th>
          <th className="text-left font-medium text-muted-foreground px-2 py-1.5">Type</th>
        </tr>
      </thead>
      <tbody>
        {schema.fields.map((field) => {
          const typeName = getGrpcTypeName(field.type);
          const isMessage = typeof field.type === "object" && "fields" in field.type;
          const isEnum = typeof field.type === "object" && "enum" in field.type;
          const isExpanded = expanded[field.name] ?? (depth < 1);

          return (
            <GrpcFieldRow
              key={field.name}
              field={field}
              typeName={typeName}
              isMessage={isMessage}
              isEnum={isEnum}
              isExpanded={isExpanded}
              onToggle={() => toggle(field.name)}
              depth={depth}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function GrpcFieldRow({
  field,
  typeName,
  isMessage,
  isEnum,
  isExpanded,
  onToggle,
  depth,
}: {
  field: GrpcField;
  typeName: string;
  isMessage: boolean;
  isEnum: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  depth: number;
}) {
  return (
    <>
      <tr
        className={cn(
          "border-b last:border-0",
          (isMessage || isEnum) && "cursor-pointer hover:bg-muted/30"
        )}
        onClick={(isMessage || isEnum) ? onToggle : undefined}
      >
        <td className="px-2 py-1.5 text-muted-foreground/60 font-mono w-8">{field.number}</td>
        <td className="px-2 py-1.5 font-mono">
          <span className="flex items-center gap-1">
            {(isMessage || isEnum) && (
              isExpanded
                ? <ChevronDownIcon className="size-3 text-muted-foreground" />
                : <ChevronRightIcon className="size-3 text-muted-foreground" />
            )}
            {field.name}
            {field.oneof && (
              <span className="text-[10px] text-muted-foreground/60 ml-1">oneof:{field.oneof}</span>
            )}
          </span>
        </td>
        <td className="px-2 py-1.5 font-mono text-muted-foreground">
          {field.repeated && <span className="text-blue-400">repeated </span>}
          {field.map && <span className="text-blue-400">map </span>}
          <span className={isMessage ? "text-teal-400" : isEnum ? "text-purple-400" : ""}>
            {typeName}
          </span>
        </td>
      </tr>
      {isMessage && isExpanded && (
        <tr>
          <td colSpan={3} className="pl-6 pr-2 py-0">
            <div className="border-l-2 border-muted ml-2">
              <GrpcFieldTable schema={field.type as GrpcMessageSchema} depth={depth + 1} />
            </div>
          </td>
        </tr>
      )}
      {isEnum && isExpanded && (
        <tr>
          <td colSpan={3} className="pl-6 pr-2 py-1">
            <div className="border-l-2 border-muted ml-2 pl-2 space-y-0.5">
              {((field.type as GrpcMessageSchema).values ?? []).map((v) => (
                <div key={v.number} className="flex gap-2 text-[11px] font-mono">
                  <span className="text-muted-foreground/60 w-6">{v.number}</span>
                  <span className="text-purple-400">{v.name}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function getGrpcTypeName(type: string | GrpcMessageSchema): string {
  if (typeof type === "string") return type;
  if ("enum" in type) return (type.enum as string).split(".").pop() ?? String(type.enum);
  return (type.name ?? "message").split(".").pop() ?? "message";
}
