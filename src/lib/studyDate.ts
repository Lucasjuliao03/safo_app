// Match the study transaction's date even after midnight UTC (21:00 in Brazil).
export function getStudyDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function getRankingStartDate(period: 'weekly' | 'monthly' | 'all', now = new Date()): string | null {
  if (period === 'all') return null;
  const day = new Date(`${getStudyDate(now)}T00:00:00Z`);
  if (period === 'monthly') day.setUTCDate(1);
  else day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

export function countStudyStreak(activityDates: Set<string>, today = getStudyDate()): number {
  const day = new Date(`${today}T00:00:00Z`);
  if (!activityDates.has(today)) day.setUTCDate(day.getUTCDate() - 1);
  let streak = 0;
  while (activityDates.has(day.toISOString().slice(0, 10))) {
    streak++;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return streak;
}
