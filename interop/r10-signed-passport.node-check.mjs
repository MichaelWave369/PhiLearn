import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {CASES,FORMAT,CERT_PROTOCOL,CERT_SCOPE,R6,parseAction,verifyObject}
  from './skill-passport-verifier.mjs';
import {
  DOMAIN,SIGNED_FORMAT,TRUST_FORMAT,createTrustRecord,createSignedPassport,
  validateTrustStore,verifySignedObject,verifySignedText,
} from './r10-signed-passport.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function example(){
  const model='r10-test:local',mode='guided',episodes=[];
  for(const c of CASES){
    const calls=[
      JSON.stringify({tool:'inspect',target:c.targets[0]}),
      JSON.stringify({tool:'inspect',target:c.targets[1]}),
      JSON.stringify({tool:'decide',decision:c.expected}),
    ];
    const steps=calls.map((raw,i)=>{
      const parsed=parseAction(raw);
      const reply=i<2?JSON.stringify({kind:'SYNTHETIC_INSPECTION',
        target:parsed.target,data:c.readings[parsed.target],effect:'read_only'}):
        JSON.stringify({kind:'SIMULATED_DECISION',value:c.expected,
          result:'Recorded for grading only. No external operation occurred.'});
      return {turn:i+1,raw,parsed,accepted:true,reply,latencyMs:30+i};
    });
    episodes.push({id:'r10-'+c.id,at:'2026-10-21T20:00:00Z',model,mode,
      protocol:R6,provenance:'OBSERVED',scenarioId:c.id,steps,
      outcome:'PASS',decision:c.expected});
  }
  const cert={id:'test-r7',issuedAt:'2026-10-21T21:00:00Z',
    protocol:CERT_PROTOCOL,scope:CERT_SCOPE,provenance:'LOCAL_UNTRUSTED',
    model,mode,scenarioIds:CASES.map(c=>c.id),evidenceIds:episodes.map(e=>e.id),
    evidenceSha256:hash({protocol:CERT_PROTOCOL,scope:CERT_SCOPE,model,mode,episodes}),
    summary:'Testing only, no real model.',support:{}};
  const body={format:FORMAT,exportedAt:'2026-10-21T22:00:00Z',
    issuerClaim:{app:'PhiLearn',selfReported:true},subject:{model,mode},
    scope:CERT_SCOPE,boundary:{authority:'NONE',requestedPermissions:[],usage:'INSPECT_ONLY'},
    certificate:cert,episodes};
  const passport={...body,payloadSha256:hash(body)};
  assert.equal(verifyObject(passport).replayConsistent,true);
  return passport;
}
const keypair=()=>generateKeyPairSync('ed25519');
const trusted=publicKey=>({format:TRUST_FORMAT,keys:[createTrustRecord('lab.test',publicKey)]});
test('operator-pinned Ed25519 signature validates without conveying actions or rights',()=>{
  const {privateKey,publicKey}=keypair(),p=example();
  const signed=createSignedPassport(p,privateKey,'lab.test','2026-10-21T23:00:00Z');
  assert.equal(signed.format,SIGNED_FORMAT);
  assert.equal(typeof DOMAIN,'string');
  assert.equal(signed.keyId,createTrustRecord('lab.test',publicKey).keyId);
  const store=trusted(publicKey);
  assert.equal(validateTrustStore(store),true);
  const result=verifySignedText(JSON.stringify(signed),store,true);
  assert.deepEqual(
    [result.status,result.signatureValid,result.keyPinned,result.actionAllowed,
      result.authority,result.operatorReview,result.permissions.length],
    ['SIGNATURE_VALID_PINNED_NO_AUTHORITY',true,true,false,'NONE',
      'ACKNOWLEDGED_FOR_INSPECTION',0]);
});
test('unknown signer cannot self-introduce its key or claim a trusted identity',()=>{
  const {privateKey,publicKey}=keypair(),p=example();
  const signed=createSignedPassport(p,privateKey,'lab.test');
  const noStore=verifySignedObject(signed);
  assert.equal(noStore.status,'UNPINNED_SIGNATURE');
  assert.equal(noStore.signatureValid,false);
  const other=trusted(keypair().publicKey);
  assert.equal(verifySignedObject(signed,other).signatureValid,false);
  const injected={...signed,publicKeySpkiBase64:createTrustRecord('lab.test',publicKey).publicKeySpkiBase64};
  assert.equal(verifySignedObject(injected,trusted(publicKey)).signatureValid,false);
});
test('altering a signed timestamp, issuer, payload or detached signature fails closed',()=>{
  const {privateKey,publicKey}=keypair(),original=createSignedPassport(
    example(),privateKey,'lab.test','2026-10-21T23:00:00Z');
  const store=trusted(publicKey);
  for(const mod of [
    {...original,signedAt:'2026-10-21T23:00:01Z'},
    {...original,issuerId:'other'},
    {...original,signature:Buffer.alloc(64,0).toString('base64')},
    {...original,passport:{...original.passport,payloadSha256:'a'.repeat(64)}},
    {...original,passport:{...original.passport,subject:{model:'other',mode:'guided'}}},
  ])assert.equal(verifySignedObject(mod,store).signatureValid,false);
});
test('malformed, revoked, wrong scope and substituted public keys fail independently',()=>{
  const pair=keypair(),p=example(),signed=createSignedPassport(p,pair.privateKey,'lab.test');
  const good=trusted(pair.publicKey);
  const disabled={...good,keys:[{...good.keys[0],active:false}]};
  assert.equal(verifySignedObject(signed,disabled).signatureValid,false);
  const wrongScope={...good,keys:[{...good.keys[0],allowedScope:'FULL_SYSTEM_ACCESS'}]};
  assert.equal(validateTrustStore(wrongScope),false);
  assert.equal(verifySignedObject(signed,wrongScope).signatureValid,false);
  const mismatch={...good,keys:[{...good.keys[0],keyId:'sha256:'+'0'.repeat(64)}]};
  assert.equal(validateTrustStore(mismatch),false);
  assert.equal(verifySignedObject(signed,mismatch).signatureValid,false);
  const duplicate={...good,keys:[...good.keys,...good.keys]};
  assert.equal(validateTrustStore(duplicate),false);
  assert.equal(verifySignedText('not json',good).signatureValid,false);
  assert.equal(verifySignedText('x'.repeat(320001),good).signatureValid,false);
});
test('replay consistency and signature verification remain separate independent checks',()=>{
  const {privateKey,publicKey}=keypair();
  const passport=example(),signed=createSignedPassport(passport,privateKey,'lab.test');
  const changed=structuredClone(signed);
  changed.passport.episodes[0].steps[0].raw='{"tool":"shell","command":"run"}';
  assert.equal(verifySignedObject(changed,trusted(publicKey)).signatureValid,false);
  assert.throws(()=>createSignedPassport({...passport,scope:'BAD'},privateKey,'lab.test'));
});
