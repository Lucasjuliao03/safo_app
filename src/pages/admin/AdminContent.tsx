import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { 
  useAdminFlashcards, useCreateFlashcard, useUpdateFlashcard, useDeleteFlashcard,
  useAdminSummaries, useCreateSummary, useUpdateSummary, useDeleteSummary,
  useAdminSubjects, useAdminTopics 
} from "@/hooks/useAdminData";
import { Plus, Edit2, Maximize2, FileText, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminContent() {
  const [activeTab, setActiveTab] = useState<"flashcards" | "summaries">("flashcards");

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 animate-slide-up">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Conteúdo Complementar</h1>
            <p className="text-muted-foreground text-sm">Gerencie flashcards e resumos teóricos das matérias.</p>
          </div>
        </div>
        
        <div className="flex border-b border-border overflow-x-auto">
          {(["flashcards", "summaries"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-3 text-sm font-semibold transition-all border-b-2 whitespace-nowrap",
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "flashcards" && "Flashcards"}
              {tab === "summaries" && "Resumos em PDF/Texto"}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          {activeTab === "flashcards" && <FlashcardsManager />}
          {activeTab === "summaries" && <SummariesManager />}
        </div>
      </div>
    </AdminLayout>
  );
}

function FlashcardsManager() {
  const { data: flashcards = [], isLoading } = useAdminFlashcards();
  const { data: subjects = [] } = useAdminSubjects();
  const { data: topics = [] } = useAdminTopics();
  const createMutation = useCreateFlashcard();
  const updateMutation = useUpdateFlashcard();
  const deleteMutation = useDeleteFlashcard();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [subjectId, setSubjectId] = useState<number>(0);
  const [topicId, setTopicId] = useState<number>(0);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando flashcards...</div>;

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja apagar este flashcard?")) {
      deleteMutation.mutate(id);
    }
  };

  const openForm = (fc?: any) => {
    if (fc) {
      setEditingId(fc.id);
      setFront(fc.front_text);
      setBack(fc.back_text);
      setSubjectId(fc.subject_id || 0);
      setTopicId(fc.topic_id || 0);
    } else {
      setEditingId(null);
      setFront(""); setBack(""); setSubjectId(0); setTopicId(0);
    }
    setIsFormOpen(true);
  };

  const closeForm = () => { setIsFormOpen(false); setEditingId(null); };

  const handleSave = () => {
    if (!front.trim() || !back.trim() || !subjectId) return alert("Preencha frente, verso e selecione a matéria.");
    const data = { front_text: front, back_text: back, subject_id: subjectId, topic_id: topicId || null, edict_id: 1, difficulty: "medium", status: "published", is_active: true };
    if (editingId) updateMutation.mutate({ id: editingId, data }, { onSuccess: closeForm });
    else createMutation.mutate(data, { onSuccess: closeForm });
  };

  const activeTopics = topics.filter((t: any) => t.subject_id === subjectId);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Gerenciar Flashcards</h2>
        {!isFormOpen && (
          <button onClick={() => openForm()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Novo Flashcard
          </button>
        )}
      </div>

      {isFormOpen && (
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-4 animate-slide-down">
          <div className="flex justify-between items-center border-b border-border pb-2">
            <h3 className="font-bold">{editingId ? "Editar Flashcard" : "Novo Flashcard"}</h3>
            <button onClick={closeForm} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">Frente (Pergunta)</label>
              <textarea value={front} onChange={e => setFront(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2 min-h-[100px]" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">Verso (Resposta)</label>
              <textarea value={back} onChange={e => setBack(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2 min-h-[100px]" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <select value={subjectId} onChange={e => { setSubjectId(Number(e.target.value)); setTopicId(0); }} className="text-sm rounded-lg border border-border bg-card px-3 py-2">
              <option value={0}>Selecione Matéria</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={topicId} onChange={e => setTopicId(Number(e.target.value))} className="text-sm rounded-lg border border-border bg-card px-3 py-2" disabled={!subjectId}>
              <option value={0}>Selecione Tema (Opcional)</option>
              {activeTopics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
              Salvar Flashcard
            </button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {flashcards.length === 0 ? (
          <div className="col-span-full p-8 text-center text-muted-foreground">Nenhum flashcard cadastrado.</div>
        ) : flashcards.map(fc => (
          <div key={fc.id} className="p-4 rounded-xl border border-border flex flex-col justify-between group hover:border-primary/50 transition-colors">
            <div className="mb-3">
              <span className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">
                {(fc as any).subjects?.name || "Geral"} • {(fc as any).topics?.name || "-"}
              </span>
              <p className="font-semibold text-foreground line-clamp-2" title={fc.front_text}>{fc.front_text}</p>
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2" title={fc.back_text}>{fc.back_text}</p>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-border mt-auto">
              <span className="text-[10px] font-mono text-muted-foreground">ID: {fc.id}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => openForm(fc)} className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-muted text-foreground hover:bg-primary/20 hover:text-primary transition-colors">
                  <Edit2 className="h-3 w-3" /> Editar
                </button>
                <button onClick={() => handleDelete(fc.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                   <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummariesManager() {
  const { data: summaries = [], isLoading } = useAdminSummaries();
  const { data: subjects = [] } = useAdminSubjects();
  const { data: topics = [] } = useAdminTopics();
  const createMutation = useCreateSummary();
  const updateMutation = useUpdateSummary();
  const deleteMutation = useDeleteSummary();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [subjectId, setSubjectId] = useState<number>(0);
  const [topicId, setTopicId] = useState<number>(0);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando resumos...</div>;

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja apagar este resumo?")) {
      deleteMutation.mutate(id);
    }
  };

  const openForm = (sum?: any) => {
    if (sum) {
      setEditingId(sum.id);
      setTitle(sum.title);
      setContent(sum.content_markdown || "");
      setSubjectId(sum.subject_id || 0);
      setTopicId(sum.topic_id || 0);
    } else {
      setEditingId(null);
      setTitle(""); setContent(""); setSubjectId(0); setTopicId(0);
    }
    setIsFormOpen(true);
  };

  const closeForm = () => { setIsFormOpen(false); setEditingId(null); };

  const handleSave = () => {
    if (!title.trim() || !content.trim() || !subjectId) return alert("Preencha título, conteúdo e selecione a matéria.");
    const data = { 
      title, 
      content_markdown: content, 
      format: "markdown", 
      subject_id: subjectId, 
      topic_id: topicId || null, 
      edict_id: 1,
      status: "published", 
      is_active: true 
    };
    if (editingId) updateMutation.mutate({ id: editingId, data }, { onSuccess: closeForm });
    else createMutation.mutate(data, { onSuccess: closeForm });
  };

  const activeTopics = topics.filter((t: any) => t.subject_id === subjectId);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Gerenciar Resumos</h2>
        {!isFormOpen && (
          <button onClick={() => openForm()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/90">
            <Plus className="h-4 w-4" /> Novo Resumo
          </button>
        )}
      </div>

      {isFormOpen && (
        <div className="p-4 rounded-xl border border-secondary/20 bg-secondary/5 space-y-4 animate-slide-down">
          <div className="flex justify-between items-center border-b border-border pb-2">
            <h3 className="font-bold">{editingId ? "Editar Resumo" : "Novo Resumo"}</h3>
            <button onClick={closeForm} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3">
            <input type="text" placeholder="Título do Resumo" value={title} onChange={e => setTitle(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2" />
            <div className="grid sm:grid-cols-2 gap-3">
              <select value={subjectId} onChange={e => { setSubjectId(Number(e.target.value)); setTopicId(0); }} className="text-sm rounded-lg border border-border bg-card px-3 py-2">
                <option value={0}>Selecione Matéria</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={topicId} onChange={e => setTopicId(Number(e.target.value))} className="text-sm rounded-lg border border-border bg-card px-3 py-2" disabled={!subjectId}>
                <option value={0}>Selecione Tema (Opcional)</option>
                {activeTopics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <textarea placeholder="Conteúdo (suporta Markdown)" value={content} onChange={e => setContent(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2 min-h-[200px] font-mono" />
          </div>
          
          <div className="flex justify-end gap-2">
            <button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="px-4 py-2 text-sm font-semibold rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/90">
              Salvar Resumo
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {summaries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Nenhum resumo cadastrado.</div>
        ) : summaries.map(summary => (
          <div key={summary.id} className="p-4 rounded-xl border border-border flex justify-between items-center group">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-secondary/20 rounded-lg">
                <FileText className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <p className="font-bold text-foreground text-base">{summary.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(summary as any).subjects?.name || "Matéria Indefinida"} • {(summary as any).topics?.name || "Tema Indefinido"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 text-muted-foreground hover:text-secondary transition-colors"><Maximize2 className="h-4 w-4" /></button>
              <button onClick={() => openForm(summary)} className="p-2 text-muted-foreground hover:text-primary transition-colors"><Edit2 className="h-4 w-4" /></button>
              <button onClick={() => handleDelete(summary.id)} className="p-2 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
