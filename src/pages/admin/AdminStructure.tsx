import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { 
  useAdminCourses, useCreateCourse, useUpdateCourse, useDeleteCourse,
  useAdminEdicts, useCreateEdict, useUpdateEdict, useDeleteEdict,
  useAdminSubjects, useCreateSubject, useUpdateSubject, useDeleteSubject,
  useAdminTopics, useCreateTopic, useUpdateTopic, useDeleteTopic,
  useAdminEdictSubjects, useAddEdictSubject, useRemoveEdictSubject
} from "@/hooks/useAdminData";
import { Plus, Edit2, Layers, FileText, BookOpen, Quote, Trash2, Link2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminStructure() {
  const [activeTab, setActiveTab] = useState<"courses" | "edicts" | "subjects" | "topics" | "vincular">("courses");

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 animate-slide-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estrutura do Sistema</h1>
          <p className="text-muted-foreground text-sm">Gerencie os cursos, editais, matérias, temas e vínculos.</p>
        </div>
        
        <div className="flex border-b border-border overflow-x-auto">
          {(["courses", "edicts", "subjects", "topics", "vincular"] as const).map(tab => (
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
              {tab === "courses" && "Cursos"}
              {tab === "edicts" && "Editais"}
              {tab === "subjects" && "Matérias"}
              {tab === "topics" && "Temas"}
              {tab === "vincular" && "🔗 Vincular"}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          {activeTab === "courses" && <CoursesManager />}
          {activeTab === "edicts" && <EdictsManager />}
          {activeTab === "subjects" && <SubjectsManager />}
          {activeTab === "topics" && <TopicsManager />}
          {activeTab === "vincular" && <VincularManager />}
        </div>
      </div>
    </AdminLayout>
  );
}

// ===================== VINCULAR MANAGER =====================
function VincularManager() {
  const { data: courses = [] } = useAdminCourses();
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedEdictId, setSelectedEdictId] = useState<number | null>(null);

  const { data: edicts = [] } = useAdminEdicts(selectedCourseId ?? undefined);
  const { data: allSubjects = [] } = useAdminSubjects();
  const { data: allTopics = [] } = useAdminTopics();
  const { data: edictSubjects = [] } = useAdminEdictSubjects(selectedEdictId ?? undefined);
  const addEdictSubject = useAddEdictSubject();
  const removeEdictSubject = useRemoveEdictSubject();

  const linkedSubjectIds = edictSubjects.map((es: any) => es.subject_id);

  const handleToggleSubject = (subjectId: number) => {
    if (!selectedEdictId) return;
    if (linkedSubjectIds.includes(subjectId)) {
      removeEdictSubject.mutate({ edictId: selectedEdictId, subjectId });
    } else {
      addEdictSubject.mutate({ edictId: selectedEdictId, subjectId });
    }
  };

  // Temas vinculados = temas cujas matérias estão vinculadas ao edital
  const linkedTopics = allTopics.filter((t: any) => linkedSubjectIds.includes(t.subject_id));
  const unlinkedTopics = allTopics.filter((t: any) => !linkedSubjectIds.includes(t.subject_id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
          <Link2 className="h-5 w-5 text-primary" /> Vincular Matérias e Temas ao Edital
        </h2>
        <p className="text-xs text-muted-foreground">
          Matérias vinculadas ao edital serão visíveis apenas para os alunos daquele curso. 
          Os temas são automaticamente herdados da matéria.
        </p>
      </div>

      {/* Step 1: Curso */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">1. Selecione o Curso</label>
          <select
            value={selectedCourseId ?? ""}
            onChange={(e) => {
              setSelectedCourseId(e.target.value ? parseInt(e.target.value) : null);
              setSelectedEdictId(null);
            }}
            className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="">Selecione...</option>
            {courses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Step 2: Edital */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">2. Selecione o Edital</label>
          <select
            value={selectedEdictId ?? ""}
            onChange={(e) => setSelectedEdictId(e.target.value ? parseInt(e.target.value) : null)}
            disabled={!selectedCourseId}
            className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
          >
            <option value="">Selecione...</option>
            {edicts.map((ed: any) => <option key={ed.id} value={ed.id}>{ed.name} ({ed.year})</option>)}
          </select>
        </div>
      </div>

      {selectedEdictId && (
        <>
          {/* Matérias */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-warning" /> Matérias
              <span className="text-[10px] font-normal text-muted-foreground ml-1">
                ({linkedSubjectIds.length} vinculada{linkedSubjectIds.length !== 1 ? "s" : ""})
              </span>
            </h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {allSubjects.map((sub: any) => {
                const isLinked = linkedSubjectIds.includes(sub.id);
                return (
                  <div
                    key={sub.id}
                    onClick={() => handleToggleSubject(sub.id)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3 transition-all cursor-pointer hover:scale-[1.01]",
                      isLinked ? "bg-success/10 border-success/30" : "bg-card border-border hover:border-muted-foreground/30"
                    )}
                  >
                    <div>
                      <p className={cn("text-sm font-medium", isLinked ? "text-success" : "text-foreground")}>{sub.name}</p>
                      {sub.description && <p className="text-[10px] text-muted-foreground">{sub.description}</p>}
                    </div>
                    <div className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center shrink-0",
                      isLinked ? "bg-success/20" : "bg-muted"
                    )}>
                      {isLinked ? <Minus className="h-3.5 w-3.5 text-success" /> : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Temas (automático pela matéria) */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Quote className="h-4 w-4 text-xp" /> Temas Vinculados (via Matéria)
              <span className="text-[10px] font-normal text-muted-foreground ml-1">
                ({linkedTopics.length} tema{linkedTopics.length !== 1 ? "s" : ""})
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Os temas abaixo serão automaticamente incluídos porque pertencem às matérias vinculadas ao edital.
            </p>
            {linkedTopics.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum tema vinculado. Vincule matérias acima para ver os temas.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {linkedTopics.map((topic: any) => (
                  <div key={topic.id} className="rounded-lg border border-success/20 bg-success/5 p-2.5">
                    <p className="text-sm font-medium text-success">{topic.name}</p>
                    <p className="text-[10px] text-muted-foreground">Matéria: {(topic as any).subjects?.name}</p>
                  </div>
                ))}
              </div>
            )}

            {unlinkedTopics.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Ver {unlinkedTopics.length} tema(s) NÃO vinculado(s)
                </summary>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                  {unlinkedTopics.map((topic: any) => (
                    <div key={topic.id} className="rounded-lg border border-border bg-muted/30 p-2.5 opacity-60">
                      <p className="text-sm font-medium text-foreground">{topic.name}</p>
                      <p className="text-[10px] text-muted-foreground">Matéria: {(topic as any).subjects?.name}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ===================== COURSES MANAGER =====================
function CoursesManager() {
  const { data: courses = [], isLoading } = useAdminCourses();
  const createMutation = useCreateCourse();
  const updateMutation = useUpdateCourse();
  const deleteMutation = useDeleteCourse();
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando cursos...</div>;

  const handleCreate = () => {
    if (!name.trim()) return;
    createMutation.mutate({ name, description, isActive });
    setName(""); setDescription(""); setIsActive(true);
  };

  const handleUpdate = (id: number) => {
    if (!name.trim()) return;
    updateMutation.mutate({ id, name, description, isActive });
    setEditingId(null);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja apagar este curso?")) deleteMutation.mutate(id);
  };

  const startEdit = (course: any) => { setEditingId(course.id); setName(course.name); setDescription(course.description || ""); setIsActive(course.is_active); };
  const cancelEdit = () => { setEditingId(null); setName(""); setDescription(""); setIsActive(true); };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2"><Layers className="h-5 w-5 text-primary" /> Cursos Cadastrados</h2>
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
        <p className="font-semibold text-sm">{editingId ? "Editar Curso" : "Novo Curso"}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input type="text" placeholder="Nome do Curso" value={name} onChange={e => setName(e.target.value)} className="text-sm rounded-lg border border-border bg-card px-3 py-2" />
          <input type="text" placeholder="Descrição (opcional)" value={description} onChange={e => setDescription(e.target.value)} className="text-sm rounded-lg border border-border bg-card px-3 py-2" />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Ativo
          </label>
          <div className="flex items-center gap-2">
            {editingId && <button onClick={cancelEdit} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted">Cancelar</button>}
            <button onClick={() => editingId ? handleUpdate(editingId) : handleCreate()} disabled={createMutation.isPending || updateMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground">
              {editingId ? "Salvar" : <><Plus className="h-4 w-4" /> Criar Curso</>}
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 mt-4">
        {courses.map(course => (
          <div key={course.id} className="p-4 rounded-lg border border-border flex justify-between items-center">
            <div>
              <p className="font-bold text-foreground">{course.name}</p>
              <p className="text-xs text-muted-foreground">{course.description}</p>
            </div>
            <div className="flex items-center gap-1">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold mr-2", course.is_active ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>{course.is_active ? "Ativo" : "Inativo"}</span>
              <button onClick={() => startEdit(course)} className="p-1.5 text-muted-foreground hover:text-primary"><Edit2 className="h-4 w-4" /></button>
              <button onClick={() => handleDelete(course.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== EDICTS MANAGER =====================
function EdictsManager() {
  const { data: edicts = [], isLoading } = useAdminEdicts();
  const { data: courses = [] } = useAdminCourses();
  const createMutation = useCreateEdict();
  const updateMutation = useUpdateEdict();
  const deleteMutation = useDeleteEdict();
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [courseId, setCourseId] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando editais...</div>;

  const handleCreate = () => { if (!name.trim() || !courseId) return; createMutation.mutate({ name, year, courseId, isActive }); setName(""); setYear(new Date().getFullYear()); setIsActive(true); };
  const handleUpdate = (id: number) => { if (!name.trim()) return; updateMutation.mutate({ id, name, year, isActive }); setEditingId(null); };
  const handleDelete = (id: number) => { if (confirm("Apagar edital e seus vínculos?")) deleteMutation.mutate(id); };
  const startEdit = (e: any) => { setEditingId(e.id); setName(e.name); setYear(e.year); setCourseId(e.course_id); setIsActive(e.is_active); };
  const cancelEdit = () => { setEditingId(null); setName(""); setYear(new Date().getFullYear()); setIsActive(true); };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2"><FileText className="h-5 w-5 text-accent" /> Editais Cadastrados</h2>
      <div className="p-4 rounded-xl border border-accent/20 bg-accent/5 space-y-3">
        <p className="font-semibold text-sm">{editingId ? "Editar Edital" : "Novo Edital"}</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <input type="text" placeholder="Nome (Ex: PMMG 2024)" value={name} onChange={e => setName(e.target.value)} className="text-sm rounded-lg border border-border bg-card px-3 py-2" />
          <input type="number" placeholder="Ano" value={year} onChange={e => setYear(Number(e.target.value))} className="text-sm rounded-lg border border-border bg-card px-3 py-2" />
          <select value={courseId} onChange={e => setCourseId(Number(e.target.value))} disabled={!!editingId} className="text-sm rounded-lg border border-border bg-card px-3 py-2">
            <option value={0}>Selecione um Curso</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Ativo</label>
          <div className="flex items-center gap-2">
            {editingId && <button onClick={cancelEdit} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted">Cancelar</button>}
            <button onClick={() => editingId ? handleUpdate(editingId) : handleCreate()} disabled={!courseId || createMutation.isPending || updateMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent text-accent-foreground">
              {editingId ? "Salvar" : <><Plus className="h-4 w-4" /> Criar Edital</>}
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-3 mt-4">
        {edicts.map(edict => (
          <div key={edict.id} className="p-4 rounded-lg border border-border flex justify-between items-center">
            <div>
              <p className="font-bold text-foreground">{edict.name} <span className="text-xs font-normal text-muted-foreground ml-2">({edict.year})</span></p>
              <p className="text-xs text-muted-foreground">Curso: {(edict as any).courses?.name}</p>
            </div>
            <div className="flex items-center gap-1">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold mr-2", edict.is_active ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>{edict.is_active ? "Ativo" : "Inativo"}</span>
              <button onClick={() => startEdit(edict)} className="p-1.5 text-muted-foreground hover:text-accent"><Edit2 className="h-4 w-4" /></button>
              <button onClick={() => handleDelete(edict.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== SUBJECTS MANAGER =====================
function SubjectsManager() {
  const { data: subjects = [], isLoading } = useAdminSubjects();
  const createMutation = useCreateSubject();
  const updateMutation = useUpdateSubject();
  const deleteMutation = useDeleteSubject();
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando matérias...</div>;

  const handleCreate = () => { if (!name.trim()) return; createMutation.mutate({ name, description }); setName(""); setDescription(""); };
  const handleUpdate = (id: number) => { if (!name.trim()) return; updateMutation.mutate({ id, name, description }); setEditingId(null); };
  const handleDelete = (id: number) => { if (confirm("Apagar matéria?")) deleteMutation.mutate(id); };
  const startEdit = (s: any) => { setEditingId(s.id); setName(s.name); setDescription(s.description || ""); };
  const cancelEdit = () => { setEditingId(null); setName(""); setDescription(""); };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen className="h-5 w-5 text-warning" /> Matérias Cadastradas</h2>
      <div className="p-4 rounded-xl border border-warning/20 bg-warning/5 space-y-3">
        <p className="font-semibold text-sm">{editingId ? "Editar Matéria" : "Nova Matéria"}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <input type="text" placeholder="Nome da Matéria" value={name} onChange={e => setName(e.target.value)} className="text-sm rounded-lg border border-border bg-card px-3 py-2" />
          <input type="text" placeholder="Descrição" value={description} onChange={e => setDescription(e.target.value)} className="text-sm rounded-lg border border-border bg-card px-3 py-2" />
        </div>
        <div className="flex items-center justify-end gap-2">
          {editingId && <button onClick={cancelEdit} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted">Cancelar</button>}
          <button onClick={() => editingId ? handleUpdate(editingId) : handleCreate()} disabled={createMutation.isPending || updateMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-warning text-warning-foreground">
            {editingId ? "Salvar" : <><Plus className="h-4 w-4" /> Criar Matéria</>}
          </button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {subjects.map(sub => (
          <div key={sub.id} className="p-4 rounded-lg border border-border flex justify-between items-center">
            <div>
              <p className="font-bold text-foreground">{sub.name}</p>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{sub.description || "Sem descrição"}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => startEdit(sub)} className="p-1.5 text-muted-foreground hover:text-warning"><Edit2 className="h-4 w-4" /></button>
              <button onClick={() => handleDelete(sub.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== TOPICS MANAGER =====================
function TopicsManager() {
  const { data: topics = [], isLoading } = useAdminTopics();
  const { data: subjects = [] } = useAdminSubjects();
  const { data: courses = [] } = useAdminCourses();
  const createMutation = useCreateTopic();
  const updateMutation = useUpdateTopic();
  const deleteMutation = useDeleteTopic();
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState<number>(0);
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [targetCourseIds, setTargetCourseIds] = useState<number[]>([]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando temas...</div>;

  const handleCreate = () => { if (!name.trim() || !subjectId) return; createMutation.mutate({ name, description, subjectId, sortOrder, targetCourseIds }); setName(""); setDescription(""); setSortOrder(0); setTargetCourseIds([]); };
  const handleUpdate = (id: number) => { if (!name.trim()) return; updateMutation.mutate({ id, name, description, sortOrder, targetCourseIds }); setEditingId(null); setTargetCourseIds([]); };
  const handleDelete = (id: number) => { if (confirm("Apagar tema?")) deleteMutation.mutate(id); };
  const startEdit = (t: any) => { setEditingId(t.id); setName(t.name); setDescription(t.description || ""); setSubjectId(t.subject_id); setSortOrder(t.sort_order || 0); setTargetCourseIds(t.target_course_ids || []); };
  const cancelEdit = () => { setEditingId(null); setName(""); setDescription(""); setSortOrder(0); setTargetCourseIds([]); };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2"><Quote className="h-5 w-5 text-xp" /> Temas Cadastrados</h2>
      <div className="p-4 rounded-xl border border-xp/20 bg-xp/5 space-y-3">
        <p className="font-semibold text-sm">{editingId ? "Editar Tema" : "Novo Tema"}</p>
        <div className="grid sm:grid-cols-4 gap-3">
          <input type="text" placeholder="Nome do Tema" value={name} onChange={e => setName(e.target.value)} className="col-span-2 text-sm rounded-lg border border-border bg-card px-3 py-2" />
          <select value={subjectId} onChange={e => setSubjectId(Number(e.target.value))} disabled={!!editingId} className="text-sm rounded-lg border border-border bg-card px-3 py-2">
            <option value={0}>Selecione Matéria</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="number" placeholder="Ordem" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} className="text-sm rounded-lg border border-border bg-card px-3 py-2" />
        </div>
        
        <div className="mt-2 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Restringir aos Cursos (Deixe vazio para herdar da Matéria)</p>
          <div className="flex flex-wrap gap-2">
            {courses.map(c => (
              <label key={c.id} className="flex items-center gap-1.5 text-xs bg-muted/50 px-2.5 py-1.5 border border-border rounded-lg cursor-pointer hover:bg-muted">
                <input type="checkbox" checked={targetCourseIds.includes(c.id)} onChange={(e) => {
                  if (e.target.checked) setTargetCourseIds([...targetCourseIds, c.id]);
                  else setTargetCourseIds(targetCourseIds.filter(id => id !== c.id));
                }} />
                {c.name}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {editingId && <button onClick={cancelEdit} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted">Cancelar</button>}
          <button onClick={() => editingId ? handleUpdate(editingId) : handleCreate()} disabled={!subjectId || createMutation.isPending || updateMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-xp text-xp-foreground">
            {editingId ? "Salvar" : <><Plus className="h-4 w-4" /> Criar Tema</>}
          </button>
        </div>
      </div>
      <div className="grid gap-3 mt-4">
        {topics.map(topic => (
          <div key={topic.id} className="p-4 rounded-lg border border-border flex justify-between items-center">
            <div>
              <p className="font-bold text-foreground">{topic.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground">Matéria: {(topic as any).subjects?.name}</p>
                {topic.target_course_ids && topic.target_course_ids.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                    {topic.target_course_ids.length} Cursos
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-muted text-muted-foreground border mr-2">Ordem: {topic.sort_order}</span>
              <button onClick={() => startEdit(topic)} className="p-1.5 text-muted-foreground hover:text-xp"><Edit2 className="h-4 w-4" /></button>
              <button onClick={() => handleDelete(topic.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
