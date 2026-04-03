import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";
import {
  Send,
  Users,
  User,
  Bell,
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  is_approved: boolean;
  course_id?: number | null;
}

interface NotificationLog {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
}

type TargetMode = "all" | "select" | "course";

export default function AdminPush() {
  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Data state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [subscribedUserIds, setSubscribedUserIds] = useState<Set<string>>(new Set());
  const [recentLogs, setRecentLogs] = useState<NotificationLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Stats
  const [totalSubscribed, setTotalSubscribed] = useState(0);

  // Carregar usuários e subscriptions
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoadingUsers(true);

    // Buscar cursos
    const { data: coursesData } = await supabase
      .from("courses")
      .select("id, title")
      .order("title");
    setCourses(coursesData || []);

    // Buscar usuários
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, username, role, is_active, course_id")
      .order("full_name");

    // Mapear para o formato local, excluindo admins
    const mappedUsers: UserProfile[] = (profiles || [])
      .filter((p: any) => p.role !== "admin")
      .map((p: any) => ({
        id: p.id,
        name: p.full_name || "Sem nome",
        email: p.username || "",
        is_approved: p.is_active,
        course_id: p.course_id,
      }));

    // Buscar quem tem push ativo
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("user_id")
      .eq("is_active", true);

    const subIds = new Set<string>(subs?.map((s: any) => s.user_id) || []);
    setSubscribedUserIds(subIds);
    setTotalSubscribed(subIds.size);
    setUsers(mappedUsers);

    // Buscar logs recentes
    const { data: logs } = await supabase
      .from("notification_logs")
      .select("*")
      .eq("notification_type", "custom")
      .order("created_at", { ascending: false })
      .limit(20);

    setRecentLogs(logs || []);
    setLoadingUsers(false);
  }

  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAll = () => {
    const subscribedFiltered = filteredUsers.filter((u) =>
      subscribedUserIds.has(u.id)
    );
    setSelectedUserIds(subscribedFiltered.map((u) => u.id));
  };

  const deselectAll = () => setSelectedUserIds([]);

  // Enviar push
  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Preencha o título e a mensagem.");
      return;
    }

    if (targetMode === "select" && selectedUserIds.length === 0) {
      toast.error("Selecione pelo menos um usuário.");
      return;
    }

    if (targetMode === "course" && !selectedCourseId) {
      toast.error("Selecione um curso.");
      return;
    }

    let targetUsers: string[] = [];
    
    if (targetMode === "all") {
      targetUsers = users.filter((u) => subscribedUserIds.has(u.id)).map((u) => u.id);
    } else if (targetMode === "course") {
      targetUsers = users
        .filter((u) => u.course_id === parseInt(selectedCourseId) && subscribedUserIds.has(u.id))
        .map((u) => u.id);
    } else {
      targetUsers = selectedUserIds;
    }

    if (targetUsers.length === 0) {
      toast.error("Nenhum usuário com push ativado para enviar neste filtro.");
      return;
    }

    const confirmMsg =
      targetMode === "all"
        ? `Enviar para TODOS os ${targetUsers.length} usuários com push ativo?`
        : targetMode === "course"
        ? `Enviar para ${targetUsers.length} usuário(s) do curso selecionado?`
        : `Enviar para ${targetUsers.length} usuário(s) selecionado(s)?`;

    if (!confirm(confirmMsg)) return;

    setIsSending(true);
    let totalSent = 0;
    let totalFailed = 0;

    try {
      for (const userId of targetUsers) {
        try {
          const { data, error } = await supabase.functions.invoke("send-push", {
            body: {
              user_id: userId,
              title: title.trim(),
              body: body.trim(),
              url: url.trim() || "/",
              type: "custom",
            },
          });

          if (error) {
            console.error(`Erro ao enviar para ${userId}:`, error);
            totalFailed++;
          } else {
            totalSent += data?.sent || 0;
            totalFailed += data?.failed || 0;
          }
        } catch (err) {
          console.error(`Erro ao enviar para ${userId}:`, err);
          totalFailed++;
        }
      }

      if (totalSent > 0) {
        toast.success(`✅ ${totalSent} notificação(ões) enviada(s) com sucesso!`);
        setTitle("");
        setBody("");
        setUrl("/");
        setSelectedUserIds([]);
        // Recarregar logs
        loadData();
      }

      if (totalFailed > 0) {
        toast.error(`${totalFailed} envio(s) falharam.`);
      }

      if (totalSent === 0 && totalFailed === 0) {
        toast.warning("Nenhum usuário ativo com push habilitado.");
      }
    } catch (err) {
      console.error("Erro geral:", err);
      toast.error("Erro ao enviar notificações.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 animate-slide-up">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Push Notifications
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Envie notificações push para os alunos, mesmo com o app fechado.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-primary/10 border border-primary/20 p-4">
            <p className="text-xs text-muted-foreground">Push Ativado</p>
            <p className="text-2xl font-bold text-primary">{totalSubscribed}</p>
          </div>
          <div className="rounded-xl bg-muted border border-border p-4">
            <p className="text-xs text-muted-foreground">Total Alunos</p>
            <p className="text-2xl font-bold text-foreground">{users.length}</p>
          </div>
          <div className="rounded-xl bg-muted border border-border p-4">
            <p className="text-xs text-muted-foreground">Envios Recentes</p>
            <p className="text-2xl font-bold text-foreground">{recentLogs.length}</p>
          </div>
        </div>

        {/* Compose */}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Compor Notificação
          </h2>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Título da Notificação *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: 📢 Novidade no SAFO!"
                maxLength={100}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Mensagem *
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Ex: Novas questões foram adicionadas! Venha conferir."
                maxLength={500}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 min-h-[80px] resize-none"
              />
              <p className="text-[10px] text-muted-foreground text-right mt-0.5">
                {body.length}/500
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                URL ao clicar (opcional)
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Ex: /questoes, /flashcards, /resumos
              </p>
            </div>
          </div>

          {/* Target selector */}
          <div className="space-y-3 pt-2 border-t border-border">
            <label className="text-xs font-medium text-muted-foreground block">
              Destinatários
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTargetMode("all")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all border",
                  targetMode === "all"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40"
                )}
              >
                <Users className="h-4 w-4" />
                Todos
              </button>
              <button
                onClick={() => setTargetMode("course")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all border",
                  targetMode === "course"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40"
                )}
              >
                <Layers className="h-4 w-4" />
                Por Curso
              </button>
              <button
                onClick={() => setTargetMode("select")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all border",
                  targetMode === "select"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40"
                )}
              >
                <User className="h-4 w-4" />
                Selecionar
                {selectedUserIds.length > 0 && ` (${selectedUserIds.length})`}
              </button>
            </div>
          </div>

          {/* Course selection */}
          {targetMode === "course" && (
            <div className="space-y-3 animate-slide-down">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Selecione o Curso
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <option value="">Selecione um curso...</option>
                {courses.map((c) => {
                  const usersInCourseCount = users.filter((u) => u.course_id === c.id && subscribedUserIds.has(u.id)).length;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.title} — {usersInCourseCount} aluno(s) ativos
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* User selection */}
          {targetMode === "select" && (
            <div className="space-y-3 animate-slide-down">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar aluno por nome ou email..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  Selecionar todos com push
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={deselectAll}
                  className="text-xs text-muted-foreground font-medium hover:underline"
                >
                  Limpar seleção
                </button>
              </div>

              <div className="max-h-[280px] overflow-y-auto space-y-1.5 rounded-xl border border-border p-2 bg-background">
                {loadingUsers ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Carregando...
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Nenhum aluno encontrado.
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const hasPush = subscribedUserIds.has(u.id);
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => hasPush && toggleUser(u.id)}
                        disabled={!hasPush}
                        className={cn(
                          "w-full flex items-center justify-between p-2.5 rounded-lg transition-all text-left",
                          isSelected
                            ? "bg-primary/10 border border-primary/25"
                            : hasPush
                            ? "hover:bg-muted border border-transparent"
                            : "opacity-40 cursor-not-allowed border border-transparent"
                        )}
                      >
                        <div className="min-w-0">
                          <p
                            className={cn(
                              "text-sm font-medium truncate",
                              isSelected ? "text-primary" : "text-foreground"
                            )}
                          >
                            {u.name || "Sem nome"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {u.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {hasPush ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium">
                              Push
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                              Sem push
                            </span>
                          )}
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={isSending || !title.trim() || !body.trim()}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98]",
              isSending || !title.trim() || !body.trim()
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
            )}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar Notificação
              </>
            )}
          </button>
        </div>

        {/* Recent logs */}
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
          >
            <span className="font-semibold text-foreground text-sm">
              Histórico de Envios
            </span>
            {showLogs ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showLogs && (
            <div className="border-t border-border">
              {recentLogs.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  Nenhum envio registrado ainda.
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="p-4 flex items-start gap-3">
                      {log.status === "sent" ? (
                        <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {log.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {log.body}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(log.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-[9px] px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                          log.status === "sent"
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive"
                        )}
                      >
                        {log.status === "sent" ? "Enviado" : "Falha"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
