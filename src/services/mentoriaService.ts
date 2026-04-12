import { supabase } from '@/lib/supabase';

// ============================================================================
// SERVIÇOS DE MENTORIA - OPERAÇÕES CRUD COM SUPABASE
// Totalmente desacoplado de outros serviços para preservar Arquitetura Inicial
// ============================================================================

export type MentoriaTaskStatus = 'pending' | 'completed' | 'delayed' | 'skipped';
export type TaskType = 'theory' | 'questions' | 'review' | 'simulation' | 'reading';

export interface MentoriaAluno {
  id: string;
  user_id: string;
  mentor_id: string | null;
  status: 'active' | 'paused' | 'finished';
  profiles?: { name: string, email: string }; 
}

export interface MentoriaDiagnostico {
  id?: string;
  user_id: string;
  objective: string;
  exam_date: string | null;
  daily_available_minutes: number;
  strong_subjects: string[];
  weak_subjects: string[];
  history_report: string;
  method_style: string;
  mentor_notes: string;
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
  // Garantimos que a Row Level Security (RLS) protege isso usando user_id implícito via Auth, mas limitamos payload.
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
    // Silent fail in UI but log:
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
  // Batch insert de blocos diários de estudo pelo mentor
  const { data, error } = await supabase
    .from('mentoria_tarefas_diarias')
    .insert(tasks)
    .select();
    
  if (error) throw error;
  return data;
}

export async function getAllStudentTasks(userId: string) {
  const { data, error } = await supabase
    .from('mentoria_tarefas_diarias')
    .select(`*, subjects(name)`)
    .eq('user_id', userId)
    .order('planned_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);
    
  if (error) throw error;
  return data || [];
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
