import type { QueryClient } from '@tanstack/react-query';
import type { StudyFeedback } from '@/services/studyAccessService';

export interface LastStudyFeedback {
  type: 'questions' | 'flashcards';
  id: number;
  requestId: string;
  feedback: StudyFeedback;
}

// Preserve only the already-authorized tenth response when the module unmounts.
export function rememberLastStudyFeedback(client: QueryClient, userId: string | undefined, receipt: LastStudyFeedback) {
  if (userId && !receipt.feedback.entitled && receipt.feedback.remaining === 0) {
    client.setQueryData(['lastStudyFeedback', userId], receipt);
  }
}
