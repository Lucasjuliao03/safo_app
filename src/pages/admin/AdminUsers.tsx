import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAdminUsers, useApproveUser, useBlockUser, useUpdateUserProfile, useAdminCourses, useAdminEdicts } from "@/hooks/useAdminData";
import { Check, X, Search, ShieldCheck, ShieldAlert, Edit2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminUsers() {
  const { data: users = [], isLoading } = useAdminUsers();
  const approveMutation = useApproveUser();
  const blockMutation = useBlockUser();
  const updateProfileM = useUpdateUserProfile();
  
  const { data: courses = [] } = useAdminCourses();
  const { data: edicts = [] } = useAdminEdicts(); // Todos editais
  
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCourseId, setEditCourseId] = useState<number | null>(null);
  const [editEditalId, setEditEditalId] = useState<number | null>(null);

  const startEdit = (user: any) => {
    setEditingId(user.id);
    setEditCourseId(user.courseId || null);
    setEditEditalId(user.editalId || null);
  };

  const handleSave = () => {
    if (editingId) {
      updateProfileM.mutate({ 
        id: editingId, 
        courseId: editCourseId, 
        editalId: editEditalId 
      });
      setEditingId(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestão de Usuários</h1>
            <p className="text-muted-foreground text-sm">Administre alunos, gerencie permissões e aprovações.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="border border-border bg-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-semibold">Usuário</th>
                  <th className="px-6 py-3 font-semibold">Cadastro</th>
                  <th className="px-6 py-3 font-semibold">Papel</th>
                  <th className="px-6 py-3 font-semibold">Vínculos (Curso / Edital)</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      Carregando usuários...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isEditing = editingId === user.id;
                    const cName = courses.find((c: any) => c.id === user.courseId)?.name || "Nenhum";
                    const eName = edicts.find((e: any) => e.id === user.editalId)?.name || "Padrão (Mais recente)";
                    
                    return (
                    <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="font-medium text-foreground">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1 font-semibold text-[10px] px-2 py-0.5 rounded-full",
                          user.role === "admin" ? "bg-primary/10 text-primary border border-primary/20" : "bg-muted text-muted-foreground"
                        )}>
                          {user.role === "admin" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                          {user.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {isEditing ? (
                          <div className="flex flex-col gap-1 w-48">
                            <select
                              value={editCourseId ?? ""}
                              onChange={e => {
                                setEditCourseId(e.target.value ? Number(e.target.value) : null);
                                setEditEditalId(null);
                              }}
                              className="text-xs p-1 rounded border border-border bg-card"
                            >
                              <option value="">Sem Curso</option>
                              {courses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select
                              value={editEditalId ?? ""}
                              onChange={e => setEditEditalId(e.target.value ? Number(e.target.value) : null)}
                              className="text-xs p-1 rounded border border-border bg-card"
                            >
                              <option value="">Edital Padrão (Mais recente)</option>
                              {edicts.filter((e: any) => e.course_id === editCourseId).map((e: any) => <option key={e.id} value={e.id}>{e.name} ({e.year})</option>)}
                            </select>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-foreground truncate max-w-[180px]">{cName}</span>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">Edital: {eName}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={cn(
                          "font-semibold text-[10px] px-2 py-0.5 rounded-full border",
                          user.isApproved
                            ? "bg-success/15 text-success border-success/20"
                            : "bg-warning/15 text-warning border-warning/20"
                        )}>
                          {user.accessBlocked ? 'Bloqueado' : user.isApproved ? "Aprovado" : "Pendente"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right space-x-2">
                        {user.role !== "admin" && (
                          <>
                            {!user.isApproved ? (
                              <button
                                onClick={() => approveMutation.mutate(user.id)}
                                disabled={approveMutation.isPending}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-success/10 text-success hover:bg-success hover:text-success-foreground transition-all disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" /> Liberar sem prazo
                              </button>
                            ) : (
                              <button
                                onClick={() => blockMutation.mutate(user.id)}
                                disabled={blockMutation.isPending}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" /> Bloquear
                              </button>
                            )}
                            {isEditing ? (
                              <button onClick={handleSave} className="p-1.5 text-success hover:bg-success/10 rounded-lg" title="Salvar">
                                <Save className="h-4 w-4" />
                              </button>
                            ) : (
                              <button onClick={() => startEdit(user)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg" title="Editar">
                                <Edit2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
