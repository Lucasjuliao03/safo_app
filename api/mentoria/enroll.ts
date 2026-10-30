import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applySameOriginCors } from "../../server/httpSecurity.js";
import { authenticateBearer, getSupabaseAdmin } from "../../server/supabaseAdmin.js";
import { isTopicVisibleForCourse } from "../../src/lib/courseScope.js";
import { requireAppAccess } from "../../server/appAccess.js";

/** Activates only the caller's mentoring plan after it has been saved. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!applySameOriginCors(req, res)) return res.status(403).json({ error: "Origin not allowed" });
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const user = await authenticateBearer(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Sessão inválida ou expirada" });
    if (!await requireAppAccess(user.id, res)) return;
    const db = getSupabaseAdmin();
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("course_id").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.course_id) return res.status(403).json({ error: "Vincule um curso antes de iniciar a mentoria." });
    const [diagnosis, tasks, enrollment] = await Promise.all([
      db.from("mentoria_diagnosticos")
        .select("id,daily_available_minutes,study_days_of_week,weak_subjects,strong_subjects,current_focus,method_style,review_frequency,include_simulations,simulation_frequency_days")
        .eq("user_id", user.id).maybeSingle(),
      db.from("mentoria_tarefas_diarias").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      db.from("mentoria_alunos").select("status").eq("user_id", user.id).maybeSingle(),
    ]);
    for (const result of [diagnosis, tasks, enrollment]) if (result.error) throw result.error;
    if (!diagnosis.data || !tasks.count) {
      return res.status(409).json({ error: "Conclua a geração do plano antes de iniciar a mentoria." });
    }
    if (enrollment.data?.status === "paused" || enrollment.data?.status === "finished") {
      return res.status(403).json({ error: "Entre em contato com seu mentor para reativar esta mentoria." });
    }
    // Strategy writes are admin-only under RLS. Derive the caller's strategy
    // here from saved preferences and the real curriculum instead of trusting
    // a user_id or unrestricted update sent by the browser.
    const { data: subjects, error: subjectsError } = await db.from("subjects")
      .select("name,topics(target_course_ids)");
    if (subjectsError) throw subjectsError;
    const diagnosisData = diagnosis.data;
    const weights = (subjects ?? [])
      .filter(subject => subject.topics.some(topic => isTopicVisibleForCourse(topic.target_course_ids, Number(profile.course_id))))
      .map(subject => ({
        name: subject.name as string,
        weight: diagnosisData.weak_subjects?.includes(subject.name) ? 1.5
          : diagnosisData.strong_subjects?.includes(subject.name) ? 0.6 : 1,
      }));
    const totalWeight = weights.reduce((sum, subject) => sum + subject.weight, 0);
    const focus = diagnosisData.current_focus && diagnosisData.current_focus !== "misto"
      ? diagnosisData.current_focus : diagnosisData.method_style || "misto";
    const percentage = ({ teoria: 0.25, questoes: 0.65, revisao: 0.30, reta_final: 0.55 } as Record<string, number>)[focus] ?? 0.4;
    const days = Array.isArray(diagnosisData.study_days_of_week) && diagnosisData.study_days_of_week.length
      ? diagnosisData.study_days_of_week.length : 5;
    const { error: strategyError } = await db.from("mentoria_estrategias").upsert({
      user_id: user.id,
      weekly_questions_target: Math.round(days * Math.max(30, diagnosisData.daily_available_minutes || 120) * percentage / 3),
      review_pattern: ({ diaria: "24h", dois_dias: "48h", semanal: "7d" } as Record<string, string>)[diagnosisData.review_frequency] || "7d",
      focus_areas: Object.fromEntries(weights.map(subject => [subject.name, `${Math.round(subject.weight / totalWeight * 100)}% do tempo`])),
      simulate_frequency_days: diagnosisData.include_simulations ? diagnosisData.simulation_frequency_days || 14 : 999,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (strategyError) throw strategyError;
    if (enrollment.data?.status !== "active") {
      // This action changes only mentoring status, never paid access or roles.
      const result = enrollment.data
        ? await db.from("mentoria_alunos").update({ status: "active" })
          .eq("user_id", user.id).eq("status", "pending").select("status").maybeSingle()
        : await db.from("mentoria_alunos").insert({ user_id: user.id, status: "active" })
          .select("status").single();
      if (result.error) throw result.error;
      if (!result.data) return res.status(409).json({ error: "O status da mentoria mudou. Recarregue a página." });
    }
    return res.status(200).json({ status: "active" });
  } catch (error) {
    console.error("[mentoria/enroll]", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "Não foi possível ativar a mentoria. Seu plano foi preservado; tente novamente." });
  }
}
