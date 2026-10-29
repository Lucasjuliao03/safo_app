import { describe, expect, it, vi } from 'vitest';
import type { RankingUser } from '@/hooks/useRanking';
import { compareWithDemoRanking, createDemoRanking, DEMO_PROFILE_COUNT } from '@/lib/rankingDemo';

describe('fixed demonstration benchmarks', () => {
  it.each(['1', '2', '87291'])('provides 78 distinct fictional profiles for course %s', courseId => {
    const profiles = createDemoRanking(courseId, 'weekly');
    expect(DEMO_PROFILE_COUNT).toBe(78);
    expect(profiles).toHaveLength(78);
    expect(new Set(profiles.map(profile => profile.userId)).size).toBe(78);
    expect(new Set(profiles.map(profile => profile.userName)).size).toBe(78);
    expect(profiles.every(profile => profile.isDemo && !profile.isCurrentUser)).toBe(true);
    expect(profiles.every(profile => profile.courseId === Number(courseId))).toBe(true);
    expect(new Set(profiles.map(profile => profile.finalScore)).size).toBeGreaterThan(5);
  });

  it.each(['weekly', 'monthly', 'all'] as const)('keeps %s statistics fixed across time and repeated visits', period => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-29T15:00:00Z'));
      const original = createDemoRanking('12', period);
      vi.setSystemTime(new Date('2027-04-01T15:00:00Z'));
      expect(createDemoRanking('12', period)).toEqual(original);
    } finally {
      vi.useRealTimers();
    }
  });

  it('varies scores between courses while keeping question totals internally consistent', () => {
    const first = createDemoRanking('1', 'weekly');
    const second = createDemoRanking('2', 'weekly');
    expect(first.map(profile => profile.finalScore)).not.toEqual(second.map(profile => profile.finalScore));
    for (const period of ['weekly', 'monthly', 'all'] as const) {
      for (const profile of createDemoRanking('1', period)) {
        expect(profile.questionsTotal).toBe(profile.questionsCorrect + profile.questionsWrong);
        expect(profile.accuracy).toBeGreaterThanOrEqual(0);
        expect(profile.accuracy).toBeLessThanOrEqual(100);
        expect(profile.finalScore).toBeGreaterThan(0);
      }
    }
  });

  it.each(['1', '2', '7', '12', '87291'])('limits virtual scores and activity to smaller periods for course %s', courseId => {
    const weekly = createDemoRanking(courseId, 'weekly');
    const monthly = createDemoRanking(courseId, 'monthly');
    const all = createDemoRanking(courseId, 'all');
    for (const [profiles, cap] of [[weekly, 60], [monthly, 180], [all, 430]] as const) {
      for (const profile of profiles) {
        expect(profile.finalScore).toBeLessThanOrEqual(cap);
        expect(profile.qualityScore).toBe(Math.max(0,
          profile.questionsCorrect * 10 + profile.flashcardsTotal * 8
          + profile.summariesRead * 3 - profile.questionsWrong * 5,
        ));
        expect(profile.volumeScore).toBe((profile.questionsTotal + profile.flashcardsTotal + profile.summariesRead) * 2);
        expect(profile.finalScore).toBe(profile.qualityScore + profile.consistencyScore + profile.volumeScore);
      }
    }
    for (let index = 0; index < 78; index++) {
      expect(weekly[index].finalScore).toBeLessThan(monthly[index].finalScore);
      expect(monthly[index].finalScore).toBeLessThan(all[index].finalScore);
      expect(weekly[index].questionsTotal).toBeLessThan(monthly[index].questionsTotal);
      expect(monthly[index].questionsTotal).toBeLessThan(all[index].questionsTotal);
    }
  });

  it.each(['', 'abc', '0', '-1', '1.5'])('does not create profiles for invalid course %s', courseId => {
    expect(createDemoRanking(courseId, 'weekly')).toEqual([]);
  });

  it('lets actual progress overtake benchmarks without mutating real data or sample statistics', () => {
    const samples = createDemoRanking('7', 'weekly');
    const real: RankingUser = {
      ...samples[0], userId: 'actual-user', userName: 'Aluno real', isDemo: false,
      isCurrentUser: true, position: 1, positionChange: 2, finalScore: 0,
    };
    const initial = compareWithDemoRanking([real], '7', 'weekly');
    expect(initial).toHaveLength(79);
    expect(initial.find(profile => profile.isCurrentUser)?.position).toBe(79);
    const progressed = { ...real, finalScore: Math.max(...samples.map(profile => profile.finalScore)) + 1 };
    const updated = compareWithDemoRanking([progressed], '7', 'weekly');
    expect(updated[0].userId).toBe(real.userId);
    expect(updated.map(profile => profile.position)).toEqual(Array.from({ length: 79 }, (_, index) => index + 1));
    expect(updated.filter(profile => profile.isDemo).map(profile => [profile.userId, profile.questionsTotal, profile.finalScore]))
      .toEqual(initial.filter(profile => profile.isDemo).map(profile => [profile.userId, profile.questionsTotal, profile.finalScore]));
    expect(real.position).toBe(1);
    expect(real.positionChange).toBe(2);
    expect(real.finalScore).toBe(0);
    expect(createDemoRanking('7', 'weekly')).toEqual(samples);
  });

  it('puts a real participant ahead on equal points and keeps tie ordering stable', () => {
    const sample = createDemoRanking('7', 'weekly')[0];
    const real = { ...sample, userId: 'real', isDemo: false };
    const comparison = compareWithDemoRanking([real], '7', 'weekly');
    expect(comparison.findIndex(profile => profile.userId === 'real'))
      .toBeLessThan(comparison.findIndex(profile => profile.userId === sample.userId));
    expect(compareWithDemoRanking([real], '7', 'weekly')).toEqual(comparison);
  });

  it('leaves real participants free to earn points above the virtual profile caps', () => {
    const real = { ...createDemoRanking('7', 'all')[0], userId: 'real', isDemo: false, finalScore: 1000 };
    for (const period of ['weekly', 'monthly', 'all'] as const) {
      const ranking = compareWithDemoRanking([real], '7', period);
      expect(ranking[0].userId).toBe('real');
      expect(ranking[0].finalScore).toBe(1000);
    }
  });
});
