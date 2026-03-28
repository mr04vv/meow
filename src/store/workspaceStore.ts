import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface Workspace {
  id: string;
  name: string;
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  loading: boolean;

  loadWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
  setActiveWorkspace: (id: string | null) => void;
  deleteWorkspace: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  loading: false,

  loadWorkspaces: async () => {
    set({ loading: true });
    try {
      const workspaces = (await invoke("list_workspaces")) as Workspace[];
      set({ workspaces, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createWorkspace: async (name) => {
    const workspace = (await invoke("create_workspace", { name })) as Workspace;
    await get().loadWorkspaces();
    return workspace;
  },

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id });
  },

  deleteWorkspace: async (id) => {
    await invoke("delete_workspace", { id });
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
    }));
  },
}));
