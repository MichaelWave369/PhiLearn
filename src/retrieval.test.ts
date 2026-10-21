import { describe, expect, it } from 'vitest';
import { LESSONS } from './teaching';
import { probesFor, packetStatus, VAULT_VERSION, type SkillPacket } from './vault';
import {
  RETRIEVAL_PROTOCOL, TASKS_R3, retrieve, relevance, r3Prompt, gradeR3, sessionStats,
  type RetrievalSession,
} from './retrieval';

function eligiblePacket(lessonId: string, model = 'student:test'): SkillPacket {
  const probes=probesFor(lessonId);
  return {
    id:'pkt-'+lessonId,createdAt:'2026-10-21T10:00:00Z',curriculum:VAULT_VERSION,
    sourceReceiptId:'observed-r1-'+lessonId,sourceModel:model,sourceTeacher:null,lessonId,
    origin:'CURATED',note:'A checked procedural description about '+lessonId+'.',
    runs:[{id:'validated-r2',at:'2026-10-21T10:10:00Z',protocol:VAULT_VERSION,model,
      pairs:probes.map((p,i)=>({probeId:p.id,order:['unassisted','assisted'],
        unassisted:{text:'',correct:i!==0,elapsedMs:10},
        assisted:{text:p.accepted[0],correct:true,elapsedMs:12}}))}],
  };
}
const allPackets=LESSONS.map(l=>eligiblePacket(l.id));

describe('R3 evidence-gated retrieval protocol', () => {
  it('only treats a same-model, R2-evidence-backed packet as eligible',()=>{
    for(const packet of allPackets)expect(packetStatus(packet)).toBe('EVIDENCE_BACKED');
    const task=TASKS_R3[0];
    expect(retrieve(task.question,'other-model',allPackets).decision).toBe('ABSTAIN_NO_EVIDENCE');
    expect(retrieve(task.question,'student:test',allPackets).decision).toBe('RETRIEVED');
    const noProof={...allPackets[0],runs:[]};
    expect(retrieve(task.question,'student:test',[noProof]).decision).toBe('ABSTAIN_NO_EVIDENCE');
    const regression={...allPackets[0],runs:[{...allPackets[0].runs[0],
      pairs:allPackets[0].runs[0].pairs.map((pair,i)=>i===1?
        {...pair,unassisted:{...pair.unassisted,correct:true},assisted:{...pair.assisted,correct:false}}:pair)}]};
    expect(retrieve(task.question,'student:test',[regression]).decision).toBe('ABSTAIN_NO_EVIDENCE');
  });

  it('routes the frozen, previously unused 12 in-domain tasks without using answer keys',()=>{
    const inDomain=TASKS_R3.filter(t=>t.category!=='out-of-domain');
    expect(inDomain).toHaveLength(LESSONS.length*2);
    for(const task of inDomain){
      const route=retrieve(task.question,'student:test',allPackets);
      expect(route.decision,task.id).toBe('RETRIEVED');
      expect(route.packet?.lessonId,task.id).toBe(task.category);
      expect(route.packet?.sourceModel).toBe('student:test');
      expect(route.score).toBeGreaterThanOrEqual(4);
      expect(route.score-route.secondScore).toBeGreaterThanOrEqual(2);
    }
  });

  it('abstains on unfamiliar and ambiguous queries rather than inventing a skill',()=>{
    for(const task of TASKS_R3.filter(t=>t.category==='out-of-domain')){
      expect(retrieve(task.question,'student:test',allPackets).decision).toBe('ABSTAIN_NO_MATCH');
    }
    const vague='What is the broadcast address and subnet mask for an IPv4 CIDR range?';
    expect(retrieve(vague,'student:test',allPackets).decision).toBe('ABSTAIN_AMBIGUOUS');
    expect(relevance('Which ocean is deepest?','logic-hex')).toBe(0);
  });

  it('deduplicates multiple packets of one category and selects the newest R2 verified one',()=>{
    const original=allPackets[0],newer={...original,id:'newer',createdAt:'2026-10-21T12:00:00Z'};
    const route=retrieve(TASKS_R3[0].question,'student:test',[original,newer]);
    expect(route.decision).toBe('RETRIEVED');
    expect(route.packet?.id).toBe('newer');
  });

  it('does not mix held-out scores into model-facing prompts',()=>{
    for(const task of TASKS_R3){
      expect(task.accepted).toHaveLength(1);
      expect(gradeR3(task,task.accepted[0])).toBe(true);
      expect(gradeR3(task,'answer is '+task.accepted[0])).toBe(false);
      const bare=r3Prompt(task);
      const aided=r3Prompt(task,'A safe note about method');
      expect(bare).toContain(task.question);
      expect(aided).toContain(task.question);
      expect(bare).not.toContain('reference_note');
      expect(aided).toContain('reference_note');
    }
  });

  it('computes paired gains, regressions, and abstentions without attributing model calls to abstention',()=>{
    const session:RetrievalSession={id:'test',at:'2026-10-21T11:00:00Z',
      model:'student:test',protocol:RETRIEVAL_PROTOCOL,receipts:[
        {id:'x',at:'2026-10-21T11:00:00Z',protocol:RETRIEVAL_PROTOCOL,provenance:'OBSERVED',
          taskId:'r3-hex-a',model:'student:test',decision:'RETRIEVED',
          packetId:'p',packetSourceReceiptId:'r1',matchScore:8,matchMargin:8,
          reason:'matched',order:['bare','retrieved'],
          bare:{text:'wrong',correct:false,elapsedMs:20},
          retrieved:{text:'DA',correct:true,elapsedMs:22}},
        {id:'y',at:'2026-10-21T11:00:01Z',protocol:RETRIEVAL_PROTOCOL,provenance:'INFERRED',
          taskId:'r3-ood-a',model:'student:test',decision:'ABSTAIN_NO_MATCH',
          packetId:null,packetSourceReceiptId:null,matchScore:0,matchMargin:0,reason:'no match',
          order:[],bare:null,retrieved:null},
      ]};
    expect(sessionStats(session)).toEqual({total:2,retrieved:1,abstained:1,barePass:0,
      retrievedPass:1,gains:1,regressions:0});
  });
});
