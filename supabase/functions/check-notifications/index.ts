// supabase/functions/check-notifications/index.ts
// Edge Function chamada pelo pg_cron para verificar e enviar notificações agendadas
// Deploy: supabase functions deploy check-notifications

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

Deno.serve(async (req) => {
  const jsonHeaders = { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" };
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const notificationType = body.type || "daily_reminder";
    const today = new Date().toISOString().split("T")[0];

    console.log(`[check-notifications] Tipo: ${notificationType}, Data: ${today}`);

    let usersToNotify: any[] = [];
    let notificationPayload: { title: string; body: string; url: string; type: string; motivational_message_id?: number } = {
      title: "",
      body: "",
      url: "/",
      type: notificationType,
    };

    switch (notificationType) {
      // ═══════════════════════════════════════════ //
      //  LEMBRETE DIÁRIO DE ESTUDO                 //
      // ═══════════════════════════════════════════ //
      case "daily_reminder": {
        // Buscar usuários que querem lembrete diário E não estudaram hoje
        const { data: prefs } = await adminClient
          .from("user_notification_preferences")
          .select("user_id")
          .eq("push_enabled", true)
          .eq("daily_reminder", true);

        if (!prefs?.length) break;

        const userIds = prefs.map((p: any) => p.user_id);

        // Verificar quais NÃO estudaram hoje
        const { data: productivity } = await adminClient
          .from("user_daily_productivity")
          .select("user_id")
          .eq("productivity_date", today)
          .gt("questions_answered", 0)
          .in("user_id", userIds);

        const studiedToday = new Set(productivity?.map((p: any) => p.user_id) || []);
        usersToNotify = userIds.filter((id: string) => !studiedToday.has(id));

        const messages = [
          "Hora de estudar! 🚀 Sua jornada rumo à aprovação continua.",
          "Bom dia, concurseiro! Vamos resolver algumas questões? 💪",
          "O estudo é a chave do sucesso. Você está pronto? 📚",
          "Um novo dia, uma nova chance de crescer. Vamos estudar! 🌟",
          "Não deixe o estudo para depois. Comece agora! 🎯",
        ];
        notificationPayload = {
          title: "📚 Hora de Estudar!",
          body: messages[Math.floor(Math.random() * messages.length)],
          url: "/questoes",
          type: "daily_reminder",
        };
        break;
      }

      // ═══════════════════════════════════════════ //
      //  STREAK EM RISCO                           //
      // ═══════════════════════════════════════════ //
      case "streak_risk": {
        const { data: prefs } = await adminClient
          .from("user_notification_preferences")
          .select("user_id")
          .eq("push_enabled", true)
          .eq("streak_alert", true);

        if (!prefs?.length) break;

        const userIds = prefs.map((p: any) => p.user_id);

        // Buscar profiles com streak > 0
        const { data: profiles } = await adminClient
          .from("profiles")
          .select("id, streak_days")
          .in("id", userIds)
          .gt("streak_days", 0);

        if (!profiles?.length) break;

        const activeUserIds = profiles.map((p: any) => p.id);

        // Quais não estudaram hoje?
        const { data: productivity } = await adminClient
          .from("user_daily_productivity")
          .select("user_id")
          .eq("productivity_date", today)
          .gt("questions_answered", 0)
          .in("user_id", activeUserIds);

        const studiedToday = new Set(productivity?.map((p: any) => p.user_id) || []);

        // Verificar também summary_views
        const { data: summaryViews } = await adminClient
          .from("user_summary_views")
          .select("user_id")
          .eq("viewed_date", today)
          .in("user_id", activeUserIds);

        const viewedSummary = new Set(summaryViews?.map((v: any) => v.user_id) || []);

        usersToNotify = activeUserIds.filter(
          (id: string) => !studiedToday.has(id) && !viewedSummary.has(id)
        );

        const alerts = [
          "⚠️ Seu streak está em risco! Estude hoje para não perdê-lo.",
          "🔥 Você ainda não estudou hoje. Seu streak precisa de você!",
          "⏰ O dia está acabando! Resolva pelo menos uma questão para manter seu streak.",
        ];
        notificationPayload = {
          title: "🔥 Streak em Risco!",
          body: alerts[Math.floor(Math.random() * alerts.length)],
          url: "/questoes",
          type: "streak_risk",
        };
        break;
      }

      // ═══════════════════════════════════════════ //
      //  MENSAGEM MOTIVACIONAL                     //
      // ═══════════════════════════════════════════ //
      case "motivational": {
        const { data: prefs } = await adminClient
          .from("user_notification_preferences")
          .select("user_id")
          .eq("push_enabled", true)
          .eq("motivational_messages", true);

        if (!prefs?.length) break;

        usersToNotify = prefs.map((p: any) => p.user_id);

        // Buscar mensagem motivacional ativa do banco
        const { data: messages } = await adminClient
          .from("motivational_messages")
          .select("id, message, author")
          .eq("is_active", true);

        if (!messages?.length) break;

        // Pegar mensagens já enviadas recentemente para evitar repetição
        const { data: recentLogs } = await adminClient
          .from("notification_logs")
          .select("motivational_message_id")
          .eq("notification_type", "motivational")
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .not("motivational_message_id", "is", null);

        const recentIds = new Set(recentLogs?.map((l: any) => l.motivational_message_id) || []);
        const available = messages.filter((m: any) => !recentIds.has(m.id));
        const selectedMsg = available.length > 0
          ? available[Math.floor(Math.random() * available.length)]
          : messages[Math.floor(Math.random() * messages.length)]; // fallback: aceita repetir

        notificationPayload = {
          title: "💪 Motivação do Dia",
          body: selectedMsg.author
            ? `"${selectedMsg.message}" — ${selectedMsg.author}`
            : selectedMsg.message,
          url: "/",
          type: "motivational",
          motivational_message_id: selectedMsg.id,
        };
        break;
      }

      // ═══════════════════════════════════════════ //
      //  MISSÃO DIÁRIA DISPONÍVEL                  //
      // ═══════════════════════════════════════════ //
      case "mission_available": {
        const { data: prefs } = await adminClient
          .from("user_notification_preferences")
          .select("user_id")
          .eq("push_enabled", true)
          .eq("mission_alert", true);

        if (!prefs?.length) break;

        usersToNotify = prefs.map((p: any) => p.user_id);

        notificationPayload = {
          title: "🎯 Missão do Dia Disponível!",
          body: "Sua missão diária está pronta. Aceite o desafio e conquiste XP!",
          url: "/",
          type: "mission_available",
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Tipo desconhecido: ${notificationType}` }),
          { status: 400, headers: jsonHeaders }
        );
    }

    if (!usersToNotify.length) {
      console.log(`[check-notifications] Nenhum usuário para notificar (${notificationType})`);
      return new Response(
        JSON.stringify({ success: true, type: notificationType, notified: 0, reason: "no_users" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    console.log(`[check-notifications] Enviando ${notificationType} para ${usersToNotify.length} usuários`);

    // Enviar para cada usuário via send-push function
    let totalSent = 0;
    let totalFailed = 0;

    for (const userId of usersToNotify) {
      try {
        // Chamar send-push internamente
        const sendPushUrl = `${SUPABASE_URL}/functions/v1/send-push`;
        const response = await fetch(sendPushUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            user_id: userId,
            title: notificationPayload.title,
            body: notificationPayload.body,
            url: notificationPayload.url,
            type: notificationPayload.type,
            motivational_message_id: notificationPayload.motivational_message_id,
          }),
        });

        const result = await response.json();
        totalSent += result.sent || 0;
        totalFailed += result.failed || 0;
      } catch (err: any) {
        console.error(`[check-notifications] Erro ao enviar para ${userId}:`, err.message);
        totalFailed++;
      }
    }

    console.log(`[check-notifications] Resultado: ${totalSent} enviados, ${totalFailed} falharam`);

    return new Response(
      JSON.stringify({
        success: true,
        type: notificationType,
        users: usersToNotify.length,
        sent: totalSent,
        failed: totalFailed,
      }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err: any) {
    console.error("[check-notifications] Erro geral:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
