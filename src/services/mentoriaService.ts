import { supabase } from '@/lib/supabase';

// ============================================================================
// SERVIÇOS DE MENTORIA - OPERAÇÕES CRUD COM SUPABASE
// Totalmente desacoplado de outros serviços para preservar Arquitetura Inicial
// ============================================================================

export type MentoriaTaskStatus = 'pending' | 'completed' | 'delayed' | 'skipped';
export type TaskType = 'theory' | 'questions' | 'review' | 'simulation' | 'reading';
export type PreferredPeriod = 'manha' | 'tarde' | 'noite' | 'variado';
export type PreparationLevel = 'iniciante' | 'intermediario' | 'avancado' | 'reta_final';
export type ReviewFrequency = 'diaria' | 'dois_dias' | 'semanal';
export type CurrentFocus = 'teoria' | 'questoes' | 'revisao' | 'reta_final' | 'misto';
export type MethodStyle = 'teoria' | 'questoes' | 'misto' | 'revisao';

export interface MentoriaAluno {
  id: string;
  user_id: string;
  mentor_id: string | null;
  status: 'active' | 'paused' | 'finished' | 'pending';
  profiles?: { name: string, email: string };
}

export interface MentoriaDiagnostico {
  id?: string;
  user_id: string;
  // Campos originais
  objective: string;
  exam_date: string | null;
  daily_available_minutes: number;
  strong_subjects: string[];
  weak_subjects: string[];
  history_report: string;
  method_style: MethodStyle | string;
  mentor_notes: string;
  // Novos campos do onboarding inteligente
  study_days_of_week: number[];        // [0-6] onde 0=Dom, 1=Seg, ..., 6=Sáb
  preferred_period: PreferredPeriod;
  preparation_level: PreparationLevel;
  include_simulations: boolean;
  simulation_frequency_days: number;
  review_frequency: ReviewFrequency;
  current_focus: CurrentFocus;
  schedule_notes: string;
  // Metadados de geração
  plan_generated: boolean;
  plan_version: number;
  plan_generated_at: string | null;
}

export interface MentoriaEstrategia {
  id?: string;
  user_id: string;
  weekly_questions_target: number;
  review_pattern: string;
  focus_areas: Record<string, string>;
  simulate_frequency_days: number;
}

export interface MentoriaTarefa {
  id: string;
  user_id: string;
  planned_date: string;
  task_type: TaskType;
  subject_id: string | null;
  title: string;
  description: string | null;
  planned_minutes: number;
  status: MentoriaTaskStatus;
  actual_minutes: number | null;
  actual_questions: number | null;
  student_notes: string | null;
  subjects?: { name: string };
}

// Interface para o gerador de plano
export interface PlanTopicInput {
  id: string;
  name: string;
}

export interface PlanSubjectInput {
  id: string;
  name: string;
  topics?: PlanTopicInput[]; // temas vinculados a esta matéria no curso
}

export interface PlanGeneratorInput {
  userId: string;
  subjects: PlanSubjectInput[];
  diagnostico: Partial<MentoriaDiagnostico>;
  startDate?: string;        // padrão: hoje
  weeksToGenerate?: number;  // se omitido, calcula por exam_date
}

/**
 * Busca todas as matérias do curso com seus temas vinculados.
 * Usa a mesma lógica de target_course_ids já existente no sistema.
 */
export async function getSubjectsWithTopicsForCourse(courseId: string): Promise<PlanSubjectInput[]> {
  const cid = Number(courseId);

  // 1. Buscar todos os temas do curso
  const { data: allTopics, error: topicErr } = await supabase
    .from('topics')
    .select('id, name, subject_id, target_course_ids, sort_order')
    .order('sort_order');
  if (topicErr) throw topicErr;

  // Filtrar temas visíveis ao curso
  const visibleTopics = (allTopics || []).filter((t: any) =>
    !t.target_course_ids || t.target_course_ids.length === 0 || t.target_course_ids.includes(cid)
  );

  if (visibleTopics.length === 0) return [];

  // 2. Buscar matérias que têm ao menos 1 tema visível
  const subjectIds = [...new Set(visibleTopics.map((t: any) => t.subject_id))];
  const { data: subjects, error: subErr } = await supabase
    .from('subjects')
    .select('id, name')
    .in('id', subjectIds)
    .order('name');
  if (subErr) throw subErr;

  // 3. Montar estrutura matéria → temas
  const topicsBySubject = new Map<string, PlanTopicInput[]>();
  visibleTopics.forEach((t: any) => {
    const key = String(t.subject_id);
    if (!topicsBySubject.has(key)) topicsBySubject.set(key, []);
    topicsBySubject.get(key)!.push({ id: String(t.id), name: t.name });
  });

  return (subjects || []).map((s: any) => ({
    id:     String(s.id),
    name:   s.name,
    topics: topicsBySubject.get(String(s.id)) || [],
  }));
}

// ---------------------------------------------------------
// Área do Aluno (Visualização e Check-in)
// ---------------------------------------------------------

export async function getMyMentoriaStatus(userId: string) {
  const { data, error } = await supabase
    .from('mentoria_alunos')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 is No Rows Found
  return data || null;
}

export async function getDiagnostico(userId: string) {
  const { data, error } = await supabase.from('mentoria_diagnosticos').select('*').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function getEstrategia(userId: string) {
  const { data, error } = await supabase.from('mentoria_estrategias').select('*').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function getTasksByDateRange(userId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('mentoria_tarefas_diarias')
    .select(`*, subjects(name)`)
    .eq('user_id', userId)
    .gte('planned_date', startDate)
    .lte('planned_date', endDate)
    .order('planned_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function checkInTask(taskId: string, userId: string, payload: Partial<MentoriaTarefa>) {
  const { data, error } = await supabase
    .from('mentoria_tarefas_diarias')
    .update({
      status: payload.status,
      actual_minutes: payload.actual_minutes,
      actual_questions: payload.actual_questions,
      student_notes: payload.student_notes,
      completed_at: payload.status === 'completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getStudentAlerts(userId: string) {
  const { data, error } = await supabase
    .from('mentoria_alertas')
    .select('*')
    .eq('user_id', userId)
    .eq('is_resolved', false)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}


/**
 * Calcula quantas semanas gerar até a véspera da prova.
 * Sem data de prova: fallback de 8 semanas (máx 52).
 */
function calcWeeksToGenerate(examDate: string | null | undefined, startDate: string, fallback = 8): number {
  if (examDate) {
    const ms = new Date(examDate + 'T12:00:00Z').getTime() - new Date(startDate + 'T12:00:00Z').getTime();
    const days = Math.floor(ms / 86_400_000);
    if (days > 1) return Math.min(Math.ceil((days - 1) / 7), 52);
  }
  return Math.min(fallback, 52);
}

/**
 * Gera plano de estudos personalizado.
 * - Múltiplas tarefas/dia (blocos de ~75 min).
 * - Cobre TODAS as matérias com rotação ponderada.
 * - Gera até a véspera da prova, ou 8 semanas se sem data.
 * - Operações pós-insert isoladas em try/catch (não mascaram o resultado).
 */
export async function generateStudyPlan(input: PlanGeneratorInput): Promise<number> {
  const {
    userId,
    subjects,
    diagnostico,
    startDate = new Date().toISOString().split('T')[0],
    weeksToGenerate: weeksOverride,
  } = input;

  if (!userId)           throw new Error('userId é obrigatório.');
  if (!subjects?.length) throw new Error('Nenhuma matéria encontrada. Verifique se o curso está configurado no perfil do aluno.');

  // Preferências com fallbacks defensivos
  const dailyMinutes       = Math.max(30, diagnostico.daily_available_minutes || 120);
  const rawDays            = diagnostico.study_days_of_week;
  const studyDays: number[] = Array.isArray(rawDays) && rawDays.length > 0 ? rawDays : [1, 2, 3, 4, 5];
  const weakSubjects       = Array.isArray(diagnostico.weak_subjects)   ? diagnostico.weak_subjects   : [];
  const strongSubjects     = Array.isArray(diagnostico.strong_subjects) ? diagnostico.strong_subjects : [];
  const currentFocus       = diagnostico.current_focus || 'misto';
  const methodStyle        = diagnostico.method_style  || 'misto';
  const includeSimulations = diagnostico.include_simulations ?? false;
  const simFrequency       = diagnostico.simulation_frequency_days || 14;
  const reviewFrequency    = diagnostico.review_frequency || 'semanal';
  const examDate           = diagnostico.exam_date || null;

  // Semanas do plano: exam_date → véspera, ou fallback 8 semanas
  const weeksToGenerate = weeksOverride ?? calcWeeksToGenerate(examDate, startDate, 8);

  console.log('[generateStudyPlan]', {
    userId, subjects: subjects.length, dailyMinutes,
    studyDays, weeksToGenerate, examDate, startDate,
  });

  if (weeksToGenerate <= 0) throw new Error('A data da prova já passou. Selecione uma data futura.');

  // Blocos por dia: alvo ~75 min cada (1–6 blocos)
  const blocksPerDay = Math.max(1, Math.min(6, Math.round(dailyMinutes / 75)));
  const blockMinutes = Math.round(dailyMinutes / blocksPerDay);
  console.log('[generateStudyPlan] blocos/dia:', blocksPerDay, '| min/bloco:', blockMinutes);

  // Sequência de tipos por foco
  const typeSeqMap: Record<string, TaskType[]> = {
    teoria:     ['theory',    'theory',    'questions', 'review',   'reading',   'review'],
    questoes:   ['questions', 'questions', 'theory',    'questions','review',    'questions'],
    revisao:    ['review',    'questions', 'review',    'theory',   'review',    'questions'],
    reta_final: ['questions', 'review',    'questions', 'review',   'questions', 'theory'],
    misto:      ['theory',    'questions', 'review',    'questions','reading',   'review'],
  };
  const effectiveFocus = currentFocus !== 'misto' ? currentFocus
    : (methodStyle === 'teoria' ? 'teoria'
    : methodStyle === 'questoes' ? 'questoes'
    : methodStyle === 'revisao' ? 'revisao' : 'misto');
  const typeSeq = typeSeqMap[effectiveFocus] || typeSeqMap.misto;

  // Saco de rotação ponderada por PARES (matéria + tema)
  // Fracas: 1.5× slots | Fortes: 0.6× slots | Normal: 1×
  // Cada matéria contribui com (peso × 10) cópias de cada tema
  // Isso garante que temas de matérias fracas apareçam mais vezes
  interface SlotItem {
    subjectId: string;
    subjectName: string;
    topicId: string | null;
    topicName: string | null;
    isWeak: boolean;
    isStrong: boolean;
  }

  const rotationBag: SlotItem[] = [];

  subjects.forEach(sub => {
    const weight = weakSubjects.includes(sub.name) ? 1.5
                 : strongSubjects.includes(sub.name) ? 0.6
                 : 1.0;
    const repeats = Math.max(1, Math.round(weight * 10));
    const isWeak  = weakSubjects.includes(sub.name);
    const isStrong = strongSubjects.includes(sub.name);
    const topics  = sub.topics && sub.topics.length > 0 ? sub.topics : [{ id: null, name: null }];

    // Para cada tema, adicionar (repeats) slots dividido pelo nº de temas
    // (para que a matéria como um todo tenha peso correto)
    const slotsPerTopic = Math.max(1, Math.round(repeats / topics.length));

    topics.forEach(topic => {
      for (let k = 0; k < slotsPerTopic; k++) {
        rotationBag.push({
          subjectId:   sub.id,
          subjectName: sub.name,
          topicId:     topic.id ?? null,
          topicName:   topic.name ?? null,
          isWeak,
          isStrong,
        });
      }
    });
  });

  // Fisher-Yates shuffle
  for (let i = rotationBag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rotationBag[i], rotationBag[j]] = [rotationBag[j], rotationBag[i]];
  }

  console.log('[generateStudyPlan] saco de rotação:', rotationBag.length, 'slots');

  // Datas válidas dentro do período
  const startD = new Date(startDate + 'T12:00:00Z');
  const validDates: string[] = [];
  for (let i = 0; i < weeksToGenerate * 7; i++) {
    const d = new Date(startD);
    d.setDate(d.getDate() + i);
    if (studyDays.includes(d.getUTCDay())) validDates.push(d.toISOString().split('T')[0]);
  }
  console.log('[generateStudyPlan] datas válidas:', validDates.length, '| primeiras 3:', validDates.slice(0, 3));
  if (validDates.length === 0) {
    throw new Error(`Nenhum dia de estudo encontrado. Dias selecionados: [${studyDays.join(', ')}] (0=Dom…6=Sáb).`);
  }

  // Labels de tipo
  const typeLabel: Record<TaskType, string> = {
    theory: '📖 Teoria', questions: '📝 Questões', review: '🔁 Revisão',
    simulation: '🏋 Simulado', reading: '📚 Leitura',
  };
  const typeDesc: Record<TaskType, string> = {
    theory:     'Estude os conceitos teóricos e princípios fundamentais do tema.',
    questions:  'Resolva questões de concurso sobre este tema — foco em velocidade e acertos.',
    review:     'Revisão ativa do tema: flashcards, mapas mentais, lei seca, esquemas.',
    simulation: 'Simulado cronometrado — condições reais de prova.',
    reading:    'Leitura dirigida: legislação, doutrina ou material complementar do tema.',
  };

  // Montar tarefas — 1 tarefa por bloco por dia
  const tasks: Omit<MentoriaTarefa, 'id' | 'subjects'>[] = [];
  const reviewEvery = reviewFrequency === 'diaria' ? 1 : reviewFrequency === 'dois_dias' ? 2 : 5;

  let rotIdx = 0, typeIdx = 0, simCounter = 0;

  for (const date of validDates) {
    simCounter++;

    if (includeSimulations && simFrequency > 0 && simCounter % simFrequency === 0) {
      tasks.push({
        user_id: userId, planned_date: date, task_type: 'simulation', subject_id: null,
        title: '🏋 Simulado Completo',
        description: 'Simulado cronometrado cobrindo todas as matérias. Simule as condições reais de prova.',
        planned_minutes: Math.min(dailyMinutes, 240), status: 'pending',
        actual_minutes: null, actual_questions: null, student_notes: null,
      });
      continue;
    }

    const forceReview = simCounter % reviewEvery === 0;

    for (let b = 0; b < blocksPerDay; b++) {
      const slot = rotationBag[rotIdx % rotationBag.length];
      rotIdx++;

      const taskType: TaskType = (forceReview && b === blocksPerDay - 1)
        ? 'review'
        : (() => { const t = typeSeq[typeIdx % typeSeq.length]; typeIdx++; return t; })();

      const badge = slot.isWeak ? ' ⚠️' : slot.isStrong ? ' ✅' : '';

      // Título: "📖 Teoria: Doutrina Operacional › CyberPM"
      const topicPart = slot.topicName ? ` › ${slot.topicName}` : '';
      const title = `${typeLabel[taskType]}: ${slot.subjectName}${topicPart}${badge}`;

      // Descrição rica com matéria + tema
      let desc = typeDesc[taskType];
      if (slot.topicName) desc += ` Tema: ${slot.topicName}.`;
      if (slot.isWeak)    desc += ' ⚠️ Matéria de dificuldade — atenção redobrada.';
      if (slot.isStrong)  desc += ' ✅ Matéria de domínio — manutenção.';

      tasks.push({
        user_id:          userId,
        planned_date:     date,
        task_type:        taskType,
        subject_id:       slot.subjectId,
        title,
        description:      desc,
        planned_minutes:  blockMinutes,
        status:           'pending',
        actual_minutes:   null,
        actual_questions: null,
        student_notes:    null,
      });
    }
  }


  console.log('[generateStudyPlan] tarefas montadas:', tasks.length);
  if (tasks.length === 0) throw new Error('Nenhuma tarefa gerada. Verifique os dias de estudo selecionados.');

  // INSERT crítico — lança erro com mensagem clara
  const BATCH = 100;
  for (let i = 0; i < tasks.length; i += BATCH) {
    const { error } = await supabase.from('mentoria_tarefas_diarias').insert(tasks.slice(i, i + BATCH));
    if (error) {
      console.error('[generateStudyPlan] INSERT error:', error);
      throw new Error(`Erro ao salvar tarefas: ${error.message}. Execute o SQL de migração no Supabase.`);
    }
  }

  // Operações pós-insert (não-críticas — falha não cancela o resultado)
  try {
    const totalW = weights.reduce((s, x) => s + x.weight, 0);
    const focusAreas: Record<string, string> = {};
    weights.forEach(s => { focusAreas[s.name] = `${Math.round((s.weight / totalW) * 100)}% do tempo`; });
    const weeklyM = studyDays.length * dailyMinutes;
    const pctQ = ({ teoria: 0.25, questoes: 0.65, revisao: 0.30, reta_final: 0.55, misto: 0.40 } as Record<string,number>)[effectiveFocus] ?? 0.40;
    const rmap: Record<string, string> = { diaria: '24h', dois_dias: '48h', semanal: '7d' };
    await supabase.from('mentoria_estrategias').upsert({
      user_id: userId,
      weekly_questions_target: Math.round((weeklyM * pctQ) / 3),
      review_pattern: rmap[reviewFrequency] || '7d',
      focus_areas: focusAreas,
      simulate_frequency_days: includeSimulations ? simFrequency : 999,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (e) { console.warn('[generateStudyPlan] estratégia (não crítico):', e); }

  try {
    const v = (diagnostico.plan_version || 0) + 1;
    await supabase.from('mentoria_plan_versions').insert({
      user_id: userId, version: v,
      reason: v === 1 ? 'onboarding_inicial' : 're_diagnostico',
      snapshot: { subjects_count: subjects.length, blocks_per_day: blocksPerDay, block_minutes: blockMinutes, exam_date: examDate },
    });
    await supabase.from('mentoria_diagnosticos').update({
      plan_generated: true, plan_version: v,
      plan_generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
  } catch (e) { console.warn('[generateStudyPlan] versão/flags (execute SQL de migração):', e); }

  console.log('[generateStudyPlan] ✅', tasks.length, 'tarefas inseridas');
  return tasks.length;
}





/**
 * Remove tarefas PENDENTES futuras do aluno para permitir re-geração limpa.
 * Tarefas com status != 'pending' (histórico) são preservadas.
 */
export async function deletePendingFutureTasks(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase
    .from('mentoria_tarefas_diarias')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gte('planned_date', today);
  if (error) throw error;
}

// ---------------------------------------------------------
// Área do Mentor (Administração de Alunos e Planos)
// ---------------------------------------------------------

export async function getMentoringStudents() {
  const { data, error } = await supabase
    .from('mentoria_alunos')
    .select(`*`)
    .order('started_at', { ascending: false });

  if (error) {
    console.error("Error fetching students:", error);
    return [];
  }
  return data || [];
}

export async function upsertDiagnostico(data: Partial<MentoriaDiagnostico>) {
  const payload = { ...data, updated_at: new Date().toISOString() };
  const { data: result, error } = await supabase
    .from('mentoria_diagnosticos')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function upsertEstrategia(data: Partial<MentoriaEstrategia>) {
  const payload = { ...data, updated_at: new Date().toISOString() };
  const { data: result, error } = await supabase
    .from('mentoria_estrategias')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function adminSaveTasks(tasks: Omit<MentoriaTarefa, 'id' | 'created_at' | 'updated_at' | 'completed_at'>[]) {
  const { data, error } = await supabase
    .from('mentoria_tarefas_diarias')
    .insert(tasks)
    .select();

  if (error) throw error;
  return data;
}

export async function getAllStudentTasks(userId: string) {
  if (!userId) return [];
  
  // Buscar todas as tarefas com paginação (o Supabase limita a 1000 por request)
  let allTasks: any[] = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('mentoria_tarefas_diarias')
      .select(`*, subjects(name)`)
      .eq('user_id', userId)
      .order('planned_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('[getAllStudentTasks] Error:', error);
      throw error;
    }
    
    if (!data || data.length === 0) break;
    
    allTasks = [...allTasks, ...data];
    
    if (data.length < pageSize) break;
    page++;
  }

  console.log('[getAllStudentTasks] Total tasks fetched:', allTasks.length);
  console.log('[getAllStudentTasks] Sample task:', allTasks[0]);
  
  return allTasks || [];
}

export async function registrarIntervencao(userId: string, mentorId: string, reason: string, action_taken: string) {
  const { data, error } = await supabase
    .from('mentoria_intervencoes')
    .insert({ user_id: userId, mentor_id: mentorId, reason, action_taken })
    .select();

  if (error) throw error;
  return data;
}

export async function getStudentInterventions(userId: string) {
  const { data, error } = await supabase
    .from('mentoria_intervencoes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function deleteIntervencao(id: string) {
  const { error } = await supabase.from('mentoria_intervencoes').delete().eq('id', id);
  if (error) throw error;
}

export async function updateIntervencao(id: string, reason: string, action_taken: string) {
  const { data, error } = await supabase
    .from('mentoria_intervencoes')
    .update({ reason, action_taken })
    .eq('id', id)
    .select();
  if (error) throw error;
  return data;
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('mentoria_tarefas_diarias').delete().eq('id', id);
  if (error) throw error;
}

export async function updateTask(id: string, payload: { title?: string; description?: string; planned_minutes?: number; planned_date?: string }) {
  const { data, error } = await supabase
    .from('mentoria_tarefas_diarias')
    .update(payload)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data;
}

export async function activateMentoria(userId: string, mentorId: string) {
  const { data, error } = await supabase
    .from('mentoria_alunos')
    .upsert({ user_id: userId, mentor_id: mentorId, status: 'active' }, { onConflict: 'user_id' })
    .select();

  if (error) throw error;

  await supabase.from('mentoria_diagnosticos').upsert({ user_id: userId }, { onConflict: 'user_id' });
  await supabase.from('mentoria_estrategias').upsert({ user_id: userId }, { onConflict: 'user_id' });

  return data;
}
