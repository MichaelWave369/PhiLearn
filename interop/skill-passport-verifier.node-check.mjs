import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CASES,FORMAT,CERT_PROTOCOL,CERT_SCOPE,R6,
  parseAction,verifyObject,verifyText,replay} from './skill-passport-verifier.mjs';

const h=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fixture(){
  const model='unit-test:synthetic',mode='guided',episodes=[];
  for(const c of CASES){
    const steps=[],seen=[];
    const calls=[
      JSON.stringify({tool:'inspect',target:c.targets[0]}),
      JSON.stringify({tool:'inspect',target:c.targets[1]}),
      JSON.stringify({tool:'decide',decision:c.expected}),
    ];
    calls.forEach((raw,i)=>{
      const parsed=parseAction(raw);
      let reply;
      if(parsed.tool==='inspect'){
        seen.push(parsed.target);
        reply=JSON.stringify({kind:'SYNTHETIC_INSPECTION',target:parsed.target,
          data:c.readings[parsed.target],effect:'read_only'});
      }else{
        assert.deepEqual(seen,c.targets);
        reply=JSON.stringify({kind:'SIMULATED_DECISION',value:parsed.decision,
          result:'Recorded for grading only. No external operation occurred.'});
      }
      steps.push({turn:i+1,raw,parsed,reply,accepted:true,latencyMs:20+i});
    });
    const episode={id:'fixture-'+c.id,at:'2026-10-21T20:00:00.000Z',
      protocol:R6,provenance:'OBSERVED',scenarioId:c.id,model,mode,
      steps,outcome:'PASS',decision:c.expected};
    assert.equal(replay(episode,c),true);
    episodes.push(episode);
  }
  const certificate={id:'r7-fixture',issuedAt:'2026-10-21T20:00:00Z',
    protocol:CERT_PROTOCOL,scope:CERT_SCOPE,provenance:'LOCAL_UNTRUSTED',model,mode,
    scenarioIds:CASES.map(c=>c.id),evidenceIds:episodes.map(e=>e.id),
    evidenceSha256:h({protocol:CERT_PROTOCOL,scope:CERT_SCOPE,model,mode,episodes}),
    summary:'Test-only forged synthetic record; never production evidence.',support:{}};
  const body={format:FORMAT,exportedAt:'2026-10-21T21:00:00Z',
    issuerClaim:{app:'PhiLearn',selfReported:true},subject:{model,mode},scope:CERT_SCOPE,
    boundary:{authority:'NONE',requestedPermissions:[],usage:'INSPECT_ONLY'},
    certificate,episodes};
  return {...body,payloadSha256:h(body)};
}
function reseal(p){
  p.certificate.evidenceSha256=h({protocol:CERT_PROTOCOL,scope:CERT_SCOPE,
    model:p.subject.model,mode:p.subject.mode,episodes:p.episodes});
  const {payloadSha256:unused,...body}=p;void unused;
  p.payloadSha256=h(body);return p;
}
test('R9 independent Node consumer replays frozen R6 schema and checks R7/R8 hashes',()=>{
  const p=fixture();
  assert.equal(verifyObject(p).status,'REPLAY_PASS_UNTRUSTED');
  assert.equal(verifyText(JSON.stringify(p)).replayConsistent,true);
  assert.equal(verifyObject(p).authority,'NONE');
  assert.deepEqual(verifyObject(p).permissions,[]);
});
test('forged evidence cannot win with stored PASS or rewritten hashes',()=>{
  const p=fixture();
  p.episodes[0].steps[0].raw='{"tool":"decide","decision":"REPAIR_DNS"}';
  reseal(p);
  assert.equal(verifyObject(p).replayConsistent,false);
  p.episodes[0].steps[0].raw='{"tool":"inspect","target":"router_status"}';
  p.episodes[0].outcome='POLICY_VIOLATION';
  reseal(p);
  assert.equal(verifyObject(p).replayConsistent,false);
});
test('no-authority boundary and cross-model / order constraints are mandatory',()=>{
  const p=fixture();
  p.boundary={authority:'WRITE',requestedPermissions:['shell'],usage:'EXECUTE'};
  reseal(p);
  assert.equal(verifyObject(p).replayConsistent,false);
  const q=fixture();
  q.subject.model='fake:bigger';
  reseal(q);
  assert.equal(verifyObject(q).replayConsistent,false);
  const o=fixture();
  o.episodes.reverse();
  reseal(o);
  assert.equal(verifyObject(o).replayConsistent,false);
});
test('parser rejects executable-shaped injection and malformed input',()=>{
  for(const source of [
    '{"tool":"shell","command":"touch /tmp/x"}',
    '{"tool":"inspect","target":"dns_record","sideEffect":"deploy"}',
    'markdown fence {"tool":"inspect","target":"dns_record"}',
  ])assert.equal(parseAction(source),null);
  assert.equal(verifyText('invalid json').replayConsistent,false);
  assert.equal(verifyText('x'.repeat(256001)).replayConsistent,false);
});
