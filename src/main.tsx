import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { toast } from "sonner";

if (import.meta.env.PROD) {
  // Configura o Service Worker para procurar atualizações com o botão interativo.
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast("Nova versão disponível! 🚀", {
        description: "Atualize para receber as últimas melhorias.",
        duration: Infinity,
        position: "top-center",
        action: {
          label: "Atualizar agora",
          onClick: () => {
            updateSW(true);
          },
        },
      });
    },
    onOfflineReady() {
      console.log("[PWA] App pronto para funcionar offline.");
    },
  });
} else if ("serviceWorker" in navigator) {
  // Remove registros/cache PWA antigos do localhost. Isso evita misturar um
  // runtime React Refresh em cache com os módulos da sessão Vite atual.
  void navigator.serviceWorker.getRegistrations().then((registrations) =>
    Promise.all(registrations.map((registration) => registration.unregister())),
  );

  if ("caches" in window) {
    void caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("workbox-precache") || key.startsWith("vite-pwa"))
          .map((key) => caches.delete(key)),
      ),
    );
  }
}

createRoot(document.getElementById("root")!).render(<App />);
