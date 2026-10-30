import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRanking } from '@/hooks/useRanking';
import { getStudyDate } from '@/lib/studyDate';

const state=vi.hoisted(()=>({rows:[] as Array<Record<string,any>>,from:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{from:(...args:unknown[])=>state.from(...args)}}));
vi.mock('@/hooks/useAvatar',()=>({getAvatarUrl:()=>'/avatar/default.svg'}));
afterEach(cleanup);
describe('ranking from actual saved progress',()=>{
 it('updates positions after new activity without using a stale ranking_global snapshot',async()=>{
  state.rows=[{id:1,user_id:'one',productivity_date:getStudyDate(),questions_answered:1,questions_correct:1,questions_wrong:0,flashcards_reviewed:0,summaries_read:0},
    {id:2,user_id:'two',productivity_date:getStudyDate(),questions_answered:2,questions_correct:2,questions_wrong:0,flashcards_reviewed:0,summaries_read:0}];
  state.from.mockReset().mockImplementation((table:string)=>{
    const filters:Array<(row:Record<string,any>)=>boolean>=[];
    let start=0,end=999;
    const query={select:()=>query,order:()=>query,range:(a:number,b:number)=>{start=a;end=b;return query;},
      lte:(key:string,value:string)=>{filters.push(row=>row[key]<=value);return query;},
      gte:(key:string,value:string)=>{filters.push(row=>row[key]>=value);return query;},
      then:(resolve:(value:unknown)=>unknown)=>{
        if(table==='public_profiles')return Promise.resolve({data:[{id:'one',full_name:'Ana',course_id:1},{id:'two',full_name:'Bruno',course_id:1}],error:null}).then(resolve);
        if(table!=='user_daily_productivity')throw Error('Unexpected ranking snapshot');
        return Promise.resolve({data:state.rows.filter(row=>filters.every(filter=>filter(row))).slice(start,end+1),error:null}).then(resolve);
      }};
    return query;
  });
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const {result,unmount}=renderHook(()=>useRanking('one','1','weekly','course'),{wrapper});
  await waitFor(()=>expect(result.current.data?.[0].userId).toBe('two'));
  state.rows[0]={...state.rows[0],questions_answered:4,questions_correct:4};
  await act(async()=>{await client.invalidateQueries({queryKey:['ranking']});});
  await waitFor(()=>expect(result.current.data?.[0].userId).toBe('one'));
  expect(result.current.data?.[0]).toMatchObject({position:1,questionsTotal:4,finalScore:51});
  expect(state.from).not.toHaveBeenCalledWith('ranking_global');
  unmount();client.clear();
 });
});
