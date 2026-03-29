// Mock for @tauri-apps/api/core when running in browser (not Tauri)

const WORKSPACE_ID = "ws-1";
const COLLECTION_A_ID = "col-a";
const COLLECTION_B_ID = "col-b";
const SUBFOLDER_ID = "col-sub";

const WORKSPACES = [{ id: WORKSPACE_ID, name: "Demo Workspace" }];

const COLLECTIONS = [
  {
    id: COLLECTION_A_ID,
    workspace_id: WORKSPACE_ID,
    name: "Petstore API",
    parent_id: null,
    spec_path: null,
    auth_type: null,
    auth_config: null,
    active_environment_id: null,
  },
  {
    id: SUBFOLDER_ID,
    workspace_id: WORKSPACE_ID,
    name: "Pets",
    parent_id: COLLECTION_A_ID,
    spec_path: null,
    auth_type: null,
    auth_config: null,
    active_environment_id: null,
  },
  {
    id: COLLECTION_B_ID,
    workspace_id: WORKSPACE_ID,
    name: "Weather API",
    parent_id: null,
    spec_path: null,
    auth_type: null,
    auth_config: null,
    active_environment_id: null,
  },
];

const REQUESTS: Record<string, Array<{
  id: string;
  collection_id: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  query_params: Record<string, string>;
  body: string | null;
  auth_type: string | null;
  auth_config: null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}>> = {
  [COLLECTION_A_ID]: [
    {
      id: "req-1",
      collection_id: COLLECTION_A_ID,
      name: "List Pets",
      method: "GET",
      url: "https://petstore.example.com/pets",
      headers: {},
      query_params: {},
      body: null,
      auth_type: null,
      auth_config: null,
      sort_order: 0,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
    {
      id: "req-2",
      collection_id: COLLECTION_A_ID,
      name: "Create Pet",
      method: "POST",
      url: "https://petstore.example.com/pets",
      headers: { "Content-Type": "application/json" },
      query_params: {},
      body: '{"name": "Kitty"}',
      auth_type: null,
      auth_config: null,
      sort_order: 1,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ],
  [SUBFOLDER_ID]: [
    {
      id: "req-3",
      collection_id: SUBFOLDER_ID,
      name: "Get Pet",
      method: "GET",
      url: "https://petstore.example.com/pets/1",
      headers: {},
      query_params: {},
      body: null,
      auth_type: null,
      auth_config: null,
      sort_order: 0,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ],
  [COLLECTION_B_ID]: [
    {
      id: "req-4",
      collection_id: COLLECTION_B_ID,
      name: "Get Weather",
      method: "GET",
      url: "https://weather.example.com/current",
      headers: {},
      query_params: {},
      body: null,
      auth_type: null,
      auth_config: null,
      sort_order: 0,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ],
};

export async function invoke(_cmd: string, _args?: unknown): Promise<unknown> {
  console.warn(`[tauri-mock] invoke("${_cmd}") called outside Tauri`);

  if (_cmd === "list_workspaces") return WORKSPACES;
  if (_cmd === "list_collections") {
    const args = _args as { workspaceId?: string | null } | undefined;
    if (args?.workspaceId) {
      return COLLECTIONS.filter((c) => c.workspace_id === args.workspaceId);
    }
    return COLLECTIONS;
  }
  if (_cmd === "list_requests") {
    const args = _args as { collectionId?: string | null } | undefined;
    const collectionId = args?.collectionId;
    if (collectionId && REQUESTS[collectionId]) {
      return REQUESTS[collectionId];
    }
    return [];
  }
  if (_cmd === "list_environments") return [];
  if (_cmd === "list_collection_environments") return [];
  if (_cmd === "list_collection_variables") return [];
  if (_cmd === "github_auth_status") return { authenticated: false };
  if (_cmd === "create_workspace") {
    const args = _args as { name: string };
    const ws = { id: `ws-${Date.now()}`, name: args.name };
    WORKSPACES.push(ws);
    return ws;
  }
  if (_cmd === "create_collection") {
    const args = _args as { name: string; workspaceId: string };
    const col = {
      id: `col-${Date.now()}`,
      workspace_id: args.workspaceId,
      name: args.name,
      parent_id: null,
      spec_path: null,
      auth_type: null,
      auth_config: null,
      active_environment_id: null,
    };
    COLLECTIONS.push(col);
    return col;
  }
  if (_cmd === "create_request") {
    const args = _args as { request: { collection_id: string; name: string; method: string; url: string } };
    return { id: `req-${Date.now()}`, ...args.request };
  }
  if (_cmd === "update_request") {
    return null;
  }
  if (_cmd === "get_request_docs") return null;
  return null;
}
