import { lazy, Suspense, useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ProtectedRoute, AdminRoute } from "@/components/ProtectedRoute";
import { SecureContentError } from "@/services/secureContentService";
const Index = lazy(() => import("./pages/Index"));
const Questoes = lazy(() => import("./pages/Questoes"));
const Flashcards = lazy(() => import("./pages/Flashcards"));
const Resumos = lazy(() => import("./pages/Resumos"));
const Estudos = lazy(() => import("./pages/Estudos"));
const Perfil = lazy(() => import("./pages/Perfil"));
const Login = lazy(() => import("./pages/Login"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Achievements = lazy(() => import("./pages/Achievements"));
const Ranking = lazy(() => import("./pages/Ranking"));
const Assinar = lazy(() => import("./pages/Assinar"));
const PagamentoSucesso = lazy(() => import("./pages/pagamento/Sucesso"));
const PagamentoPendente = lazy(() => import("./pages/pagamento/Pendente"));
const PagamentoFalhou = lazy(() => import("./pages/pagamento/Falhou"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminStructure = lazy(() => import("./pages/admin/AdminStructure"));
const AdminQuestions = lazy(() => import("./pages/admin/AdminQuestions"));
const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminPush = lazy(() => import("./pages/admin/AdminPush"));
const AdminPlansPage = lazy(() => import("./pages/admin/AdminPlansPage"));
const AdminMentoriaDashboard = lazy(() => import("./pages/admin/AdminMentoriaDashboard"));
const AdminMentoriaAluno = lazy(() => import("./pages/admin/AdminMentoriaAluno"));
const AdminPatrulhamento = lazy(() => import("./pages/admin/AdminPatrulhamento"));
const AdminPatrulhamentoEditor = lazy(() => import("./pages/admin/AdminPatrulhamentoEditor"));
const AdminLawReferences = lazy(() => import("./pages/admin/AdminLawReferences"));
const MentoriaDashboard = lazy(() => import("./pages/mentoria/MentoriaDashboard"));
const MentoriaExecucao = lazy(() => import("./pages/mentoria/MentoriaExecucao"));
const MentoriaDesempenho = lazy(() => import("./pages/mentoria/MentoriaDesempenho"));
const PatrulhamentoDashboard = lazy(() => import("./pages/patrulhamento/PatrulhamentoDashboard"));
const PatrulhamentoFase = lazy(() => import("./pages/patrulhamento/PatrulhamentoFase"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof SecureContentError) {
          if (error.status >= 400 && error.status < 500) return false;
          return failureCount < 1;
        }
        return failureCount < 2;
      },
    },
  },
});

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
        <Suspense fallback={<div className="dark min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
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
          <Route path="/painel/normas" element={<ProtectedRoute><AdminRoute><AdminLawReferences /></AdminRoute></ProtectedRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
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
