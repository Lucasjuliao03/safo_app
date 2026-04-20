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
import Estudos from "./pages/Estudos";
import Perfil from "./pages/Perfil";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Achievements from "./pages/Achievements";
import Ranking from "./pages/Ranking";
import Assinar from "./pages/Assinar";
import PagamentoSucesso from "./pages/pagamento/Sucesso";
import PagamentoPendente from "./pages/pagamento/Pendente";
import PagamentoFalhou from "./pages/pagamento/Falhou";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminStructure from "./pages/admin/AdminStructure";
import AdminQuestions from "./pages/admin/AdminQuestions";
import AdminContent from "./pages/admin/AdminContent";
import AdminMessages from "./pages/admin/AdminMessages";
import AdminPush from "./pages/admin/AdminPush";
import AdminPlansPage from "./pages/admin/AdminPlansPage";
import AdminMentoriaDashboard from "./pages/admin/AdminMentoriaDashboard";
import AdminMentoriaAluno from "./pages/admin/AdminMentoriaAluno";
import AdminPatrulhamento from "./pages/admin/AdminPatrulhamento";
import AdminPatrulhamentoEditor from "./pages/admin/AdminPatrulhamentoEditor";

import MentoriaDashboard from "./pages/mentoria/MentoriaDashboard";
import MentoriaExecucao from "./pages/mentoria/MentoriaExecucao";
import MentoriaDesempenho from "./pages/mentoria/MentoriaDesempenho";

import PatrulhamentoDashboard from "./pages/patrulhamento/PatrulhamentoDashboard";
import PatrulhamentoFase from "./pages/patrulhamento/PatrulhamentoFase";

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
          <Route path="/estudos" element={<ProtectedRoute><Estudos /></ProtectedRoute>} />
          <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
          <Route path="/medalhas" element={<ProtectedRoute><Achievements /></ProtectedRoute>} />
          <Route path="/ranking" element={<ProtectedRoute><Ranking /></ProtectedRoute>} />
          <Route path="/assinar" element={<ProtectedRoute><Assinar /></ProtectedRoute>} />

          {/* Páginas de retorno do Mercado Pago — sem ProtectedRoute para usuários não logados verem a mensagem */}
          <Route path="/pagamento/sucesso" element={<PagamentoSucesso />} />
          <Route path="/pagamento/pendente" element={<PagamentoPendente />} />
          <Route path="/pagamento/falhou" element={<PagamentoFalhou />} />
          
          <Route path="/mentoria" element={<ProtectedRoute><MentoriaDashboard /></ProtectedRoute>} />
          <Route path="/mentoria/execucao" element={<ProtectedRoute><MentoriaExecucao /></ProtectedRoute>} />
          <Route path="/mentoria/relatorios" element={<ProtectedRoute><MentoriaDesempenho /></ProtectedRoute>} />

          <Route path="/patrulhamento" element={<ProtectedRoute><PatrulhamentoDashboard /></ProtectedRoute>} />
          <Route path="/patrulhamento/fase/:id" element={<ProtectedRoute><PatrulhamentoFase /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute><AdminRoute><Admin /></AdminRoute></ProtectedRoute>} />
          
          <Route path="/painel" element={<ProtectedRoute><AdminRoute><AdminDashboard /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/usuarios" element={<ProtectedRoute><AdminRoute><AdminUsers /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/estrutura" element={<ProtectedRoute><AdminRoute><AdminStructure /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/questoes" element={<ProtectedRoute><AdminRoute><AdminQuestions /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/conteudo" element={<ProtectedRoute><AdminRoute><AdminContent /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/mensagens" element={<ProtectedRoute><AdminRoute><AdminMessages /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/push" element={<ProtectedRoute><AdminRoute><AdminPush /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/planos" element={<ProtectedRoute><AdminRoute><AdminPlansPage /></AdminRoute></ProtectedRoute>} />
          
          {/* Módulo de Admin Mentoria */}
          <Route path="/painel/mentoria" element={<ProtectedRoute><AdminRoute><AdminMentoriaDashboard /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/mentoria/aluno/:id" element={<ProtectedRoute><AdminRoute><AdminMentoriaAluno /></AdminRoute></ProtectedRoute>} />
          
          <Route path="/painel/patrulhamento" element={<ProtectedRoute><AdminRoute><AdminPatrulhamento /></AdminRoute></ProtectedRoute>} />
          <Route path="/painel/patrulhamento/:courseId" element={<ProtectedRoute><AdminRoute><AdminPatrulhamentoEditor /></AdminRoute></ProtectedRoute>} />

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
