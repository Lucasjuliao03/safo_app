import React, { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAutoBuildPatrulhamento } from '@/hooks/usePatrulhamento';
import { Crosshair, Map, ShieldAlert, Cpu, Edit3 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

export default function AdminPatrulhamento() {
  const buildMutation = useAutoBuildPatrulhamento();

  // Buscar todos os cursos e contar quantas Campanhas e Fases cada um tem
  const { data: cursoStats, refetch, isLoading } = useQuery({
    queryKey: ['admin_patrulhamento_stats'],
    queryFn: async () => {
      const { data: courses, error: errC } = await supabase.from('courses').select('id, name, description').order('name');
      if (errC) throw errC;

      const { data: camps, error: errCamp } = await supabase.from('patrulhamento_campanhas').select('course_id, id');
      if (errCamp) throw errCamp;

      // Calcular arrays
      const stats = courses.map(course => {
         const courseCamps = camps.filter(c => c.course_id === course.id);
         return {
            ...course,
            hasTrilha: courseCamps.length > 0,
            campCount: courseCamps.length
         };
      });

      return stats;
    }
  });

  const handleBuild = async (courseId: number, courseName: string) => {
    if (!confirm(`Gerar trilha para o curso "${courseName}"?\nSe já existir uma trilha, ela será apagada e reconstruída.`)) return;
    try {
      await buildMutation.mutateAsync(courseId);
      toast.success(`Trilha gerada com sucesso para ${courseName}!`);
      refetch();
    } catch(e: any) {
      toast.error("Erro ao gerar: " + e.message);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-wider mb-2 text-sm">
            <Map className="w-5 h-5" />
            <p>Engenharia Pedagógica</p>
          </div>
          <h1 className="text-3xl font-black text-foreground">Construtor de Patrulhamento</h1>
          <p className="text-muted-foreground mt-1 text-sm bg-muted/50 p-3 rounded-lg border border-border inline-block">
            Gerencie os Mapas Gamificados. O motor automático constrói toda a trilha linear lendo as matérias e temas de cada curso escolhido.
          </p>
        </header>

        {isLoading ? (
           <div className="text-center p-12 text-muted-foreground animate-pulse">Carregando batalhões (cursos)...</div>
        ) : (
           <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cursoStats?.map(course => (
                 <div key={course.id} className="bg-card border border-border rounded-3xl p-5 shadow-sm hover:border-primary/50 transition-all flex flex-col justify-between">
                    <div>
                       <div className="flex items-start justify-between mb-3">
                          <div className={cn(
                             "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner",
                             course.hasTrilha ? "bg-primary/20 text-primary border border-primary/30" : "bg-muted text-muted-foreground border border-border"
                          )}>
                             <Crosshair className="w-6 h-6" />
                          </div>
                          {course.hasTrilha ? (
                             <span className="text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success px-2 py-1 rounded">Mapa Ativo</span>
                          ) : (
                             <span className="text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning px-2 py-1 rounded">Sem Mapa</span>
                          )}
                       </div>
                       <h3 className="font-bold text-foreground text-lg leading-tight mb-1">{course.name}</h3>
                       <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed mb-4">{course.description || "Sem descrição"}</p>
                    </div>

                    <div className="mt-auto space-y-3 pt-4 border-t border-border">
                       {course.hasTrilha && (
                          <>
                             <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground bg-muted/50 p-2 rounded-xl mb-2">
                                <span>Grandes Setores:</span>
                                <span className="text-foreground">{course.campCount} Operações</span>
                             </div>

                             <Link
                                to={`/painel/patrulhamento/${course.id}`}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs bg-primary text-primary-foreground active:scale-95 shadow-md shadow-primary/20 mb-2"
                             >
                                <Edit3 className="w-4 h-4" />
                                Refinamento Fino (Editar)
                             </Link>
                          </>
                       )}

                       <button
                          onClick={() => handleBuild(course.id, course.name)}
                          disabled={buildMutation.isPending}
                          className={cn(
                             "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-all outline outline-1 outline-border",
                             course.hasTrilha 
                                ? "bg-muted text-foreground hover:bg-destructive/10 hover:text-destructive hover:outline-destructive" 
                                : "bg-primary text-primary-foreground active:scale-95 shadow-md shadow-primary/20 outline-primary"
                          )}
                       >
                          <Cpu className="w-4 h-4" />
                          {course.hasTrilha ? "Destruir e Regerar Modo I.A" : "Auto-Construir Mapa"}
                       </button>
                    </div>
                 </div>
              ))}
           </div>
        )}
      </div>
    </AdminLayout>
  );
}
