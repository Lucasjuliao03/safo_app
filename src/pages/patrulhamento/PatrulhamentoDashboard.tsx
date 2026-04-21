import React, { useMemo, useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { usePatrulhamentoTrilha, usePatrulhamentoProgresso } from '@/hooks/usePatrulhamento';
import { ShieldAlert, Crosshair, Lock, Star, ChevronLeft, Flag, Check, Zap, MapPin, User as UserIcon, Award } from 'lucide-react';
import { CourseSelector } from '@/components/CourseSelector';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUserAvatar, getAvatarUrlSync } from '@/hooks/useAvatar';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SUBJECT_UI_MAP, DEFAULT_ICON, DEFAULT_COLOR } from '@/hooks/useStudyData';

export default function PatrulhamentoDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const { data: userAvatarName } = useUserAvatar(user?.id);
  const avatarUrl = getAvatarUrlSync(userAvatarName || null);

  const courseId = user?.courseId ? Number(user.courseId) : null;
  const { data: campanhas, isLoading: loadingTrilha, error: errorTrilha, refetch: refetchTrilha } = usePatrulhamentoTrilha(courseId);
  const { data: progresso, isLoading: loadingProg, refetch: refetchProgresso } = usePatrulhamentoProgresso(user?.id, courseId);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Recupera o último mapa acessado usando localStorage para máxima resiliência entre abas/reloads
  const [selectedCampanhaId, setSelectedCampanhaId] = useState<number | null>(() => {
      const saved = localStorage.getItem('patrulha_active_campanha');
      return saved ? Number(saved) : null;
  });

  useEffect(() => {
      // Force sync in case of HMR or tricky routing
      const saved = localStorage.getItem('patrulha_active_campanha');
      if (saved && Number(saved) !== selectedCampanhaId) {
          setSelectedCampanhaId(Number(saved));
      }
  }, []);

  const handleSelectCampanha = (id: number | null) => {
      setSelectedCampanhaId(id);
      if (id) {
          localStorage.setItem('patrulha_active_campanha', String(id));
      } else {
          localStorage.removeItem('patrulha_active_campanha');
      }
  };

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
    
    // A próxima fase (ou 1 se não venceu nenhuma) DE CADA CAMPANHA separadamente
    const campaignNextFaseMap: Record<number, number | null> = {};
    
    campanhas.forEach(c => {
       const fasesOfCamp = c.setores?.flatMap(s => s.fases || []) || [];
       fasesOfCamp.sort((a,b) => a.ordem_global - b.ordem_global);
       
       let nFaseId = fasesOfCamp[0]?.id || null;
       for (let i = 0; i < fasesOfCamp.length; i++) {
           if (!vencidas.includes(fasesOfCamp[i].id)) {
               nFaseId = fasesOfCamp[i].id;
               break;
           }
       }
       // Se todas estao vencidas daquela campanha, o NxtFaseId daquela campanha aponta pra null (ou a ultima)
       campaignNextFaseMap[c.id] = nFaseId;
    });

    // Calcular campanhas e setores concluídos (medalhas)
    let completedCampaignsCount = 0;
    let completedSectorsCount = 0;

    campanhas.forEach(c => {
       const fIdsC = c.setores?.flatMap(s => s.fases?.map(f => f.id) || []) || [];
       if (fIdsC.length > 0 && fIdsC.every(fid => vencidas.includes(fid))) {
           completedCampaignsCount++;
       }

       c.setores?.forEach(s => {
          const fIdsS = s.fases?.map(f => f.id) || [];
          if (fIdsS.length > 0 && fIdsS.every(fid => vencidas.includes(fid))) {
             completedSectorsCount++;
          }
       });
    });
    
    return { allFases, campaignNextFaseMap, nextFaseId: null, vencidas, completedCampaignsCount, completedSectorsCount };

  }, [campanhas, progresso]);

  useEffect(() => {
    // Scroll após um pequeno delay para garantir renderização do DOM e imagens
    const timer = setTimeout(() => {
       if (scrollRef.current && selectedCampanhaId) {
         scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
       }
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedCampanhaId, mapData?.campaignNextFaseMap]);

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
                <div className="flex items-center gap-1.5 mt-0.5">
                   <p className="text-sm font-black text-foreground">Operação Ativa</p>
                   {((mapData?.completedSectorsCount ?? 0) > 0 || (mapData?.completedCampaignsCount ?? 0) > 0) && (
                      <div className="flex items-center gap-1.5 ml-2">
                         {(mapData?.completedSectorsCount ?? 0) > 0 && (
                            <div className="flex items-center gap-px bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20" title={`${mapData?.completedSectorsCount} Áreas Concluídas`}>
                               {Array.from({ length: mapData!.completedSectorsCount }).map((_, i) => (
                                  <Award key={`s_${i}`} className="w-3.5 h-3.5 text-primary fill-primary/20 drop-shadow-sm" />
                               ))}
                            </div>
                         )}
                         {(mapData?.completedCampaignsCount ?? 0) > 0 && (
                            <div className="flex items-center gap-px bg-warning/10 px-1.5 py-0.5 rounded-full border border-warning/20" title={`${mapData?.completedCampaignsCount} Campanhas Concluídas`}>
                               {Array.from({ length: mapData!.completedCampaignsCount }).map((_, i) => (
                                  <Star key={`c_${i}`} className="w-3.5 h-3.5 text-warning fill-warning drop-shadow-sm" />
                               ))}
                            </div>
                         )}
                      </div>
                   )}
                </div>
             </div>
           </div>
           
           <div className="flex items-center gap-3">
             <div className="flex items-center gap-1.5 bg-card border border-border px-3 py-1.5 rounded-full shadow-inner">
               <Zap className="w-3.5 h-3.5 text-warning fill-warning" />
               <span className="text-xs font-black text-foreground">{progresso?.xp_total || 0} XP</span>
             </div>
           </div>
        </header>

        {/* --- TELA DE SELEÇÃO DE MISSÃO --- */}
        {!selectedCampanhaId ? (
           <div className="pt-24 px-4 max-w-2xl mx-auto space-y-6 pb-20 mt-4">
              <div className="text-center mb-8">
                  <h1 className="text-2xl font-black text-foreground">Escolha sua Missão</h1>
                  <p className="text-muted-foreground text-sm mt-1">Qual matéria você vai dominar hoje?</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {campanhas?.map(camp => {
                      const titleStr = camp.titulo || "";
                      const mapInfo = SUBJECT_UI_MAP[titleStr] || { icon: DEFAULT_ICON, color: DEFAULT_COLOR };
                      const Icon = mapInfo.icon;
                      
                      const allCampFases = camp.setores?.flatMap((s: any) => s.fases?.map((f: any) => f.id) || []) || [];
                      const total = allCampFases.length;
                      const doneds = allCampFases.filter((fid: number) => mapData?.vencidas.includes(fid)).length;
                      const progressPct = total === 0 ? 0 : Math.round((doneds / total) * 100);
                      const isCompleted = total > 0 && total === doneds;
                      
                      const titleStrUpper = (camp.titulo || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                      
                      let bgImage = "";
                      if (titleStrUpper.includes("PORTUGUES")) bgImage = "/portugues.png";
                      else if (titleStrUpper.includes("DOUTRINA")) bgImage = "/doutrina.png";
                      else if (titleStrUpper.includes("JURIDICA")) bgImage = "/juridica.png";
                      else if (titleStrUpper.includes("INSTITUCIONAL")) bgImage = "/institucional.png";

                      return (
                          <button 
                             key={camp.id} 
                             onClick={() => handleSelectCampanha(camp.id)} 
                             className="group relative overflow-hidden rounded-xl border border-border/50 bg-card transition-all hover:border-primary/50 hover:scale-[1.02] active:scale-[0.98] text-left flex flex-col justify-end aspect-[3/4] sm:aspect-[4/5] object-top"
                          >
                               {/* Background Image / Overlay */}
                               {bgImage ? (
                                  <img 
                                      src={bgImage} 
                                      alt={camp.titulo} 
                                      className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-110" 
                                      onError={(e) => {
                                          const target = e.target as HTMLImageElement;
                                          target.style.display = 'none';
                                          // Se a imagem falhar, injetamos o título no content box como fallback nativo via JS, para não perder o hook render local
                                          const contentBox = target.parentElement?.querySelector('.fallback-title');
                                          if (contentBox) contentBox.classList.remove('hidden');
                                      }}
                                  />
                               ) : (
                                  <div className="absolute inset-0 w-full h-full bg-muted flex items-center justify-center opacity-30">
                                     <Icon className="w-24 h-24 text-muted-foreground" />
                                  </div>
                               )}
                               
                               {/* Subtle Gradient overlay só na parte inferior para o texto aparecer */}
                               <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>

                               {/* Content Box */}
                               <div className="relative z-10 p-5 w-full flex flex-col justify-end h-full">
                                   <div className="flex items-center justify-between gap-3 mb-2">
                                       <div className="flex-1 min-w-0">
                                           <h3 className={cn("font-black text-white leading-tight text-lg sm:text-xl pr-2 drop-shadow-md fallback-title", bgImage ? "hidden" : "block")}>{camp.titulo}</h3>
                                           <span className="text-xs text-white/70 font-medium uppercase tracking-widest block mt-0.5">{total} Fases</span>
                                       </div>
                                       {isCompleted && (
                                          <div className="w-8 h-8 rounded-full bg-warning/20 flex flex-col items-center justify-center shadow-lg border border-warning/50 flex-shrink-0 backdrop-blur-sm">
                                              <Star className="w-4 h-4 text-warning fill-warning drop-shadow-lg" />
                                          </div>
                                       )}
                                   </div>
                                   
                                   {/* Progress bar */}
                                   <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden backdrop-blur-md mt-2">
                                       <div className="h-full transition-all duration-1000 ease-in-out" style={{ width: `${progressPct}%`, backgroundColor: mapInfo.color }}></div>
                                   </div>
                                   <div className="mt-1.5 text-right font-medium">
                                       <span className="text-[10px] text-white/90 drop-shadow-sm">{progressPct}% Concluído</span>
                                   </div>
                               </div>
                          </button>
                      )
                  })}
              </div>
           </div>
        ) : (
           /* --- MAPA DA TRILHA DE UMA CAMPANHA ESCOLHIDA --- */
           <div className="pt-24 px-4 max-w-md mx-auto space-y-12">
               
               {/* Fixed Header Substitute for Back Navigation */}
               <div className="flex items-center justify-between mb-8 sticky top-[72px] z-40 bg-background/80 backdrop-blur-md py-2 px-1 rounded-full shadow-sm border border-border/30 w-fit">
                   <button onClick={() => handleSelectCampanha(null)} className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted py-2 px-4 rounded-full transition-colors">
                      <ChevronLeft className="w-5 h-5" /> Voltar ao Quartel Generel
                   </button>
               </div>

               {campanhas?.filter(c => c.id === selectedCampanhaId).map((campanha) => (
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
                               const isCompleted = mapData?.vencidas.includes(fase.id) || false;
                               const isNextActive = fase.id === mapData?.campaignNextFaseMap[campanha.id];
                               const isLocked = !isCompleted && !isNextActive;

                               // Zig-zag styling
                               let offsetClass = "";
                               if (i % 2 === 1) offsetClass = "-translate-x-6";
                               if (i % 4 === 3) offsetClass = "translate-x-6";

                               return (
                                  <div key={fase.id} ref={isNextActive ? scrollRef : null} className={cn("relative z-10 flex flex-col items-center", offsetClass)}>
                                      
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
        )}
      </div>
    </AppLayout>
  );
}
