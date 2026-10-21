import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey} from 'node:crypto';
import {makeFixture,TEST_ONLY_SEEDS} from './r13-fixture.mjs';
import {
  verifyWitness,witnessCheckpoint,validateWitnessTrust,makeWitnessTrustRecord,
} from './r13-witness.mjs';
import {appendClosure,createCheckpoint,verifyLedger} from './r12-governance.mjs';
import {verifySignedObject} from './r10-signed-passport.mjs';

const keyFromSeed=(hex)=>createPrivateKey({key:Buffer.concat([
  Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(hex,'hex')]),
  format:'der',type:'pkcs8'});
test('R13 Node verifies shared deterministic fixture, with zero authority',()=>{
  const f=makeFixture();
  assert.equal(f.purpose,'CROSS_RUNTIME_TEST_ONLY');
  assert.equal(verifySignedObject(f.signed,f.issuerTrust).signatureValid,true);
  assert.equal(verifyLedger(f.ledger,f.operatorTrust).chainValid,true);
  assert.equal(validateWitnessTrust(f.witnessTrust,f.operatorTrust),true);
  const report=verifyWitness(f.ledger,f.operatorTrust,f.witness,f.witnessTrust,1);
  assert.equal(report.status,'WITNESSED_HISTORY_NO_AUTHORITY');
  assert.equal(report.witnessValid,true);
  assert.equal(report.headAnchored,true);
  assert.equal(report.count,1);
  assert.equal(report.headHash,f.checkpoint.headHash);
  assert.equal(report.actionAllowed,false);
  assert.deepEqual(report.permissions,[]);
  assert.equal(report.authority,'NONE');
  assert.deepEqual(makeFixture(),f);
});
test('altered witness, issuer, revocation, wrong pin, or same operator key fails',()=>{
  const f=makeFixture();
  assert.equal(verifyWitness(f.ledger,f.operatorTrust,
    {...f.witness,count:0},f.witnessTrust,1).witnessValid,false);
  assert.equal(verifyWitness(f.ledger,f.operatorTrust,
    {...f.witness,headHash:'0'.repeat(64)},f.witnessTrust,1).witnessValid,false);
  assert.equal(verifyWitness(f.ledger,f.operatorTrust,
    {...f.witness,witnessId:'not-our-witness'},f.witnessTrust,1).witnessValid,false);
  const alteredLedger=structuredClone(f.ledger);
  alteredLedger.entries[0].event.expiresAt='2026-10-23T22:00:00.000Z';
  assert.equal(verifyWitness(alteredLedger,f.operatorTrust,f.witness,f.witnessTrust,1).witnessValid,false);
  const revokedStore={...f.witnessTrust,witnesses:
    f.witnessTrust.witnesses.map(w=>({...w,active:false}))};
  assert.equal(verifyWitness(f.ledger,f.operatorTrust,f.witness,revokedStore,1).witnessValid,false);
  assert.equal(validateWitnessTrust({format:f.witnessTrust.format,witnesses:[
    {...f.witnessTrust.witnesses[0],keyId:f.operatorTrust.operators[0].keyId},
  ]},f.operatorTrust),false);
  assert.equal(verifyWitness(f.ledger,f.operatorTrust,f.witness,null,1).witnessValid,false);
});
test('previous genuine witnessed chain cannot override protected minimum count after a signed closure',()=>{
  const f=makeFixture();
  const op=keyFromSeed(TEST_ONLY_SEEDS.operator);
  const enrollmentId=f.ledger.entries[0].event.enrollmentId;
  const revoked=appendClosure('REVOKE_INSPECTION',enrollmentId,f.operatorTrust,
    f.ledger,op,'TEST.operator','2026-10-22T00:00:00.000Z',true,f.checkpoint);
  const witnessedRevoked=witnessCheckpoint(revoked,f.operatorTrust,f.witnessTrust,
    keyFromSeed(TEST_ONLY_SEEDS.witness),'TEST.witness','2026-10-22T00:10:00.000Z');
  assert.equal(verifyWitness(revoked,f.operatorTrust,witnessedRevoked,f.witnessTrust,2).status,
    'WITNESSED_HISTORY_NO_AUTHORITY');
  assert.equal(verifyWitness(f.ledger,f.operatorTrust,f.witness,f.witnessTrust,2).status,
    'ROLLBACK_BELOW_FLOOR');
  assert.equal(verifyWitness(revoked,f.operatorTrust,f.witness,f.witnessTrust,2).status,
    'HEAD_MISMATCH');
  assert.notEqual(createCheckpoint(revoked,f.operatorTrust).headHash,f.checkpoint.headHash);
});
test('witness cannot postdate-check incorrectly or sign with unpinned/key-reused operator key',()=>{
  const f=makeFixture();
  assert.throws(()=>witnessCheckpoint(f.ledger,f.operatorTrust,f.witnessTrust,
    keyFromSeed(TEST_ONLY_SEEDS.operator),'TEST.witness','2026-10-21T23:10:00.000Z'));
  assert.throws(()=>witnessCheckpoint(f.ledger,f.operatorTrust,f.witnessTrust,
    keyFromSeed(TEST_ONLY_SEEDS.witness),'TEST.witness','2026-10-21T21:00:00.000Z'));
  assert.equal(verifyWitness(f.ledger,f.operatorTrust,f.witness,f.witnessTrust,-1).status,'INVALID_FLOOR');
  assert.equal(verifyWitness(f.ledger,f.operatorTrust,f.witness,f.witnessTrust,2).status,'ROLLBACK_BELOW_FLOOR');
});
