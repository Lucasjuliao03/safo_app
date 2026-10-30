import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applySameOriginCors } from "../server/httpSecurity.js";
import { authenticateBearer, getSupabaseAdmin } from "../server/supabaseAdmin.js";
import { isTopicVisibleForCourse } from "../src/lib/courseScope.js";

// Generic Vercel Node Functions do not expand [type] paths as Next.js does.
// vercel.json maps /api/content/:type to this static function's query string.

type ContentType = "questions" | "flashcards" | "summaries" | "subjects" | "topics";

const SELECTS: Record<ContentType, string> = {
  subjects: "id, name, description",
  topics: "id, name, subject_id, sort_order, target_course_ids",
  questions: `id, subject_id, topic_id, subtopic_id, question_type, difficulty, source_year, statement,
    option_a, option_b, option_c, option_d, option_e, format,
    board_id, is_active, status, law_reference_id, exam_boards(name),
    topics(name, target_course_ids), law_references(name, short_name)`,
  flashcards: `id, subject_id, topic_id, front_text, difficulty, law_reference_id,
    is_active, status, topics(name, target_course_ids), law_references(name, short_name)`,
  summaries: `id, subject_id, topic_id, subtopic_id, title, format, content_html, content_markdown,
    sort_order, law_reference_id, is_active, status, topics(name, target_course_ids),
    subtopics(name), law_references(name, short_name)`,
};

const catalogCache = new Map<ContentType, { expiresAt: number; rows: Record<string, unknown>[] }>();
const catalogCacheMs = 30_000;

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseIdList(value: string | undefined, max = 100): number[] {
  if (!value) return [];
  return [...new Set(value.split(",").map(Number).filter(Number.isSafeInteger))].slice(0, max);
}

function hasTopicCourse(row: Record<string, unknown>, courseId: number | null): boolean {
  const topic = row.topics as { target_course_ids?: number[] | null } | null;
  return isTopicVisibleForCourse(topic?.target_course_ids, courseId);
}

async function fetchAll(type: ContentType): Promise<Record<string, unknown>[]> {
  const cached = catalogCache.get(type);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const supabase = getSupabaseAdmin();
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];

  for (let page = 0; ; page += 1) {
    let query = supabase
      .from(type)
      .select(SELECTS[type])
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (type !== "subjects" && type !== "topics") {
      query = query.eq("is_active", true).eq("status", "published");
    }
    if (type === "summaries") query = query.order("sort_order");
    else query = query.order("id");

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < pageSize) break;
  }
  catalogCache.set(type, { expiresAt: Date.now() + catalogCacheMs, rows });
  return rows;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!applySameOriginCors(req, res)) return res.status(403).json({ error: "Origin not allowed" });
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const type = scalar(req.query.type) as ContentType | undefined;
    if (!type || !Object.hasOwn(SELECTS, type)) return res.status(404).json({ error: "Content type not found" });

    const user = await authenticateBearer(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Sessão inválida ou expirada" });

    const supabase = getSupabaseAdmin();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active, active_until, course_id, edital_id")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) return res.status(403).json({ error: "Perfil não disponível" });

    const requestedCourse = parseInteger(scalar(req.query.courseId));
    const courseId = profile.role === "admin" ? requestedCourse : Number(profile.course_id) || null;
    if (profile.role !== "admin" && !courseId) {
      return res.status(403).json({ error: "Sua conta ainda não tem um curso vinculado. Entre em contato com a equipe." });
    }

    // Metadata is available to enrolled trial students as well as subscribers.
    // Reading it through the API avoids depending on paid-content RLS grants.
    if (type === "subjects" || type === "topics") {
      const topics = (await fetchAll("topics")).filter(row => isTopicVisibleForCourse(
        row.target_course_ids as number[] | null, courseId,
      ));
      if (type === "topics") return res.status(200).json({ data: topics });
      const subjectIds = new Set(topics.map(row => String(row.subject_id)));
      const subjects = (await fetchAll("subjects"))
        .filter(row => courseId === null || subjectIds.has(String(row.id)))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
      return res.status(200).json({ data: subjects });
    }
    const activeUntil = profile.active_until ? new Date(profile.active_until).getTime() : null;
    const entitled = profile.role === "admin"
      || (profile.is_active === true && (activeUntil === null || activeUntil > Date.now()));

    let trialLimit = Number.POSITIVE_INFINITY;
    if (!entitled && type === "summaries") {
      // Keep the same two sample summaries available for rereading. The server
      // records reads independently; question/flashcard quota does not hide them.
      trialLimit = 2;
    }

    // The student's edital comes from the profile, never from query parameters.
    let lawIds = parseIdList(scalar(req.query.lawIds));
    if (profile.role !== "admin") {
      let edictQuery = supabase.from("edicts").select("id")
        .eq("course_id", courseId).eq("is_active", true);
      if (profile.edital_id) edictQuery = edictQuery.eq("id", profile.edital_id);
      const { data: edicts, error: edictError } = await edictQuery
        .order("year", { ascending: false }).order("id", { ascending: false }).limit(1);
      if (edictError) throw edictError;
      if (profile.edital_id && !edicts?.length) {
        return res.status(403).json({ error: "O edital vinculado à sua conta não está ativo neste curso. Entre em contato com a equipe." });
      }
      lawIds = [];
      if (edicts?.length) {
        const { data: links, error: linksError } = await supabase.from("edital_law_references")
          .select("law_reference_id").eq("edital_id", edicts[0].id);
        if (linksError) throw linksError;
        lawIds = (links ?? []).map(link => Number(link.law_reference_id));
      }
    }
    const requestedIds = parseIdList(scalar(req.query.ids));
    let rows = (await fetchAll(type))
      .filter((row) => hasTopicCourse(row, courseId))
      .filter((row) => {
        if (!lawIds.length) return true;
        const lawId = Number(row.law_reference_id);
        return !lawId || lawIds.includes(lawId);
      });

    // The full course catalog is browsable. Corrections and card backs are
    // delivered exclusively by /api/study after the atomic lifetime quota.
    rows = rows.slice(0, trialLimit);
    if (requestedIds.length) rows = rows.filter((row) => requestedIds.includes(Number(row.id)));
    rows = rows.map(row => {
      const { correct_option: _correct, explanation: _explanation, back_text: _back, ...catalogRow } = row;
      return type === "summaries" ? row : catalogRow;
    });

    return res.status(200).json({ data: rows, entitled, trialLimit });
  } catch (error) {
    console.error("[content] request failed", error instanceof Error ? error.message : error);
    const unavailable = error instanceof Error && error.message.toLowerCase().includes("configuration");
    return res.status(unavailable ? 503 : 500).json({
      error: unavailable
        ? "Serviço de conteúdo temporariamente indisponível"
        : "Não foi possível carregar o conteúdo",
    });
  }
}
