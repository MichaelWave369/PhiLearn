import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {CASES,FORMAT,CERT_PROTOCOL,CERT_SCOPE,R6,parseAction} from './skill-passport-verifier.mjs';
import {TRUST_FORMAT,createTrustRecord,createSignedPassport} from './r10-signed-passport.mjs';
import {emptyRegistry,validateEnrollmentRegistry,approveForInspection,
  revokeEnrollment,evaluateEnrollment,signedEnvelopeDigest} from './r11-enrollment.mjs';
const sha=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const t0='2026-10-21T20:00:00.000Z', t1='2026-10-21T21:00:00.000Z';
function passport(){
  const model='test:r11',mode='guided';
  const episodes=CASES.map(c=>{
    const steps=[
      JSON.stringify({tool:'inspect',target:c.targets[0]}),
      JSON.stringify({tool:'inspect',target:c.targets[1]}),
      JSON.stringify({tool:'decide',decision:c.expected}),
    ].map((raw,i)=>{const parsed=parseAction(raw);
      return {turn:i+1,raw,parsed,accepted:true,latencyMs:25+i,
        reply:i<2?JSON.stringify({kind:'SYNTHETIC_INSPECTION',target:parsed.target,
          data:c.readings[parsed.target],effect:'read_only'}):
          JSON.stringify({kind:'SIMULATED_DECISION',value:c.expected,
            result:'Recorded for grading only. No external operation occurred.'})};});
    return {id:'obs-'+c.id,at:t0,model,mode,protocol:R6,provenance:'OBSERVED',
      scenarioId:c.id,steps,outcome:'PASS',decision:c.expected};
  });
  const cert={id:'r7-test',issuedAt:t0,protocol:CERT_PROTOCOL,scope:CERT_SCOPE,
    provenance:'LOCAL_UNTRUSTED',model,mode,scenarioIds:CASES.map(c=>c.id),
    evidenceIds:episodes.map(e=>e.id),
    evidenceSha256:sha({protocol:CERT_PROTOCOL,scope:CERT_SCOPE,model,mode,episodes}),
    summary:'Test synthetic only',support:{}};
  const body={format:FORMAT,exportedAt:t0,issuerClaim:{app:'PhiLearn',selfReported:true},
    subject:{model,mode},scope:CERT_SCOPE,
    boundary:{authority:'NONE',requestedPermissions:[],usage:'INSPECT_ONLY'},
    certificate:cert,episodes};
  return {...body,payloadSha256:sha(body)};
}
function ctx(){
  const pair=generateKeyPairSync('ed25519');
  const key=createTrustRecord('field.operator',pair.publicKey);
  const trust={format:TRUST_FORMAT,keys:[key]};
  const signed=createSignedPassport(passport(),pair.privateKey,'field.operator',t0);
  return {pair,key,trust,signed};
}
test('default-deny: no registry means no enrollment even with valid pinned signature',()=>{
  const {signed,trust}=ctx();
  const a=evaluateEnrollment(signed,trust,null,t1);
  assert.equal(a.status,'REGISTRY_REJECTED');assert.equal(a.signatureValid,true);
  assert.equal(a.actionAllowed,false);assert.deepEqual(a.permissions,[]);
  const b=evaluateEnrollment(signed,trust,emptyRegistry(),t1);
  assert.equal(b.status,'NOT_ENROLLED');assert.equal(b.reviewApproved,false);
});
test('explicit human inspection approval is scoped to one exact signed envelope and expires',()=>{
  const {signed,trust}=ctx(),registry=emptyRegistry();
  assert.throws(()=>approveForInspection(signed,trust,registry,'operator',t1,24,false));
  const approved=approveForInspection(signed,trust,registry,'operator',t1,24,true);
  assert.equal(validateEnrollmentRegistry(approved),true);
  const mid=evaluateEnrollment(signed,trust,approved,'2026-10-21T22:00:00.000Z');
  assert.equal(mid.status,'APPROVED_FOR_INSPECTION_ONLY');
  assert.equal(mid.reviewApproved,true);assert.equal(mid.inspectionOnly,true);
  assert.equal(mid.authority,'NONE');assert.equal(mid.actionAllowed,false);
  assert.deepEqual(mid.permissions,[]);
  assert.equal(evaluateEnrollment(signed,trust,approved,'2026-10-22T21:00:00.000Z').status,'EXPIRED');
  assert.equal(evaluateEnrollment(signed,trust,approved,'2026-10-21T20:59:00.000Z').status,'NOT_YET_VALID');
  const changed={...signed,signedAt:'2026-10-21T20:01:00.000Z'};
  assert.equal(evaluateEnrollment(changed,trust,approved,t1).reviewApproved,false);
});
test('revocation is terminal and cannot be silently renewed',()=>{
  const {signed,trust}=ctx(),r=approveForInspection(signed,trust,emptyRegistry(),
    'operator',t1,72,true);
  const id=r.entries[0].enrollmentId;
  const revoked=revokeEnrollment(r,id,'operator',true);
  assert.equal(revoked.entries[0].state,'REVOKED');
  assert.equal(evaluateEnrollment(signed,trust,revoked,t1).status,'REVOKED');
  assert.throws(()=>approveForInspection(signed,trust,revoked,'operator',t1,1,true));
  assert.throws(()=>revokeEnrollment(revoked,id,'operator',true));
  assert.throws(()=>revokeEnrollment(r,id,'operator',false));
});
test('unknown signer, forged trust store or invalid lease cannot pass enrollment',()=>{
  const {signed,trust,key}=ctx();
  const bad={format:TRUST_FORMAT,keys:[{...key,active:false}]};
  assert.throws(()=>approveForInspection(signed,bad,emptyRegistry(),'operator',t1,12,true));
  for(const lease of [0,169,1.5,-1,NaN])assert.throws(()=>
    approveForInspection(signed,trust,emptyRegistry(),'operator',t1,lease,true));
  const wrong={...signed,issuerId:'attacker'};
  assert.equal(evaluateEnrollment(wrong,trust,emptyRegistry(),t1).status,'SIGNATURE_REJECTED');
});
test('registry structural checks reject duplicates, changed binding and excessive scope',()=>{
  const {signed,trust}=ctx(),base=approveForInspection(signed,trust,emptyRegistry(),
    'operator',t1,24,true);
  const entry=base.entries[0];
  assert.match(signedEnvelopeDigest(signed),/^[a-f0-9]{64}$/);
  assert.equal(validateEnrollmentRegistry({...base,entries:[entry,entry]}),false);
  assert.equal(validateEnrollmentRegistry({...base,entries:[{...entry,scope:'PRODUCTION_ROOT'}]}),false);
  assert.equal(validateEnrollmentRegistry({...base,entries:[{...entry,state:'APPROVED_TOOL_USE'}]}),false);
  assert.equal(validateEnrollmentRegistry({...base,entries:[{...entry,expiresAt:'2026-11-21T21:00:00Z'}]}),false);
  const bad={...base,entries:[{...entry,model:'changed-model'}]};
  assert.equal(evaluateEnrollment(signed,trust,bad,t1).status,'REGISTRY_REJECTED');
});
