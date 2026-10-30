import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { LastStudyFeedback } from '@/lib/lastStudyFeedback';
import { recordStudyFlashcardReview, type FlashcardRating } from '@/services/studyAccessService';
import { toast } from 'sonner';

export function LastStudyResult() {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ['lastStudyFeedback', user?.id];
  const { data: receipt } = useQuery<LastStudyFeedback | null>({ queryKey: key, queryFn: () => null, enabled: false });
  const [saving, setSaving] = useState(false);
  if (!receipt) return null;

  const rate = async (rating: FlashcardRating) => {
    if (saving) return;
    setSaving(true);
    try {
      await recordStudyFlashcardReview(receipt.id, rating, receipt.requestId);
      client.setQueryData(key, null);
      void client.invalidateQueries({ queryKey: ['userProfile'] });
      toast.success('Última revisão salva.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.');
    } finally { setSaving(false); }
  };

  return <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-left" aria-label="Último resultado">
    <p className="font-semibold">{receipt.type === 'questions' ? 'Última resposta salva' : 'Último flashcard'}</p>
    {receipt.type === 'questions' ? <>
      <p>{receipt.feedback.isCorrect ? 'Resposta correta' : `Alternativa correta: ${receipt.feedback.correctOption?.toUpperCase()}`}</p>
      <p className="text-sm whitespace-pre-line">{receipt.feedback.explanation}</p>
    </> : <>
      <p className="text-sm whitespace-pre-line">{receipt.feedback.back}</p>
      <p className="text-sm">Como foi?</p>
      <div className="grid grid-cols-4 gap-2">
        {([['wrong', 'Errei'], ['hard', 'Difícil'], ['good', 'Bom'], ['easy', 'Fácil']] as const).map(([value, label]) =>
          <button key={value} disabled={saving} onClick={() => void rate(value)} className="rounded-lg bg-primary/10 p-2 text-sm disabled:opacity-50">{label}</button>)}
      </div>
    </>}
  </section>;
}
