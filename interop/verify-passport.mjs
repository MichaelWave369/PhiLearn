#!/usr/bin/env node
/**
 * Read-only offline Skill Passport compatibility check.
 * Usage: node interop/verify-passport.mjs ./passport.json
 * No SDK install, browser, server, model execution, or network required.
 */
import {readFile} from 'node:fs/promises';
import {verifyText,MAX_BYTES} from './skill-passport-verifier.mjs';
const filename=process.argv[2];
if(!filename||process.argv.length!==3){
  process.stderr.write('Usage: node interop/verify-passport.mjs <local-passport.json>\n');
  process.exitCode=2;
}else{
  try{
    const {stat}=await import('node:fs/promises');
    const info=await stat(filename);
    if(!info.isFile()||info.size>MAX_BYTES)throw new Error('Not a bounded local file (max 256000 bytes).');
    const contents=await readFile(filename,'utf8');
    const report=verifyText(contents);
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    process.exitCode=report.replayConsistent?0:1;
  }catch(error){
    process.stderr.write('Passport rejected: '+(error instanceof Error?error.message:String(error))+'\n');
    process.exitCode=1;
  }
}
