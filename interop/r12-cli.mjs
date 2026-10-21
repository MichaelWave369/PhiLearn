#!/usr/bin/env node
/** R12 offline receiver operator commands. Writes NEW files only, never grants tools. */
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {
  emptyLedger,emptyCheckpoint,createOperatorRecord,appendApproval,
  appendClosure,createCheckpoint,evaluateGovernance,TRUST_FORMAT,MAX_LEDGER_BYTES,
} from './r12-governance.mjs';
const args=process.argv.slice(2);
async function read(path,max){
  const meta=await stat(path);
  if(!meta.isFile()||meta.size>max)throw Error('Not a bounded local input file: '+path);
  return JSON.parse(await readFile(path,'utf8'));
}
async function privatePem(path){
  const meta=await stat(path);
  if(!meta.isFile()||meta.size>8000)throw Error('Private key file invalid.');
  return readFile(path,'utf8');
}
const writeNew=(file,data)=>writeFile(file,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
const help=()=>{
  process.stderr.write(
    'Usage:\n'+
    '  node interop/r12-cli.mjs operator-keygen <outside-repo-directory> <operator-id>\n'+
    '  node interop/r12-cli.mjs init <new-ledger.json> <new-checkpoint.json>\n'+
    '  node interop/r12-cli.mjs approve <signed.json> <R10-trust.json> <R12-operator-trust.json> <ledger.json> <operator-private.pem> <operator-id> <hours-1..168> <prior-checkpoint.json> <new-ledger.json> <new-checkpoint.json> --confirm\n'+
    '  node interop/r12-cli.mjs revoke|expire <enrollment-sha256> <R12-operator-trust.json> <ledger.json> <operator-private.pem> <operator-id> <prior-checkpoint.json> <new-ledger.json> <new-checkpoint.json> --confirm\n'+
    '  node interop/r12-cli.mjs check <signed.json> <R10-trust.json> <R12-operator-trust.json> <ledger.json> <independent-checkpoint.json>\n'+
    'Keep keys and checkpoints in separately controlled locations. Replace the active ledger manually.\n'
  );
};
try{
  if(args[0]==='operator-keygen'&&args.length===3){
    const [,directory,operatorId]=args;
    const {privateKey,publicKey}=generateKeyPairSync('ed25519');
    const record=createOperatorRecord(operatorId,publicKey);
    await mkdir(directory,{recursive:true,mode:0o700});
    await writeNew(join(directory,'r12.operator.private.pem'),privateKey.export({format:'pem',type:'pkcs8'}));
    await writeNew(join(directory,'r12.operator.public.candidate.json'),
      {format:TRUST_FORMAT,operators:[record]});
    process.stdout.write(JSON.stringify({operatorId,keyId:record.keyId,
      warning:'Receiver must authenticate and pin this public key OUT OF BAND. Never commit private PEM.'},null,2)+'\n');
  }else if(args[0]==='init'&&args.length===3){
    await writeNew(args[1],emptyLedger());
    await writeNew(args[2],emptyCheckpoint());
    process.stdout.write('New empty ledger and separately retainable checkpoint created.\n');
  }else if(args[0]==='approve'&&args.length===12&&args[11]==='--confirm'){
    const [,signedPath,passportTrustPath,operatorTrustPath,ledgerPath,privatePath,
      operatorId,lease,checkpointPath,outLedger,outHead]=args;
    const signed=await read(signedPath,320000);
    const passportTrust=await read(passportTrustPath,16000);
    const operatorTrust=await read(operatorTrustPath,16000);
    const ledger=await read(ledgerPath,MAX_LEDGER_BYTES);
    const head=await read(checkpointPath,500);
    const updated=appendApproval(signed,passportTrust,operatorTrust,ledger,
      await privatePem(privatePath),operatorId,new Date().toISOString(),Number(lease),true,head);
    const checkpoint=createCheckpoint(updated,operatorTrust);
    await writeNew(outLedger,updated);await writeNew(outHead,checkpoint);
    process.stdout.write('Operator-signed INSPECTION-ONLY approval recorded. Preserve checkpoint independently; NO tool permissions granted.\n');
  }else if((args[0]==='revoke'||args[0]==='expire')&&args.length===10&&args[9]==='--confirm'){
    const [,enrollmentId,trustPath,ledgerPath,privatePath,operatorId,priorPath,outLedger,outHead]=args;
    const trust=await read(trustPath,16000),ledger=await read(ledgerPath,MAX_LEDGER_BYTES);
    const head=await read(priorPath,500);
    const type=args[0]==='revoke'?'REVOKE_INSPECTION':'EXPIRE_INSPECTION';
    const next=appendClosure(type,enrollmentId,trust,ledger,await privatePem(privatePath),
      operatorId,new Date().toISOString(),true,head);
    await writeNew(outLedger,next);await writeNew(outHead,createCheckpoint(next,trust));
    process.stdout.write('Terminal '+type+' event signed. No agent permissions ever granted.\n');
  }else if(args[0]==='check'&&args.length===6){
    const [,signedPath,passportTrustPath,operatorTrustPath,ledgerPath,checkpointPath]=args;
    const report=evaluateGovernance(await read(signedPath,320000),
      await read(passportTrustPath,16000),await read(operatorTrustPath,16000),
      await read(ledgerPath,MAX_LEDGER_BYTES),await read(checkpointPath,500));
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    process.exitCode=report.reviewApproved?0:1;
  }else{help();process.exitCode=2;}
}catch(e){
  process.stderr.write('R12 refused: '+(e instanceof Error?e.message:String(e))+'\n');
  process.exitCode=1;
}
