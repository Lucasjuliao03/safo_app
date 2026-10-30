import type { QueryClient } from '@tanstack/react-query';
import { ACHIEVEMENTS } from '@/types/achievements';
import { toast } from 'sonner';

export function invalidateStudyProgress(client: QueryClient) {
  for (const key of ['studyAccess', 'userProfile', 'userProductivity', 'userLifetimeUsage',
    'userQuestionStats', 'userFlashcardReviews', 'userAchievements', 'daily-mission',
    'studentEvolution', 'student-evolution', 'userStreakStats', 'ranking']) {
    void client.invalidateQueries({ queryKey: [key] });
  }
}

export function showStudyAchievements(feedback: { replayed: boolean; unlockedAchievementIds?: string[] }) {
  if (feedback.replayed) return;
  const achievements = ACHIEVEMENTS.filter(item => feedback.unlockedAchievementIds?.includes(item.id));
  if (!achievements.length) return;
  toast.success(achievements.length === 1 ? '🏆 Conquista desbloqueada!' : `🏆 ${achievements.length} conquistas desbloqueadas!`, {
    description: achievements.map(item => `${item.icon} ${item.name}`).join(' • '), duration: 6000,
  });
}
