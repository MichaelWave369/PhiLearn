#!/usr/bin/env node
/** Explicit, offline operator commands. No runtime permission changes. */
import {readFile,writeFile,stat} from 'node:fs/promises';
import {approveForInspection,revokeEnrollment,evaluateEnrollment,emptyRegistry}
  from './r11-enrollment.mjs';
const read=async(path,max)=>{
  const info=await stat(path);
  if(!info.isFile()||info.size>max)throw Error('Input must be a bounded local file.');
  return JSON.parse(await readFile(path,'utf8'));
};
const output=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const args=process.argv.slice(2);
try{
  if(args[0]==='init'&&args.length===2){
    await output(args[1],emptyRegistry());
    process.stdout.write('Created empty receiver-controlled enrollment registry.\n');
  }else if(args[0]==='approve'&&args.length===7){
    const [,signedPath,trustPath,registryPath,operator,leaseStr,out]=args;
    const lease=Number(leaseStr);
    const signed=await read(signedPath,320000),trust=await read(trustPath,16000);
    const registry=await read(registryPath,48000);
    const updated=approveForInspection(signed,trust,registry,operator,
      new Date().toISOString(),lease,true);
    await output(out,updated);
    process.stdout.write('New INSPECTION-ONLY registry written. Verify it separately; replace the operator registry manually. No actions authorized.\n');
  }else if(args[0]==='revoke'&&args.length===5){
    const [,registryPath,enrollmentId,operator,out]=args;
    const original=await read(registryPath,48000);
    await output(out,revokeEnrollment(original,enrollmentId,operator,true));
    process.stdout.write('Revocation record written to new file; replace operator registry manually. No permissions ever granted.\n');
  }else if(args[0]==='check'&&args.length===4){
    const [,signedPath,trustPath,registryPath]=args;
    const result=evaluateEnrollment(await read(signedPath,320000),
      await read(trustPath,16000),await read(registryPath,48000));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    process.exitCode=result.reviewApproved?0:1;
  }else{
    process.stderr.write(
      'Usage:\n  node interop/r11-cli.mjs init <new-registry.json>\n'+
      '  node interop/r11-cli.mjs approve <signed.json> <pinned-trust.json> <registry.json> <operator-id> <lease-hours-1..168> <new-registry.json>\n'+
      '  node interop/r11-cli.mjs revoke <registry.json> <enrollment-sha256> <operator-id> <new-registry.json>\n'+
      '  node interop/r11-cli.mjs check <signed.json> <pinned-trust.json> <registry.json>\n');
    process.exitCode=2;
  }
}catch(error){
  process.stderr.write('R11 rejected: '+(error instanceof Error?error.message:String(error))+'\n');
  process.exitCode=1;
}
