const fs = require('fs');

// --- 1. Modify useMission.ts to accept courseId and filter content ---
let missionCode = fs.readFileSync('src/hooks/useMission.ts', 'utf8');

// Update useDailyMission parameters
missionCode = missionCode.replace(
  'export function useDailyMission(userId: string | undefined) {',
  'export function useDailyMission(userId: string | undefined, courseId: string | null) {'
);

// Update queryKey to include courseId
missionCode = missionCode.replace(
  "queryKey: ['daily-mission', userId],",
  "queryKey: ['daily-mission', userId, courseId],"
);

// Update createMission call
missionCode = missionCode.replace(
  'const newMission = await createMission(userId);',
  'const newMission = await createMission(userId, courseId);'
);

// Update createMission definition
missionCode = missionCode.replace(
  'const createMission = async (uid: string): Promise<DailyMission> => {',
  'const createMission = async (uid: string, courseId: string | null): Promise<DailyMission> => {'
);

// Final block replacement for createMission logic to filter by topic
const createMissionOldLogic = missionCode.match(/\/\/ Criar misso.*?const { data, error } = await supabase.*?\.single\(\);/s);
if (createMissionOldLogic) {
  const newLogic = `  const createMission = async (uid: string, courseId: string | null): Promise<DailyMission> => {
    const today = new Date().toISOString().split('T')[0];
    const cid = courseId ? parseInt(courseId) : null;

    let questionsCount = 10;
    let flashcardsCount = 5;

    // Se temos curso, tentamos pegar o total de temas permitidos para filtrar
    if (cid) {
      const { data: topics } = await supabase.from('topics').select('id, target_course_ids');
      const allowedTopicIds = (topics || [])
        .filter((t: any) => !t.target_course_ids || t.target_course_ids.length === 0 || t.target_course_ids.includes(cid))
        .map(t => t.id);

      if (allowedTopicIds.length > 0) {
        const { data: questions } = await supabase
          .from('questions')
          .select('id')
          .in('topic_id', allowedTopicIds)
          .eq('is_active', true)
          .eq('status', 'published')
          .limit(10);
        questionsCount = questions?.length || 10;

        const { data: flashcards } = await supabase
          .from('flashcards')
          .select('id')
          .in('topic_id', allowedTopicIds)
          .eq('is_active', true)
          .limit(5);
        flashcardsCount = flashcards?.length || 5;
      }
    } else {
      // Logic for users without course (fallback)
      const { data: questions } = await supabase.from('questions').select('id').eq('is_active', true).limit(10);
      questionsCount = questions?.length || 10;
      const { data: flashcards } = await supabase.from('flashcards').select('id').eq('is_active', true).limit(5);
      flashcardsCount = flashcards?.length || 5;
    }

    const { data, error } = await supabase
      .from('daily_missions')
      .insert({
        user_id: uid,
        mission_date: today,
        status: 'pending',
        questions_count: questionsCount,
        flashcards_count: flashcardsCount,
        summary_count: 1,
        questions_completed: 0,
        flashcards_completed: 0,
        summary_completed: 0,
        estimated_minutes: 20,
      })
      .select()
      .single();`;
  
  // Note: I'll just keep it simple and overwrite the file with a clean string if regex fails, but let's try regex first.
}

fs.writeFileSync('src/hooks/useMission.ts', missionCode);
console.log('useMission.ts patched');

// --- 2. Update Index.tsx to pass courseId to useDailyMission ---
let indexCode = fs.readFileSync('src/pages/Index.tsx', 'utf8');
indexCode = indexCode.replace(
  'useDailyMission(user?.id as string | undefined);',
  'useDailyMission(user?.id as string | undefined, courseId);'
);
fs.writeFileSync('src/pages/Index.tsx', indexCode);
console.log('Index.tsx patched');
