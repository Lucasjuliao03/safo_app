import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAdminQuestions, useCreateQuestion, useUpdateQuestion, useDeleteQuestion, useAdminSubjects, useAdminTopics } from "@/hooks/useAdminData";
import { Plus, Edit2, Filter, X, Trash2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminQuestionImport } from "@/components/AdminQuestionImport";

export default function AdminQuestions() {
  const [subjectFilter, setSubjectFilter] = useState<number | undefined>();
  const [topicFilter, setTopicFilter] = useState<number | undefined>();
  
  const { data: questions = [], isLoading } = useAdminQuestions({ subjectId: subjectFilter, topicId: topicFilter });
  const { data: subjects = [] } = useAdminSubjects();
  const { data: topics = [] } = useAdminTopics();

  const createMutation = useCreateQuestion();
  const updateMutation = useUpdateQuestion();
  const deleteMutation = useDeleteQuestion();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [format, setFormat] = useState<"multiple_choice" | "true_false">("multiple_choice");
  const [statement, setStatement] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", "", ""]);
  const [correctOption, setCorrectOption] = useState<number>(0);
  const [explanation, setExplanation] = useState("");
  const [difficulty, setDifficulty] = useState<"easy"|"medium"|"hard">("medium");
  const [subjectId, setSubjectId] = useState<number>(0);
  const [topicId, setTopicId] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);

  const openForm = (q?: any) => {
    if (q) {
      const qFormat = q.format || "multiple_choice";
      setEditingId(q.id);
      setFormat(qFormat);
      setStatement(q.statement);
      setOptions([q.option_a || "", q.option_b || "", q.option_c || "", q.option_d || "", q.option_e || ""]);
      if (qFormat === "true_false") {
        setCorrectOption(q.correct_option === "V" ? 0 : 1);
      } else {
        setCorrectOption(q.correct_option ? q.correct_option.charCodeAt(0) - 65 : 0); // 'A' -> 0, 'B' -> 1
      }
      setExplanation(q.explanation || "");
      setDifficulty(q.difficulty || "medium");
      setSubjectId(q.subject_id || 0);
      setTopicId(q.topic_id || 0);
      setIsActive(q.is_active ?? true);
    } else {
      setEditingId(null);
      setFormat("multiple_choice");
      setStatement("");
      setOptions(["", "", "", "", ""]);
      setCorrectOption(0);
      setExplanation("");
      setDifficulty("medium");
      setSubjectId(subjectFilter || 0);
      setTopicId(0);
      setIsActive(true);
    }
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja apagar esta questão permanentemente?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleSave = () => {
    if (!statement.trim() || !subjectId) {
      alert("Preencha o enunciado e matéria.");
      return;
    }
    if (format === "multiple_choice" && options.slice(0, 4).some(opt => !opt.trim())) {
      alert("Por favor, preencha no mínimo as alternativas de A até D.");
      return;
    }

    const data = {
      format,
      statement,
      option_a: format === "multiple_choice" ? options[0] : "",
      option_b: format === "multiple_choice" ? options[1] : "",
      option_c: format === "multiple_choice" ? options[2] : "",
      option_d: format === "multiple_choice" ? options[3] : "",
      option_e: format === "multiple_choice" ? (options[4] || "") : "",
      correct_option: format === "true_false" ? (correctOption === 0 ? "V" : "F") : String.fromCharCode(65 + correctOption), // 0 -> 'A'
      explanation,
      difficulty,
      subject_id: subjectId,
      topic_id: topicId || null,
      edict_id: 1,
      is_active: isActive,
      status: "published",
      question_type: format === "true_false" ? "banca" : "banca"
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, { 
        onSuccess: closeForm,
        onError: (err: any) => alert(err.message || "Erro ao atualizar a questão. Verifique se você executou a atualização no banco de dados.")
      });
    } else {
      createMutation.mutate(data, { 
        onSuccess: closeForm,
        onError: (err: any) => alert(err.message || "Erro ao salvar a questão. Verifique se você executou a atualização no banco de dados.")
      });
    }
  };

  const activeTopics = topics.filter(t => t.subject_id === subjectId);

  return (
    <AdminLayout>
      <div className="p-6 space-y-4 animate-slide-up h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Banco de Questões</h1>
            <p className="text-muted-foreground text-sm">Gerencie todas as questões da plataforma.</p>
          </div>
          {!isFormOpen && (
            <div className="flex gap-2">
              <button onClick={() => setIsImportOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-xl font-bold hover:bg-secondary/90 transition-colors shadow-sm">
                <UploadCloud className="h-5 w-5" /> Importar
              </button>
              <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-sm">
                <Plus className="h-5 w-5" /> Nova Questão
              </button>
            </div>
          )}
        </div>

        {isFormOpen && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4 animate-slide-down">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h2 className="font-bold">{editingId ? `Editar Questão #${editingId}` : "Nova Questão"}</h2>
              <button onClick={closeForm} className="p-1 text-muted-foreground hover:bg-muted rounded"><X className="h-4 w-4" /></button>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex gap-2 p-1 bg-muted rounded-lg">
                  <button onClick={() => setFormat("multiple_choice")} className={cn("flex-1 text-sm font-semibold py-1.5 rounded-md transition-colors", format === "multiple_choice" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")} >Múltipla Escolha</button>
                  <button onClick={() => {setFormat("true_false"); setCorrectOption(0);}} className={cn("flex-1 text-sm font-semibold py-1.5 rounded-md transition-colors", format === "true_false" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")} >Certo / Errado</button>
                </div>
                <textarea placeholder="Enunciado da Questão" value={statement} onChange={e => setStatement(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 min-h-[100px]" />
                
                <div className="grid grid-cols-2 gap-2">
                  <select value={subjectId} onChange={e => { setSubjectId(Number(e.target.value)); setTopicId(0); }} className="text-sm rounded-lg border border-border bg-background px-3 py-2">
                    <option value={0}>Selecione Matéria</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select value={topicId} onChange={e => setTopicId(Number(e.target.value))} className="text-sm rounded-lg border border-border bg-background px-3 py-2" disabled={!subjectId}>
                    <option value={0}>Selecione Tema (Opcional)</option>
                    {topics.filter(t => t.subject_id === subjectId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={difficulty} onChange={e => setDifficulty(e.target.value as any)} className="text-sm rounded-lg border border-border bg-background px-3 py-2">
                    <option value="easy">Fácil</option>
                    <option value="medium">Média</option>
                    <option value="hard">Difícil</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer px-2">
                    <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded border-border" /> Ativa
                  </label>
                </div>

                <textarea placeholder="Explicação do Professor (Opcional mas recomendado)" value={explanation} onChange={e => setExplanation(e.target.value)} className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 min-h-[80px]" />
              </div>

              <div className="space-y-2 border border-border p-3 rounded-lg bg-muted/20">
                <p className="text-xs font-bold text-muted-foreground mb-2">
                  {format === "multiple_choice" ? "Alternativas (Marque a correta)" : "Resposta Correta"}
                </p>
                {format === "multiple_choice" ? (
                  options.map((opt, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <input type="radio" name="correctOpt" checked={correctOption === i} onChange={() => setCorrectOption(i)} className="mt-2.5" />
                      <textarea value={opt} onChange={e => {
                        const newOpts = [...options];
                        newOpts[i] = e.target.value;
                        setOptions(newOpts);
                      }} placeholder={`Alternativa ${String.fromCharCode(65+i)} ${i===4? "(Opcional)":""}`} className={cn("flex-1 text-sm rounded-md border bg-background px-2 py-1.5 min-h-[40px]", correctOption === i ? "border-success" : "border-border")} />
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className={cn("flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all", correctOption === 0 ? "border-success bg-success/10" : "border-border bg-background")}>
                      <input type="radio" name="tfOpt" checked={correctOption === 0} onChange={() => setCorrectOption(0)} className="w-4 h-4 text-success" />
                      <span className={cn("font-bold", correctOption === 0 ? "text-success" : "text-foreground")}>Verdadeiro / Certo</span>
                    </label>
                    <label className={cn("flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all", correctOption === 1 ? "border-destructive bg-destructive/10" : "border-border bg-background")}>
                      <input type="radio" name="tfOpt" checked={correctOption === 1} onChange={() => setCorrectOption(1)} className="w-4 h-4 text-destructive" />
                      <span className={cn("font-bold", correctOption === 1 ? "text-destructive" : "text-foreground")}>Falso / Errado</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border gap-2">
              <button onClick={closeForm} className="px-4 py-2 text-sm font-semibold rounded-lg bg-muted hover:bg-muted/80">Cancelar</button>
              <button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                {editingId ? "Salvar Alterações" : "Salvar Questão"}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 p-4 bg-muted/40 rounded-xl border border-border">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mr-2">
            <Filter className="h-4 w-4" /> Filtros:
          </div>
          <select value={subjectFilter || ""} onChange={e => setSubjectFilter(e.target.value ? Number(e.target.value) : undefined)} className="text-sm rounded-lg border border-border bg-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">Todas as Matérias</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={topicFilter || ""} onChange={e => setTopicFilter(e.target.value ? Number(e.target.value) : undefined)} disabled={!subjectFilter} className="text-sm rounded-lg border border-border bg-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">Todos os Temas</option>
            {topics.filter(t => t.subject_id === subjectFilter).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-hidden bg-card border border-border rounded-xl flex flex-col">
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">Enunciado</th>
                  <th className="px-4 py-3 font-semibold">Matéria / Tema</th>
                  <th className="px-4 py-3 font-semibold text-center">Formato</th>
                  <th className="px-4 py-3 font-semibold text-center">Nível</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Carregando questões...</td></tr>
                ) : questions.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma questão encontrada para os filtros atuais.</td></tr>
                ) : (
                  questions.map(q => (
                    <tr key={q.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{q.id}</td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[300px] truncate" title={q.statement}>{q.statement.substring(0, 60)}{q.statement.length > 60 ? "..." : ""}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-xs">{(q as any).subjects?.name || "Sem Matéria"}</span>
                          <span className="text-[10px] text-muted-foreground">{(q as any).topics?.name || "Sem Tema"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold bg-muted text-muted-foreground">
                          {q.format === 'true_false' ? 'C/E' : 'Múltipla'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          q.difficulty === "easy" ? "bg-success/15 text-success" :
                          q.difficulty === "medium" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
                        )}>{q.difficulty === "easy" ? "Fácil" : q.difficulty === "medium" ? "Média" : "Difícil"}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", q.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{q.is_active ? "Ativa" : "Inativa"}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openForm(q)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors hover:bg-primary/10 rounded-lg"><Edit2 className="h-4 w-4" /></button>
                          <button onClick={() => handleDelete(q.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {isImportOpen && (
        <AdminQuestionImport onClose={() => setIsImportOpen(false)} presetSubjectId={subjectFilter} />
      )}
    </AdminLayout>
  );
}
