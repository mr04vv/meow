import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface AuthStatus {
  authenticated: boolean;
  login: string | null;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  html_url: string;
}

export interface GithubBranch {
  name: string;
  sha: string;
}

export interface GithubTreeEntry {
  path: string;
  type: string;
  sha: string;
  size: number | null;
}

const OPENAPI_PATTERNS = [
  /openapi\.(yaml|yml|json)$/i,
  /swagger\.(yaml|yml|json)$/i,
  /api\.(yaml|yml|json)$/i,
  /api-spec\.(yaml|yml|json)$/i,
  /api-docs\.(yaml|yml|json)$/i,
];

interface GithubState {
  authStatus: AuthStatus | null;
  repos: GithubRepo[];
  searchQuery: string;
  selectedRepo: GithubRepo | null;
  branches: GithubBranch[];
  selectedBranch: string | null;
  treeEntries: GithubTreeEntry[];
  openApiFiles: GithubTreeEntry[];
  loading: boolean;
  error: string | null;

  checkAuthStatus: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loadRepos: (query?: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  selectRepo: (repo: GithubRepo) => Promise<void>;
  selectBranch: (branch: string, owner: string, repo: string) => Promise<void>;
  setError: (error: string | null) => void;
  resetSelection: () => void;
}

export const useGithubStore = create<GithubState>((set, get) => ({
  authStatus: null,
  repos: [],
  searchQuery: "",
  selectedRepo: null,
  branches: [],
  selectedBranch: null,
  treeEntries: [],
  openApiFiles: [],
  loading: false,
  error: null,

  checkAuthStatus: async () => {
    try {
      const status = (await invoke("github_auth_status")) as AuthStatus;
      set({ authStatus: status });
    } catch (e) {
      set({ authStatus: { authenticated: false, login: null } });
    }
  },

  login: async () => {
    set({ loading: true, error: null });
    try {
      const status = (await invoke("github_start_oauth")) as AuthStatus;
      set({ authStatus: status, loading: false });
      await get().loadRepos();
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  logout: async () => {
    await invoke("github_logout");
    set({
      authStatus: { authenticated: false, login: null },
      repos: [],
      selectedRepo: null,
      branches: [],
      selectedBranch: null,
      treeEntries: [],
      openApiFiles: [],
    });
  },

  loadRepos: async (query?: string) => {
    set({ loading: true, error: null });
    try {
      const repos = (await invoke("github_list_repos", {
        query: query || null,
        page: 1,
      })) as GithubRepo[];
      set({ repos, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  selectRepo: async (repo) => {
    set({ selectedRepo: repo, loading: true, error: null, selectedBranch: null });
    try {
      const [owner, repoName] = repo.full_name.split("/");
      const branches = (await invoke("github_list_branches", {
        owner,
        repo: repoName,
      })) as GithubBranch[];
      set({ branches, loading: false });
      // Auto-select default branch
      await get().selectBranch(repo.default_branch, owner, repoName);
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  selectBranch: async (branch, owner, repo) => {
    set({ selectedBranch: branch, loading: true, error: null });
    try {
      // Get tree for the branch
      const entries = (await invoke("github_get_file_tree", {
        owner,
        repo,
        treeSha: branch,
        recursive: true,
      })) as GithubTreeEntry[];

      // Filter OpenAPI files
      const openApiFiles = entries.filter(
        (e) =>
          e.type === "blob" &&
          OPENAPI_PATTERNS.some((p) => p.test(e.path))
      );

      set({ treeEntries: entries, openApiFiles, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  setError: (error) => set({ error }),

  resetSelection: () =>
    set({
      selectedRepo: null,
      branches: [],
      selectedBranch: null,
      treeEntries: [],
      openApiFiles: [],
      searchQuery: "",
      error: null,
    }),
}));
