import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Mock Tauri API when not running inside Tauri (e.g., browser E2E tests)
      ...(mode === "test-e2e" || !process.env.TAURI_ENV_PLATFORM
        ? {
            "@tauri-apps/api/core": path.resolve(
              __dirname,
              "./src/lib/tauri-mock.ts",
            ),
          }
        : {}),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
}));
