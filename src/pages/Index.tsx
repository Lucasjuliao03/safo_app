import { Flame, Zap, Target, BookOpen, Layers, AlertTriangle, FileText, GraduationCap, Calendar, Trophy } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { buildStats, ranks } from "@/services/statsService";
import { useAccessStatus } from "@/hooks/useAccessStatus";
import { useSubjects, useQuestions, useUserProfile, useUserProductivity, useUserQuestionStats, useCourses } from "@/hooks/useStudyData";
import { NextMissionCard } from "@/components/NextMissionCard";
import { useDailyMission } from "@/hooks/useMission";
import { useUserStreakStats } from "@/hooks/useUserStreakStats";
import { StudentEvolutionCard } from "@/components/StudentEvolutionCard";
import { useStudentEvolution } from "@/hooks/useStudentEvolution";
import { formatDisplayName } from "@/hooks/useNickname";

export default function HomePage() {
  const { user, isAdmin } = useAuth();
  const accessStatus = useAccessStatus();
  const courseId = user?.courseId ? String(user.courseId) : null;

  const { data: courses = [], isLoading: isLoadingCourses } = useCourses();
  const { data: subjects = [], isLoading: isLoadingSub } = useSubjects(isAdmin ? undefined : courseId);
  const { data: questions = [], isLoading: isLoadingQ } = useQuestions(isAdmin ? undefined : courseId);
  const { data: profile } = useUserProfile(user?.id);
  const { data: todayProd } = useUserProductivity(user?.id);
  const { data: qStats = [] } = useUserQuestionStats(user?.id);
  const { data: streakStats } = useUserStreakStats(user?.id);

  // Hook de evolução do aluno
  const { data: evolution, isLoading: isLoadingEvolution } = useStudentEvolution(
    user?.id, 
    courseId || (profile as any)?.course_id ? String((profile as any)?.course_id || courseId) : null
  );

  // Hook de missão diária
  const {
    mission,
    isLoading: isLoadingMission,
    progress,
    nextStep,
    isCompleted,
    hasStarted,
    startMission,
  } = useDailyMission(user?.id as string | undefined, courseId);

  const course = courses.find((c) => c.id === courseId);

  const stats = buildStats(profile, todayProd);
  const remaining = accessStatus.trialRemaining;

  if (isLoadingSub || isLoadingQ || isLoadingCourses) {
    return <AppLayout><div className="p-8 text-center text-muted-foreground">Carregando...</div></AppLayout>;
  }

  if (!isAdmin && (!courseId || !course)) {
    if (!isLoadingCourses) {
       return (
         <AppLayout>
           <div className="p-8 text-center text-muted-foreground mt-10">
              Nenhum curso preparatório vinculado à sua conta. Entre em contato com nossa equipe para assistência.
           </div>
         </AppLayout>
       );
    }
    return null;
  }

  return (
    <AppLayout>
      <div className="px-4 pt-6 space-y-4 animate-slide-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Olá, {formatDisplayName(profile?.full_name || undefined, profile?.nickname || undefined)}! 🎯</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <GraduationCap className="h-3.5 w-3.5 text-primary" />
            <p className="text-sm text-primary font-medium">{course?.name ?? (isAdmin ? "Administrador" : "Sem Curso")}</p>
            <span className="text-sm text-muted-foreground">— Continue firme.</span>
          </div>
        </div>

        {!accessStatus.isLoading && accessStatus.isOnTrial && !accessStatus.canAccess && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Acesso bloqueado</p>
              <p className="text-xs text-muted-foreground mt-0.5">Você usou suas questões gratuitas. Aguarde a aprovação.</p>
            </div>
          </div>
        )}

        {!accessStatus.isLoading && accessStatus.isOnTrial && accessStatus.canAccess && (
          <div className="rounded-2xl bg-warning/10 border border-warning/30 p-3 text-center">
            <p className="text-xs text-warning font-medium">⚡ Restam <span className="font-bold">{remaining}</span> questões gratuitas</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Card de Sequência - Atualizado */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Sequência</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-accent animate-streak-fire">{streakStats?.currentStreak ?? stats.streak}</span>
                  <span className="text-sm font-semibold text-accent">dias</span>
                </div>
              </div>
              <Flame className="h-12 w-12 text-accent opacity-80" strokeWidth={1.5} />
            </div>
            {/* Info adicional */}
            <div className="mt-2 pt-2 border-t border-accent/20">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Trophy className="h-3 w-3" />
                  <span>Melhor: {streakStats?.currentStreak ?? stats.streak}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Total: {streakStats?.totalDays ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-xp/20 to-xp/5 border border-xp/20 p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-muted-foreground">Patente</p>
              <div className="flex items-center gap-1 bg-xp/20 px-2 py-0.5 rounded-full">
                <Zap className="h-3 w-3 text-xp" />
                <span className="text-xs font-bold text-xp">{stats.xp} XP</span>
              </div>
            </div>
            <p className="text-lg font-bold text-foreground mb-2">{stats.rank}</p>
            {(() => {
              const currentRank = ranks.find((r) => r.level === stats.level) ?? ranks[0];
              const nextRank = ranks.find((r) => r.level === stats.level + 1);
              if (!nextRank) return null;
              const xpProgress = ((stats.xp - currentRank.xpRequired) / (nextRank.xpRequired - currentRank.xpRequired)) * 100;
              const xpToGo = nextRank.xpRequired - stats.xp;
              return (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{currentRank.name}</span>
                    <span>{nextRank.name}</span>
                  </div>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-xp rounded-full transition-all" style={{ width: `${xpProgress}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-white drop-shadow-sm">
                      {xpToGo} XP
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Link to="/questoes" className="flex flex-col items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 p-3 transition-all active:scale-[0.97]">
            <BookOpen className="h-5 w-5 text-primary" />
            <p className="font-semibold text-foreground text-[10px]">Questões</p>
          </Link>
          <Link to="/flashcards" className="flex flex-col items-center gap-1.5 rounded-xl bg-accent/10 border border-accent/20 p-3 transition-all active:scale-[0.97]">
            <Layers className="h-5 w-5 text-accent" />
            <p className="font-semibold text-foreground text-[10px]">Flashcards</p>
          </Link>
          <Link to="/resumos" className="flex flex-col items-center gap-1.5 rounded-xl bg-xp/10 border border-xp/20 p-3 transition-all active:scale-[0.97]">
            <FileText className="h-5 w-5 text-xp" />
            <p className="font-semibold text-foreground text-[10px]">Resumos</p>
          </Link>
        </div>

        <StudentEvolutionCard
          evolution={evolution}
          isLoading={isLoadingEvolution}
        />

        <NextMissionCard
          mission={mission}
          isLoading={isLoadingMission}
          progress={progress}
          nextStep={nextStep}
          isCompleted={isCompleted}
          hasStarted={hasStarted}
          onStart={startMission}
          streakDays={streakStats?.currentStreak ?? stats.streak}
          totalDays={streakStats?.totalDays ?? 0}
        />
      </div>
    </AppLayout>
  );
}
