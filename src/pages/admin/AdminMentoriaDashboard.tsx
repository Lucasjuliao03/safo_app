import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAdminMentoringStudents } from "@/hooks/useMentoriaData";
import { Search, Target, ChevronRight, Activity, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

export default function AdminMentoriaDashboard() {
  const { data: alunos = [], isLoading } = useAdminMentoringStudents();
  const [search, setSearch] = useState("");

  const filteredAlunos = alunos.filter((a: any) => 
    a.profiles?.name?.toLowerCase().includes(search.toLowerCase()) || 
    a.profiles?.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestão de Mentoria</h1>
            <p className="text-muted-foreground text-sm">Controle as estratégias, metas e desempenho dos alunos VIP.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar aluno..."
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
           <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Alunos Ativos</p>
                <p className="text-2xl font-bold">{alunos.filter((a: any) => a.status === 'active').length}</p>
              </div>
              <div className="bg-primary/10 p-3 rounded-xl"><Target className="h-6 w-6 text-primary" /></div>
           </div>
           
           <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Alertas Abertos</p>
                <p className="text-2xl font-bold text-warning">0</p>
              </div>
              <div className="bg-warning/10 p-3 rounded-xl"><Activity className="h-6 w-6 text-warning" /></div>
           </div>
           
           <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between opacity-50">
              <div>
                 <p className="text-muted-foreground text-sm">Taxa de Adesão Média</p>
                 <p className="text-2xl font-bold">--</p>
              </div>
              <div className="bg-muted p-3 rounded-xl"><Clock className="h-6 w-6 text-muted-foreground" /></div>
           </div>
        </div>

        <div className="border border-border bg-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-semibold">Aluno</th>
                  <th className="px-6 py-3 font-semibold">Início</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">Carregando alunos...</td></tr>
                ) : filteredAlunos.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">Nenhum registro encontrado.</td></tr>
                ) : (
                  filteredAlunos.map((aluno: any) => (
                    <tr key={aluno.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{aluno.profiles?.name || "Sem Nome"}</div>
                        <div className="text-xs text-muted-foreground">{aluno.profiles?.email}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {new Date(aluno.started_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-4">
                         <span className={cn(
                           "font-semibold text-[10px] px-2 py-0.5 rounded-full border",
                           aluno.status === 'active' ? "bg-success/15 text-success border-success/20" : "bg-muted text-muted-foreground border-border"
                         )}>
                           {aluno.status.toUpperCase()}
                         </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <Link 
                           to={`/painel/mentoria/aluno/${aluno.user_id}`}
                           className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
                         >
                           Desempenho <ChevronRight className="h-3.5 w-3.5" />
                         </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
