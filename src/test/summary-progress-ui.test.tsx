import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResumosPage from '@/pages/Resumos';

const state=vi.hoisted(()=>({read:vi.fn(),from:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'student',courseId:1,role:'student',isApproved:false}})}));
vi.mock('@/components/AppLayout',()=>({AppLayout:({children}:{children:ReactNode})=><>{children}</>}));
vi.mock('@/components/mdx/MarkdownRenderer',()=>({MarkdownRenderer:({content}:{content:string})=><div>{content}</div>}));
vi.mock('@/services/studyAccessService',()=>({recordSummaryRead:(...args:unknown[])=>state.read(...args)}));
vi.mock('@/lib/supabase',()=>({supabase:{from:(...args:unknown[])=>state.from(...args)}}));
vi.mock('@/hooks/useStudyData',()=>({SUBJECT_UI_MAP:{},useActiveLawIdsForCourse:()=>({data:[]}),
 useSubjects:()=>({data:[{id:'1',name:'Direito'}]}),useTopics:()=>({data:[{id:1,name:'Constituição',subject_id:1}]}),
 useSummaries:()=>({data:[{id:'1',title:'Resumo 1',subjectId:'1',topicId:'1',contentMarkdown:'Conteúdo do resumo'}]})}));
let client:QueryClient;
beforeEach(()=>{
 client=new QueryClient();
 state.read.mockReset().mockResolvedValue({readCount:1,replayed:false});
 state.from.mockReset().mockImplementation((table:string)=>{
   if(table!=='user_summary_views')throw Error('Unexpected browser write');
   return {select:()=>({eq:async()=>({data:[],error:null})})};
 });
});
afterEach(()=>{cleanup();client.clear();});
function openList(){
 render(<QueryClientProvider client={client}><ResumosPage/></QueryClientProvider>);
 fireEvent.click(screen.getByRole('button',{name:/Direito/}));
 fireEvent.click(screen.getByRole('button',{name:/Constituição/}));
}
describe('summary persistence interface',()=>{
 it('opens the summary only after the server confirms its reading record',async()=>{
  openList();
  fireEvent.click(screen.getByRole('button',{name:/Resumo 1/}));
  expect(await screen.findByText('Conteúdo do resumo')).toBeInTheDocument();
  expect(state.read).toHaveBeenCalledWith(1,expect.any(String));
  expect(state.from.mock.calls.every(([table])=>table==='user_summary_views')).toBe(true);
 });
 it('keeps a failed read on the list and retries the same request instead of pretending to save',async()=>{
  state.read.mockRejectedValueOnce(new Error('Serviço indisponível'));
  openList();
  fireEvent.click(screen.getByRole('button',{name:/Resumo 1/}));
  await waitFor(()=>expect(screen.getByRole('button',{name:/Resumo 1/})).not.toBeDisabled());
  expect(screen.queryByText('Conteúdo do resumo')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Resumo 1/}));
  expect(await screen.findByText('Conteúdo do resumo')).toBeInTheDocument();
  expect(state.read.mock.calls[1][1]).toBe(state.read.mock.calls[0][1]);
 });
});
