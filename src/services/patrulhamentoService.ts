import { supabase } from '@/lib/supabase';
import { Subject } from '@/types/study';

// ============================================================================
// TIPAGENS - PATRULHAMENTO
// ============================================================================

export type PatrulhaTipoFase = 'teoria' | 'questoes' | 'flashcards' | 'checkpoint';

export interface PatrulhaCampanha {
  id: number;
  course_id: number;
  titulo: string;
  descricao: string | null;
  ordem: number;
  setores?: PatrulhaSetor[];
}

export interface PatrulhaSetor {
  id: number;
  campanha_id: number;
  titulo: string;
  icone: string;
  ordem: number;
  fases?: PatrulhaFase[];
}

export interface PatrulhaFase {
  id: number;
  setor_id: number;
  tipo_fase: PatrulhaTipoFase;
  titulo: string;
  descricao: string | null;
  req_acertos: number;
  limite_itens: number;
  payload_json: any;
  ordem_global: number;
  xp_reward: number;
}

export interface PatrulhaProgresso {
  user_id: string;
  course_id: number;
  fase_atual_id: number | null;
  xp_total: number;
  fases_vencidas: number[]; // Array de IDs de fases já concluídas
  last_activity: string;
}

// ============================================================================
// MÉTODOS DO ALUNO (CONSUMO)
// ============================================================================

/**
 * Busca a trilha completa do curso do aluno (Campanhas > Setores > Fases)
 */
export async function getTrilhaPorCurso(courseId: number): Promise<PatrulhaCampanha[]> {
  const { data: campanhas, error: errC } = await supabase
    .from('patrulhamento_campanhas')
    .select('id, course_id, titulo, descricao, ordem')
    .eq('course_id', courseId)
    .order('ordem', { ascending: true });

  if (errC) throw errC;
  if (!campanhas || campanhas.length === 0) return [];

  const campIds = campanhas.map(c => c.id);

  const { data: setores, error: errS } = await supabase
    .from('patrulhamento_setores')
    .select('*')
    .in('campanha_id', campIds)
    .order('ordem', { ascending: true });
  if (errS) throw errS;

  const setorIds = (setores || []).map(s => s.id);
  
  let fases: PatrulhaFase[] = [];
  if (setorIds.length > 0) {
    const { data: f, error: errF } = await supabase
      .from('patrulhamento_fases')
      .select('*')
      .in('setor_id', setorIds)
      .order('ordem_global', { ascending: true });
    if (errF) throw errF;
    fases = f || [];
  }

  // Montar árvore
  return campanhas.map(camp => {
    const setList = (setores || []).filter(s => s.campanha_id === camp.id).map(setor => {
      const faseList = fases.filter(f => f.setor_id === setor.id);
      return { ...setor, fases: faseList };
    });
    return { ...camp, setores: setList };
  });
}

/**
 * Puxa o progresso (save game) do aluno atual no patrulhamento
 */
export async function fetchProgresso(userId: string, courseId: number): Promise<PatrulhaProgresso | null> {
  const { data, error } = await supabase
    .from('patrulhamento_progresso')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  
  // Garantir array no JSONB
  if (data) {
    data.fases_vencidas = Array.isArray(data.fases_vencidas) ? data.fases_vencidas : [];
  }
  return data;
}

/**
 * Conclui uma fase e avança para a próxima. Opcionalmente passa de setor/campanha.
 */
export async function completarFase(params: {
  userId: string;
  courseId: number;
  faseConcluidaId: number;
  nextFaseId: number | null; // Se for null, o cara zerou a trilha
  xpGanho: number;
}) {
  const currentP = await fetchProgresso(params.userId, params.courseId);

  let vencidas = currentP?.fases_vencidas || [];
  if (!vencidas.includes(params.faseConcluidaId)) {
    vencidas.push(params.faseConcluidaId);
  }

  const payload = {
    user_id: params.userId,
    course_id: params.courseId,
    fase_atual_id: params.nextFaseId,
    xp_total: (currentP?.xp_total || 0) + params.xpGanho,
    fases_vencidas: vencidas,
    last_activity: new Date().toISOString()
  };

  const { error } = await supabase
    .from('patrulhamento_progresso')
    .upsert(payload, { onConflict: 'user_id,course_id' });
  
  if (error) throw error;
  return payload;
}

// ============================================================================
// ADMIN EDIT E GESTÃO
// ============================================================================

export async function updatePatrulhaFase(faseId: number, data: Partial<PatrulhaFase>) {
  const { error } = await supabase
    .from('patrulhamento_fases')
    .update(data)
    .eq('id', faseId);
    
  if (error) throw error;
}

export async function updatePatrulhaCampanha(campanhaId: number, data: Partial<{ titulo: string; descricao: string; ordem: number }>) {
  const { error } = await supabase
    .from('patrulhamento_campanhas')
    .update(data)
    .eq('id', campanhaId);
  if (error) throw error;
}

export async function updatePatrulhaSetor(setorId: number, data: Partial<{ titulo: string; ordem: number }>) {
  const { error } = await supabase
    .from('patrulhamento_setores')
    .update(data)
    .eq('id', setorId);
  if (error) throw error;
}

// ============================================================================
// AUTO-BUILDER ENGINE (NÍVEL ADMIN)
// ============================================================================

/**
 * O Motor de Geração Dinâmica.
 * Apaga a trilha anterior do curso e constrói tudo do zero de forma linear,
 * gerando Fases de Teoria, Prática (questões) e Fixação (Flashcards) para cada TEMA.
 * E a cada N temas, gera um Checkpoint.
 */
export async function autoBuildTrilhaForCourse(courseId: number) {
  // ATENÇÃO: Esta é uma função destrutiva. Ao recriar a trilha, 
  // alunos podem acabar em IDs de fase que não existem mais. 
  // Na vida real, o admin reseta o progresso da galera, ou cria um versionamento.
  
  // 1. Limpar campanhas (Cascade apagará setores e fases)
  await supabase.from('patrulhamento_campanhas').delete().eq('course_id', courseId);
  
  // 2. Buscar matérias e temas reais vinculados ao curso
  const { data: allTopics, error: tErr } = await supabase
    .from('topics')
    .select('id, name, subject_id, target_course_ids, sort_order')
    .order('sort_order');
  if (tErr) throw tErr;

  const validTopics = (allTopics || []).filter(t => 
    !t.target_course_ids || t.target_course_ids.length === 0 || t.target_course_ids.includes(courseId)
  );

  const subIds = [...new Set(validTopics.map(t => t.subject_id))];
  const { data: subjects, error: sErr } = await supabase
    .from('subjects')
    .select('id, name')
    .in('id', subIds)
    .order('name');
  if (sErr) throw sErr;

  const subjectMap = new Map();
  subjects?.forEach(s => subjectMap.set(s.id, s.name));

  // 2.1 Fetch content counts per topic to only create valid phases (handling >1000 rows pagination natively)
  const fetchActiveTopicIds = async (table: string) => {
      let page = 0;
      const ids = new Set<number>();
      while (true) {
          const { data, error } = await supabase
              .from(table)
              .select('topic_id')
              .eq('is_active', true)
              .eq('status', 'published')
              .range(page * 1000, (page + 1) * 1000 - 1);
          
          if (error || !data || data.length === 0) break;
          data.forEach(row => { if (row.topic_id) ids.add(Number(row.topic_id)) });
          if (data.length < 1000) break;
          page++;
      }
      return ids;
  };

  const topicHasQuestions = await fetchActiveTopicIds('questions');
  const topicHasFlashcards = await fetchActiveTopicIds('flashcards');
  const topicHasSummaries = await fetchActiveTopicIds('summaries');

  // 3. Organizar blocos
  // Como são muitas matérias, faremos 1 Campanha por Matéria (ou agrupado).
  // Para simplificar: 1 Campanha = 1 Matéria. Setores = agrupamentos de temas.
  let ordemGlobalFase = 1;

  for (let i = 0; i < (subjects || []).length; i++) {
    const sub = subjects![i];
    
    // Inserir Campanha
    const { data: campData, error: errCmp } = await supabase
      .from('patrulhamento_campanhas')
      .insert({
        course_id: courseId,
        titulo: `Operação ${sub.name.toUpperCase()}`,
        descricao: `Domine todos os fundamentos da disciplina de ${sub.name}.`,
        ordem: i + 1
      }).select('id').single();
    if (errCmp) throw errCmp;

    const temasDaMateria = validTopics.filter(t => t.subject_id === sub.id);
    
    // Dividir temas em Setores de no máximo 3 temas
    const chunk_size = 3;
    let setorOrdem = 1;
    for (let k = 0; k < temasDaMateria.length; k += chunk_size) {
      const chunk = temasDaMateria.slice(k, k + chunk_size);
      
      const { data: setorData, error: errSetor } = await supabase
        .from('patrulhamento_setores')
        .insert({
          campanha_id: campData!.id,
          titulo: `Área de Varredura ${setorOrdem}`,
          icone: 'Crosshair',
          ordem: setorOrdem
        }).select('id').single();
      if (errSetor) throw errSetor;

      // Inserir Fases do chunk
      const fasesDoSetor = [];
      const topicsDoCheckPoint = [];

      for (let j = 0; j < chunk.length; j++) {
        const t = chunk[j];
        
        let addedToSector = false;

        // FASE a) Leitura
        if (topicHasSummaries.has(t.id)) {
           fasesDoSetor.push({
             setor_id: setorData!.id, type: 'teoria' as PatrulhaTipoFase, title: `Briefing: ${t.name}`,
             desc: `Instrução base sobre ${t.name}.`, limit: 0, req: 0,
             payload: { topic_id: t.id }, xp: 20
           });
           addedToSector = true;
        }

        // FASE b) Prática
        if (topicHasQuestions.has(t.id)) {
           fasesDoSetor.push({
              setor_id: setorData!.id, type: 'questoes' as PatrulhaTipoFase, title: `Tiro Prático: ${t.name}`,
              desc: `Bater 4 de 5 alvos para prosseguir.`, limit: 5, req: 4,
              payload: { topic_id: t.id }, xp: 75
           });
           addedToSector = true;
        }

        // FASE c) Fixação
        if (topicHasFlashcards.has(t.id)) {
           fasesDoSetor.push({
              setor_id: setorData!.id, type: 'flashcards' as PatrulhaTipoFase, title: `Reconhecimento: ${t.name}`,
              desc: `Memorização forçada via Flashcards.`, limit: 10, req: 0,
              payload: { topic_id: t.id }, xp: 30
           });
           addedToSector = true;
        }

        if (addedToSector) {
           topicsDoCheckPoint.push(t.id);
        }
      }

      // Se esse Setor inteiro não teve nenhuma fase, então não cria checkpoint e até apaga ele
      if (fasesDoSetor.length === 0) {
          await supabase.from('patrulhamento_setores').delete().eq('id', setorData!.id);
          continue; // Pula a inserção
      }

      // FASE FINAL DO SETOR: Checkpoint (só se tiver questions)
      fasesDoSetor.push({
         setor_id: setorData!.id, type: 'checkpoint' as PatrulhaTipoFase, title: `Extração N° ${setorOrdem}`,
         desc: `Prove seu valor antes de deixar a área. Simulado mesclado!`, limit: 10, req: 7,
         payload: { mix_topic_ids: topicsDoCheckPoint }, xp: 150
      });

      // Preparar bulk insert
      const insertFases = fasesDoSetor.map(f => ({
         setor_id:      f.setor_id,
         tipo_fase:     f.type,
         titulo:        f.title,
         descricao:     f.desc,
         limite_itens:  f.limit,
         req_acertos:   f.req,
         payload_json:  f.payload,
         ordem_global:  ordemGlobalFase++,
         xp_reward:     f.xp
      }));

      await supabase.from('patrulhamento_fases').insert(insertFases);
      setorOrdem++;
    }
  }

  return { message: "Trilha recriada com sucesso", fasesCriadas: ordemGlobalFase - 1 };
}
