import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Base888 mirrors Base44's Vite SPA layout. Rolldown (Base44's bundler) is a
// drop-in Vite bundler; we use the standard Rollup-based Vite here for parity
// of structure without the experimental dependency.
const MOCK_API = process.env.BASE888_API ?? "http://localhost:4488";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  },
  server: {
    port: 5888,
    proxy: {
      "/api": MOCK_API,
      "/auth": MOCK_API,
      "/apps": { target: MOCK_API, bypass: (req) => (req.headers.accept?.includes("text/html") ? req.url : undefined) },
      "/workspaces": MOCK_API
    }
  },
  build: {
    outDir: "dist",
    // Mirror Base44's named-chunk strategy so the module roles stay legible.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-data": ["axios"],
          "vendor-i18n": ["i18next", "react-i18next"],
          "vendor-state": ["zustand"]
        }
      }
    }
  }
});
