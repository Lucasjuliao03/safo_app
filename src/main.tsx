import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { toast } from "sonner";

// Configura o Service Worker para procurar atualizações com o botão interativo
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

createRoot(document.getElementById("root")!).render(<App />);
