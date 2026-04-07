import { AppLayout } from "@/components/AppLayout";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { buildStats, getSubjectPerformance, ranks } from "@/services/statsService";
import { User, ChevronRight, Medal, Flame, Zap, LogOut, TrendingUp, Trophy, BookOpen, Layers, FileText, Edit2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useSubjects, useQuestions, useUserProductivity, useUserQuestionStats } from "@/hooks/useStudyData";
import { useAchievementStats } from "@/hooks/useAchievements";
import { useUserStreakStats } from "@/hooks/useUserStreakStats";
import { NotificationSettings } from "@/components/NotificationSettings";
import { PerformanceCard } from "@/components/PerformanceCard";
import { EditNickname } from "@/components/EditNickname";
import { AvatarSelector } from "@/components/AvatarSelector";
import { getAvatarUrl } from "@/hooks/useAvatar";
import { formatDisplayName } from "@/hooks/useNickname";
import { useUserProfile } from "@/hooks/useStudyData";
import { useState } from "react";

export default function PerfilPage() {
  const { user, isAdmin, logout } = useAuth();
  const courseId = user?.courseId ? String(user.courseId) : null;
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  const { data: subjects = [], isLoading: loadingSub } = useSubjects(isAdmin ? undefined : courseId);
  const { data: questions = [], isLoading: loadingQ } = useQuestions(isAdmin ? undefined : courseId);
  const { data: profile } = useUserProfile(user?.id);
  const { data: todayProd } = useUserProductivity(user?.id);
  const { data: qStats = [] } = useUserQuestionStats(user?.id);
  const { data: streakStats } = useUserStreakStats(user?.id);
  const achievementStats = useAchievementStats(user?.id);

  const stats = buildStats(profile, todayProd);
  const performance = !loadingQ && !loadingSub ? getSubjectPerformance(qStats, questions, subjects) : [];
  
  const subjectStats = performance.map((sp: any) => {
    const subject = subjects.find((s: any) => s.id === sp.subjectId);
    const subjectQuestionIds = questions
      .filter((q: any) => q.subjectId === sp.subjectId)
      .map((q: any) => String(q.id));
    const relevantStats = qStats.filter((qs: any) => subjectQuestionIds.includes(String(qs.question_id)));

    const totalCorrect = relevantStats.reduce((sum: number, s: any) => sum + (s.total_correct || 0), 0);
    const totalWrong = sp.totalAttempts - totalCorrect;

    const topicMap = new Map<string, any>();
    relevantStats.forEach((qs: any) => {
      const question = questions.find((q: any) => String(q.id) === String(qs.question_id));
      if (question && question.topicId) {
        const topicKey = String(question.topicId);
        if (!topicMap.has(topicKey)) {
          topicMap.set(topicKey, {
            id: question.topicId,
            name: question.topic || "Geral",
            totalAttempts: 0,
            totalCorrect: 0,
            totalWrong: 0,
            accuracy: 0,
          });
        }
        const t = topicMap.get(topicKey);
        t.totalAttempts += (qs.total_attempts || 0);
        t.totalCorrect += (qs.total_correct || 0);
      }
    });
    topicMap.forEach((t: any) => {
      t.totalWrong = t.totalAttempts - t.totalCorrect;
      if (t.totalAttempts > 0) {
        t.accuracy = Math.round((t.totalCorrect / t.totalAttempts) * 100);
      }
    });
    const topics = Array.from(topicMap.values()).filter((t: any) => t.totalAttempts > 0);

    return {
      subjectId: sp.subjectId,
      name: sp.name,
      icon: "📖",
      totalAttempts: sp.totalAttempts,
      totalCorrect,
      totalWrong,
      accuracy: sp.accuracy,
      topics,
    };
  });

  const currentRank = ranks.find((r) => r.level === stats.level) ?? ranks[0];
  const nextRank = ranks.find((r) => r.level === stats.level + 1);
  const xpProgress = nextRank
    ? ((stats.xp - currentRank.xpRequired) / (nextRank.xpRequired - currentRank.xpRequired)) * 100
    : 100;

  if (loadingSub || loadingQ) {
    return <AppLayout><div className="p-8 text-center text-muted-foreground">Carregando perfil...</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="px-4 pt-6 space-y-4 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowAvatarModal(true)} className="relative">
              <img 
                src={getAvatarUrl(profile?.avatar)}
                alt="Avatar"
                className="w-20 h-20 rounded-2xl object-contain border-2 border-primary/25 bg-muted/30"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (img.src.endsWith('.png')) {
                    img.src = img.src.replace('.png', '.svg');
                  } else {
                    img.src = getAvatarUrl('default');
                  }
                }}
              />
              <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1.5">
                <Edit2 className="h-3 w-3 text-white" />
              </div>
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground">{formatDisplayName(profile?.full_name || undefined, profile?.nickname || undefined)}</h1>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              <div className="flex gap-2 mt-1">
                <button 
                  onClick={() => setShowNicknameModal(true)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Edit2 className="h-3 w-3" /> Nome
                </button>
                <button 
                  onClick={() => setShowAvatarModal(true)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Edit2 className="h-3 w-3" /> Avatar
                </button>
              </div>
            </div>
          </div>
          <button onClick={() => logout()}
            className="flex items-center gap-1.5 text-xs text-destructive font-medium rounded-lg bg-destructive/10 px-3 py-1.5 border border-destructive/20">
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>

        <EditNickname open={showNicknameModal} onOpenChange={setShowNicknameModal} />
        <AvatarSelector open={showAvatarModal} onOpenChange={setShowAvatarModal} userId={user?.id} />

        {isAdmin && (
          <Link to="/admin"
            className="flex items-center justify-between rounded-xl bg-primary/10 border border-primary/25 p-3 transition-all active:scale-[0.98]">
            <span className="text-sm font-semibold text-primary">Painel Admin</span>
            <ChevronRight className="h-4 w-4 text-primary" />
          </Link>
        )}

        {/* Rank card */}
        <div className="rounded-2xl bg-gradient-to-br from-xp/20 to-xp/5 border border-xp/20 p-4 space-y-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <Medal className="h-5 w-5 text-xp flex-shrink-0" />
            <span className="font-bold text-foreground text-sm">{stats.rank}</span>
            <div className="h-4 w-px bg-xp/30 mx-1 flex-shrink-0" />
            <div className="flex items-center gap-1 bg-xp/20 px-2 py-0.5 rounded-full flex-shrink-0">
              <Zap className="h-3 w-3 text-xp" />
              <span className="text-xs font-bold text-xp">{stats.xp} XP</span>
            </div>
          </div>
          {nextRank && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span className="truncate">{currentRank.name}</span>
                <span className="truncate">{nextRank.name}</span>
              </div>
              <Progress value={xpProgress} className="h-2 bg-muted [&>div]:bg-xp" />
              <p className="text-xs text-muted-foreground mt-1 text-center">
                {nextRank.xpRequired - stats.xp} XP para {nextRank.name}
              </p>
            </div>
          )}
        </div>

        {/* Stats - 5 cards na mesma linha */}
        <div className="grid grid-cols-5 gap-2">
          <div className="rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 p-2.5 text-center">
            <Flame className="h-4 w-4 text-accent mx-auto mb-0.5" />
            <p className="text-lg font-bold text-foreground leading-tight">{streakStats?.currentStreak ?? stats.streak}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Sequência</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 p-2.5 text-center">
            <TrendingUp className="h-4 w-4 text-accent mx-auto mb-0.5" />
            <p className="text-lg font-bold text-foreground leading-tight">{streakStats?.totalDays ?? 0}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Dias Total</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 p-2.5 text-center">
            <BookOpen className="h-4 w-4 text-accent mx-auto mb-0.5" />
            <p className="text-lg font-bold text-foreground leading-tight">
              {Math.min(todayProd?.questions_answered ?? 0, 99)}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">Questões</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 p-2.5 text-center">
            <Layers className="h-4 w-4 text-accent mx-auto mb-0.5" />
            <p className="text-lg font-bold text-foreground leading-tight">
              {Math.min(todayProd?.flashcards_reviewed ?? 0, 99)}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">Flashcards</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 p-2.5 text-center">
            <FileText className="h-4 w-4 text-accent mx-auto mb-0.5" />
            <p className="text-lg font-bold text-foreground leading-tight">
              {Math.min(todayProd?.summaries_read ?? 0, 99)}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">Resumos</p>
          </div>
        </div>

        {/* Medalhas */}
        <Link to="/medalhas"
          className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-warning/15 to-warning/5 border border-warning/25 p-4 transition-all active:scale-[0.98]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
              <Trophy className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Minhas Medalhas</p>
              <p className="text-xs text-muted-foreground">
                {achievementStats.unlockedCount}/{achievementStats.totalCount} conquistas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-lg font-black text-warning">{achievementStats.percentage}%</p>
            </div>
            <ChevronRight className="h-5 w-5 text-warning" />
          </div>
        </Link>

        {/* Notificações */}
        <NotificationSettings />

        {/* Desempenho */}
        <PerformanceCard subjects={subjectStats} isLoading={loadingQ || loadingSub} />
      </div>
    </AppLayout>
  );
}
