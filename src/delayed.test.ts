import {describe,expect,it} from 'vitest';
import {LESSONS} from './teaching';
import {PROBES} from './vault';
import {TASKS_R3} from './retrieval';
import {CROSS_TASKS,NEUTRAL_NOTE,TRANSFER_PROTOCOL,CONDITIONS,type CrossSession,type Triple} from './crossTransfer';
import {
  DELAYED_PROTOCOL,MIN_DELAY_MS,DELAYED_TASKS,tasksForDelay,gradeDelayed,delayedPrompt,
  validSource,createDelayedStudy,isDue,finishDelayedStudy,scoreTriples,delayedSummary,
} from './delayed';

function triple(taskId:string,pass:[boolean,boolean,boolean]=[true,false,true]):Triple{
  return {taskId,order:['neutral','bare','relevant'],answers:{
    bare:{text:'x',correct:pass[0],elapsedMs:22},
    neutral:{text:'y',correct:pass[1],elapsedMs:23},
    relevant:{text:'z',correct:pass[2],elapsedMs:24},
  }};
}
function source():CrossSession{
  return {id:'r4-1',at:'2026-10-15T12:00:00Z',protocol:TRANSFER_PROTOCOL,provenance:'OBSERVED',
    sourcePacketId:'p1',sourceReceiptId:'r1-1',sourceModel:'qwen:test',
    targetModel:'gemma:test',sourceOrigin:'PEER_UNVERIFIED',
    lessonId:'net-broadcast',noteSnapshot:'This is a frozen subnet method.',
    neutralSnapshot:NEUTRAL_NOTE,
    triples:['cross-broadcast-1','cross-broadcast-2','cross-broadcast-3'].map((id,i)=>
      triple(id,[i!==0,i!==0,true])),
  };
}
const day=MIN_DELAY_MS;

describe('R5 delayed transfer protocol',()=>{
  it('uses exactly three fresh non-overlapping tasks per earlier skill',()=>{
    expect(DELAYED_TASKS).toHaveLength(LESSONS.length*3);
    expect(new Set(DELAYED_TASKS.map(t=>t.id)).size).toBe(DELAYED_TASKS.length);
    const previous=[
      ...LESSONS.map(l=>l.transfer),...PROBES.map(p=>p.question),
      ...TASKS_R3.map(t=>t.question),...CROSS_TASKS.map(t=>t.question),
    ];
    for(const lesson of LESSONS){
      const tasks=tasksForDelay(lesson.id);
      expect(tasks).toHaveLength(3);
      for(const task of tasks){
        expect(previous).not.toContain(task.question);
        expect(gradeDelayed(task,task.accepted[0])).toBe(true);
        expect(gradeDelayed(task,'My answer: '+task.accepted[0])).toBe(false);
      }
    }
  });
  it('accepts only complete observed cross-model R4 baselines',()=>{
    expect(validSource(source())).toBe(true);
    expect(validSource({...source(),triples:source().triples.slice(0,2)})).toBe(false);
    expect(validSource({...source(),sourceModel:'gemma:test'})).toBe(false);
    expect(validSource({...source(),noteSnapshot:''})).toBe(false);
    expect(validSource({...source(),protocol:'unexpected'})).toBe(false);
    expect(validSource({...source(),provenance:'INFERRED' as 'OBSERVED'})).toBe(false);
  });
  it('pins source and three-condition baseline, with nonzero minimum delay',()=>{
    const s=source(),now=Date.parse(s.at)+1000;
    const d=createDelayedStudy(s,1,now);
    expect(d.protocol).toBe(DELAYED_PROTOCOL);
    expect(d.status).toBe('PENDING');
    expect(d.sourceModel).toBe(s.sourceModel);
    expect(d.targetModel).toBe(s.targetModel);
    expect(d.noteSnapshot).toBe(s.noteSnapshot);
    expect(d.neutralSnapshot).toBe(NEUTRAL_NOTE);
    expect(d.baselineScores).toEqual({bare:2,neutral:2,relevant:3});
    expect(Date.parse(d.dueAt)-Date.parse(s.at)).toBe(day);
    expect(isDue(d,now)).toBe(false);
    expect(isDue(d,Date.parse(d.dueAt)-1)).toBe(false);
    expect(isDue(d,Date.parse(d.dueAt))).toBe(true);
    expect(()=>createDelayedStudy(s,0,now)).toThrow();
    expect(()=>createDelayedStudy(s,10,now)).toThrow();
    expect(()=>createDelayedStudy({...s,at:'2100-01-01T00:00:00Z'},1,now)).toThrow();
  });
  it('does not prematurely finalize, or accept partial / duplicated / broken condition records',()=>{
    const s=source(),d=createDelayedStudy(s,3,Date.parse(s.at)+1000);
    const pairs=tasksForDelay(s.lessonId).map(task=>triple(task.id));
    const at=d.dueAt;
    expect(()=>finishDelayedStudy(d,pairs,new Date(Date.parse(at)-1).toISOString())).toThrow();
    expect(()=>finishDelayedStudy(d,pairs.slice(0,2),at)).toThrow();
    expect(()=>finishDelayedStudy(d,[pairs[0],pairs[0],pairs[1]],at)).toThrow();
    expect(()=>finishDelayedStudy(d,[pairs[0],{...pairs[1],order:['bare','bare','relevant']},pairs[2]],at)).toThrow();
    const done=finishDelayedStudy(d,pairs,at);
    expect(done.status).toBe('COMPLETE');
    expect(done.triples).toHaveLength(3);
    expect(done.elapsedHours).toBeCloseTo(72);
    expect(isDue(done,Date.parse(at)+day)).toBe(false);
  });
  it('uses isolated note controls and retains descriptive pre/post comparisons',()=>{
    const s=source(),d=createDelayedStudy(s,1,Date.parse(s.at)+1000);
    const task=tasksForDelay(s.lessonId)[0];
    const bare=delayedPrompt(task,'bare',s.noteSnapshot,s.neutralSnapshot);
    const neutral=delayedPrompt(task,'neutral',s.noteSnapshot,s.neutralSnapshot);
    const relevant=delayedPrompt(task,'relevant',s.noteSnapshot,s.neutralSnapshot);
    for(const prompt of [bare,neutral,relevant])expect(prompt).toContain(task.question);
    expect(bare).not.toContain(s.noteSnapshot);
    expect(bare).not.toContain(s.neutralSnapshot);
    expect(neutral).toContain(s.neutralSnapshot);
    expect(neutral).not.toContain(s.noteSnapshot);
    expect(relevant).toContain(s.noteSnapshot);
    expect(relevant).not.toContain(s.neutralSnapshot);
    const triples=tasksForDelay(s.lessonId).map((t,i)=>triple(t.id,i===0?[false,false,true]:[false,true,true]));
    expect(scoreTriples(triples)).toEqual({bare:0,neutral:2,relevant:3});
    const complete=finishDelayedStudy(d,triples,d.dueAt);
    expect(delayedSummary(complete)).toEqual({
      baseline:{bare:2,neutral:2,relevant:3},
      latest:{bare:0,neutral:2,relevant:3},
      change:{bare:-2,neutral:0,relevant:0},
      relevantAdvantageNow:1,relevantAdvantageThen:1,
    });
  });
  it('does not let an already completed study run again',()=>{
    const s=source(),d=createDelayedStudy(s,1,Date.parse(s.at)+1000);
    const a=tasksForDelay(s.lessonId).map(t=>triple(t.id));
    const complete=finishDelayedStudy(d,a,d.dueAt);
    expect(()=>finishDelayedStudy(complete,a,new Date(Date.parse(d.dueAt)+day).toISOString())).toThrow();
    expect(CONDITIONS).toEqual(['bare','neutral','relevant']);
  });
});
