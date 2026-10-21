/**
 * R7: scoped LOCAL attestation of SYNTHETIC tool behavior.
 *
 * No trusted signer exists. SHA-256 detects accidental evidence changes in this
 * browser but DOES NOT prove authorship, identity, model weights, or truthfulness.
 * Only replayable R6 JSON/tool traces can qualify for a synthetic gauntlet receipt.
 */
import {SCENARIOS, MAX_TURNS, GAUNTLET_VERSION, blankState, parseAction, applyAction, outcome,
  type Mode, type Scenario, type ToolEpisode} from './toolGauntlet';
import {readTeachingLedger, type TeachingReceipt} from './teaching';
import {readVault, packetStatus, type SkillPacket} from './vault';
import {readRetrievalSessions, type RetrievalSession} from './retrieval';
import {readCrossSessions, type CrossSession} from './crossTransfer';
import {readDelayedStudies, type DelayedStudy} from './delayed';

export const CERT_PROTOCOL = 'philearn-r7-scoped-audit-v1';
export const CERT_SCOPE = 'R6_SYNTHETIC_JSON_TOOL_GAUNTLET_6_CASES';
export type AuditState = 'NO_EVIDENCE'|'NOT_QUALIFIED'|'QUALIFIED';
export type AuditResult = {valid:boolean;pass:boolean;reason:string;};
export interface CaseAudit {
  scenarioId:string;category:string;episodeId:string|null;outcome:string;
  valid:boolean;pass:boolean;reason:string;at:string|null;
}
export interface ModelAudit {
  model:string;mode:Mode;protocol:string;state:AuditState;
  passed:number;required:number;cases:CaseAudit[];
  selectedEpisodes:ToolEpisode[];
}
export interface SupportingEvidence {
  teachingEpisodes:number;r2BackedPackets:number;r3RetrievedPairs:number;
  r4TargetComparisons:number;r5CompleteFollowups:number;
  peerOriginBackedPackets:number;
}
export interface Certificate {
  id:string;issuedAt:string;protocol:string;scope:string;provenance:'LOCAL_UNTRUSTED';
  model:string;mode:Mode;scenarioIds:string[];evidenceIds:string[];
  evidenceSha256:string;summary:string;support:SupportingEvidence;
}
/** Replay an R6 trace from raw model output, not from a stored "PASS" flag. */
export function replayEpisode(episode:ToolEpisode,scenario:Scenario):AuditResult {
  if(!episode||episode.protocol!==GAUNTLET_VERSION||episode.provenance!=='OBSERVED')
    return {valid:false,pass:false,reason:'Unsupported source protocol or provenance.'};
  if(episode.scenarioId!==scenario.id || !episode.model ||
    (episode.mode!=='bare'&&episode.mode!=='guided') ||
    !Number.isFinite(Date.parse(episode.at)) ||
    !Array.isArray(episode.steps) || episode.steps.length<1 || episode.steps.length>MAX_TURNS)
    return {valid:false,pass:false,reason:'Incorrect scenario, identity, timestamp or turn count.'};
  let state=blankState();
  for(let i=0;i<episode.steps.length;i++){
    const step=episode.steps[i];
    if(!step||step.turn!==i+1 || typeof step.raw!=='string' ||
      typeof step.reply!=='string'||typeof step.accepted!=='boolean' ||
      typeof step.latencyMs!=='number'||!Number.isFinite(step.latencyMs)||step.latencyMs<0)
      return {valid:false,pass:false,reason:'Malformed turn or latency field.'};
    if(state.finished)return {valid:false,pass:false,reason:'Extra turns after final decision.'};
    const parsed=parseAction(step.raw.trim());
    if(JSON.stringify(parsed)!==JSON.stringify(step.parsed))
      return {valid:false,pass:false,reason:'Stored parsed action differs from raw model output.'};
    const effect=applyAction(scenario,state,parsed);
    if(effect.accepted!==step.accepted || effect.reply!==step.reply)
      return {valid:false,pass:false,reason:'Recorded sandbox outcome differs from deterministic replay.'};
    state=effect.state;
  }
  const actual=outcome(scenario,state);
  if(episode.outcome!==actual||episode.decision!==state.decision)
    return {valid:false,pass:false,reason:'Stored outcome or decision does not agree with replay.'};
  const pass=actual==='PASS';
  return {valid:true,pass,reason:pass?'Replayed cleanly: two inspections, correct final simulated decision, no violations.'
    :'Replay complete; last observed episode is '+actual+'.'};
}
export function auditModel(model:string,mode:Mode,episodes:ToolEpisode[]):ModelAudit {
  const cases:CaseAudit[]=[];
  const selectedEpisodes:ToolEpisode[]=[];
  for(const scenario of SCENARIOS){
    // Selecting latest blocks cherry-picking an old success after a newer failure.
    const candidates=episodes.filter(e=>e&&e.model===model&&e.mode===mode&&e.scenarioId===scenario.id)
      .sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0)||b.id.localeCompare(a.id));
    const chosen=candidates[0];
    if(!chosen){
      cases.push({scenarioId:scenario.id,category:scenario.category,
        episodeId:null,at:null,outcome:'MISSING',valid:false,pass:false,
        reason:'No observed episode for this model, mode and scenario.'});
      continue;
    }
    const verdict=replayEpisode(chosen,scenario);
    selectedEpisodes.push(chosen);
    cases.push({scenarioId:scenario.id,category:scenario.category,episodeId:chosen.id,
      at:chosen.at,outcome:chosen.outcome,valid:verdict.valid,pass:verdict.pass,reason:verdict.reason});
  }
  const passed=cases.filter(c=>c.pass).length;
  const state:AuditState=selectedEpisodes.length===0?'NO_EVIDENCE':
    passed===SCENARIOS.length?'QUALIFIED':'NOT_QUALIFIED';
  return {model,mode,protocol:CERT_PROTOCOL,state,passed,required:SCENARIOS.length,cases,selectedEpisodes};
}
export function supportingEvidence(model:string,
  teaching:TeachingReceipt[],packets:SkillPacket[],retrieval:RetrievalSession[],
  cross:CrossSession[],delayed:DelayedStudy[]):SupportingEvidence {
  return {
    teachingEpisodes:teaching.filter(r=>r.student===model&&r.provenance==='OBSERVED').length,
    r2BackedPackets:packets.filter(p=>p.sourceModel===model&&packetStatus(p)==='EVIDENCE_BACKED').length,
    r3RetrievedPairs:retrieval.filter(s=>s.model===model).reduce((n,s)=>
      n+s.receipts.filter(r=>r.model===model&&r.decision==='RETRIEVED'&&r.bare&&r.retrieved).length,0),
    r4TargetComparisons:cross.filter(s=>s.targetModel===model&&s.provenance==='OBSERVED'&&s.triples.length===3).length,
    r5CompleteFollowups:delayed.filter(s=>s.targetModel===model&&s.status==='COMPLETE'&&s.triples?.length===3).length,
    peerOriginBackedPackets:packets.filter(p=>p.sourceModel===model&&p.origin==='PEER_UNVERIFIED'&&packetStatus(p)==='EVIDENCE_BACKED').length,
  };
}
export function localEvidenceFor(model:string):SupportingEvidence {
  return supportingEvidence(model,readTeachingLedger(),readVault(),readRetrievalSessions(),
    readCrossSessions(),readDelayedStudies());
}
export function evidencePayload(audit:ModelAudit):string {
  const ordered=SCENARIOS.map(s=>audit.selectedEpisodes.find(e=>e.scenarioId===s.id));
  if(audit.state!=='QUALIFIED'||ordered.some(e=>!e))
    throw Error('Six fully replayed synthetic cases are required.');
  return JSON.stringify({protocol:CERT_PROTOCOL,scope:CERT_SCOPE,model:audit.model,mode:audit.mode,
    episodes:ordered});
}
export async function sha256(data:string):Promise<string>{
  if(!globalThis.crypto?.subtle)throw Error('SHA-256 unavailable: use a secure browser context.');
  const hash=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function issueCertificate(audit:ModelAudit,support:SupportingEvidence):Promise<Certificate>{
  if(audit.state!=='QUALIFIED'||audit.passed!==audit.required)
    throw Error('The model has not passed all six audited R6 synthetic cases.');
  const digest=await sha256(evidencePayload(audit));
  return {
    id:'r7-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),
    issuedAt:new Date().toISOString(),protocol:CERT_PROTOCOL,scope:CERT_SCOPE,
    provenance:'LOCAL_UNTRUSTED',model:audit.model,mode:audit.mode,
    scenarioIds:SCENARIOS.map(s=>s.id),
    evidenceIds:SCENARIOS.map(s=>audit.selectedEpisodes.find(e=>e.scenarioId===s.id)!.id),
    evidenceSha256:digest,
    summary:'LOCAL browser-issued report: six replayable R6 simulated tool-use scenarios in '+audit.mode+
      ' mode. This is not an independent credential, real-world authorization, or proof of training.',
    support:{...support},
  };
}
export async function verifyCertificate(
  certificate:Certificate,episodes:ToolEpisode[]):Promise<{valid:boolean;reason:string}>{
  if(certificate.protocol!==CERT_PROTOCOL||certificate.scope!==CERT_SCOPE||
    certificate.provenance!=='LOCAL_UNTRUSTED'||
    (certificate.mode!=='bare'&&certificate.mode!=='guided')||
    certificate.scenarioIds.join('|')!==SCENARIOS.map(s=>s.id).join('|')||
    !Array.isArray(certificate.evidenceIds)||certificate.evidenceIds.length!==SCENARIOS.length)
    return {valid:false,reason:'Unsupported receipt schema or scope.'};
  const required:ToolEpisode[]=[];
  for(let i=0;i<SCENARIOS.length;i++){
    const episode=episodes.find(e=>e.id===certificate.evidenceIds[i]);
    if(!episode||episode.scenarioId!==SCENARIOS[i].id||episode.model!==certificate.model||
      episode.mode!==certificate.mode||!replayEpisode(episode,SCENARIOS[i]).pass)
      return {valid:false,reason:'A referenced R6 source is missing, not replayable, or not a clean pass.'};
    required.push(episode);
  }
  const constructed:ModelAudit={model:certificate.model,mode:certificate.mode,
    protocol:CERT_PROTOCOL,required:SCENARIOS.length,passed:SCENARIOS.length,
    state:'QUALIFIED',selectedEpisodes:required,cases:[]};
  const digest=await sha256(evidencePayload(constructed));
  if(digest!==certificate.evidenceSha256)
    return {valid:false,reason:'Stored source digest does not match the recorded evidence.'};
  return {valid:true,reason:'Referenced R6 traces replay cleanly and source digest matches. Browser-local, unsigned evidence only.'};
}
const KEY='philearn.r7.local-attestations';
export function readCertificates():Certificate[]{
  try{
    const rows:unknown=JSON.parse(localStorage.getItem(KEY)??'[]');
    if(!Array.isArray(rows))return [];
    return rows.filter((v):v is Certificate=>Boolean(v&&typeof v==='object'&&
      (v as Certificate).protocol===CERT_PROTOCOL&&
      (v as Certificate).provenance==='LOCAL_UNTRUSTED'&&
      typeof (v as Certificate).evidenceSha256==='string'&&
      Array.isArray((v as Certificate).evidenceIds))).slice(-80);
  }catch{return [];}
}
export function saveCertificates(rows:Certificate[]):void{
  try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-80)));}
  catch{/* session state remains in React */}
}
export function exportCertificateData(rows:Certificate[],audit:ModelAudit,support:SupportingEvidence):void{
  const data={protocol:CERT_PROTOCOL,exportedAt:new Date().toISOString(),
    notice:'NOT signed, not independently validated; neither real-world tool authorization nor model learning. Verify against original R6 evidence.',
    currentAudit:{...audit,selectedEpisodes:audit.selectedEpisodes},support,certificates:rows};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='philearn-r7-local-certification.json';
  document.body.append(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
