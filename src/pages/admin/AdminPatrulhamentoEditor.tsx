import React, { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { usePatrulhamentoTrilha } from '@/hooks/usePatrulhamento';
import { updatePatrulhaFase } from '@/services/patrulhamentoService';
import { ChevronLeft, ChevronDown, ChevronRight, Settings, Save, ShieldAlert, Target, BrainCircuit, Star, Type, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export default function AdminPatrulhamentoEditor() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { data: campanhas, isLoading, refetch } = usePatrulhamentoTrilha(Number(courseId));
  
  // Árvore open state
  const [openCampanhas, setOpenCampanhas] = useState<Record<number, boolean>>({});
  const [openSetores, setOpenSetores] = useState<Record<number, boolean>>({});

  // Foco do Editor
  const [selectedFase, setSelectedFase] = useState<any | null>(null);

  const toggleCampanha = (id: number) => setOpenCampanhas(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleSetor = (id: number) => setOpenSetores(prev => ({ ...prev, [id]: !prev[id] }));

  // Form State para a Fase
  const [editForm, setEditForm] = useState<any>({});
  
  const handleSelectFase = (fase: any) => {
      setSelectedFase(fase);
      // Fazer parse do JSON para facilitar a edição pelo admin
      const questionIdsRaw = fase.payload_json?.question_ids?.join(', ') || '';
      const fallbackTopicId = fase.payload_json?.topic_id || '';
      
      setEditForm({
          titulo: fase.titulo,
          descricao: fase.descricao || '',
          limite_itens: fase.limite_itens,
          req_acertos: fase.req_acertos,
          xp_reward: fase.xp_reward,
          specific_ids: questionIdsRaw,
          topic_id: fallbackTopicId
      });
  };

  const updateMutation = useMutation({
      mutationFn: async (data: any) => {
          if (!selectedFase) return;
          await updatePatrulhaFase(selectedFase.id, data);
      },
      onSuccess: () => {
          toast.success("Fase atualizada com sucesso!");
          refetch();
          setSelectedFase(null);
      },
      onError: (e: any) => {
          toast.error("Erro ao salvar: " + e.message);
      }
  });

  const handleSave = () => {
      if (!selectedFase) return;

      const payload = { ...selectedFase.payload_json };
      
      // Lidar com o overwrite de IDs
      if (editForm.specific_ids && editForm.specific_ids.trim() !== '') {
          const arr = editForm.specific_ids.split(',').map((id: string) => Number(id.trim())).filter(Number);
          payload.question_ids = arr;
      } else {
          // Remover restriction if empty
          delete payload.question_ids;
      }

      updateMutation.mutate({
          titulo: editForm.titulo,
          descricao: editForm.descricao,
          limite_itens: Number(editForm.limite_itens),
          req_acertos: Number(editForm.req_acertos),
          xp_reward: Number(editForm.xp_reward),
          payload_json: payload,
      });
  };

  if (isLoading) return <AdminLayout><div className="p-12 text-center animate-pulse">Carregando árvore de operações...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6 pb-20">
        <header className="flex items-center gap-4 border-b border-border pb-4">
           <button onClick={() => navigate('/painel/patrulhamento')} className="p-2 bg-muted hover:bg-border rounded-xl transition">
              <ChevronLeft className="w-5 h-5" />
           </button>
           <div>
              <h1 className="text-2xl font-black text-foreground">Editor de Rota: Curso #{courseId}</h1>
              <p className="text-muted-foreground text-sm">Visualize a árvore de progresso e ajuste parâmetros individuais das Fases.</p>
           </div>
        </header>

        <div className="flex flex-col md:flex-row gap-6">
            
            {/* Esquerda: Árvore Hierárquica */}
            <div className="flex-1 bg-card border border-border rounded-2xl shadow-sm p-4 max-h-[80vh] overflow-y-auto">
               <h3 className="font-bold uppercase tracking-widest text-xs text-muted-foreground mb-4">Mapeamento Tático</h3>
               
               <div className="space-y-3">
                  {!campanhas || campanhas.length === 0 ? (
                     <p className="text-muted-foreground text-sm">Nenhuma campanha neste mapa.</p>
                  ) : (
                     campanhas.map((camp: any) => (
                        <div key={camp.id} className="border border-border/50 rounded-xl overflow-hidden">
                           <div 
                              onClick={() => toggleCampanha(camp.id)}
                              className="bg-muted px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/80 transition select-none"
                           >
                              <div className="font-bold flex items-center gap-2">
                                  {openCampanhas[camp.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  {camp.titulo}
                              </div>
                              <span className="text-xs bg-background px-2 py-0.5 rounded-full border border-border">{camp.setores?.length || 0} Setores</span>
                           </div>

                           {openCampanhas[camp.id] && (
                              <div className="p-2 space-y-2 bg-background">
                                  {camp.setores?.map((setor: any) => (
                                      <div key={setor.id} className="border border-border/30 rounded-lg ml-4">
                                          <div 
                                             onClick={() => toggleSetor(setor.id)}
                                             className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition select-none"
                                          >
                                               <div className="text-sm font-semibold flex items-center gap-2 text-primary">
                                                  {openSetores[setor.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                  {setor.titulo}
                                               </div>
                                               <span className="text-[10px] uppercase font-bold text-muted-foreground">{setor.fases?.length || 0} Nós</span>
                                          </div>

                                          {openSetores[setor.id] && (
                                              <div className="p-2 pt-0 space-y-1 bg-muted/10">
                                                  {setor.fases?.map((fase: any) => (
                                                      <div 
                                                         key={fase.id}
                                                         onClick={() => handleSelectFase(fase)}
                                                         className={cn(
                                                             "flex items-center justify-between p-2 pl-6 rounded cursor-pointer transition border border-transparent text-sm hover:bg-card hover:border-border",
                                                             selectedFase?.id === fase.id && "bg-primary/10 border-primary/30 shadow-sm"
                                                         )}
                                                      >
                                                          <div className="flex items-center gap-2">
                                                              {fase.tipo_fase === 'teoria' && <Type className="w-3.5 h-3.5 text-muted-foreground" />}
                                                              {fase.tipo_fase === 'questoes' && <Target className="w-3.5 h-3.5 text-warning" />}
                                                              {fase.tipo_fase === 'flashcards' && <Star className="w-3.5 h-3.5 text-success" />}
                                                              {fase.tipo_fase === 'checkpoint' && <ShieldAlert className="w-3.5 h-3.5 text-destructive" />}
                                                              <span className={cn("truncate max-w-[180px]", selectedFase?.id === fase.id && "font-bold text-primary")}>
                                                                 {fase.titulo}
                                                              </span>
                                                          </div>
                                                          {fase.payload_json?.question_ids && (
                                                              <span className="bg-destructive/10 text-destructive text-[9px] font-black uppercase px-1.5 rounded">Engessado</span>
                                                          )}
                                                      </div>
                                                  ))}
                                              </div>
                                          )}
                                      </div>
                                  ))}
                              </div>
                           )}
                        </div>
                     ))
                  )}
               </div>
            </div>

            {/* Direita: Editor Visual da Fase */}
            <div className="flex-1 bg-card border border-primary/20 rounded-2xl shadow-xl shadow-primary/5 p-6 h-fit sticky top-24">
                {!selectedFase ? (
                   <div className="h-48 flex flex-col items-center justify-center text-muted-foreground/50">
                       <Settings className="w-12 h-12 mb-2 opacity-50" />
                       <p>Selecione um nó (Fase) à esquerda para editá-lo.</p>
                   </div>
                ) : (
                   <div className="space-y-5 animate-fade-in">
                       <div className="flex items-center gap-3 border-b border-border pb-3">
                           <div className="bg-primary/20 p-2 rounded-xl text-primary"><Settings className="w-5 h-5" /></div>
                           <div>
                               <h2 className="font-black text-lg leading-tight">Configuração da Fase</h2>
                               <p className="text-xs uppercase font-bold text-muted-foreground">ID Interno: {selectedFase.id} | Tipo: {selectedFase.tipo_fase}</p>
                           </div>
                       </div>

                       <div className="space-y-4">
                           <div className="space-y-1">
                               <label className="text-xs font-bold uppercase text-muted-foreground">Título de Exibição</label>
                               <Input value={editForm.titulo} onChange={e => setEditForm({...editForm, titulo: e.target.value})} className="bg-muted/50 font-bold" />
                           </div>
                           
                           <div className="space-y-1">
                               <label className="text-xs font-bold uppercase text-muted-foreground">Ordem de Operação (Descritivo)</label>
                               <Textarea value={editForm.descricao} onChange={e => setEditForm({...editForm, descricao: e.target.value})} rows={2} className="resize-none text-sm bg-muted/50" />
                           </div>

                           <div className="grid grid-cols-3 gap-3">
                               <div className="space-y-1">
                                   <label className="text-[10px] font-bold uppercase text-muted-foreground opacity-70">XP Recompensa</label>
                                   <Input type="number" value={editForm.xp_reward} onChange={e => setEditForm({...editForm, xp_reward: e.target.value})} />
                               </div>
                               <div className="space-y-1">
                                   <label className="text-[10px] font-bold uppercase text-warning opacity-70">Total de Itens (Sort)</label>
                                   <Input type="number" value={editForm.limite_itens} onChange={e => setEditForm({...editForm, limite_itens: e.target.value})} disabled={selectedFase.tipo_fase === 'teoria'} />
                               </div>
                               <div className="space-y-1">
                                   <label className="text-[10px] font-bold uppercase text-destructive opacity-70">Mín. Acertos (Passe)</label>
                                   <Input type="number" value={editForm.req_acertos} onChange={e => setEditForm({...editForm, req_acertos: e.target.value})} disabled={selectedFase.tipo_fase === 'teoria'} />
                               </div>
                           </div>

                           <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-xl space-y-2 mt-4 relative overflow-hidden">
                               <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none"><Lock className="w-20 h-20" /></div>
                               <h3 className="text-sm font-black text-destructive">Trava de ID Específico (Engessamento)</h3>
                               <p className="text-[11px] text-muted-foreground leading-relaxed pr-8">
                                   Se deixar vazio, puxaremos `limite_itens` aleatórios do Tema Base ({editForm.topic_id || 'Nenhum'}).
                                   Para forçar essa fase a mostrar APENAS IDs de questões ou flashcards imutáveis, digite-os separados por vírgula (ex: `10, 45, 91`).
                               </p>
                               <Input 
                                  placeholder="Vazio = Aleatório baseado no Tema" 
                                  value={editForm.specific_ids} 
                                  onChange={e => setEditForm({...editForm, specific_ids: e.target.value})} 
                                  className="font-mono text-sm border-destructive/30 focus-visible:ring-destructive"
                               />
                           </div>
                       </div>

                       <Button 
                          onClick={handleSave} 
                          disabled={updateMutation.isPending}
                          className="w-full mt-4 h-12 font-bold text-base shadow-xl"
                       >
                          {updateMutation.isPending ? "Salvando Alteração..." : <><Save className="w-5 h-5 mr-2" /> Salvar Configuração</>}
                       </Button>
                   </div>
                )}
            </div>

        </div>
      </div>
    </AdminLayout>
  );
}
