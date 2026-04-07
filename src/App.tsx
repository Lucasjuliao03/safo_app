import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ProtectedRoute, AdminRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Questoes from "./pages/Questoes";
import Flashcards from "./pages/Flashcards";
import Resumos from "./pages/Resumos";
import Perfil from "./pages/Perfil";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Achievements from "./pages/Achievements";
import Ranking from "./pages/Ranking";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminStructure from "./pages/admin/AdminStructure";
import AdminQuestions from "./pages/admin/AdminQuestions";
import AdminContent from "./pages/admin/AdminContent";
import AdminMessages from "./pages/admin/AdminMessages";
import AdminPush from "./pages/admin/AdminPush";

const queryClient = new QueryClient();

// Intro Video Screen Overlay
const IntroScreen = ({ onFinish }: { onFinish: () => void }) => {
  return (
    <div 
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center cursor-pointer overflow-hidden p-4"
      onClick={onFinish}
    >
      <video 
        src="/intro.mp4" 
        autoPlay 
        muted 
        playsInline 
        onEnded={onFinish}
        className="w-full h-full max-h-[90vh] object-contain animate-fade-in"
      />
      <div className="absolute bottom-6 left-0 w-full text-center text-white/50 text-xs font-mono tracking-widest uppercase font-semibold">
        Toque para pular
      </div>
    </div>
  );
};

const AppRoutes = () => {
  const [introFinished, setIntroFinished] = useState(false);

  useEffect(() => {
    const hasSeenIntro = sessionStorage.getItem("hasSeenIntro");
    if (hasSeenIntro) {
      setIntroFinished(true);
    }
  }, []);

  const handleFinishIntro = () => {
    sessionStorage.setItem("hasSeenIntro", "true");
    setIntroFinished(true);
  };

  return (
    <>
      {!introFinished && <IntroScreen onFinish={handleFinishIntro} />}
      <div className={introFinished ? "block" : "hidden h-0 overflow-hidden"}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/questoes" element={<ProtectedRoute><Questoes /></ProtectedRoute>} />
          <Route path="/flashcards" element={<ProtectedRoute><Flashcards /></ProtectedRoute>} />
          <Route path="/resumos" element={<ProtectedRoute><Resumos /></ProtectedRoute>} />
          <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
          <Route path="/medalhas" element={<ProtectedRoute><Achievements /></ProtectedRoute>} />
          <Route path="/ranking" element={<ProtectedRoute><Ranking /></ProtectedRoute>} />
          
          <Route path="/admin" element={<ProtectedRoute><AdminRoute><Admin /></AdminRoute></ProtectedRoute>} />
          
          <Route path="/painel" element={<ProtectedRoute><AdminRoute><AdminDashboard /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/usuarios" element={<ProtectedRoute><AdminRoute><AdminUsers /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/estrutura" element={<ProtectedRoute><AdminRoute><AdminStructure /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/questoes" element={<ProtectedRoute><AdminRoute><AdminQuestions /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/conteudo" element={<ProtectedRoute><AdminRoute><AdminContent /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/mensagens" element={<ProtectedRoute><AdminRoute><AdminMessages /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/push" element={<ProtectedRoute><AdminRoute><AdminPush /></AdminRoute></ProtectedRoute>} />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <AppRoutes />
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
