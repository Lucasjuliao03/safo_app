import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Falhar claramente se a porta estiver ocupada. Trocar silenciosamente de
    // porta deixa clientes HMR antigos tentando conectar ao servidor errado.
    strictPort: true,
    hmr: {
      overlay: false,
    },
    // A API local é iniciada pelo próprio `npm run dev`.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: "auto",
      includeAssets: ["favicon.ico", "app.png", "icons/*.png"],
      manifest: {
        name: "SAFO - Concurseiro",
        short_name: "SAFO",
        description: "Sua preparação para concursos públicos",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#09090b",
        theme_color: "#09090b",
        orientation: "portrait-primary",
        prefer_related_applications: false,
        categories: ["education", "productivity"],
        icons: [
          {
            src: "/app.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/app.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/app.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      injectManifest: {
        // Cache only the application shell. Large videos/avatars remain available
        // on demand and no longer make every PWA update download ~10 MB.
        globPatterns: ["**/*.{js,css,html,ico,svg}"],
        // The XLSX engine is loaded only on explicit admin action and must not
        // be downloaded during service-worker installation.
        globIgnores: ["**/avatar/**", "**/*.mp4", "**/exceljs*.js"],
      },
      devOptions: {
        // Um service worker em desenvolvimento pode servir módulos Vite/HMR
        // antigos e quebrar o React Fast Refresh após upgrades de dependências.
        enabled: false,
        type: "module",
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
