import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { User, UserRole } from "@/types/study";
import { toast } from "sonner";

// ---------------------------------------------------------
// USERS MODULE
// ---------------------------------------------------------

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin_users"],
    queryFn: async (): Promise<User[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      return data.map((d) => ({
        id: d.id,
        name: d.full_name || d.username || "Sem Nome",
        email: d.username || "",
        role: d.role as UserRole,
        isApproved: d.is_active,
        accessBlocked: d.access_blocked === true,
        createdAt: d.created_at,
        courseId: d.course_id,
        editalId: d.edital_id,
        activeUntil: d.active_until,
        passwordHash: "", // Not used
      }));
    },
  });
}

export function useApproveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").update({ is_active: true, active_until: null, access_blocked: false }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_users"] });
    },
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").update({ is_active: false, access_blocked: true }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_users"] });
    },
  });
}

export function useMigrateUsersEdital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { oldEditalId: number; newEditalId: number }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ edital_id: vars.newEditalId })
        .eq("edital_id", vars.oldEditalId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_users"] });
      toast.success("Alunos transferidos com sucesso!");
    },
  });
}

export function useUpdateUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; courseId?: number | null; editalId?: number | null; activeUntil?: string | null }) => {
      const payload: any = {};
      if (vars.courseId !== undefined) payload.course_id = vars.courseId;
      if (vars.editalId !== undefined) payload.edital_id = vars.editalId;
      if (vars.activeUntil !== undefined) payload.active_until = vars.activeUntil;
      
      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_users"] });
      toast.success("Perfil atualizado com sucesso!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------------------------------------------------------
// OTHER MODULES AHEAD...
// ---------------------------------------------------------

export function useAdminDashboardStats() {
  return useQuery({
    queryKey: ["admin_dashboard_stats"],
    queryFn: async () => {
      const [
        { count: usersCount }, 
        { count: questionsCount }, 
        { count: flashcardsCount }
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("questions").select("*", { count: "exact", head: true }),
        supabase.from("flashcards").select("*", { count: "exact", head: true }),
      ]);

      const today = new Date().toISOString().split('T')[0];
      const { data: prodData } = await supabase
        .from("user_daily_productivity")
        .select("questions_answered")
        .eq("productivity_date", today);
        
      const todayResolutions = prodData?.reduce((acc, curr) => acc + (curr.questions_answered || 0), 0) || 0;

      return {
        users: usersCount || 0,
        questions: questionsCount || 0,
        flashcards: flashcardsCount || 0,
        todayResolutions
      };
    }
  });
}

// STRUCTURE MODULE
export function useAdminCourses() {
  return useQuery({
    queryKey: ["admin_courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").order("id");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (course: { name: string; description: string; isActive?: boolean }) => {
      const { error } = await supabase.from("courses").insert({
        name: course.name,
        description: course.description,
        is_active: course.isActive ?? true
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_courses"] }),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; name: string; description: string; isActive: boolean }) => {
      const { error } = await supabase.from("courses").update({
        name: vars.name,
        description: vars.description,
        is_active: vars.isActive
      }).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_courses"] }),
  });
}

export function useAdminEdicts(courseId?: number) {
  return useQuery({
    queryKey: ["admin_edicts", courseId],
    queryFn: async () => {
      let query = supabase.from("edicts").select("*, courses(name)").order("year", { ascending: false });
      if (courseId) query = query.eq("course_id", courseId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateEdict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (edict: { courseId: number; name: string; year: number; isActive?: boolean }) => {
      const { error } = await supabase.from("edicts").insert({
        course_id: edict.courseId,
        name: edict.name,
        year: edict.year,
        is_active: edict.isActive ?? true
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_edicts"] }),
  });
}

export function useUpdateEdict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; name: string; year: number; isActive: boolean }) => {
      const { error } = await supabase.from("edicts").update({
        name: vars.name,
        year: vars.year,
        is_active: vars.isActive
      }).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_edicts"] }),
  });
}

// SUBJECTS
export function useAdminSubjects() {
  return useQuery({
    queryKey: ["admin_subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subject: { name: string; description?: string }) => {
      const { error } = await supabase.from("subjects").insert({
        name: subject.name,
        description: subject.description
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_subjects"] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

export function useUpdateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; name: string; description?: string }) => {
      const { error } = await supabase.from("subjects").update({
        name: vars.name,
        description: vars.description
      }).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_subjects"] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

// TOPICS
export function useAdminTopics(subjectId?: number) {
  return useQuery({
    queryKey: ["admin_topics", subjectId],
    queryFn: async () => {
      let query = supabase.from("topics").select("*, subjects(name)").order("sort_order");
      if (subjectId) query = query.eq("subject_id", subjectId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (topic: { subjectId: number; name: string; description?: string; sortOrder?: number; targetCourseIds?: number[] }) => {
      const { error } = await supabase.from("topics").insert({
        subject_id: topic.subjectId,
        name: topic.name,
        description: topic.description,
        sort_order: topic.sortOrder ?? 0,
        target_course_ids: topic.targetCourseIds && topic.targetCourseIds.length > 0 ? topic.targetCourseIds : null
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_topics"] });
      qc.invalidateQueries({ queryKey: ["topics"] });
    },
  });
}

export function useUpdateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; name: string; description?: string; sortOrder?: number; targetCourseIds?: number[] }) => {
      const { error } = await supabase.from("topics").update({
        name: vars.name,
        description: vars.description,
        sort_order: vars.sortOrder,
        target_course_ids: vars.targetCourseIds && vars.targetCourseIds.length > 0 ? vars.targetCourseIds : null
      }).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_topics"] });
      qc.invalidateQueries({ queryKey: ["topics"] });
    },
  });
}

// ---------------------------------------------------------
// CONTENT MODULE (FLASHCARDS & SUMMARIES & BOARDS)
// ---------------------------------------------------------

export function useAdminExamBoards() {
  return useQuery({
    queryKey: ["admin_exam_boards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exam_boards").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateExamBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from("exam_boards").upsert({ name }, { onConflict: 'name' }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_exam_boards"] });
    },
  });
}

export function useAdminFlashcards(filters?: { subjectId?: number; topicId?: number }) {
  return useQuery({
    queryKey: ["admin_flashcards", filters],
    queryFn: async () => {
      let query = supabase.from("flashcards").select("*, subjects(name), topics(name)").order("created_at", { ascending: false });
      if (filters?.subjectId) query = query.eq("subject_id", filters.subjectId);
      if (filters?.topicId) query = query.eq("topic_id", filters.topicId);
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (flashcard: any) => {
      const { error } = await supabase.from("flashcards").insert(flashcard);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_flashcards"] });
      qc.invalidateQueries({ queryKey: ["flashcards"] });
    },
  });
}

export function useUpdateFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; data: any }) => {
      const { error } = await supabase.from("flashcards").update(vars.data).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_flashcards"] });
      qc.invalidateQueries({ queryKey: ["flashcards"] });
    },
  });
}

export function useAdminSummaries(filters?: { subjectId?: number; topicId?: number }) {
  return useQuery({
    queryKey: ["admin_summaries", filters],
    queryFn: async () => {
      let query = supabase.from("summaries").select("*, subjects(name), topics(name)").order("created_at", { ascending: false });
      if (filters?.subjectId) query = query.eq("subject_id", filters.subjectId);
      if (filters?.topicId) query = query.eq("topic_id", filters.topicId);
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (summary: any) => {
      console.log('[useCreateSummary] inserting:', summary);
      const { data, error } = await supabase.from("summaries").insert(summary);
      console.log('[useCreateSummary] result:', data, 'error:', error);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_summaries"] });
      qc.invalidateQueries({ queryKey: ["summaries"] });
    },
  });
}

export function useUpdateSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; data: any }) => {
      const { error } = await supabase.from("summaries").update(vars.data).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_summaries"] });
      qc.invalidateQueries({ queryKey: ["summaries"] });
    },
  });
}

// ---------------------------------------------------------
// ENGAGEMENT MODULE (MESSAGES)
// ---------------------------------------------------------

export function useAdminMessages() {
  return useQuery({
    queryKey: ["admin_messages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("motivational_messages").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (message: { message: string; author?: string; theme?: string }) => {
      const { error } = await supabase.from("motivational_messages").insert(message);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_messages"] }),
  });
}

export function useUpdateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; data: { message?: string; author?: string; theme?: string; is_active?: boolean } }) => {
      const { error } = await supabase.from("motivational_messages").update(vars.data).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_messages"] }),
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("motivational_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_messages"] }),
});
}

export interface QuestionStats {
  total: number;
  withoutAnswer: number;
  withAnswer: number;
  active: number;
  inactive: number;
}

export function useQuestionStats() {
  return useQuery({
    queryKey: ["question_stats"],
    queryFn: async (): Promise<QuestionStats> => {
      // Buscar todas as questões com paginação (Supabase limita a 1000 por request)
      let allQuestions: any[] = [];
      let page = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from("questions")
          .select("id, is_active, correct_option, format")
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        
        if (!data || data.length === 0) break;
        
        allQuestions = [...allQuestions, ...data];
        
        if (data.length < pageSize) break;
        page++;
      }

      const total = allQuestions.length;
      const active = allQuestions.filter(q => q.is_active).length;
      const inactive = total - active;

      // Função para verificar se está sem gabarito
      const isMissingAnswer = (q: any) => {
        const correctOption = q.correct_option;
        
        // Se não tem correct_option
        if (!correctOption) return true;
        
        const val = String(correctOption).trim().toLowerCase();
        
        // Se estiver vazio ou n/a
        if (val === '' || val === 'n/a') return true;
        
        // Verificar se é válido para múltipla escolha (a,b,c,d,e) ou true_false (v,f,c,e)
        const isValidMultipleChoice = ['a', 'b', 'c', 'd', 'e'].includes(val);
        const isValidTrueFalse = ['v', 'f', 'c', 'e'].includes(val);
        
        // Se tem um format definido, usa ele, senão aceita ambos os padrões
        const format = q.format ? q.format.toString().toLowerCase() : null;
        
        if (format === 'true_false') {
          return !isValidTrueFalse;
        } else if (format === 'multiple_choice') {
          return !isValidMultipleChoice;
        }
        
        // Sem format definido, aceita qualquer um dos padrões
        return !(isValidMultipleChoice || isValidTrueFalse);
      };

      const withoutAnswer = allQuestions.filter(isMissingAnswer).length;
      const withAnswer = total - withoutAnswer;

      return { total, withoutAnswer, withAnswer, active, inactive };
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

export function useAdminQuestions(filters?: { subjectId?: number; topicId?: number; is_active?: boolean }) {
  return useQuery({
    queryKey: ["admin_questions", filters],
    queryFn: async () => {
      let query = supabase
        .from("questions")
        .select(`
          *,
          subjects(name),
          topics(name),
          exam_boards(name)
        `)
        .order("created_at", { ascending: false });
        
      if (filters?.subjectId) query = query.eq("subject_id", filters.subjectId);
      if (filters?.topicId) query = query.eq("topic_id", filters.topicId);
      if (filters?.is_active !== undefined) query = query.eq("is_active", filters.is_active);

      const { data, error } = await query.limit(500); // Admin limit to prevent massive payload
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (question: any) => {
      const { error } = await supabase.from("questions").insert(question);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_questions"] });
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}

export function useBulkCreateQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (questions: any[]) => {
      const { error } = await supabase.from("questions").insert(questions);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_questions"] });
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}

export function useUpdateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; data: any }) => {
      const { error } = await supabase.from("questions").update(vars.data).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_questions"] });
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_questions"] });
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
  });
}

// DELETE HOOKS MISSING IN OTHER MODULES

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_courses"] }),
  });
}

export function useDeleteEdict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("edicts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_edicts"] }),
  });
}

export function useDeleteSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_subjects"] }),
  });
}

export function useDeleteTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_topics"] }),
  });
}

export function useDeleteFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("flashcards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_flashcards"] }),
  });
}

export function useDeleteSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("summaries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_summaries"] }),
  });
}

// ---------------------------------------------------------
// EDICT-SUBJECTS LINK MODULE
// ---------------------------------------------------------

export function useAdminEdictSubjects(edictId?: number) {
  return useQuery({
    queryKey: ["admin_edict_subjects", edictId],
    queryFn: async () => {
      if (!edictId) return [];
      const { data, error } = await supabase
        .from("edict_subjects")
        .select("*, subjects(name)")
        .eq("edict_id", edictId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!edictId,
  });
}

export function useAddEdictSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { edictId: number; subjectId: number; sortOrder?: number }) => {
      const { error } = await supabase.from("edict_subjects").insert({
        edict_id: vars.edictId,
        subject_id: vars.subjectId,
        sort_order: vars.sortOrder ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_edict_subjects"] }),
  });
}

export function useRemoveEdictSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { edictId: number; subjectId: number }) => {
      const { error } = await supabase
        .from("edict_subjects")
        .delete()
        .eq("edict_id", vars.edictId)
        .eq("subject_id", vars.subjectId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_edict_subjects"] }),
  });
}

// ---------------------------------------------------------
// SUBSCRIPTIONS (PLANS) MODULE
// ---------------------------------------------------------

export function useAdminPlans() {
  return useQuery({
    queryKey: ["admin_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("price_cents", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: { code: string; name: string; description?: string; price_cents: number; duration_days: number; is_active?: boolean }) => {
      const { error } = await supabase.from("plans").insert(plan);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_plans"] }),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; data: any }) => {
      const { error } = await supabase.from("plans").update(vars.data).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_plans"] }),
  });
}

// ---------------------------------------------------------
// LAW REFERENCES — Catálogo de Normas/Leis
// ---------------------------------------------------------

export function useLawReferences(topicId?: number) {
  return useQuery({
    queryKey: ["law_references", topicId],
    queryFn: async () => {
      let q = supabase
        .from("law_references")
        .select("*, topics(name)")
        .eq("is_active", true)
        .order("name");
      if (topicId) q = q.eq("topic_id", topicId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useAllLawReferences() {
  return useQuery({
    queryKey: ["law_references_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("law_references")
        .select("*, topics(name)")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateLawReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string; short_name?: string; topic_id?: number; description?: string }) => {
      const { data, error } = await supabase
        .from("law_references")
        .insert({ ...vars, is_active: true })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["law_references"] });
      qc.invalidateQueries({ queryKey: ["law_references_all"] });
    },
  });
}

export function useUpdateLawReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; name: string; short_name?: string; topic_id?: number; description?: string; is_active?: boolean }) => {
      const { id, ...updates } = vars;
      const { error } = await supabase.from("law_references").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["law_references"] });
      qc.invalidateQueries({ queryKey: ["law_references_all"] });
    },
  });
}

export function useDeleteLawReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("law_references").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["law_references"] });
      qc.invalidateQueries({ queryKey: ["law_references_all"] });
      qc.invalidateQueries({ queryKey: ["edital_laws"] });
    },
  });
}

// ---------------------------------------------------------
// EDITAL ↔ LAW REFERENCES — Vínculo edital/normas
// ---------------------------------------------------------

export function useEditalLaws(editalId?: number) {
  return useQuery({
    queryKey: ["edital_laws", editalId],
    queryFn: async () => {
      if (!editalId) return [];
      const { data, error } = await supabase
        .from("edital_law_references")
        .select("law_reference_id, law_references(id, name, short_name, topic_id, topics(name))")
        .eq("edital_id", editalId);
      if (error) throw error;
      return (data || []).map((row: any) => row.law_references).filter(Boolean);
    },
    enabled: !!editalId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useLinkLawToEdital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { edital_id: number; law_reference_id: number }) => {
      const { error } = await supabase
        .from("edital_law_references")
        .upsert(vars, { onConflict: "edital_id,law_reference_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["edital_laws", vars.edital_id] }),
  });
}

export function useUnlinkLawFromEdital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { edital_id: number; law_reference_id: number }) => {
      const { error } = await supabase
        .from("edital_law_references")
        .delete()
        .eq("edital_id", vars.edital_id)
        .eq("law_reference_id", vars.law_reference_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["edital_laws", vars.edital_id] }),
  });
}

// ---------------------------------------------------------
// Filtro: busca law_reference_ids ativos para um curso
// (usado no front p/ restringir questões/flashcards/resumos)
// ---------------------------------------------------------

export function useCourseLawReferenceIds(courseId?: number | null) {
  return useQuery({
    queryKey: ["course_law_ids", courseId],
    queryFn: async () => {
      if (!courseId) return null; // null = sem filtro de lei (exibe tudo)
      const { data, error } = await supabase
        .from("v_course_active_laws")
        .select("law_reference_id")
        .eq("course_id", courseId);
      if (error) throw error;
      // Se nenhuma lei vinculada ao curso, retorna null (sem filtro restrictivo)
      if (!data || data.length === 0) return null;
      return data.map((row: any) => Number(row.law_reference_id));
    },
    staleTime: 1000 * 60 * 15,
    enabled: courseId !== undefined,
  });
}

