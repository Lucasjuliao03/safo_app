import { AppLayout } from "@/components/AppLayout";
import { BookOpenIcon, Layers, FileText, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Estudos() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="px-4 pt-6 space-y-6 animate-fade-in pb-20 max-w-lg mx-auto">
        <div>
          <h1 className="text-2xl font-black text-foreground mb-1">Sala de Estudos</h1>
          <p className="text-sm text-muted-foreground">Escolha o seu método de estudo agora.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 mt-8">
          <button onClick={() => navigate("/questoes")}
            className="flex flex-col items-start p-5 rounded-2xl bg-card border border-border hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-[0.98] group text-left relative overflow-hidden">
            <div className="absolute right-[-20px] top-[-20px] opacity-[0.03] group-hover:opacity-10 transition-opacity">
               <BookOpenIcon className="w-40 h-40" />
            </div>
            <div className="flex w-full items-center justify-between mb-3 relative">
               <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20">
                 <BookOpenIcon className="h-6 w-6 text-primary" />
               </div>
               <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="font-bold text-lg text-foreground relative">Banco de Questões</span>
            <span className="text-xs text-muted-foreground mt-1 relative">Treine com milhares de questões focadas no seu edital.</span>
          </button>

          <button onClick={() => navigate("/flashcards")}
            className="flex flex-col items-start p-5 rounded-2xl bg-card border border-border hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-[0.98] group text-left relative overflow-hidden">
            <div className="absolute right-[-20px] top-[-20px] opacity-[0.03] group-hover:opacity-10 transition-opacity">
               <Layers className="w-40 h-40" />
            </div>
            <div className="flex w-full items-center justify-between mb-3 relative">
               <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20">
                 <Layers className="h-6 w-6 text-primary" />
               </div>
               <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="font-bold text-lg text-foreground relative">Flashcards Inteligentes</span>
            <span className="text-xs text-muted-foreground mt-1 relative">Memorize rápido com repetição espaçada.</span>
          </button>

          <button onClick={() => navigate("/resumos")}
            className="flex flex-col items-start p-5 rounded-2xl bg-card border border-border hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-[0.98] group text-left relative overflow-hidden">
            <div className="absolute right-[-20px] top-[-20px] opacity-[0.03] group-hover:opacity-10 transition-opacity">
               <FileText className="w-40 h-40" />
            </div>
            <div className="flex w-full items-center justify-between mb-3 relative">
               <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20">
                 <FileText className="h-6 w-6 text-primary" />
               </div>
               <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="font-bold text-lg text-foreground relative">Resumos Teóricos</span>
            <span className="text-xs text-muted-foreground mt-1 relative">Acesse mapas mentais e pílulas de conhecimento.</span>
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
