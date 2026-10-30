import { readApiJson, ApiResponseError } from '@/lib/apiJson';
import { validAccessToken } from './secureContentService';
import { isAppAccessSnapshot, type AppAccessSnapshot } from '@/lib/appAccess';

export type StudyAccess = AppAccessSnapshot;
export interface StudyFeedback extends StudyAccess {
  correctOption?: string; explanation?: string; isCorrect?: boolean; back?: string; replayed: boolean;
  earnedXp?: number; unlockedAchievementIds?: string[];
}
export type FlashcardRating = 'wrong' | 'hard' | 'good' | 'easy';
export interface SummaryReadFeedback {
  readCount: number; replayed: boolean; earnedXp?: number; unlockedAchievementIds?: string[];
}
async function studyRequest<T extends object>(body?: object): Promise<T> {
  const { token } = await validAccessToken();
  const response = await fetch('/api/study', {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return readApiJson<T>(response, 'Não foi possível validar o acesso de estudo.');
}
export async function getStudyAccess(): Promise<StudyAccess> {
  const access = await studyRequest<StudyAccess>();
  if (!isAppAccessSnapshot(access)) throw new ApiResponseError('Não foi possível validar seu acesso. Tente novamente.', 503, 'study_unavailable');
  return access;
}
export const answerStudyQuestion = (id: number, selectedOption: string, requestId: string) =>
  studyRequest<StudyFeedback>({ type: 'questions', id, selectedOption, requestId });
export const revealStudyFlashcard = (id: number, requestId: string) =>
  studyRequest<StudyFeedback>({ type: 'flashcards', id, requestId });
export const recordStudyFlashcardReview = (id: number, rating: FlashcardRating, requestId: string) =>
  studyRequest<StudyFeedback>({ type: 'flashcard_review', id, rating, requestId });
export const recordSummaryRead = (id: number, requestId: string) =>
  studyRequest<SummaryReadFeedback>({ type: 'summary_read', id, requestId });
export function isStudyLimitError(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === 403 && error.code === 'trial_exhausted';
}
