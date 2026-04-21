import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import {
  useAllLawReferences, useCreateLawReference, useUpdateLawReference, useDeleteLawReference,
  useAdminEdicts, useAdminCourses,
  useEditalLaws, useLinkLawToEdital, useUnlinkLawFromEdital, useMigrateUsersEdital
} from "@/hooks/useAdminData";
import { useAdminTopics } from "@/hooks/useAdminData";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, Link2, Scale, BookOpen, BookOpenCheck, Minus, Search, Tag, FileText, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Hook: listar questões/flashcards/resumos com seus law_reference_id ───────
function useContentWithLaw(table: "questions" | "flashcards" | "summaries", topicId?: number) {
  return useQuery({
    queryKey: [`content_law_${table}`, topicId],
    queryFn: async () => {
      let q = supabase
        .from(table)
        .select("id, topic_id, law_reference_id, topics(name)" + (table === "questions" ? ", statement" : table === "flashcards" ? ", front_text" : ", title"))
        .eq("is_active", true)
        .eq("status", "published")
        .order("topic_id");
      if (topicId) q = (q as any).eq("topic_id", topicId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 2,
  });
}

function useBulkSetLaw(table: "questions" | "flashcards" | "summaries") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { ids: number[]; law_reference_id: number | null }) => {
      const { error } = await supabase
        .from(table)
        .update({ law_reference_id: vars.law_reference_id })
        .in("id", vars.ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`content_law_${table}`] });
      toast.success("Vínculo atualizado!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminLawReferences() {
  const [activeTab, setActiveTab] = useState<"normas" | "edital" | "conteudo" | "migrar">("normas");

  const tabs = [
    { key: "normas",   label: "📜 Catálogo de Normas" },
    { key: "edital",   label: "🔗 Normas → Edital" },
    { key: "conteudo", label: "📎 Vincular Conteúdo" },
    { key: "migrar",   label: "🔄 Migrar Alunos" },
  ] as const;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 animate-slide-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Normas / Leis</h1>
          <p className="text-muted-foreground text-sm">
            Cadastre normas, vincule-as aos editais dos cursos e associe questões, flashcards e resumos às normas específicas.
          </p>
        </div>

        <div className="flex border-b border-border overflow-x-auto gap-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "px-4 py-3 text-sm font-semibold transition-all border-b-2 whitespace-nowrap",
                activeTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          {activeTab === "normas"   && <NormasCRUD />}
          {activeTab === "edital"   && <EditalLawManager />}
          {activeTab === "conteudo" && <ContentLawLinker />}
          {activeTab === "migrar"   && <StudentEditalMigrator />}
        </div>
      </div>
    </AdminLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA 1: CRUD de Normas
// ─────────────────────────────────────────────────────────────────────────────
function NormasCRUD() {
  const { data: normas = [], isLoading } = useAllLawReferences();
  const { data: topics = [] } = useAdminTopics();
  const createM = useCreateLawReference();
  const updateM = useUpdateLawReference();
  const deleteM = useDeleteLawReference();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [topicId, setTopicId] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [search, setSearch] = useState("");

  const reset = () => { setEditingId(null); setName(""); setShortName(""); setTopicId(0); setDescription(""); setIsActive(true); };
  const startEdit = (n: any) => { setEditingId(n.id); setName(n.name); setShortName(n.short_name || ""); setTopicId(n.topic_id || 0); setDescription(n.description || ""); setIsActive(n.is_active); };

  const handleSave = () => {
    if (!name.trim()) return;
    const payload = { name, short_name: shortName || undefined, topic_id: topicId || undefined, description: description || undefined, is_active: isActive };
    if (editingId) {
      updateM.mutate({ id: editingId, ...payload }, { onSuccess: reset });
    } else {
      createM.mutate(payload, { onSuccess: reset });
    }
  };

  const filtered = normas.filter((n: any) =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    (n.short_name || "").toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando normas...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold flex items-center gap-2"><Scale className="h-5 w-5 text-primary" /> Normas e Leis Cadastradas</h2>

      {/* Formulário */}
      <div className="p-5 rounded-xl border border-primary/20 bg-primary/5 space-y-4">
        <p className="font-semibold text-sm">{editingId ? "Editar Norma" : "Nova Norma / Lei"}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nome completo *</label>
            <input
              type="text"
              placeholder='Ex: Lei Federal nº 14.133, de 01/04/2021 – Lei de Licitações'
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nome curto (tag)</label>
            <input
              type="text"
              placeholder="Ex: Lei 14.133/2021"
              value={shortName}
              onChange={e => setShortName(e.target.value)}
              className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tema pai (organização)</label>
            <select
              value={topicId}
              onChange={e => setTopicId(Number(e.target.value))}
              className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2"
            >
              <option value={0}>— Sem tema —</option>
              {topics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Descrição (opcional)</label>
            <input
              type="text"
              placeholder="Resumo ou contexto da norma"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Ativa
          </label>
          <div className="flex items-center gap-2">
            {editingId && <button onClick={reset} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted">Cancelar</button>}
            <button
              onClick={handleSave}
              disabled={createM.isPending || updateM.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground"
            >
              {editingId ? "Salvar Norma" : <><Plus className="h-3.5 w-3.5" /> Cadastrar Norma</>}
            </button>
          </div>
        </div>
      </div>

      {/* Busca + Lista */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar normas..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-sm rounded-lg border border-border bg-card pl-9 pr-4 py-2"
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground italic text-center py-6">Nenhuma norma cadastrada.</p>}
        {filtered.map((n: any) => (
          <div key={n.id} className="p-4 rounded-lg border border-border flex justify-between items-start gap-3 hover:bg-muted/30 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm text-foreground leading-snug">{n.name}</p>
                {n.short_name && (
                  <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold border border-primary/20">
                    <Tag className="inline h-2.5 w-2.5 mr-0.5" />{n.short_name}
                  </span>
                )}
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", n.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                  {n.is_active ? "Ativa" : "Inativa"}
                </span>
              </div>
              {n.topics?.name && <p className="text-[10px] text-muted-foreground mt-1">Tema: {n.topics.name}</p>}
              {n.description && <p className="text-xs text-muted-foreground mt-0.5">{n.description}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => startEdit(n)} className="p-1.5 text-muted-foreground hover:text-primary"><Edit2 className="h-4 w-4" /></button>
              <button onClick={() => { if (confirm("Apagar esta norma? Isso desvinculará todo o conteúdo associado.")) deleteM.mutate(n.id); }} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA 2: Vincular Normas ao Edital
// ─────────────────────────────────────────────────────────────────────────────
function EditalLawManager() {
  const { data: courses = [] } = useAdminCourses();
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedEdictId, setSelectedEdictId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const { data: edicts = [] } = useAdminEdicts(selectedCourseId ?? undefined);
  const { data: normas = [] } = useAllLawReferences();
  const { data: linkedLaws = [] } = useEditalLaws(selectedEdictId ?? undefined);
  const linkM = useLinkLawToEdital();
  const unlinkM = useUnlinkLawFromEdital();

  const linkedIds = linkedLaws.map((l: any) => Number(l.id));

  const toggle = (lawId: number) => {
    if (!selectedEdictId) return;
    if (linkedIds.includes(lawId)) {
      unlinkM.mutate({ edital_id: selectedEdictId, law_reference_id: lawId });
    } else {
      linkM.mutate({ edital_id: selectedEdictId, law_reference_id: lawId });
    }
  };

  const filtered = (normas as any[]).filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) || (n.short_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold flex items-center gap-2"><Link2 className="h-5 w-5 text-accent" /> Vincular Normas ao Edital</h2>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">1. Selecione o Curso</label>
          <select
            value={selectedCourseId ?? ""}
            onChange={e => { setSelectedCourseId(e.target.value ? Number(e.target.value) : null); setSelectedEdictId(null); }}
            className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2"
          >
            <option value="">Selecione...</option>
            {courses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">2. Selecione o Edital</label>
          <select
            value={selectedEdictId ?? ""}
            onChange={e => setSelectedEdictId(e.target.value ? Number(e.target.value) : null)}
            disabled={!selectedCourseId}
            className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2 disabled:opacity-50"
          >
            <option value="">Selecione...</option>
            {edicts.map((e: any) => <option key={e.id} value={e.id}>{e.name} ({e.year})</option>)}
          </select>
        </div>
      </div>

      {selectedEdictId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              Normas do edital: <span className="text-primary">{linkedIds.length} vinculada(s)</span>
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar norma..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm rounded-lg border border-border bg-card pl-9 pr-4 py-2"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map((n: any) => {
              const linked = linkedIds.includes(Number(n.id));
              return (
                <div
                  key={n.id}
                  onClick={() => toggle(Number(n.id))}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-all hover:scale-[1.01]",
                    linked ? "bg-success/10 border-success/30" : "bg-card border-border hover:border-muted-foreground/30"
                  )}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className={cn("text-sm font-medium leading-snug", linked ? "text-success" : "text-foreground")}>{n.name}</p>
                    {n.short_name && <p className="text-[10px] text-muted-foreground mt-0.5">{n.short_name}</p>}
                  </div>
                  <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0", linked ? "bg-success/20" : "bg-muted")}>
                    {linked ? <Minus className="h-3.5 w-3.5 text-success" /> : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA 3: Vincular Conteúdo (questões/flashcards/resumos) a normas
// ─────────────────────────────────────────────────────────────────────────────
function ContentLawLinker() {
  const { data: topics = [] } = useAdminTopics();
  const { data: normas = [] } = useAllLawReferences();

  const [contentType, setContentType] = useState<"questions" | "flashcards" | "summaries">("questions");
  const [selectedTopicId, setSelectedTopicId] = useState<number>(0);
  const [selectedLawId, setSelectedLawId] = useState<number>(0);

  const { data: items = [], isLoading } = useContentWithLaw(contentType, selectedTopicId || undefined);
  const bulkM = useBulkSetLaw(contentType);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  const toggleItem = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectAll = () => setSelected(new Set(filteredItems.map((i: any) => Number(i.id))));
  const clearAll = () => setSelected(new Set());

  const getLabel = (item: any) => {
    if (contentType === "questions") return item.statement?.slice(0, 90) + "...";
    if (contentType === "flashcards") return item.front_text?.slice(0, 90) + "...";
    return item.title;
  };

  const filteredItems = (items as any[]).filter(i =>
    getLabel(i)?.toLowerCase().includes(search.toLowerCase())
  );

  const handleApply = () => {
    if (selected.size === 0) { toast.error("Selecione ao menos um item."); return; }
    bulkM.mutate({ ids: Array.from(selected), law_reference_id: selectedLawId || null });
    clearAll();
  };

  const contentLabels = {
    questions: { label: "Questões", icon: <FileText className="h-4 w-4" /> },
    flashcards: { label: "Flashcards", icon: <BookOpenCheck className="h-4 w-4" /> },
    summaries: { label: "Resumos", icon: <BookOpen className="h-4 w-4" /> },
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2"><FileText className="h-5 w-5 text-warning" /> Vincular Conteúdo a Normas</h2>
      <p className="text-xs text-muted-foreground">
        Selecione o tipo de conteúdo, filtre pelo tema, escolha os itens e atribua a norma correspondente.
      </p>

      {/* Controles */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Tipo de Conteúdo</label>
          <div className="flex gap-1">
            {(["questions", "flashcards", "summaries"] as const).map(ct => (
              <button
                key={ct}
                onClick={() => { setContentType(ct); clearAll(); setSearch(""); }}
                className={cn(
                  "flex-1 text-[10px] font-bold px-2 py-2 rounded-lg border transition-all flex items-center justify-center gap-1",
                  contentType === ct ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {contentLabels[ct].icon} {contentLabels[ct].label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Filtrar por Tema</label>
          <select
            value={selectedTopicId}
            onChange={e => { setSelectedTopicId(Number(e.target.value)); clearAll(); }}
            className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2"
          >
            <option value={0}>— Todos os temas —</option>
            {topics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Norma a vincular</label>
          <select
            value={selectedLawId}
            onChange={e => setSelectedLawId(Number(e.target.value))}
            className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2"
          >
            <option value={0}>— Remover vínculo —</option>
            {(normas as any[]).map(n => <option key={n.id} value={n.id}>{n.short_name || n.name}</option>)}
          </select>
        </div>
      </div>

      {/* Seleção em massa */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar conteúdo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-sm rounded-lg border border-border bg-card pl-9 pr-4 py-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted">Todos ({filteredItems.length})</button>
          <button onClick={clearAll} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted">Limpar</button>
          <button
            onClick={handleApply}
            disabled={selected.size === 0 || bulkM.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-warning text-warning-foreground disabled:opacity-50"
          >
            <Link2 className="h-3.5 w-3.5" />
            Aplicar em {selected.size} item(s)
          </button>
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center text-muted-foreground text-sm py-8">Carregando...</div>
      ) : (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
          {filteredItems.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-8">Nenhum item encontrado. Selecione um tema ou tipo de conteúdo.</p>
          )}
          {filteredItems.map((item: any) => {
            const isSelected = selected.has(Number(item.id));
            const hasLaw = !!item.law_reference_id;
            const lawName = hasLaw ? (normas as any[]).find(n => n.id === item.law_reference_id)?.short_name : null;

            return (
              <div
                key={item.id}
                onClick={() => toggleItem(Number(item.id))}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                  isSelected ? "bg-primary/10 border-primary/40" : "border-border hover:bg-muted/30"
                )}
              >
                <div className={cn(
                  "mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center",
                  isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                )}>
                  {isSelected && <div className="h-2 w-2 bg-white rounded-sm" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug line-clamp-2">{getLabel(item)}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">Tema: {item.topics?.name || "—"}</span>
                    {hasLaw ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-bold border border-success/20">
                        ✓ {lawName || `Lei ID ${item.law_reference_id}`}
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">Sem norma</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA 4: Migrar Alunos entre Editais
// ─────────────────────────────────────────────────────────────────────────────
function StudentEditalMigrator() {
  const { data: courses = [] } = useAdminCourses();
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [sourceEdictId, setSourceEdictId] = useState<number | null>(null);
  const [targetEdictId, setTargetEdictId] = useState<number | null>(null);
  
  const { data: edicts = [] } = useAdminEdicts(selectedCourseId ?? undefined);
  const migrateM = useMigrateUsersEdital();

  const handleMigrate = () => {
    if (!sourceEdictId || !targetEdictId) {
      toast.error("Selecione os dois editais.");
      return;
    }
    if (sourceEdictId === targetEdictId) {
      toast.error("Os editais não podem ser o mesmo.");
      return;
    }
    
    if (confirm("Confirma a migração em massa de todos os alunos? Isso atualizará instantaneamente a plataforma deles.")) {
      migrateM.mutate({ oldEditalId: sourceEdictId, newEditalId: targetEdictId });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-indigo-500" /> Migração de Alunos (Em Lote)</h2>
        <p className="text-sm text-muted-foreground">Transfira todos os alunos matriculados em um edital antigo para um edital mais recente com um único clique.</p>
      </div>

      <div className="p-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 space-y-6">
        <div className="space-y-1">
          <label className="text-sm font-semibold text-foreground">1. Qual curso deseja analisar?</label>
          <select
            value={selectedCourseId ?? ""}
            onChange={e => { setSelectedCourseId(e.target.value ? Number(e.target.value) : null); setSourceEdictId(null); setTargetEdictId(null); }}
            className="w-full md:max-w-md text-sm rounded-lg border border-border bg-card px-3 py-2"
          >
            <option value="">Selecione o curso...</option>
            {courses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedCourseId && edicts.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-indigo-500/10">
            <div className="space-y-2 p-4 rounded-xl border border-destructive/20 bg-destructive/5">
              <label className="text-sm font-bold text-destructive">De (Edital de Origem)</label>
              <p className="text-xs text-muted-foreground">Todos os alunos que atualmente estão vinculados a este edital serão transferidos.</p>
              <select
                value={sourceEdictId ?? ""}
                onChange={e => setSourceEdictId(e.target.value ? Number(e.target.value) : null)}
                className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2 mt-2"
              >
                <option value="">Selecione origem...</option>
                {edicts.map((e: any) => <option key={e.id} value={e.id}>{e.name} ({e.year})</option>)}
              </select>
            </div>

            <div className="space-y-2 p-4 rounded-xl border border-success/20 bg-success/5">
              <label className="text-sm font-bold text-success">Para (Edital de Destino)</label>
              <p className="text-xs text-muted-foreground">Este será o novo edital padrão desses alunos. Seus materiais e mapas serão atualizados automaticamente.</p>
              <select
                value={targetEdictId ?? ""}
                onChange={e => setTargetEdictId(e.target.value ? Number(e.target.value) : null)}
                className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2 mt-2"
              >
                <option value="">Selecione destino...</option>
                {edicts.map((e: any) => <option key={e.id} value={e.id}>{e.name} ({e.year})</option>)}
              </select>
            </div>
          </div>
        )}

        {sourceEdictId && targetEdictId && sourceEdictId !== targetEdictId && (
          <div className="pt-4 flex justify-end gap-3">
            <button
              onClick={handleMigrate}
              disabled={migrateM.isPending}
              className="flex items-center gap-2 px-6 py-2.5 font-bold rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-all active:scale-95 disabled:opacity-50"
            >
              <ArrowRightLeft className="h-4 w-4" />
              Executar Transferência em Massa
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
