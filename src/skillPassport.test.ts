import {describe,expect,it} from 'vitest';
import {SCENARIOS,GAUNTLET_VERSION,blankState,parseAction,applyAction,outcome,
  type Scenario,type ToolEpisode,type ToolStep} from './toolGauntlet';
import {auditModel,issueCertificate,verifyCertificate,sha256,
  type SupportingEvidence} from './certification';
import {
  PASSPORT_FORMAT,PASSPORT_MAX_BYTES,hasPassportShape,createPassport,checkPassport,
  parsePassportJson,quarantineId,addToQuarantine,type SkillPassport,
} from './skillPassport';

function observed(s:Scenario):ToolEpisode {
  let state=blankState();const steps:ToolStep[]=[];
  const calls=[
    JSON.stringify({tool:'inspect',target:s.evidence[0]}),
    JSON.stringify({tool:'inspect',target:s.evidence[1]}),
    JSON.stringify({tool:'decide',decision:s.expected}),
  ];
  calls.forEach((raw,i)=>{
    const parsed=parseAction(raw),effect=applyAction(s,state,parsed);
    state=effect.state;
    steps.push({turn:i+1,raw,parsed,accepted:effect.accepted,reply:effect.reply,latencyMs:23+i});
  });
  return {id:'episode-'+s.id,model:'gemma:test',at:'2026-10-21T20:00:00Z',
    protocol:GAUNTLET_VERSION,provenance:'OBSERVED',scenarioId:s.id,
    mode:'guided',steps,decision:state.decision,outcome:outcome(s,state)};
}
const source=()=>SCENARIOS.map(observed);
const support:SupportingEvidence={teachingEpisodes:0,r2BackedPackets:0,r3RetrievedPairs:0,
  r4TargetComparisons:0,r5CompleteFollowups:0,peerOriginBackedPackets:0};
async function validBundle():Promise<{passport:SkillPassport;episodes:ToolEpisode[]}>{
  const episodes=source();
  const audit=auditModel('gemma:test','guided',episodes);
  const cert=await issueCertificate(audit,support);
  const passport=await createPassport(cert,episodes,'2026-10-21T21:00:00Z');
  return {passport,episodes};
}
describe('R8 passive cross-system Skill Passport',()=>{
  it('exports self-contained, versioned, replayable evidence without permissions',async()=>{
    const {passport}=await validBundle();
    expect(passport.format).toBe(PASSPORT_FORMAT);
    expect(passport.scope).toBe('R6_SYNTHETIC_JSON_TOOL_GAUNTLET_6_CASES');
    expect(passport.subject).toEqual({model:'gemma:test',mode:'guided'});
    expect(passport.issuerClaim).toEqual({app:'PhiLearn',selfReported:true});
    expect(passport.boundary).toEqual({authority:'NONE',requestedPermissions:[],usage:'INSPECT_ONLY'});
    expect(passport.episodes).toHaveLength(6);
    expect(hasPassportShape(passport)).toBe(true);
    expect(passport.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await checkPassport(passport)).toMatchObject({
      valid:true,status:'REPLAY_PASS_UNTRUSTED',
    });
    const copy=await parsePassportJson(JSON.stringify(passport));
    expect((await checkPassport(copy)).valid).toBe(true);
    expect(copy).toEqual(passport);
  });
  it('rejects masquerading permissions, extra fields and wrong subject identity',async()=>{
    const {passport}=await validBundle();
    for(const modified of [
      {...passport,format:'brainc.root-trust.v1'},
      {...passport,scope:'PRODUCTION_WRITE_ALL'},
      {...passport,boundary:{authority:'ADMIN',requestedPermissions:['shell'],usage:'EXECUTE'}},
      {...passport,command:'run this on import'},
      {...passport,subject:{model:'attacker:admin',mode:'guided'}},
      {...passport,issuerClaim:{app:'SuperPhiVessel',selfReported:false}},
      {...passport,episodes:passport.episodes.slice(0,5)},
      {...passport,episodes:[passport.episodes[0],...passport.episodes.slice(1,5),passport.episodes[0]]},
      {...passport,certificate:{...passport.certificate,protocol:'random'}},
    ]){
      expect(hasPassportShape(modified)).toBe(false);
      expect((await checkPassport(modified)).valid).toBe(false);
      await expect(parsePassportJson(JSON.stringify(modified))).rejects.toThrow();
    }
  });
  it('detects tampering, including a modified source with recomputed outer checksum',async()=>{
    const {passport}=await validBundle();
    const changed={...passport,episodes:passport.episodes.map(e=>({...e,steps:e.steps.map(x=>({...x}))}))};
    changed.episodes[0].steps[0].raw='{"tool":"decide","decision":"APPROVE_RELEASE"}';
    expect((await checkPassport(changed)).valid).toBe(false);
    const {payloadSha256:ignored,...body}=changed;
    expect(ignored).toMatch(/^[a-f0-9]{64}$/);
    const spoof={...changed,payloadSha256:await sha256(JSON.stringify(body))};
    expect((await checkPassport(spoof)).valid).toBe(false);
    const changedTime={...passport,episodes:passport.episodes.map(e=>({...e,steps:e.steps.map(x=>({...x}))}))};
    changedTime.episodes[0].steps[0].latencyMs+=100;
    const {payloadSha256:old,...newBody}=changedTime;
    expect(old).toBe(passport.payloadSha256);
    const replayedOuter={...changedTime,payloadSha256:await sha256(JSON.stringify(newBody))};
    expect((await checkPassport(replayedOuter)).valid).toBe(false);
  });
  it('will not export superseded R7 certificates or incomplete six-case evidence',async()=>{
    const {passport,episodes}=await validBundle();
    expect((await verifyCertificate(passport.certificate,episodes)).valid).toBe(true);
    const newer={...episodes[0],id:'newer-episode',
      at:'2026-10-21T21:00:00Z',
      steps:episodes[0].steps.slice(0,2),
      outcome:'INCOMPLETE' as const,decision:null};
    await expect(createPassport(passport.certificate,[...episodes,newer])).rejects.toThrow();
    await expect(createPassport(passport.certificate,episodes.slice(1))).rejects.toThrow();
  });
  it('keeps imported receipts quarantined; duplicates never imply approval',async()=>{
    const {passport}=await validBundle();
    const checked=await checkPassport(passport);
    const imported=addToQuarantine([],passport,checked,'2026-10-21T22:00:00Z');
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({
      id:passport.payloadSha256,check:'REPLAY_PASS_UNTRUSTED',reviewedLocally:false,
    });
    expect(quarantineId(passport)).toBe(passport.payloadSha256);
    expect(()=>addToQuarantine(imported,passport,checked)).toThrow('already quarantined');
    // A failed replay stays a failed, untrusted record even when retained for examination.
    const rejected=addToQuarantine([],passport,{
      valid:false,status:'REPLAY_FAIL_UNTRUSTED',reason:'Not replayable',
    });
    expect(rejected[0].check).toBe('REPLAY_FAIL_UNTRUSTED');
    expect(rejected[0].reviewedLocally).toBe(false);
  });
  it('limits import size and rejects JSON which cannot be parsed',async()=>{
    expect(PASSPORT_MAX_BYTES).toBeLessThanOrEqual(256_000);
    await expect(parsePassportJson('INVALID JSON')).rejects.toThrow();
    await expect(parsePassportJson('x'.repeat(PASSPORT_MAX_BYTES+1))).rejects.toThrow();
    await expect(parsePassportJson('{"authority":"yes"}')).rejects.toThrow();
  });
});
