// Mock for @tauri-apps/api/window when running in browser (not Tauri)
export function getCurrentWindow() {
  return {
    onCloseRequested: (_handler: (event: { preventDefault: () => void }) => void) => {
      // Return a no-op unlisten function
      return Promise.resolve(() => {});
    },
    close: async () => {
      console.warn("[tauri-window-mock] close() called outside Tauri");
    },
  };
}
