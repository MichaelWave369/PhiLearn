import { describe, expect, it } from 'vitest';
import { LESSONS, type TeachingReceipt } from './teaching';
import {
  VAULT_VERSION, PROBES, probesFor, probePrompt, scoreProbe, makePacket, packetStatus, summarizeRun,
  type SkillPacket, type VaultRun, type ProbePair,
} from './vault';

function source(lessonId: string): TeachingReceipt {
  return {
    id:'r1-source-001',at:'2026-10-21T13:00:00Z',curriculum:'philearn-r1-2026-10-21',
    provenance:'OBSERVED',lessonId,student:'test-model:1b',teacher:null,
    coaching:'curated',order:['baseline','coached'],explanation:'Calculate the answer from the demonstrated method.',
    baseline:{response:'BAD',correct:false,elapsedMs:40},coached:{response:'GOOD',correct:true,elapsedMs:42},
    verdict:'IMPROVED',
  };
}
function paired(lessonId: string, unassisted: boolean[], assisted: boolean[]): VaultRun {
  const pairs: ProbePair[] = probesFor(lessonId).map((probe,i) => ({
    probeId:probe.id,order:i % 2 === 0 ? ['unassisted','assisted'] : ['assisted','unassisted'],
    unassisted:{text:'test',correct:unassisted[i],elapsedMs:12},
    assisted:{text:'test',correct:assisted[i],elapsedMs:13},
  }));
  return {id:'r2-run',at:'2026-10-21T13:01:00Z',model:'test-model:1b',protocol:VAULT_VERSION,pairs};
}
function packetWith(run: VaultRun): SkillPacket {
  return {...makePacket(source('net-broadcast')),runs:[run]};
}
describe('R2 vault science and trust boundaries', () => {
  it('has three distinct, independently graded R2 probes per lesson', () => {
    expect(new Set(PROBES.map(p => p.id)).size).toEqual(PROBES.length);
    expect(PROBES.length).toBe(LESSONS.length * 3);
    for (const lesson of LESSONS) {
      const probes = probesFor(lesson.id);
      expect(probes).toHaveLength(3);
      for (const probe of probes) {
        expect(probe.question).not.toBe(lesson.transfer);
        expect(probe.accepted.length).toBeGreaterThan(0);
        expect(scoreProbe(probe,probe.accepted[0])).toBe(true);
        expect(scoreProbe(probe,'ANSWER IS '+probe.accepted[0])).toBe(false);
      }
    }
  });
  it('keeps correct answers out of both model-facing prompts', () => {
    for(const probe of PROBES) {
      for(const prompt of [probePrompt(probe),probePrompt(probe,'An explanation of the method')]) {
        expect(prompt).toContain(probe.question);
        expect(prompt).not.toContain('ANSWER KEY:');
      }
    }
  });
  it('captures a provenance-bearing note as a CANDIDATE, not an instant promotion', () => {
    const packet=makePacket(source('net-broadcast'));
    expect(packetStatus(packet)).toBe('CANDIDATE');
    expect(packet.sourceReceiptId).toBe('r1-source-001');
    expect(packet.sourceModel).toBe('test-model:1b');
    expect(packet.runs).toHaveLength(0);
    expect(packet.origin).toBe('CURATED');
  });
  it('rejects unobserved or invalid source receipts', () => {
    expect(() => makePacket({...source('net-broadcast'),provenance:'SIMULATED' as 'OBSERVED'})).toThrow();
    expect(() => makePacket(source('not-a-lesson'))).toThrow();
  });
  it('requires all three assisted passes, improvement and no regression', () => {
    expect(packetStatus(packetWith(paired('net-broadcast',[true,false,true],[true,true,true])))).toBe('EVIDENCE_BACKED');
    expect(packetStatus(packetWith(paired('net-broadcast',[true,true,true],[true,true,true])))).toBe('NO_LIFT');
    expect(packetStatus(packetWith(paired('net-broadcast',[true,true,false],[true,false,true])))).toBe('REGRESSED');
    expect(packetStatus(packetWith(paired('net-broadcast',[false,false,true],[true,false,true])))).toBe('INCONCLUSIVE');
  });
  it('does not certify partial, duplicate, wrong-model, or wrong-protocol runs', () => {
    const run=paired('net-broadcast',[false,false,false],[true,true,true]);
    expect(packetStatus(packetWith({...run,pairs:run.pairs.slice(0,2)}))).toBe('INCONCLUSIVE');
    const duplicated={...run,pairs:[run.pairs[0],run.pairs[0],run.pairs[1]]};
    expect(packetStatus(packetWith(duplicated))).toBe('INCONCLUSIVE');
    expect(packetStatus(packetWith({...run,model:'another-model'}))).toBe('INCONCLUSIVE');
    expect(packetStatus(packetWith({...run,protocol:'unknown'}))).toBe('INCONCLUSIVE');
  });
  it('summarizes paired differences without implying internal learning', () => {
    const run=paired('net-broadcast',[true,false,false],[true,true,false]);
    expect(summarizeRun(run)).toEqual({total:3,unassisted:1,assisted:2,improvements:1,regressions:0});
  });
});
