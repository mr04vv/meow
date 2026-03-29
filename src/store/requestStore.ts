import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useCollectionStore } from "@/store/collectionStore";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
}

export interface AuthConfig {
  type: "none" | "bearer" | "basic" | "api_key" | "cognito";
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: "header" | "query";
  cognitoClientId?: string;
  cognitoUsername?: string;
  cognitoPassword?: string;
  cognitoRegion?: string;
}

export interface RequestTab {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValuePair[];
  queryParams: KeyValuePair[];
  body: string;
  auth: AuthConfig;
  collectionId: string | null;
  inheritAuth: boolean;
  isPreview: boolean;
  savedRequestId?: string;
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  responseTimeMs: number;
  bodySizeBytes: number;
  isJson: boolean;
}

interface RequestState {
  tabs: RequestTab[];
  activeTabId: string | null;
  responses: Record<string, ResponseData | null>;
  loading: Record<string, boolean>;
  docs: Record<string, string | null>;
  originalSnapshots: Record<string, string>;

  addTab: () => void;
  openPreviewTab: (tab: Omit<RequestTab, "id" | "isPreview">) => void;
  pinTab: (tabId: string) => void;
  pinActiveTab: () => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  updateTab: (id: string, updates: Partial<RequestTab>) => void;
  setResponse: (tabId: string, response: ResponseData | null) => void;
  setLoading: (tabId: string, loading: boolean) => void;
  loadDocs: (tabId: string, requestId: string) => Promise<void>;
  saveTab: (tabId: string) => Promise<void>;
  isDirty: (tabId: string) => boolean;
  getUnsavedTabs: () => RequestTab[];
  saveAllDirty: () => Promise<void>;
}

let tabCounter = 1;

function newTab(): RequestTab {
  return {
    id: `tab-${Date.now()}-${tabCounter++}`,
    name: "New Request",
    method: "GET",
    url: "",
    headers: [],
    queryParams: [],
    body: "",
    auth: { type: "none" },
    collectionId: null,
    inheritAuth: false,
    isPreview: false,
  };
}

function makeSnapshot(tab: RequestTab): string {
  return JSON.stringify({
    method: tab.method,
    url: tab.url,
    headers: tab.headers.filter((h) => h.key).map((h) => [h.key, h.value]),
    queryParams: tab.queryParams.filter((p) => p.key).map((p) => [p.key, p.value]),
    body: tab.body,
  });
}

export const useRequestStore = create<RequestState>((set, get) => {
  return {
    tabs: [],
    activeTabId: null,
    responses: {},
    loading: {},
    docs: {},
    originalSnapshots: {},

    addTab: () =>
      set((state) => {
        const tab = newTab();
        const snapshot = makeSnapshot(tab);
        return {
          tabs: [...state.tabs, tab],
          activeTabId: tab.id,
          responses: { ...state.responses, [tab.id]: null },
          loading: { ...state.loading, [tab.id]: false },
          originalSnapshots: { ...state.originalSnapshots, [tab.id]: snapshot },
        };
      }),

    openPreviewTab: (tabData) =>
      set((state) => {
        const id = `tab-${Date.now()}-${tabCounter++}`;
        const previewTab: RequestTab = { ...tabData, id, isPreview: true };
        const snapshot = makeSnapshot(previewTab);
        const existingPreviewIdx = state.tabs.findIndex((t) => t.isPreview);
        if (existingPreviewIdx >= 0) {
          // Replace the existing preview tab
          const oldId = state.tabs[existingPreviewIdx].id;
          const tabs = [...state.tabs];
          tabs[existingPreviewIdx] = previewTab;
          const responses = { ...state.responses };
          const loading = { ...state.loading };
          const originalSnapshots = { ...state.originalSnapshots };
          delete responses[oldId];
          delete loading[oldId];
          delete originalSnapshots[oldId];
          return {
            tabs,
            activeTabId: id,
            responses: { ...responses, [id]: null },
            loading: { ...loading, [id]: false },
            originalSnapshots: { ...originalSnapshots, [id]: snapshot },
          };
        }
        return {
          tabs: [...state.tabs, previewTab],
          activeTabId: id,
          responses: { ...state.responses, [id]: null },
          loading: { ...state.loading, [id]: false },
          originalSnapshots: { ...state.originalSnapshots, [id]: snapshot },
        };
      }),

    pinTab: (tabId) =>
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId ? { ...t, isPreview: false } : t
        ),
      })),

    pinActiveTab: () =>
      set((state) => {
        if (!state.activeTabId) return state;
        return {
          tabs: state.tabs.map((t) =>
            t.id === state.activeTabId ? { ...t, isPreview: false } : t
          ),
        };
      }),

    closeTab: (id) =>
      set((state) => {
        const tabs = state.tabs.filter((t) => t.id !== id);
        const originalSnapshots = { ...state.originalSnapshots };
        delete originalSnapshots[id];
        if (tabs.length === 0) {
          return {
            tabs: [],
            activeTabId: null,
            responses: {},
            loading: {},
            originalSnapshots: {},
          };
        }
        const activeTabId =
          state.activeTabId === id
            ? (tabs[tabs.length - 1]?.id ?? null)
            : state.activeTabId;
        const responses = { ...state.responses };
        const loading = { ...state.loading };
        delete responses[id];
        delete loading[id];
        return { tabs, activeTabId, responses, loading, originalSnapshots };
      }),

    setActiveTab: (id) => set({ activeTabId: id }),

    updateTab: (id, updates) =>
      set((state) => ({
        tabs: state.tabs.map((t) => {
          if (t.id !== id) return t;
          const updated = { ...t, ...updates };
          // Auto-pin when content is edited
          if (updated.isPreview && (
            updates.url !== undefined ||
            updates.method !== undefined ||
            updates.headers !== undefined ||
            updates.queryParams !== undefined ||
            updates.body !== undefined
          )) {
            updated.isPreview = false;
          }
          return updated;
        }),
      })),

    setResponse: (tabId, response) =>
      set((state) => ({
        responses: { ...state.responses, [tabId]: response },
      })),

    setLoading: (tabId, loading) =>
      set((state) => ({
        loading: { ...state.loading, [tabId]: loading },
      })),

    loadDocs: async (tabId, requestId) => {
      try {
        const docs = await invoke("get_request_docs", { requestId }) as string | null;
        set((state) => ({
          docs: { ...state.docs, [tabId]: docs },
        }));
      } catch {
        // Silently fail — docs are optional
      }
    },

    saveTab: async (tabId) => {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab || !tab.url.trim()) return;

      const headerMap: Record<string, string> = {};
      for (const h of tab.headers) {
        if (h.key) headerMap[h.key] = h.value;
      }
      const queryMap: Record<string, string> = {};
      for (const p of tab.queryParams) {
        if (p.key) queryMap[p.key] = p.value;
      }

      if (tab.savedRequestId) {
        // Don't send collection_id or sort_order — preserve the original values
        await invoke("update_request", {
          request: {
            id: tab.savedRequestId,
            name: tab.name,
            method: tab.method,
            url: tab.url,
            headers: headerMap,
            query_params: queryMap,
            body: tab.body || null,
            auth_type: tab.auth.type !== "none" ? tab.auth.type : null,
          },
        });
      } else {
        const saved = (await invoke("create_request", {
          request: {
            collection_id: tab.collectionId,
            name: tab.name || `${tab.method} ${tab.url}`,
            method: tab.method,
            url: tab.url,
            headers: headerMap,
            query_params: queryMap,
            body: tab.body || null,
            auth_type: tab.auth.type !== "none" ? tab.auth.type : null,
            auth_config: null,
            sort_order: 0,
          },
        })) as { id: string };
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, savedRequestId: saved.id } : t
          ),
        }));
      }

      // Pin the tab (remove preview/italic state) and update snapshot
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId ? { ...t, isPreview: false } : t
        ),
      }));

      const currentTab = get().tabs.find((t) => t.id === tabId);
      if (currentTab) {
        set((state) => ({
          originalSnapshots: {
            ...state.originalSnapshots,
            [tabId]: makeSnapshot(currentTab),
          },
        }));

        // Reload the collection's requests cache so sidebar shows updated data
        if (currentTab.collectionId) {
          await useCollectionStore.getState().loadRequests(currentTab.collectionId);
        }
      }
    },

    isDirty: (tabId) => {
      const state = get();
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return false;
      // New tabs with no URL are not dirty
      if (!tab.url.trim() && !tab.savedRequestId) return false;
      const snapshot = state.originalSnapshots[tabId];
      if (snapshot === undefined) return false;
      return makeSnapshot(tab) !== snapshot;
    },

    getUnsavedTabs: () => {
      const state = get();
      return state.tabs.filter(
        (tab) => !tab.isPreview && state.isDirty(tab.id)
      );
    },

    saveAllDirty: async () => {
      const unsaved = get().getUnsavedTabs();
      for (const tab of unsaved) {
        await get().saveTab(tab.id);
      }
    },
  };
});
