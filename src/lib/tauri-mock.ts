// Mock for @tauri-apps/api/core when running in browser (not Tauri)
export async function invoke(_cmd: string, _args?: unknown): Promise<unknown> {
  console.warn(`[tauri-mock] invoke("${_cmd}") called outside Tauri`);
  // Return sensible defaults based on command
  if (_cmd === "list_environments") return [];
  if (_cmd === "list_collections") return [];
  if (_cmd === "list_requests") return [];
  if (_cmd === "github_auth_status") return { authenticated: false };
  return null;
}
