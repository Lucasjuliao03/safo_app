import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAdminMentoringStudents, useAdminActivateMentoria } from "@/hooks/useMentoriaData";
import { useAdminUsers } from "@/hooks/useAdminData";
import { useAuth } from "@/contexts/AuthContext";
import { Search, Target, ChevronRight, Activity, Clock, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function AdminMentoriaDashboard() {
  const { user: adminUser } = useAuth();
  const { data: alunos = [], isLoading } = useAdminMentoringStudents();
  const { data: allUsers = [], isLoading: isLoadingUsers } = useAdminUsers();
  const activateMutation = useAdminActivateMentoria();

  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  // Map local profiles instead of relying on ambiguous SQL joins
  const alunosWithProfiles = alunos.map((a: any) => {
    const userProfile = allUsers.find(u => u.id === a.user_id);
    return {
      ...a,
      user_profile: {
        full_name: userProfile?.name || 'Sem Nome',
        username: userProfile?.email || ''
      }
    };
  });

  const filteredAlunos = alunosWithProfiles.filter((a: any) => 
    a.user_profile?.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    a.user_profile?.username?.toLowerCase().includes(search.toLowerCase())
  );

  // Find users not yet in mentoria
  const nonMentoredUsers = allUsers.filter(u => !alunos.some((ma: any) => ma.user_id === u.id));
  const filteredNonMentored = nonMentoredUsers.filter(u => 
    u.name?.toLowerCase().includes(addSearch.toLowerCase()) || 
    u.email?.toLowerCase().includes(addSearch.toLowerCase())
  );

  const handleActivate = (userId: string) => {
    if (!adminUser) return;
    activateMutation.mutate({ userId, mentorId: adminUser.id }, {
      onSuccess: () => {
        toast.success("Aluno vinculado à Mentoria VIP!");
        setShowAddModal(false);
      }
    });
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 relative">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestão de Mentoria</h1>
            <p className="text-muted-foreground text-sm">Controle as estratégias, metas e desempenho dos alunos VIP.</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar aluno VIP..."
                className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-primary text-primary-foreground p-2 rounded-lg hover:opacity-90 flex items-center justify-center shrink-0"
              title="Vincular Aluno à Mentoria"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal de Adição */}
        {showAddModal && (
          <div className="absolute top-20 right-6 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95">
             <div className="flex items-center justify-between p-3 border-b border-border bg-muted/50">
                <span className="font-bold text-sm">Adicionar à Mentoria</span>
                <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
             </div>
             <div className="p-3">
               <input
                 type="text"
                 placeholder="Buscar por e-mail ou nome..."
                 className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-xs focus:outline-primary mb-3"
                 value={addSearch}
                 onChange={(e) => setAddSearch(e.target.value)}
               />
               <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                 {isLoadingUsers ? (
                   <p className="text-xs text-center text-muted-foreground p-4">Carregando...</p>
                 ) : filteredNonMentored.length === 0 ? (
                   <p className="text-xs text-center text-muted-foreground p-4">Nenhum aluno disponível.</p>
                 ) : (
                   filteredNonMentored.slice(0, 20).map(u => (
                     <div key={u.id} className="flex flex-col gap-1 p-2 border border-border rounded-lg hover:border-primary/50 transition-colors bg-muted/20">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 pr-2">
                             <p className="text-xs font-bold truncate text-foreground">{u.name}</p>
                             <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                          </div>
                          <button 
                            onClick={() => handleActivate(u.id)}
                            disabled={activateMutation.isPending}
                            className="text-[10px] bg-primary text-primary-foreground px-2 py-1 rounded font-bold hover:opacity-90 shrink-0"
                          >
                            Vincular
                          </button>
                        </div>
                     </div>
                   ))
                 )}
               </div>
             </div>
          </div>
        )}

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
                        <div className="font-medium text-foreground">{aluno.user_profile?.full_name || "Sem Nome"}</div>
                        <div className="text-xs text-muted-foreground">{aluno.user_profile?.username}</div>
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
