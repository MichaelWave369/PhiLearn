#!/usr/bin/env node
/**
 * R10 operator-only offline CLI. NEVER commit generated private keys or trust
 * them because an envelope carries them. No agent integration or tool grants.
 */
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {createTrustRecord,createSignedPassport,verifySignedText,TRUST_FORMAT,
  SIGNED_MAX_BYTES} from './r10-signed-passport.mjs';
const limit=async(path,max)=>{
  const info=await stat(path);
  if(!info.isFile()||info.size>max)throw Error('Local input is not a bounded file: '+path);
  return readFile(path,'utf8');
};
const writeNew=async(path,contents)=>writeFile(path,contents,{flag:'wx',mode:0o600});
function usage(){
  process.stderr.write(
    'Usage:\n'+
    '  node interop/r10-cli.mjs keygen <operator-owned-directory> <issuer-id>\n'+
    '  node interop/r10-cli.mjs sign <R8-passport.json> <private-key.pem> <issuer-id> <output-signed.json>\n'+
    '  node interop/r10-cli.mjs verify <signed.json> [operator-pinned-trust.json] [--review]\n'+
    'Keygen writes a PRIVATE PEM with filesystem 0600 and a CANDIDATE public trust-store file.\n'+
    'Move private keys outside any Git checkout; verify and pin public keys out of band.\n'
  );
}
const args=process.argv.slice(2);
try{
  if(args[0]==='keygen'&&args.length===3){
    const [_,directory,issuerId]=args;void _;
    const {privateKey,publicKey}=generateKeyPairSync('ed25519');
    const record=createTrustRecord(issuerId,publicKey);
    await mkdir(directory,{recursive:true,mode:0o700});
    await writeNew(join(directory,'issuer.private.pem'),
      privateKey.export({format:'pem',type:'pkcs8'}));
    await writeNew(join(directory,'issuer.public.candidate.json'),
      JSON.stringify({format:TRUST_FORMAT,keys:[record]},null,2)+'\n');
    process.stdout.write(JSON.stringify({keyId:record.keyId,issuerId,
      warning:'Private PEM stays operator-controlled. Receiver must independently authenticate this public key before pinning.'},null,2)+'\n');
  }else if(args[0]==='sign'&&args.length===5){
    const [,passportFile,keyFile,issuerId,output]=args;
    const input=JSON.parse(await limit(passportFile,256_000));
    const pem=await limit(keyFile,8_000);
    const signed=createSignedPassport(input,pem,issuerId);
    await writeNew(output,JSON.stringify(signed,null,2)+'\n');
    process.stdout.write('Created optional signed passport. No receiving system has approved it.\n');
  }else if(args[0]==='verify'&&(args.length===2||args.length===3||args.length===4)){
    const [,signedPath,trustPath,flag]=args;
    if(flag&&flag!=='--review')throw Error('Unknown review argument.');
    if(trustPath==='--review')throw Error('Explicit trust-file path required before review.');
    const store=trustPath?JSON.parse(await limit(trustPath,16_000)):null;
    const result=verifySignedText(await limit(signedPath,SIGNED_MAX_BYTES),
      store,flag==='--review');
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    process.exitCode=result.signatureValid?0:1;
  }else{usage();process.exitCode=2;}
}catch(error){
  process.stderr.write('R10 rejected: '+(error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=1;
}
