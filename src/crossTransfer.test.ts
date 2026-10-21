import {describe,expect,it} from 'vitest';
import {LESSONS} from './teaching';
import {PROBES,VAULT_VERSION,packetStatus,type SkillPacket} from './vault';
import {TASKS_R3} from './retrieval';
import {
  CROSS_TASKS,NEUTRAL_NOTE,CONDITIONS,TRANSFER_PROTOCOL,crossTasksFor,
  eligibleSources,canCrossTransfer,gradeCross,crossPrompt,randomConditions,
  summarizeCross,crossSignal,type Triple,type CrossSession,
} from './crossTransfer';
function packet(lessonId:string,model='qwen:test'):SkillPacket {
  return {id:'pkt-1',createdAt:'2026-10-21T12:00:00Z',curriculum:VAULT_VERSION,
    sourceReceiptId:'r1-obs-1',sourceModel:model,sourceTeacher:'teacher:demo',
    lessonId,origin:'PEER_UNVERIFIED',note:'Use a worked example to derive the correct output.',
    runs:[{id:'r2-run',at:'2026-10-21T12:05:00Z',model,protocol:VAULT_VERSION,
      pairs:PROBES.filter(p=>p.lessonId===lessonId).map((p,i)=>({
        probeId:p.id,order:['unassisted','assisted'],
        unassisted:{text:i?'right':'wrong',correct:i>0,elapsedMs:10},
        assisted:{text:p.accepted[0],correct:true,elapsedMs:11},
      }))}]};
}
function answer(correct:boolean){return {correct,text:correct?'right':'wrong',elapsedMs:22};}
function session(t: [boolean,boolean,boolean][]):CrossSession{
  const rows:Triple[]=t.map((a,i)=>({
    taskId:'test'+i,order:['bare','neutral','relevant'],
    answers:{bare:answer(a[0]),neutral:answer(a[1]),relevant:answer(a[2])},
  }));
  return {id:'r4-test',at:'2026-10-21T12:10:00Z',protocol:TRANSFER_PROTOCOL,
    provenance:'OBSERVED',sourcePacketId:'pkt-1',sourceReceiptId:'r1-obs-1',
    sourceModel:'qwen:test',targetModel:'gemma:test',sourceOrigin:'CURATED',
    lessonId:'net-broadcast',noteSnapshot:'explanation',neutralSnapshot:NEUTRAL_NOTE,triples:rows};
}
describe('R4 cross-model transfer',()=>{
  it('uses 3 distinct fresh challenges per category, disjoint from R1, R2, and R3',()=>{
    expect(CROSS_TASKS).toHaveLength(LESSONS.length*3);
    expect(new Set(CROSS_TASKS.map(t=>t.id)).size).toBe(CROSS_TASKS.length);
    const earlier=[...LESSONS.map(l=>l.transfer),...PROBES.map(p=>p.question),...TASKS_R3.map(t=>t.question)];
    for(const lesson of LESSONS){
      const rows=crossTasksFor(lesson.id);
      expect(rows).toHaveLength(3);
      for(const task of rows){
        expect(earlier).not.toContain(task.question);
        expect(gradeCross(task,task.accepted[0])).toBe(true);
        expect(gradeCross(task,'Answer is '+task.accepted[0])).toBe(false);
      }
    }
  });
  it('permits only a valid evidence-backed source paired with a different model identity',()=>{
    const p=packet('net-broadcast');
    expect(packetStatus(p)).toBe('EVIDENCE_BACKED');
    expect(eligibleSources([p])).toEqual([p]);
    expect(canCrossTransfer(p,'gemma:test')).toBe(true);
    expect(canCrossTransfer(p,'qwen:test')).toBe(false);
    expect(canCrossTransfer(p,'')).toBe(false);
    const unverified={...p,runs:[]};
    expect(eligibleSources([unverified])).toEqual([]);
    expect(canCrossTransfer(unverified,'gemma:test')).toBe(false);
    const incomplete={...p,runs:[{...p.runs[0],pairs:p.runs[0].pairs.slice(0,2)}]};
    expect(canCrossTransfer(incomplete,'gemma:test')).toBe(false);
  });
  it('does not send expected answers in prompt instruction and includes note only in relevant condition',()=>{
    const t=crossTasksFor('net-broadcast')[0],note='Use block size to compute subnet end.';
    const bare=crossPrompt(t,'bare',note),neutral=crossPrompt(t,'neutral',note),relevant=crossPrompt(t,'relevant',note);
    for(const prompt of [bare,neutral,relevant])expect(prompt).toContain(t.question);
    expect(bare).not.toContain(note);
    expect(bare).not.toContain(NEUTRAL_NOTE);
    expect(neutral).toContain(NEUTRAL_NOTE);
    expect(neutral).not.toContain(note);
    expect(relevant).toContain(note);
    expect(relevant).not.toContain(NEUTRAL_NOTE);
  });
  it('shuffles every condition exactly once under deterministic random streams',()=>{
    const original=new Set(CONDITIONS);
    const randoms=[0,0.25,0.5,0.9,0.999];
    for(const n of randoms){
      const order=randomConditions(()=>n);
      expect(order).toHaveLength(3);
      expect(new Set(order)).toEqual(original);
    }
  });
  it('scores cross-model outcomes without turning a single success into persistent learning',()=>{
    const s=session([[false,false,true],[true,true,true],[false,true,true]]);
    expect(summarizeCross(s)).toEqual({total:3,bare:1,neutral:2,relevant:3,
      gainVsBare:2,gainVsNeutral:1,regressVsBare:0,regressVsNeutral:0});
    expect(crossSignal(s)).toBe('DIRECTIONAL_LIFT');
    expect(crossSignal(session([[true,true,true],[true,true,true],[true,true,true]]))).toBe('NO_CLEAR_LIFT');
    expect(crossSignal(session([[true,true,false],[false,false,true],[false,false,true]]))).toBe('REGRESSION');
  });
});
