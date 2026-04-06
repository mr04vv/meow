import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { ParsedOpenApi } from "@/types/openapi";

export interface Collection {
  id: string;
  workspace_id: string | null;
  name: string;
  parent_id: string | null;
  spec_path: string | null;
  auth_type: string | null;
  auth_config: string | null;
  active_environment_id: string | null;
}

export interface CollectionEnvironment {
  id: string;
  collection_id: string;
  name: string;
}

export interface VariableKey {
  id: string;
  collection_id: string;
  key: string;
  is_secret: boolean;
}

export interface VariableWithValue {
  key_id: string;
  key: string;
  value: string;
  is_secret: boolean;
}

export interface SavedRequest {
  id: string;
  collection_id: string | null;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  query_params: Record<string, string>;
  body: string | null;
  auth_type: string | null;
  auth_config: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
  request_type: string;
}

export interface SyncResult {
  root_collection_id: string;
  tag_collections: Array<{ tag: string; collection_id: string }>;
  requests_created: number;
  requests_updated: number;
  requests_skipped: number;
  requests_removed: number;
}

interface CollectionState {
  collections: Collection[];
  requests: Record<string, SavedRequest[]>;
  loading: boolean;
  error: string | null;

  // Active collection for settings view
  activeCollectionId: string | null;
  setActiveCollection: (id: string | null) => void;

  // Environments (per collection)
  environments: CollectionEnvironment[];
  activeEnvironmentId: string | null;
  loadEnvironments: (collectionId: string) => Promise<void>;
  createEnvironment: (collectionId: string, name: string) => Promise<void>;
  setActiveEnvironment: (collectionId: string, environmentId: string) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;

  // Variable keys (shared across all envs for a collection)
  variableKeys: VariableKey[];
  loadVariableKeys: (collectionId: string) => Promise<void>;
  createVariableKey: (collectionId: string, key: string, isSecret: boolean) => Promise<VariableKey>;
  deleteVariableKey: (id: string) => Promise<void>;

  // Variable values (per env)
  variables: VariableWithValue[];
  loadVariables: (collectionId: string, environmentId: string) => Promise<void>;
  upsertVariableValue: (variableKeyId: string, environmentId: string, value: string) => Promise<void>;

  // Auth
  updateCollectionAuth: (collectionId: string, authType: string | null, authConfig: string | null) => Promise<void>;

  loadCollections: (workspaceId?: string) => Promise<void>;
  loadRequests: (collectionId?: string | null) => Promise<void>;
  generateFromOpenApi: (
    spec: ParsedOpenApi,
    baseUrl?: string,
    collectionId?: string,
    parentCollectionId?: string,
    workspaceId?: string
  ) => Promise<SyncResult>;
  generateFromProto: (
    parsedProto: unknown,
    collectionId?: string,
    parentCollectionId?: string,
    workspaceId?: string,
    collectionName?: string
  ) => Promise<SyncResult>;
  createCollection: (name: string, workspaceId: string) => Promise<Collection>;
  deleteCollection: (id: string) => Promise<void>;
  createRequest: (req: Omit<SavedRequest, "id" | "created_at" | "updated_at">) => Promise<SavedRequest>;
  updateRequest: (id: string, updates: Partial<SavedRequest>) => Promise<void>;
  deleteRequest: (id: string) => Promise<void>;
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  collections: [],
  requests: {},
  loading: false,
  error: null,

  activeCollectionId: null,
  setActiveCollection: (id) => {
    set({ activeCollectionId: id });
    if (id) {
      get().loadEnvironments(id);
    } else {
      set({ environments: [], activeEnvironmentId: null, variableKeys: [], variables: [] });
    }
  },

  environments: [],
  activeEnvironmentId: null,

  loadEnvironments: async (collectionId) => {
    const environments = (await invoke("list_collection_environments", {
      collectionId,
    })) as CollectionEnvironment[];
    // Determine active environment from the collection record
    const collection = get().collections.find((c) => c.id === collectionId);
    const activeEnvironmentId =
      collection?.active_environment_id ?? (environments[0]?.id ?? null);
    set({ environments, activeEnvironmentId });
    await get().loadVariableKeys(collectionId);
    if (activeEnvironmentId) {
      await get().loadVariables(collectionId, activeEnvironmentId);
    }
  },

  createEnvironment: async (collectionId, name) => {
    await invoke("create_collection_environment", { collectionId, name });
    await get().loadEnvironments(collectionId);
  },

  setActiveEnvironment: async (collectionId, environmentId) => {
    await invoke("set_active_collection_environment", { collectionId, environmentId });
    set({ activeEnvironmentId: environmentId });
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId ? { ...c, active_environment_id: environmentId } : c
      ),
    }));
    await get().loadVariables(collectionId, environmentId);
  },

  deleteEnvironment: async (id) => {
    const state = get();
    const env = state.environments.find((e) => e.id === id);
    await invoke("delete_collection_environment", { id });
    if (env) {
      await get().loadEnvironments(env.collection_id);
    }
  },

  variableKeys: [],

  loadVariableKeys: async (collectionId) => {
    const variableKeys = (await invoke("list_variable_keys", {
      collectionId,
    })) as VariableKey[];
    set({ variableKeys });
  },

  createVariableKey: async (collectionId, key, isSecret) => {
    const variableKey = (await invoke("create_variable_key", {
      collectionId,
      key,
      isSecret,
    })) as VariableKey;
    await get().loadVariableKeys(collectionId);
    return variableKey;
  },

  deleteVariableKey: async (id) => {
    const state = get();
    await invoke("delete_variable_key", { id });
    const collectionId = state.activeCollectionId;
    if (collectionId) {
      await get().loadVariableKeys(collectionId);
      if (state.activeEnvironmentId) {
        await get().loadVariables(collectionId, state.activeEnvironmentId);
      }
    }
  },

  variables: [],

  loadVariables: async (collectionId, environmentId) => {
    const variables = (await invoke("get_variables_for_env", {
      collectionId,
      environmentId,
    })) as VariableWithValue[];
    set({ variables });
  },

  upsertVariableValue: async (variableKeyId, environmentId, value) => {
    await invoke("upsert_variable_value", {
      variableKeyId,
      environmentId,
      value,
    });
    const state = get();
    if (state.activeCollectionId && state.activeEnvironmentId) {
      await get().loadVariables(state.activeCollectionId, state.activeEnvironmentId);
    }
  },

  updateCollectionAuth: async (collectionId, authType, authConfig) => {
    await invoke("update_collection_auth", {
      collectionId,
      authType,
      authConfig,
    });
    await get().loadCollections();
  },

  loadCollections: async (workspaceId?: string) => {
    console.log("[collectionStore] loadCollections called with workspaceId:", workspaceId);
    try {
      const cols = (await invoke("list_collections", {
        workspaceId: workspaceId ?? null,
      })) as Collection[];
      console.log("[collectionStore] loadCollections result:", cols.length, "collections", cols.map(c => ({ id: c.id, ws: c.workspace_id, name: c.name })));
      set({ collections: cols });
    } catch (e) {
      console.error("[collectionStore] loadCollections error:", e);
      set({ error: String(e) });
    }
  },

  loadRequests: async (collectionId?: string | null) => {
    set({ loading: true, error: null });
    try {
      const reqs = (await invoke("list_requests", {
        collectionId: collectionId ?? null,
      })) as SavedRequest[];
      const key = collectionId ?? "__uncollected__";
      const filtered =
        collectionId === null || collectionId === undefined
          ? reqs.filter((r) => r.collection_id === null)
          : reqs;
      set((state) => ({
        requests: { ...state.requests, [key]: filtered },
        loading: false,
      }));
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  generateFromOpenApi: async (spec, baseUrl, collectionId, parentCollectionId, workspaceId) => {
    set({ loading: true, error: null });
    try {
      const result = (await invoke("generate_collection_from_openapi", {
        request: {
          spec,
          parent_collection_id: parentCollectionId ?? null,
          base_url: baseUrl ?? null,
          collection_id: collectionId ?? null,
          workspace_id: workspaceId ?? null,
        },
      })) as SyncResult;

      await get().loadCollections(workspaceId);
      set({ loading: false });
      return result;
    } catch (e) {
      set({ loading: false, error: String(e) });
      throw e;
    }
  },

  generateFromProto: async (parsedProto, collectionId, parentCollectionId, workspaceId, collectionName) => {
    set({ loading: true, error: null });
    try {
      const result = (await invoke("generate_collection_from_proto", {
        request: {
          parsed_proto: parsedProto,
          collection_id: collectionId ?? null,
          parent_collection_id: parentCollectionId ?? null,
          workspace_id: workspaceId ?? null,
          collection_name: collectionName ?? null,
        },
      })) as SyncResult;

      await get().loadCollections(workspaceId);
      set({ loading: false });
      return result;
    } catch (e) {
      set({ loading: false, error: String(e) });
      throw e;
    }
  },

  createCollection: async (name, workspaceId) => {
    const collection = (await invoke("create_collection", {
      name,
      workspaceId,
    })) as Collection;
    await get().loadCollections(workspaceId);
    return collection;
  },

  deleteCollection: async (id) => {
    await invoke("delete_collection", { id });
    set((state) => {
      const requests = { ...state.requests };
      delete requests[id];
      return { requests };
    });
    await get().loadCollections();
  },

  createRequest: async (req) => {
    const saved = (await invoke("create_request", {
      request: {
        collection_id: req.collection_id,
        name: req.name,
        method: req.method,
        url: req.url,
        headers: req.headers,
        query_params: req.query_params,
        body: req.body,
        auth_type: req.auth_type,
        auth_config: req.auth_config,
        sort_order: req.sort_order,
      },
    })) as SavedRequest;
    await get().loadRequests(req.collection_id);
    return saved;
  },

  updateRequest: async (id, updates) => {
    await invoke("update_request", {
      request: { id, ...updates },
    });
  },

  deleteRequest: async (id) => {
    await invoke("delete_request", { id });
  },
}));
