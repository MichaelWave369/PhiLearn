#!/usr/bin/env node
/** Offline R13 witness operator and verifier CLI. NO network, runtime calls, or tool grants. */
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {
  WITNESS_TRUST_FORMAT,makeWitnessTrustRecord,witnessCheckpoint,verifyWitness,
} from './r13-witness.mjs';
const read=async(path,max)=>{
  const info=await stat(path);
  if(!info.isFile()||info.size>max)throw Error('Only bounded regular local files accepted.');
  return JSON.parse(await readFile(path,'utf8'));
};
const secret=async path=>{
  const info=await stat(path);
  if(!info.isFile()||info.size>8000)throw Error('Invalid local private key file.');
  return readFile(path,'utf8');
};
const writeNew=(file,data)=>writeFile(file,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n',
  {flag:'wx',mode:0o600});
const args=process.argv.slice(2);
try{
  if(args[0]==='keygen'&&args.length===3){
    const [,folder,witnessId]=args;
    const {privateKey,publicKey}=generateKeyPairSync('ed25519');
    const record=makeWitnessTrustRecord(witnessId,publicKey);
    await mkdir(folder,{recursive:true,mode:0o700});
    await writeNew(join(folder,'r13.witness.private.pem'),
      privateKey.export({format:'pem',type:'pkcs8'}));
    await writeNew(join(folder,'r13.witness.public.candidate.json'),
      {format:WITNESS_TRUST_FORMAT,witnesses:[record]});
    process.stdout.write(JSON.stringify({witnessId,keyId:record.keyId,
      warning:'Private PEM is unencrypted. Keep it outside Git/synced folders. Receivers MUST pin the public key independently.'},null,2)+'\n');
  }else if(args[0]==='sign'&&args.length===7){
    const [,ledgerPath,operatorKeys,witnessKeys,witnessPrivate,witnessId,out]=args;
    const receipt=witnessCheckpoint(await read(ledgerPath,192000),
      await read(operatorKeys,16000),await read(witnessKeys,14000),
      await secret(witnessPrivate),witnessId);
    await writeNew(out,receipt);
    process.stdout.write('Signed independent checkpoint receipt created; inspection only, no permissions.\n');
  }else if(args[0]==='check'&&args.length===6){
    const [,ledgerPath,operatorKeys,witnessKeys,receiptPath,minCount]=args;
    const floor=Number(minCount);
    const report=verifyWitness(await read(ledgerPath,192000),
      await read(operatorKeys,16000),await read(receiptPath,3000),
      await read(witnessKeys,14000),floor);
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    process.exitCode=report.witnessValid?0:1;
  }else{
    process.stderr.write(
      'Usage:\n'+
      '  node interop/r13-cli.mjs keygen <outside-repo-dir> <witness-id>\n'+
      '  node interop/r13-cli.mjs sign <R12-ledger.json> <pinned-operator-keys.json> <pinned-witness-keys.json> <witness-private.pem> <witness-id> <new-receipt.json>\n'+
      '  node interop/r13-cli.mjs check <R12-ledger.json> <pinned-operator-keys.json> <pinned-witness-keys.json> <receipt.json> <receiver-protected-min-count>\n');
    process.exitCode=2;
  }
}catch(error){
  process.stderr.write('R13 refused: '+(error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=1;
}
