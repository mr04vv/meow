export interface ParsedOpenApi {
  version: string;
  title: string;
  description: string | null;
  servers: ServerInfo[];
  paths: PathInfo[];
  schemas: Record<string, unknown>;
  security_schemes: Record<string, unknown>;
}

export interface ServerInfo {
  url: string;
  description: string | null;
}

export interface PathInfo {
  path: string;
  operations: OperationInfo[];
}

export interface OperationInfo {
  method: string;
  operation_id: string | null;
  summary: string | null;
  description: string | null;
  tags: string[];
  parameters: unknown[];
  request_body: unknown | null;
  responses: Record<string, unknown>;
  security: unknown[];
}
