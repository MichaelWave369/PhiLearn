/**
 * PhiLearn R8 Skill Passport: self-contained portable REPLAY EVIDENCE ONLY.
 *
 * Import into an isolated quarantine: NEVER insert guest data into R6/R7
 * storage or grant any tool, account, model or filesystem permission.
 * SHA-256 checks consistency, NOT identity/authorship; the benchmark and
 * receipts remain forgeable by a user who controls browser storage.
 */
import {SCENARIOS,MAX_TURNS,GAUNTLET_VERSION,type Mode,type ToolEpisode} from './toolGauntlet';
import {
  CERT_SCOPE,CERT_PROTOCOL,sha256,verifyCertificate,
  type Certificate,
} from './certification';

export const PASSPORT_FORMAT='philearn.skill-passport.v1';
export const PASSPORT_MAX_BYTES=256_000;
const STORAGE='philearn.r8.quarantine';
const MAX_IMPORTS=25;
export interface PassportBody {
  format:typeof PASSPORT_FORMAT;exportedAt:string;
  issuerClaim:{app:'PhiLearn';selfReported:true};
  subject:{model:string;mode:Mode};
  scope:typeof CERT_SCOPE;
  boundary:{authority:'NONE';requestedPermissions:[];usage:'INSPECT_ONLY'};
  certificate:Certificate;
  episodes:ToolEpisode[];
}
export interface SkillPassport extends PassportBody {payloadSha256:string;}
export type CheckStatus='REPLAY_PASS_UNTRUSTED'|'REPLAY_FAIL_UNTRUSTED';
export interface QuarantinedPassport {
  id:string;importedAt:string;
  passport:SkillPassport;
  checkedAt:string;check:CheckStatus;reason:string;
  reviewedLocally:boolean;
}
export interface PassportCheck {valid:boolean;status:CheckStatus;reason:string;}
const isRecord=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,min=1,max=256):v is string=>typeof v==='string'&&v.length>=min&&v.length<=max;
const iso=(v:unknown):v is string=>str(v,10,40)&&Number.isFinite(Date.parse(v));
const exact=(v:Record<string,unknown>,keys:string[]):boolean=>
  Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const digestString=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const legalMode=(v:unknown):v is Mode=>v==='bare'||v==='guided';

/** Metadata and bounded payload shape only; NOT a statement that contents are authentic. */
export function hasPassportShape(v:unknown):v is SkillPassport {
  if(!isRecord(v)||!exact(v,[
    'format','exportedAt','issuerClaim','subject','scope','boundary','certificate','episodes','payloadSha256',
  ])||v.format!==PASSPORT_FORMAT||v.scope!==CERT_SCOPE||!iso(v.exportedAt)||
    !digestString(v.payloadSha256)||!Array.isArray(v.episodes)||
    v.episodes.length!==SCENARIOS.length)return false;

  const issuer=v.issuerClaim;
  if(!isRecord(issuer)||!exact(issuer,['app','selfReported'])||
    issuer.app!=='PhiLearn'||issuer.selfReported!==true)return false;
  const sub=v.subject;
  if(!isRecord(sub)||!exact(sub,['model','mode'])||
    !str(sub.model,1,128)||!legalMode(sub.mode))return false;
  const boundary=v.boundary;
  if(!isRecord(boundary)||!exact(boundary,['authority','requestedPermissions','usage'])||
    boundary.authority!=='NONE'||boundary.usage!=='INSPECT_ONLY'||
    !Array.isArray(boundary.requestedPermissions)||boundary.requestedPermissions.length!==0)return false;

  const cert=v.certificate;
  if(!isRecord(cert)||!str(cert.id,1,128)||!iso(cert.issuedAt)||
    cert.protocol!==CERT_PROTOCOL||cert.scope!==CERT_SCOPE||
    cert.provenance!=='LOCAL_UNTRUSTED'||cert.model!==sub.model||
    cert.mode!==sub.mode||!Array.isArray(cert.evidenceIds)||
    !Array.isArray(cert.scenarioIds)||cert.evidenceIds.length!==SCENARIOS.length||
    cert.scenarioIds.length!==SCENARIOS.length||
    !digestString(cert.evidenceSha256)||!str(cert.summary,1,1000)||
    !isRecord(cert.support))return false;

  const seen=new Set<string>();
  for(let i=0;i<SCENARIOS.length;i++){
    if(cert.scenarioIds[i]!==SCENARIOS[i].id||!str(cert.evidenceIds[i],1,128)||
      seen.has(cert.evidenceIds[i]))return false;
    seen.add(cert.evidenceIds[i]);
  }
  const episodes=v.episodes;
  if(!Array.isArray(episodes))return false;
  const episodeIds=new Set<string>();
  for(const ep of episodes){
    if(!isRecord(ep)||!str(ep.id,1,128)||episodeIds.has(ep.id)||
      !iso(ep.at)||ep.model!==sub.model||ep.mode!==sub.mode||
      ep.protocol!==GAUNTLET_VERSION||ep.provenance!=='OBSERVED'||
      !str(ep.scenarioId,1,128)||!Array.isArray(ep.steps)||
      ep.steps.length<1||ep.steps.length>MAX_TURNS)return false;
    episodeIds.add(ep.id);
    for(const step of ep.steps){
      if(!isRecord(step)||!str(step.raw,1,1024)||!str(step.reply,1,5000)||
        typeof step.turn!=='number'||!Number.isSafeInteger(step.turn)||step.turn<1||step.turn>MAX_TURNS||
        typeof step.accepted!=='boolean'||
        typeof step.latencyMs!=='number'||!Number.isFinite(step.latencyMs)||
        step.latencyMs<0||step.latencyMs>1_000_000)return false;
    }
  }
  if(cert.evidenceIds.some((id,i)=>episodes[i].id!==id||
    episodes[i].scenarioId!==SCENARIOS[i].id))return false;
  return true;
}

function portableBody(certificate:Certificate,episodes:ToolEpisode[],exportedAt:string):PassportBody {
  return {
    format:PASSPORT_FORMAT,exportedAt,
    issuerClaim:{app:'PhiLearn',selfReported:true},
    subject:{model:certificate.model,mode:certificate.mode},
    scope:CERT_SCOPE,
    boundary:{authority:'NONE',requestedPermissions:[],usage:'INSPECT_ONLY'},
    certificate,episodes,
  };
}
export async function createPassport(
  certificate:Certificate,allEpisodes:ToolEpisode[],exportedAt=new Date().toISOString(),
):Promise<SkillPassport> {
  if(!iso(exportedAt))throw Error('Invalid export timestamp.');
  // Verify against ALL local episodes: an old pass cannot hide a newer failure.
  const result=await verifyCertificate(certificate,allEpisodes);
  if(!result.valid)throw Error('Cannot export: '+result.reason);
  const matching=certificate.evidenceIds.map(id=>allEpisodes.find(e=>e.id===id));
  if(matching.some(e=>!e))throw Error('Source traces are missing.');
  const body=portableBody(certificate,matching as ToolEpisode[],exportedAt);
  const passport:SkillPassport={...body,payloadSha256:await sha256(JSON.stringify(body))};
  if(!hasPassportShape(passport)||
    new TextEncoder().encode(JSON.stringify(passport)).length>PASSPORT_MAX_BYTES)
    throw Error('Skill Passport exceeds the format or size limits.');
  return passport;
}

/** A parsed portable proof passes replay and checksum, but never establishes TRUST. */
export async function checkPassport(value:unknown):Promise<PassportCheck>{
  const fail=(reason:string):PassportCheck=>({valid:false,status:'REPLAY_FAIL_UNTRUSTED',reason});
  if(!hasPassportShape(value))return fail('Unsupported or malformed passport schema. No import permissions granted.');
  const bytes=new TextEncoder().encode(JSON.stringify(value)).length;
  if(bytes>PASSPORT_MAX_BYTES)return fail('Passport exceeds 256 KB evidence limit.');
  const reconstructed=portableBody(value.certificate,value.episodes,value.exportedAt);
  // Exact top-level metadata and policy boundary already validated.
  const digest=await sha256(JSON.stringify(reconstructed));
  if(digest!==value.payloadSha256)return fail('Payload SHA-256 does not match its bundled data.');
  try{
    const cert=await verifyCertificate(value.certificate,value.episodes);
    if(!cert.valid)return fail('Synthetic trace replay failed: '+cert.reason);
  }catch{return fail('Unable to replay bundled certification evidence.');}
  return {valid:true,status:'REPLAY_PASS_UNTRUSTED',
    reason:'Six synthetic tool traces replay and two digests match. This is NOT authenticated identity or permission.'};
}
export async function parsePassportJson(raw:string):Promise<SkillPassport>{
  if(new TextEncoder().encode(raw).length>PASSPORT_MAX_BYTES)
    throw Error('Import rejected: file is larger than 256 KB.');
  let parsed:unknown;
  try{parsed=JSON.parse(raw) as unknown;}
  catch{throw Error('Import rejected: invalid JSON.');}
  if(!hasPassportShape(parsed))throw Error('Import rejected: unsupported, malformed, or permission-bearing passport.');
  return parsed;
}
export function downloadPassport(passport:SkillPassport){
  const content=JSON.stringify(passport,null,2);
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;
  a.download='philearn-skill-passport-'+passport.subject.mode+'.json';
  document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/** Unique key by declared self-checksum. Used for dedupe, not authenticity. */
export function quarantineId(passport:SkillPassport){return passport.payloadSha256;}
export function addToQuarantine(rows:QuarantinedPassport[],passport:SkillPassport,
  check:PassportCheck,now=new Date().toISOString()):QuarantinedPassport[]{
  if(!hasPassportShape(passport))throw Error('Only a valid passport schema can be quarantined.');
  const id=quarantineId(passport);
  if(rows.some(x=>x.id===id))throw Error('This exact passport is already quarantined.');
  return [...rows,{id,importedAt:now,passport,checkedAt:now,
    check:check.status,reason:check.reason,reviewedLocally:false}].slice(-MAX_IMPORTS);
}
export function readQuarantine():QuarantinedPassport[]{
  try{
    const input:unknown=JSON.parse(localStorage.getItem(STORAGE)??'[]');
    if(!Array.isArray(input))return [];
    return input.filter((entry):entry is QuarantinedPassport=>Boolean(isRecord(entry)&&
      str(entry.id,64,64)&&hasPassportShape(entry.passport)&&
      iso(entry.importedAt)&&typeof entry.reviewedLocally==='boolean'&&
      (entry.check==='REPLAY_PASS_UNTRUSTED'||entry.check==='REPLAY_FAIL_UNTRUSTED'))).slice(-MAX_IMPORTS);
  }catch{return [];}
}
export function saveQuarantine(rows:QuarantinedPassport[]):void{
  try{localStorage.setItem(STORAGE,JSON.stringify(rows.slice(-MAX_IMPORTS)));}
  catch{/* keep current React state even when storage quota is unavailable */}
}
