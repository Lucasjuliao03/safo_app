import type { RankingUser } from '@/hooks/useRanking';

export type RankingPeriod = 'all' | 'weekly' | 'monthly';

// Fictional display names only: these entries never create accounts or activity.
const DEMO_NAMES = [
  'Ana Beatriz', 'RafaM', 'Biazinha', 'Lucas Ferreira', 'Cami', 'pedro.h',
  'Jéssica Lima', 'Gui do café', 'Mari_92', 'Bruno', 'Nanda Rocha', 'Thiago Reis',
  'Lari', 'leo.zip', 'Juliana Castro', 'Matheus A.', 'Carolzinha', 'Dudu',
  'Patrícia', 'Felipe Costa', 'tata.s', 'Renan', 'Amanda Luz', 'vini77',
  'Gabi', 'André Martins', 'Luiza N.', 'Caio', 'Dani Oliveira', 'rodrigo.r',
  'Priscila', 'Zé Victor', 'SofiaM', 'Henrique', 'Isa do chá', 'Marcelo Dias',
  'Aline Souza', 'Breno', 'Cris', 'João Pedro', 'Renata', 'Alex_23',
  'Debs', 'Gustavo Melo', 'Letícia Alves', 'Dieguinho', 'mila.r', 'Ruan',
  'Vitória', 'Samuel Lopes', 'Belinha', 'Eduardo N.', 'Paula Reis', 'Neto',
  'Tainá', 'Murilo', 'Malu', 'cadu.rs', 'Vanessa C.', 'Douglas',
  'Nicole', 'Igor Santana', 'Fê Almeida', 'Marquinhos', 'Yasmin', 'Otávio',
  'Raquel', 'Danilo Rocha', 'Lia', 'Ricardo S.', 'Sabrina', 'Jota',
  'Natália Dias', 'Wesley', 'helo.m', 'Chico', 'Monique', 'Arthur Lima',
] as const;

export const DEMO_PROFILE_COUNT = DEMO_NAMES.length;

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  }
  return result >>> 0;
}

/** Stable sample benchmarks for any current or future course, without DB writes. */
export function createDemoRanking(courseId: string, period: RankingPeriod): RankingUser[] {
  const numericCourseId = Number(courseId);
  if (!Number.isSafeInteger(numericCourseId) || numericCourseId <= 0) return [];

  const multiplier = { weekly: 1, monthly: 3, all: 8 }[period];
  return DEMO_NAMES.map((userName, index) => {
    const seed = `${numericCourseId}:${index + 1}`;
    const questionsTotal = (8 + hash(`${seed}:questions`) % 253) * multiplier;
    const questionsCorrect = Math.round(questionsTotal * (48 + hash(`${seed}:accuracy`) % 49) / 100);
    const questionsWrong = questionsTotal - questionsCorrect;
    const flashcardsTotal = (hash(`${seed}:flashcards`) % 91) * multiplier;
    const summariesRead = (hash(`${seed}:summaries`) % 16) * multiplier;
    const daysStudied = (1 + hash(`${seed}:days`) % 7) * multiplier;
    const qualityScore = Math.max(0,
      questionsCorrect * 10 + flashcardsTotal * 8 + summariesRead * 3 - questionsWrong * 5,
    );
    const consistencyScore = daysStudied * 3;
    const volumeScore = (questionsTotal + flashcardsTotal + summariesRead) * 2;

    return {
      position: 0,
      positionChange: 0,
      userId: `demo:${numericCourseId}:${index + 1}`,
      userName,
      courseId: numericCourseId,
      questionsTotal,
      questionsCorrect,
      questionsWrong,
      flashcardsTotal,
      summariesRead,
      qualityScore,
      consistencyScore,
      volumeScore,
      finalScore: qualityScore + consistencyScore + volumeScore,
      accuracy: Math.round(questionsCorrect / questionsTotal * 100),
      isCurrentUser: false,
      isDemo: true,
    };
  });
}

/** Comparison positions are derived from scores; official data stays untouched. */
export function compareWithDemoRanking(
  realRanking: readonly RankingUser[],
  courseId: string,
  period: RankingPeriod,
): RankingUser[] {
  return [...realRanking, ...createDemoRanking(courseId, period)]
    .sort((a, b) => b.finalScore - a.finalScore
      || Number(!!a.isDemo) - Number(!!b.isDemo)
      || a.userId.localeCompare(b.userId))
    .map((entry, index) => ({ ...entry, position: index + 1, positionChange: 0 }));
}
