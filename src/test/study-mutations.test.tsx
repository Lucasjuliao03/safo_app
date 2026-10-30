import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecordAnswer, useRecordFlashcardReview } from '@/hooks/useStudyData';
import { countStudyStreak, getRankingStartDate, getStudyDate } from '@/lib/studyDate';

const state = vi.hoisted(() => ({ answer:vi.fn(),review:vi.fn(),from:vi.fn(),studied:vi.fn() }));
vi.mock('@/lib/supabase',()=>({supabase:{from:(...args:unknown[])=>state.from(...args)}}));
vi.mock('@/contexts/NotificationContext',()=>({useNotificationContext:()=>({markAsStudied:state.studied})}));
vi.mock('@/services/studyAccessService',()=>({answerStudyQuestion:(...args:unknown[])=>state.answer(...args),
  recordStudyFlashcardReview:(...args:unknown[])=>state.review(...args)}));
let client: QueryClient;
function Wrapper({children}:{children:ReactNode}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(()=>{
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  state.from.mockReset().mockImplementation(()=>{throw new Error('Client must not write progress tables');});
  state.studied.mockReset();
  const feedback={entitled:false,used:1,remaining:9,limit:10,replayed:false,isCorrect:true};
  state.answer.mockReset().mockResolvedValue(feedback);
  state.review.mockReset().mockResolvedValue(feedback);
});
afterEach(()=>{cleanup();client.clear();});
describe('server-authoritative study hooks',()=>{
  it('confirms an answer without a second browser write to question_attempts, XP or productivity',async()=>{
    const invalidate=vi.spyOn(client,'invalidateQueries');
    const {result}=renderHook(useRecordAnswer,{wrapper:Wrapper});
    await act(async()=>{await result.current.mutateAsync({userId:'student',questionId:12,selectedOption:'b',requestId:'stable-request'});});
    expect(state.answer).toHaveBeenCalledWith(12,'b','stable-request');
    expect(state.from).not.toHaveBeenCalled();
    expect(state.studied).toHaveBeenCalledOnce();
    expect(client.getQueryData(['studyAccess','student'])).toMatchObject({used:1});
    expect(invalidate).toHaveBeenCalledWith({queryKey:['ranking']});
    expect(invalidate).toHaveBeenCalledWith({queryKey:['userQuestionStats']});
  });
  it('records a card rating through the server using its reveal request ID',async()=>{
    const {result}=renderHook(useRecordFlashcardReview,{wrapper:Wrapper});
    await act(async()=>{await result.current.mutateAsync({userId:'student',flashcardId:2,result:'hard',requestId:'reveal-request'});});
    expect(state.review).toHaveBeenCalledWith(2,'hard','reveal-request');
    expect(state.from).not.toHaveBeenCalled();
  });
  it('propagates a server failure without claiming progress was saved',async()=>{
    state.answer.mockRejectedValue(new Error('Banco indisponível'));
    const {result}=renderHook(useRecordAnswer,{wrapper:Wrapper});
    await act(async()=>{await expect(result.current.mutateAsync({userId:'student',questionId:1,selectedOption:'a'})).rejects.toThrow('Banco indisponível');});
    expect(state.from).not.toHaveBeenCalled();
    expect(state.studied).not.toHaveBeenCalled();
    expect(client.getQueryData(['studyAccess','student'])).toBeUndefined();
  });
});
describe('Brazilian study dates',()=>{
  it('keeps activity recorded at 21:30 under the same date as the server',()=>{
    expect(getStudyDate(new Date('2026-10-30T00:30:00Z'))).toBe('2026-10-29');
  });
  it('uses calendar weeks and months, including ISO week boundaries across New Year',()=>{
    expect(getRankingStartDate('weekly',new Date('2027-01-01T15:00:00Z'))).toBe('2026-12-28');
    expect(getRankingStartDate('monthly',new Date('2027-01-01T15:00:00Z'))).toBe('2027-01-01');
    expect(getRankingStartDate('all')).toBeNull();
  });
  it('preserves yesterday’s complete streak until the student studies today',()=>{
    const days=new Set(['2026-10-27','2026-10-28','2026-10-29']);
    expect(countStudyStreak(days,'2026-10-30')).toBe(3);
    expect(countStudyStreak(days,'2026-10-29')).toBe(3);
    expect(countStudyStreak(days,'2026-10-31')).toBe(0);
  });
});
