import React, { useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { usePatrulhamentoTrilha, usePatrulhamentoProgresso } from '@/hooks/usePatrulhamento';
import { ShieldAlert, Crosshair, Lock, Star, ChevronLeft, Flag, Check, Zap, MapPin, User as UserIcon } from 'lucide-react';
import { CourseSelector } from '@/components/CourseSelector';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUserAvatar, getAvatarUrlSync } from '@/hooks/useAvatar';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function PatrulhamentoDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const { data: userAvatarName } = useUserAvatar(user?.id);
  const avatarUrl = getAvatarUrlSync(userAvatarName || null);

  const courseId = user?.courseId ? Number(user.courseId) : null;
  const { data: campanhas, isLoading: loadingTrilha, error: errorTrilha, refetch: refetchTrilha } = usePatrulhamentoTrilha(courseId);
  const { data: progresso, isLoading: loadingProg, refetch: refetchProgresso } = usePatrulhamentoProgresso(user?.id, courseId);

  // Processar mapa e definir a próxima fase disponível global (foco do mapa)
  const mapData = useMemo(() => {
    if (!campanhas || campanhas.length === 0) return null;
    
    // Todas as fases ordenadas para saber quem desbloqueia
    const allFases: any[] = [];
    campanhas.forEach(c => {
      c.setores?.forEach(s => {
        s.fases?.forEach(f => {
          allFases.push(f);
        });
      });
    });
    // sort asc just in case
    allFases.sort((a,b) => a.ordem_global - b.ordem_global);

    const vencidas = progresso?.fases_vencidas || [];
    
    // A próxima fase (ou 1 se não venceu nenhuma)
    let nextFaseId = allFases[0]?.id;
    for (let i = 0; i < allFases.length; i++) {
        if (!vencidas.includes(allFases[i].id)) {
            nextFaseId = allFases[i].id;
            break;
        }
    }
    
    return { allFases, nextFaseId, vencidas };

  }, [campanhas, progresso]);

  if (loadingTrilha || loadingProg) {
    return <AppLayout><div className="flex h-screen items-center justify-center animate-pulse text-muted-foreground font-bold uppercase tracking-widest text-xs">Carregando Rota...</div></AppLayout>;
  }

  // Se o aluno (ou admin) não selecionou nenhum curso ainda, obriga a selecionar
  if (!courseId) {
    return (
      <AppLayout>
        <div className="pt-10 px-4 max-w-md mx-auto">
          <CourseSelector 
             currentCourseId={undefined} 
             onSelect={() => window.location.reload()} 
          />
        </div>
      </AppLayout>
    );
  }

  // Se não houver curso ou não houver trilha (e o aluno não for admin que pode gerar), mostramos aviso
  if (!mapData) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center p-8 mt-20 text-center space-y-4">
          <ShieldAlert className="h-16 w-16 text-warning mx-auto opacity-50" />
          <h2 className="text-xl font-bold">Rota Indisponível</h2>
          <p className="text-sm text-muted-foreground">A coordenação pedagógica ainda não estabeleceu o mapa de operações para o seu batalhão (curso).</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="relative min-h-screen pb-32 overflow-hidden bg-background">
        
        {/* Top Header Fixado - Status XP */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border py-3 px-4 flex justify-between items-center shadow-sm max-w-lg mx-auto">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-full bg-primary/20 flex flex-col items-center justify-center text-primary font-bold">
               <Crosshair className="w-4 h-4" />
             </div>
             <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none tracking-widest">Seu Setor</p>
                <p className="text-sm font-black text-foreground">Operação Ativa</p>
             </div>
           </div>
           
           <div className="flex items-center gap-3">
             <div className="flex items-center gap-1.5 bg-card border border-border px-3 py-1.5 rounded-full shadow-inner">
               <Zap className="w-3.5 h-3.5 text-warning fill-warning" />
               <span className="text-xs font-black text-foreground">{progresso?.xp_total || 0} XP</span>
             </div>
           </div>
        </header>

        {/* --- MAPA DA TRILHA --- */}
        <div className="pt-24 px-4 max-w-md mx-auto space-y-12">

            {campanhas?.map((campanha) => (
                <div key={campanha.id} className="space-y-10">
                   
                   {/* Banner da Campanha */}
                   <div className="bg-gradient-to-br from-card to-muted border border-border p-5 rounded-[2rem] shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                         <Flag className="w-24 h-24" />
                      </div>
                      <h2 className="text-[10px] uppercase font-black tracking-widest text-primary mb-1">Campanha {campanha.ordem}</h2>
                      <h3 className="text-xl font-black text-foreground">{campanha.titulo}</h3>
                      <p className="text-xs text-muted-foreground mt-2 inline-block max-w-[80%] leading-relaxed">{campanha.descricao}</p>
                   </div>

                   {campanha.setores?.map((setor) => (
                      <div key={setor.id} className="relative pt-6">
                         
                         {/* Linha divisória Setor */}
                         <div className="flex items-center justify-center gap-3 mb-12 relative z-10 sticky top-[70px]">
                            <div className="h-[1px] flex-1 bg-border/50"></div>
                            <span className="bg-card text-foreground px-4 py-2 rounded-full border border-border/50 text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-2">
                               <MapPin className="w-3 h-3 text-primary" /> {setor.titulo}
                            </span>
                            <div className="h-[1px] flex-1 bg-border/50"></div>
                         </div>

                         {/* Nós (Fases) do Setor */}
                         <div className="flex flex-col items-center gap-6 relative">
                            {/* SVG de Linha Conectora (Fica no fundo passando por trás de tudo) */}
                            <div className="absolute top-0 bottom-0 left-1/2 w-2 bg-muted-foreground/10 -translate-x-1/2 rounded-full z-0"></div>

                            {setor.fases?.map((fase, i) => {
                               const isCompleted = mapData.vencidas.includes(fase.id);
                               const isNextActive = fase.id === mapData.nextFaseId;
                               const isLocked = !isCompleted && !isNextActive;

                               // Zig-zag styling
                               let offsetClass = "";
                               if (i % 2 === 1) offsetClass = "-translate-x-6";
                               if (i % 4 === 3) offsetClass = "translate-x-6";

                               return (
                                  <div key={fase.id} className={cn("relative z-10 flex flex-col items-center", offsetClass)}>
                                      
                                      {/* Balão do Título da Fase e AVATAR do Aluno */}
                                      {isNextActive && (
                                         <div className="absolute -top-16 flex flex-col items-center animate-bounce z-20">
                                            {/* Avatar do Jogador */}
                                            <Avatar className="w-14 h-14 border-4 border-primary shadow-[0_0_20px_rgba(var(--primary),0.6)] mb-2 ring-2 ring-background z-30 relative">
                                              <AvatarImage src={avatarUrl} className="object-cover" />
                                              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-black">
                                                {user?.name?.substring(0, 2).toUpperCase() || 'OG'}
                                              </AvatarFallback>
                                            </Avatar>
                                            <div className="bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1.5 rounded-xl shadow-lg whitespace-nowrap after:content-[''] after:absolute after:-bottom-1 after:left-1/2 after:-translate-x-1/2 after:border-solid after:border-t-primary after:border-t-4 after:border-x-transparent after:border-x-4 after:border-b-0">
                                               {fase.titulo}
                                            </div>
                                         </div>
                                      )}

                                      <button 
                                        onClick={() => !isLocked && navigate(`/patrulhamento/fase/${fase.id}`)}
                                        disabled={isLocked}
                                        className={cn(
                                          "w-16 h-16 rounded-full flex items-center justify-center border-[4px] shadow-lg transition-all",
                                          isCompleted  ? "bg-success border-success text-success-foreground" :
                                          isNextActive ? "bg-muted border-primary text-primary active:scale-95 shadow-primary/30 ring-4 ring-primary/20" :
                                                         "bg-muted border-muted-foreground/30 text-muted-foreground/50 cursor-not-allowed"
                                        )}
                                      >
                                          {isCompleted ? <Check className="w-8 h-8 stroke-[3]" /> :
                                           isLocked    ? <Lock className="w-6 h-6" /> :
                                           fase.tipo_fase === 'checkpoint' ? <ShieldAlert className="w-7 h-7 stroke-[2.5] text-primary" /> :
                                           <Star className="w-7 h-7 stroke-[2.5]" />}
                                      </button>

                                      {/* Info Extra - Somente para marcadores importantes como checkpoint */}
                                      {fase.tipo_fase === 'checkpoint' && !isCompleted && (
                                         <div className="mt-2 text-center w-full max-w-[120px]">
                                            <p className="text-[10px] font-bold uppercase text-warning">Chefe de Setor</p>
                                         </div>
                                      )}
                                  </div>
                               );
                            })}
                         </div>
                      </div>
                   ))}
                </div>
            ))}
        </div>
      </div>
    </AppLayout>
  );
}
