import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "frontend",
  envDir: process.cwd(),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-icon.svg"],
      manifest: false,
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
            options: {
              cacheName: "mindweave-api-network-only"
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173
  },
  build: {
    outDir: "../dist/frontend",
    emptyOutDir: true
  }
});
