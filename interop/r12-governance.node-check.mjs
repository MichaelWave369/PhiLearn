import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {CASES,FORMAT,CERT_PROTOCOL,CERT_SCOPE,R6,parseAction} from './skill-passport-verifier.mjs';
import {TRUST_FORMAT as ISSUER_TRUST,createTrustRecord,createSignedPassport}
  from './r10-signed-passport.mjs';
import {
  emptyLedger,emptyCheckpoint,createOperatorRecord,validateOperatorTrust,
  createCheckpoint,verifyLedger,appendApproval,appendClosure,
  evaluateGovernance,checkpointMatches,GENESIS,TRUST_FORMAT as OPERATOR_TRUST,
} from './r12-governance.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const AT='2026-10-21T21:00:00.000Z',AFTER='2026-10-21T21:10:00.000Z';
function setup(){
  const model='r12-test-model',mode='guided';
  const episodes=CASES.map(c=>{
    const calls=[
      JSON.stringify({tool:'inspect',target:c.targets[0]}),
      JSON.stringify({tool:'inspect',target:c.targets[1]}),
      JSON.stringify({tool:'decide',decision:c.expected}),
    ];
    const steps=calls.map((raw,i)=>{
      const parsed=parseAction(raw);
      const reply=i<2?
        JSON.stringify({kind:'SYNTHETIC_INSPECTION',target:parsed.target,
          data:c.readings[parsed.target],effect:'read_only'}):
        JSON.stringify({kind:'SIMULATED_DECISION',value:c.expected,
          result:'Recorded for grading only. No external operation occurred.'});
      return {turn:i+1,raw,parsed,reply,accepted:true,latencyMs:25+i};
    });
    return {id:'r12-'+c.id,at:AT,protocol:R6,provenance:'OBSERVED',
      scenarioId:c.id,model,mode,steps,outcome:'PASS',decision:c.expected};
  });
  const cert={id:'r7-r12-test',issuedAt:AT,protocol:CERT_PROTOCOL,
    scope:CERT_SCOPE,provenance:'LOCAL_UNTRUSTED',model,mode,
    scenarioIds:CASES.map(c=>c.id),evidenceIds:episodes.map(e=>e.id),
    evidenceSha256:hash({protocol:CERT_PROTOCOL,scope:CERT_SCOPE,model,mode,episodes}),
    summary:'Test fixture only; never operational evidence.',support:{}};
  const body={format:FORMAT,exportedAt:AT,issuerClaim:{app:'PhiLearn',selfReported:true},
    subject:{model,mode},scope:CERT_SCOPE,
    boundary:{authority:'NONE',requestedPermissions:[],usage:'INSPECT_ONLY'},
    certificate:cert,episodes};
  const issuerPair=generateKeyPairSync('ed25519');
  const issuerTrust={format:ISSUER_TRUST,keys:[createTrustRecord('field.lab',issuerPair.publicKey)]};
  const signed=createSignedPassport({...body,payloadSha256:hash(body)},
    issuerPair.privateKey,'field.lab',AT);
  const opPair=generateKeyPairSync('ed25519');
  const opTrust={format:OPERATOR_TRUST,
    operators:[createOperatorRecord('operator.alpha',opPair.publicKey)]};
  return {signed,issuerTrust,opPair,opTrust};
}
function approved(){
  const v=setup(),ledger=appendApproval(v.signed,v.issuerTrust,v.opTrust,
    emptyLedger(),v.opPair.privateKey,'operator.alpha',AT,24,true,emptyCheckpoint());
  return {...v,ledger,head:createCheckpoint(ledger,v.opTrust)};
}
test('signed, pinned operator approval requires independent checkpoint to count',()=>{
  const {signed,issuerTrust,opTrust,ledger,head}=approved();
  assert.equal(validateOperatorTrust(opTrust),true);
  assert.equal(verifyLedger(ledger,opTrust).chainValid,true);
  const ok=evaluateGovernance(signed,issuerTrust,opTrust,ledger,head,AFTER);
  assert.equal(ok.status,'INSPECTION_APPROVED_WITH_SIGNED_HISTORY');
  assert.equal(ok.reviewApproved,true);
  assert.equal(ok.authority,'NONE');
  assert.deepEqual(ok.permissions,[]);
  assert.equal(ok.actionAllowed,false);
  assert.equal(evaluateGovernance(signed,issuerTrust,opTrust,ledger,null,AFTER).status,'UNANCHORED_OR_CHANGED');
  assert.equal(evaluateGovernance(signed,issuerTrust,opTrust,ledger,emptyCheckpoint(),AFTER).reviewApproved,false);
});
test('change, deletion and reordering break operator-signed history and independent anchor',()=>{
  const {signed,issuerTrust,opTrust,ledger,head,opPair}=approved();
  const modified=structuredClone(ledger);
  modified.entries[0].event.expiresAt='2026-10-24T21:00:00.000Z';
  assert.equal(verifyLedger(modified,opTrust).chainValid,false);
  const truncated=emptyLedger();
  assert.equal(verifyLedger(truncated,opTrust).chainValid,true);
  assert.equal(evaluateGovernance(signed,issuerTrust,opTrust,truncated,head,AFTER).reviewApproved,false);
  const second=appendClosure('REVOKE_INSPECTION',ledger.entries[0].event.enrollmentId,
    opTrust,ledger,opPair.privateKey,'operator.alpha',AFTER,true,head);
  const reordered={...second,entries:[second.entries[1],second.entries[0]]};
  assert.equal(verifyLedger(reordered,opTrust).chainValid,false);
  const oldHead=evaluateGovernance(signed,issuerTrust,opTrust,second,head,AFTER);
  assert.equal(oldHead.status,'UNANCHORED_OR_CHANGED');
});
test('terminal operator-signed revocation and signed explicit expiry never grant rights',()=>{
  const {signed,issuerTrust,opTrust,ledger,head,opPair}=approved();
  const id=ledger.entries[0].event.enrollmentId;
  const revoked=appendClosure('REVOKE_INSPECTION',id,opTrust,ledger,
    opPair.privateKey,'operator.alpha',AFTER,true,head);
  const newHead=createCheckpoint(revoked,opTrust);
  const result=evaluateGovernance(signed,issuerTrust,opTrust,revoked,newHead,AFTER);
  assert.equal(result.status,'REVOKED');
  assert.equal(result.actionAllowed,false);
  assert.throws(()=>appendApproval(signed,issuerTrust,opTrust,revoked,
    opPair.privateKey,'operator.alpha','2026-10-21T22:00:00.000Z',24,true,newHead));
  assert.throws(()=>appendClosure('REVOKE_INSPECTION',id,opTrust,revoked,
    opPair.privateKey,'operator.alpha','2026-10-21T22:00:00.000Z',true,newHead));
  assert.throws(()=>appendClosure('EXPIRE_INSPECTION',id,opTrust,ledger,
    opPair.privateKey,'operator.alpha',AFTER,true,head));
  const expired=appendClosure('EXPIRE_INSPECTION',id,opTrust,ledger,opPair.privateKey,
    'operator.alpha','2026-10-22T21:00:00.000Z',true,head);
  assert.equal(evaluateGovernance(signed,issuerTrust,opTrust,expired,
    createCheckpoint(expired,opTrust),'2026-10-22T22:00:00.000Z').status,'EXPIRED_EVENT');
});
test('refusal cases: unknown operators, invalid claims, no human confirmation, missing anchor',()=>{
  const {signed,issuerTrust,opTrust,opPair}=setup();
  assert.throws(()=>appendApproval(signed,issuerTrust,opTrust,emptyLedger(),
    opPair.privateKey,'operator.alpha',AT,24,false,emptyCheckpoint()));
  assert.throws(()=>appendApproval(signed,issuerTrust,opTrust,emptyLedger(),
    opPair.privateKey,'operator.alpha',AT,169,true,emptyCheckpoint()));
  const outsider=generateKeyPairSync('ed25519');
  assert.throws(()=>appendApproval(signed,issuerTrust,opTrust,emptyLedger(),
    outsider.privateKey,'operator.alpha',AT,24,true,emptyCheckpoint()));
  const old=appendApproval(signed,issuerTrust,opTrust,emptyLedger(),
    opPair.privateKey,'operator.alpha',AT,24,true,emptyCheckpoint());
  assert.throws(()=>appendApproval(signed,issuerTrust,opTrust,old,
    opPair.privateKey,'operator.alpha',AFTER,24,true,null));
  const pinRevoked={...opTrust,operators:[{...opTrust.operators[0],active:false}]};
  assert.equal(evaluateGovernance(signed,issuerTrust,pinRevoked,old,
    createCheckpoint(old,opTrust),AFTER).reviewApproved,false);
  assert.equal(checkpointMatches(emptyCheckpoint(),verifyLedger(emptyLedger(),opTrust)),true);
  assert.equal(emptyCheckpoint().headHash,GENESIS);
});
test('operator ledger signatures must be valid Ed25519 and cannot be self-proclaimed',()=>{
  const {opTrust,ledger}=approved();
  const altered=structuredClone(ledger);
  altered.entries[0].signature=Buffer.alloc(64,9).toString('base64');
  assert.equal(verifyLedger(altered,opTrust).chainValid,false);
  const extra={...ledger,adminOverride:true};
  assert.equal(verifyLedger(extra,opTrust).chainValid,false);
  const dupe={format:OPERATOR_TRUST,operators:[...opTrust.operators,opTrust.operators[0]]};
  assert.equal(validateOperatorTrust(dupe),false);
});
