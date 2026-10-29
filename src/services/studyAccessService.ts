import { readApiJson, ApiResponseError } from '@/lib/apiJson';
import { validAccessToken } from './secureContentService';

export interface StudyAccess { entitled: boolean; used: number; remaining: number | null; limit: number; expired?: boolean }
export interface StudyFeedback extends StudyAccess {
  correctOption?: string; explanation?: string; isCorrect?: boolean; back?: string; replayed: boolean;
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
export const getStudyAccess = () => studyRequest<StudyAccess>();
export const answerStudyQuestion = (id: number, selectedOption: string, requestId: string) =>
  studyRequest<StudyFeedback>({ type: 'questions', id, selectedOption, requestId });
export const revealStudyFlashcard = (id: number, requestId: string) =>
  studyRequest<StudyFeedback>({ type: 'flashcards', id, requestId });
export function isStudyLimitError(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === 403 && error.code === 'trial_exhausted';
}
