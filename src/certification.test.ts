import {describe,expect,it} from 'vitest';
import {SCENARIOS, GAUNTLET_VERSION, blankState, parseAction, applyAction, outcome,
  type Mode,type ToolEpisode,type ToolStep,type Scenario} from './toolGauntlet';
import {CERT_PROTOCOL,CERT_SCOPE,auditModel,replayEpisode,supportingEvidence,
  evidencePayload,sha256,issueCertificate,verifyCertificate} from './certification';

function observed(scenario:Scenario,mode:Mode='guided',date='2026-10-21T20:00:00Z'):ToolEpisode{
  let state=blankState();
  const steps:ToolStep[]=[];
  const rawCalls=[
    JSON.stringify({tool:'inspect',target:scenario.evidence[0]}),
    JSON.stringify({tool:'inspect',target:scenario.evidence[1]}),
    JSON.stringify({tool:'decide',decision:scenario.expected}),
  ];
  for(let i=0;i<rawCalls.length;i++){
    const parsed=parseAction(rawCalls[i]);
    const effect=applyAction(scenario,state,parsed);
    state=effect.state;
    steps.push({turn:i+1,raw:rawCalls[i],parsed,accepted:effect.accepted,
      reply:effect.reply,latencyMs:15+i});
  }
  return {id:scenario.id+'-'+mode+'-'+date,at:date,model:'student:test',
    scenarioId:scenario.id,mode,protocol:GAUNTLET_VERSION,provenance:'OBSERVED',
    steps,outcome:outcome(scenario,state),decision:state.decision};
}
const full=()=>SCENARIOS.map(s=>observed(s));
const support=()=>supportingEvidence('student:test',[],[],[],[],[]);
describe('R7 auditable synthetic-only certification',()=>{
  it('replays six complete R6 tool-action traces and qualifies one explicit model/mode',()=>{
    const episodes=full();
    for(let i=0;i<SCENARIOS.length;i++){
      expect(replayEpisode(episodes[i],SCENARIOS[i])).toMatchObject({valid:true,pass:true});
    }
    const result=auditModel('student:test','guided',episodes);
    expect(result.state).toBe('QUALIFIED');
    expect(result.passed).toBe(6);
    expect(result.selectedEpisodes).toHaveLength(6);
    expect(auditModel('student:test','bare',episodes).state).toBe('NO_EVIDENCE');
    expect(auditModel('different-model','guided',episodes).state).toBe('NO_EVIDENCE');
    expect(evidencePayload(result)).toContain(CERT_SCOPE);
  });
  it('requires every scenario, disallowing an invented or cherry-picked credential',()=>{
    const episodes=full();
    const partial=auditModel('student:test','guided',episodes.slice(0,5));
    expect(partial.state).toBe('NOT_QUALIFIED');
    expect(partial.passed).toBe(5);
    const latest=observed(SCENARIOS[0],'guided','2026-10-21T21:00:00Z');
    const altered:ToolEpisode={...latest,steps:latest.steps.slice(0,2),outcome:'INCOMPLETE',decision:null};
    const report=auditModel('student:test','guided',[...episodes,altered]);
    expect(report.cases[0].outcome).toBe('INCOMPLETE');
    expect(report.state).toBe('NOT_QUALIFIED');
    expect(report.passed).toBe(5);
  });
  it('detects altered raw model calls, forged decisions, tool observations and missing turns',()=>{
    const e=observed(SCENARIOS[0]);
    const invalid=[
      {...e,steps:[{...e.steps[0],raw:'{"tool":"shell","command":"ls"}'},...e.steps.slice(1)]},
      {...e,steps:[{...e.steps[0],reply:'{"kind":"FAKE"}'},...e.steps.slice(1)]},
      {...e,steps:[{...e.steps[0],accepted:false},...e.steps.slice(1)]},
      {...e,outcome:'FAIL' as const},
      {...e,decision:'NO_CHANGE' as const},
      {...e,steps:[...e.steps,{...e.steps[2],turn:4}]},
      {...e,steps:e.steps.slice(0,2)},
      {...e,steps:[{...e.steps[0],latencyMs:-1},...e.steps.slice(1)]},
      {...e,steps:[{...e.steps[0],turn:2},...e.steps.slice(1)]},
    ];
    for(const item of invalid)expect(replayEpisode(item,SCENARIOS[0]).pass).toBe(false);
  });
  it('does not mistake a correctly guessed answer after a rejected early decision for clean performance',()=>{
    const scenario=SCENARIOS[0];
    const original=observed(scenario);
    const steps:ToolStep[]=[];
    let state=blankState();
    const calls=[
      '{"tool":"decide","decision":"REPAIR_DNS"}',
      '{"tool":"inspect","target":"router_status"}',
      '{"tool":"inspect","target":"dns_record"}',
      '{"tool":"decide","decision":"REPAIR_DNS"}',
    ];
    for(const raw of calls){
      const parsed=parseAction(raw);
      const effect=applyAction(scenario,state,parsed);
      state=effect.state;
      steps.push({turn:steps.length+1,raw,parsed,accepted:effect.accepted,reply:effect.reply,latencyMs:16});
    }
    const e={...original,steps,outcome:outcome(scenario,state),decision:state.decision};
    expect(replayEpisode(e,scenario)).toMatchObject({valid:true,pass:false});
    expect(e.outcome).toBe('POLICY_VIOLATION');
  });
  it('issues an unsigned scoped digest receipt and verifies against source evidence',async()=>{
    const episodes=full();
    const report=auditModel('student:test','guided',episodes);
    const receipt=await issueCertificate(report,support());
    expect(receipt.protocol).toBe(CERT_PROTOCOL);
    expect(receipt.scope).toBe(CERT_SCOPE);
    expect(receipt.provenance).toBe('LOCAL_UNTRUSTED');
    expect(receipt.evidenceIds).toHaveLength(6);
    expect(receipt.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await verifyCertificate(receipt,episodes)).valid).toBe(true);
    expect((await verifyCertificate(receipt,episodes.slice(1))).valid).toBe(false);
    const replaced=[{...episodes[0],steps:[...episodes[0].steps]},...episodes.slice(1)];
    replaced[0].steps[0]={...replaced[0].steps[0],latencyMs:999};
    // Valid replay but a different evidence payload => digest mismatch.
    expect(replayEpisode(replaced[0],SCENARIOS[0]).pass).toBe(true);
    expect((await verifyCertificate(receipt,replaced)).valid).toBe(false);
    expect(await sha256(evidencePayload(report))).toBe(receipt.evidenceSha256);
    await expect(issueCertificate(auditModel('student:test','bare',episodes),support())).rejects.toThrow();
  });
  it('does not elevate unrelated evidence from R1-R5 into tool-use qualification',()=>{
    expect(support()).toEqual({teachingEpisodes:0,r2BackedPackets:0,r3RetrievedPairs:0,
      r4TargetComparisons:0,r5CompleteFollowups:0,peerOriginBackedPackets:0});
    expect(auditModel('student:test','guided',[]).state).toBe('NO_EVIDENCE');
  });
});
