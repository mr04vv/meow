import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface Environment {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Variable {
  id: string;
  environment_id: string;
  key: string;
  value: string;
  is_secret: boolean;
}

interface EnvironmentState {
  environments: Environment[];
  activeEnvironmentId: string | null;
  variables: Record<string, Variable[]>;

  loadEnvironments: () => Promise<void>;
  createEnvironment: (name: string) => Promise<void>;
  updateEnvironment: (id: string, name: string) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;
  setActiveEnvironment: (id: string | null) => Promise<void>;
  loadVariables: (environmentId: string) => Promise<void>;
  upsertVariable: (
    environmentId: string,
    key: string,
    value: string,
    isSecret: boolean
  ) => Promise<void>;
  deleteVariable: (id: string, environmentId: string) => Promise<void>;
}

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  environments: [],
  activeEnvironmentId: null,
  variables: {},

  loadEnvironments: async () => {
    const envs = (await invoke("list_environments")) as Environment[];
    const active = envs.find((e) => e.is_active);
    set({
      environments: envs,
      activeEnvironmentId: active?.id ?? null,
    });
  },

  createEnvironment: async (name) => {
    await invoke("create_environment", { request: { name } });
    await get().loadEnvironments();
  },

  updateEnvironment: async (id, name) => {
    await invoke("update_environment", { request: { id, name, is_active: null } });
    await get().loadEnvironments();
  },

  deleteEnvironment: async (id) => {
    await invoke("delete_environment", { id });
    await get().loadEnvironments();
  },

  setActiveEnvironment: async (id) => {
    if (id) {
      await invoke("update_environment", {
        request: { id, name: null, is_active: true },
      });
    } else {
      // deactivate all: update each with is_active=false
      const envs = get().environments;
      for (const env of envs) {
        if (env.is_active) {
          await invoke("update_environment", {
            request: { id: env.id, name: null, is_active: false },
          });
        }
      }
    }
    await get().loadEnvironments();
  },

  loadVariables: async (environmentId) => {
    const vars = (await invoke("list_variables", {
      environmentId,
    })) as Variable[];
    set((state) => ({
      variables: { ...state.variables, [environmentId]: vars },
    }));
  },

  upsertVariable: async (environmentId, key, value, isSecret) => {
    await invoke("upsert_variable", {
      request: { environment_id: environmentId, key, value, is_secret: isSecret },
    });
    await get().loadVariables(environmentId);
  },

  deleteVariable: async (id, environmentId) => {
    await invoke("delete_variable", { id });
    await get().loadVariables(environmentId);
  },
}));
