import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { getAllUsers, approveUser, blockUser, deleteUser } from "@/services/authService";
import { useAdminCourses, useAdminEdicts, useAdminSubjects, useAdminEdictSubjects, useAddEdictSubject, useRemoveEdictSubject } from "@/hooks/useAdminData";
import { User } from "@/types/study";
import { Shield, Check, X, Users, RefreshCw, Trash2, Link2, BookOpen, GraduationCap, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

import AdminPlans from "./admin/AdminPlans";
import { Copy } from "lucide-react"; // Import something if needed

type Tab = "users" | "vincular" | "planos";

export default function AdminPage() {
  const { user: admin } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [activeDates, setActiveDates] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  // Vincular state
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedEdictId, setSelectedEdictId] = useState<number | null>(null);

  const { data: courses = [] } = useAdminCourses();
  const { data: edicts = [] } = useAdminEdicts(selectedCourseId ?? undefined);
  const { data: allSubjects = [] } = useAdminSubjects();
  const { data: edictSubjects = [] } = useAdminEdictSubjects(selectedEdictId ?? undefined);
  const addEdictSubject = useAddEdictSubject();
  const removeEdictSubject = useRemoveEdictSubject();

  const linkedSubjectIds = edictSubjects.map((es: any) => es.subject_id);

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true);
      const allUsers = await getAllUsers();
      const students = allUsers.filter((u) => u.role !== "admin");
      setUsers(students);
      const initialDates: Record<string, string> = {};
      students.forEach(s => {
        if (s.activeUntil) initialDates[s.id] = s.activeUntil.split('T')[0];
      });
      setActiveDates(initialDates);
      setLoading(false);
    }
    fetchUsers();
  }, [refreshKey]);

  const handleDateChange = (userId: string, val: string) => {
    setActiveDates(prev => ({ ...prev, [userId]: val }));
  };

  const handleApprove = async (userId: string) => {
    const val = activeDates[userId];
    const isoDate = val ? new Date(val).toISOString() : null;
    await approveUser(userId, isoDate);
    setRefreshKey((k) => k + 1);
  };

  const handleBlock = async (userId: string) => {
    await blockUser(userId);
    setRefreshKey((k) => k + 1);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Tem certeza que deseja EXCLUIR este usuário? Esta ação é irreversível.")) return;
    await deleteUser(userId);
    setRefreshKey((k) => k + 1);
  };

  const handleToggleSubject = (subjectId: number) => {
    if (!selectedEdictId) return;
    if (linkedSubjectIds.includes(subjectId)) {
      removeEdictSubject.mutate({ edictId: selectedEdictId, subjectId });
    } else {
      addEdictSubject.mutate({ edictId: selectedEdictId, subjectId });
    }
  };

  return (
    <AppLayout>
      <div className="px-4 pt-6 space-y-5 animate-slide-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Painel Admin</h1>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Atualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-muted p-1">
          <button
            onClick={() => setTab("users")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-all",
              tab === "users" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
            )}
          >
            <Users className="h-4 w-4" /> Usuários
          </button>
          <button
            onClick={() => setTab("vincular")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-all",
              tab === "vincular" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
            )}
          >
            <Link2 className="h-4 w-4" /> Vincular Matérias
          </button>
          <button
            onClick={() => setTab("planos")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-all",
              tab === "planos" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
            )}
          >
            <Copy className="h-4 w-4" /> Planos
          </button>
        </div>

        {/* ===== TAB: USERS ===== */}
        {tab === "users" && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Total de usuários</span>
              </div>
              <p className="text-3xl font-black text-primary">{users.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {users.filter((u) => u.isApproved).length} aprovados · {users.filter((u) => !u.isApproved).length} pendentes
              </p>
            </div>

            <h2 className="text-sm font-semibold text-foreground">Usuários Cadastrados</h2>
            {loading ? (
              <div className="rounded-2xl bg-card border border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">Carregando usuários...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-2xl bg-card border border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
              </div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="rounded-2xl bg-card border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground text-sm">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Cadastrado em: {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                      {u.courseId && (
                        <p className="text-[10px] text-primary mt-0.5">
                          Curso: {courses.find(c => c.id === u.courseId)?.name || `ID ${u.courseId}`}
                        </p>
                      )}
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full",
                      u.isApproved
                        ? "bg-success/15 text-success border border-success/20"
                        : "bg-warning/15 text-warning border border-warning/20"
                    )}>
                      {u.isApproved ? "Aprovado" : "Pendente"}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={activeDates[u.id] || ""}
                      onChange={(e) => handleDateChange(u.id, e.target.value)}
                      className="flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />

                    {!u.isApproved ? (
                      <button
                        onClick={() => handleApprove(u.id)}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-success/15 border border-success/25 px-3 py-2.5 text-xs font-semibold text-success active:scale-[0.97] transition-all"
                      >
                        <Check className="h-3 w-3" /> Aprovar
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleApprove(u.id)}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5 text-xs font-semibold text-primary active:scale-[0.97] transition-all"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => handleBlock(u.id)}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-destructive/15 border border-destructive/25 px-3 py-2.5 text-xs font-semibold text-destructive active:scale-[0.97] transition-all"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="flex items-center justify-center rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs font-semibold text-destructive active:scale-[0.97] transition-all"
                      title="Excluir usuário"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== TAB: VINCULAR MATÉRIAS ===== */}
        {tab === "vincular" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" /> Vincular Matérias ao Edital
              </h3>
              <p className="text-xs text-muted-foreground">
                Selecione o curso e o edital, depois marque as matérias que fazem parte. Apenas alunos desse curso verão essas matérias.
              </p>

              {/* Curso picker */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Curso</label>
                <select
                  value={selectedCourseId ?? ""}
                  onChange={(e) => {
                    setSelectedCourseId(e.target.value ? parseInt(e.target.value) : null);
                    setSelectedEdictId(null);
                  }}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none"
                >
                  <option value="">Selecione um curso...</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Edital picker */}
              {selectedCourseId && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Edital</label>
                  <select
                    value={selectedEdictId ?? ""}
                    onChange={(e) => setSelectedEdictId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none"
                  >
                    <option value="">Selecione um edital...</option>
                    {edicts.map((ed: any) => (
                      <option key={ed.id} value={ed.id}>{ed.name} ({ed.year})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Subject toggles */}
            {selectedEdictId && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-accent" /> Matérias Disponíveis
                </h4>
                {allSubjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma matéria cadastrada.</p>
                ) : (
                  allSubjects.map((sub: any) => {
                    const isLinked = linkedSubjectIds.includes(sub.id);
                    return (
                      <div
                        key={sub.id}
                        className={cn(
                          "flex items-center justify-between rounded-2xl border p-3.5 transition-all cursor-pointer active:scale-[0.98]",
                          isLinked
                            ? "bg-success/10 border-success/25"
                            : "bg-card border-border"
                        )}
                        onClick={() => handleToggleSubject(sub.id)}
                      >
                        <div>
                          <p className={cn("text-sm font-medium", isLinked ? "text-success" : "text-foreground")}>{sub.name}</p>
                          {sub.description && <p className="text-[10px] text-muted-foreground">{sub.description}</p>}
                        </div>
                        <div className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center",
                          isLinked ? "bg-success/20" : "bg-muted"
                        )}>
                          {isLinked
                            ? <Minus className="h-4 w-4 text-success" />
                            : <Plus className="h-4 w-4 text-muted-foreground" />
                          }
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB: PLANOS ===== */}
        {tab === "planos" && (
          <AdminPlans />
        )}
      </div>
    </AppLayout>
  );
}
