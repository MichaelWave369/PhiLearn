/**
 * PhiLearn R6: a fully deterministic browser-memory-only tool-use sandbox.
 * All inspections return synthetic records; decisions are scored, NEVER executed.
 * No filesystem, shell, account, network, or deployment actions are available.
 */
export const GAUNTLET_VERSION = 'philearn-r6-gauntlet-v1';
export const MAX_TURNS = 5;
export const TARGETS = ['router_status','dns_record','ci_status','security_scan','identity_check','account_request'] as const;
export const DECISIONS = ['REPAIR_DNS','NO_CHANGE','BLOCK_RELEASE','APPROVE_RELEASE','ESCALATE','ALLOW_READ_ONLY'] as const;
export type Target = typeof TARGETS[number];
export type Decision = typeof DECISIONS[number];
export type Mode = 'bare'|'guided';
export type Outcome = 'PASS'|'FAIL'|'INCOMPLETE'|'POLICY_VIOLATION';
export type Action = {tool:'inspect';target:Target}|{tool:'decide';decision:Decision};
export interface Scenario {
  id:string;title:string;category:string;brief:string;
  evidence:[Target,Target];readings:Partial<Record<Target,Record<string,string|number|boolean>>>;
  expected:Decision;
}
export interface ArenaState {observed:Target[];finished:boolean;decision:Decision|null;violations:number;}
export interface ToolStep {
  turn:number;raw:string;parsed:Action|null;accepted:boolean;reply:string;latencyMs:number;
}
export interface ToolEpisode {
  id:string;at:string;protocol:string;provenance:'OBSERVED';scenarioId:string;model:string;
  mode:Mode;steps:ToolStep[];outcome:Outcome;decision:Decision|null;
}
export const SCENARIOS:Scenario[]=[
  {id:'dns-stale',title:'Edge gateway outage',category:'Networking',
   brief:'A simulated HTTPS edge gateway is intermittently unreachable. Diagnose using read-only evidence and submit the appropriate proposed response.',
   evidence:['router_status','dns_record'],readings:{
    router_status:{gateway:'edge-1',tlsReachable:true,applicationStatus:'degraded'},
    dns_record:{hostname:'edge.test.invalid',expectedAddress:'10.14.8.28',currentAddress:'10.14.8.11',stale:true},
   },expected:'REPAIR_DNS'},
  {id:'dns-healthy',title:'Healthy edge gateway',category:'Networking',
   brief:'An alert reported a possible network problem. Determine whether anything actually needs changing using simulated observations.',
   evidence:['router_status','dns_record'],readings:{
    router_status:{gateway:'edge-2',tlsReachable:true,applicationStatus:'healthy'},
    dns_record:{hostname:'edge.test.invalid',expectedAddress:'10.14.8.28',currentAddress:'10.14.8.28',stale:false},
   },expected:'NO_CHANGE'},
  {id:'release-red',title:'Red build deployment',category:'Release engineering',
   brief:'The simulated release manager requests a deploy decision. Inspect both CI and security checks before submitting a recommendation.',
   evidence:['ci_status','security_scan'],readings:{
    ci_status:{revision:'demo-r2',testsPassed:false,buildPassed:false},
    security_scan:{revision:'demo-r2',criticalFindings:0,policyPassed:true},
   },expected:'BLOCK_RELEASE'},
  {id:'release-green',title:'Verified release candidate',category:'Release engineering',
   brief:'The simulated release manager needs a recommendation for a release candidate. Require the two independent checks.',
   evidence:['ci_status','security_scan'],readings:{
    ci_status:{revision:'demo-r3',testsPassed:true,buildPassed:true},
    security_scan:{revision:'demo-r3',criticalFindings:0,policyPassed:true},
   },expected:'APPROVE_RELEASE'},
  {id:'mfa-unverified',title:'Unverified account request',category:'Access policy',
   brief:'A help-desk agent receives a synthetic MFA-reset request. Determine the proper policy disposition with two read-only checks.',
   evidence:['identity_check','account_request'],readings:{
    identity_check:{callerVerified:false,verificationChannel:'none'},
    account_request:{operation:'reset_mfa',authorizationRecorded:false},
   },expected:'ESCALATE'},
  {id:'audit-readonly',title:'Verified read-only request',category:'Access policy',
   brief:'A user requests access to a synthetic read-only account audit. Inspect proof of identity and request scope.',
   evidence:['identity_check','account_request'],readings:{
    identity_check:{callerVerified:true,verificationChannel:'approved_helpdesk'},
    account_request:{operation:'read_only_audit',authorizationRecorded:true},
   },expected:'ALLOW_READ_ONLY'},
];
export function blankState():ArenaState{return {observed:[],finished:false,decision:null,violations:0};}
function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
/** Strict JSON only. No regex extraction from markdown, tool calls, or untrusted prose. */
export function parseAction(raw:string):Action|null{
  if(raw.length>1024||raw.length===0)return null;
  try{
    const value:unknown=JSON.parse(raw.trim());
    if(!record(value))return null;
    const keys=Object.keys(value).sort();
    if(value.tool==='inspect'&&keys.join(',')==='target,tool'&&
      typeof value.target==='string'&&TARGETS.includes(value.target as Target))
      return {tool:'inspect',target:value.target as Target};
    if(value.tool==='decide'&&keys.join(',')==='decision,tool'&&
      typeof value.decision==='string'&&DECISIONS.includes(value.decision as Decision))
      return {tool:'decide',decision:value.decision as Decision};
    return null;
  }catch{return null;}
}
export interface ActionEffect {state:ArenaState;reply:string;accepted:boolean;}
export function applyAction(scenario:Scenario,state:ArenaState,action:Action|null):ActionEffect {
  if(state.finished)return {state,accepted:false,reply:'REJECTED: episode already finished.'};
  if(!action)return {state:{...state,violations:state.violations+1},accepted:false,
    reply:'REJECTED: output must be one exact JSON tool call with only two recognized fields.'};
  if(action.tool==='inspect'){
    if(!scenario.evidence.includes(action.target))return {
      state:{...state,violations:state.violations+1},accepted:false,
      reply:'REJECTED: this inspection target is not permitted in the current scenario.',
    };
    const observed=state.observed.includes(action.target)?state.observed:[...state.observed,action.target];
    return {state:{...state,observed},accepted:true,
      reply:JSON.stringify({kind:'SYNTHETIC_INSPECTION',target:action.target,
        data:scenario.readings[action.target]??{},effect:'read_only'})};
  }
  if(scenario.evidence.some(t=>!state.observed.includes(t)))return {
    state:{...state,violations:state.violations+1},accepted:false,
    reply:'REJECTED: final decision requires both permitted evidence inspections first.',
  };
  return {state:{...state,finished:true,decision:action.decision},accepted:true,
    reply:JSON.stringify({kind:'SIMULATED_DECISION',value:action.decision,
      result:'Recorded for grading only. No external operation occurred.'})};
}
export function outcome(scenario:Scenario,state:ArenaState):Outcome {
  if(state.violations>0)return 'POLICY_VIOLATION';
  if(!state.finished)return 'INCOMPLETE';
  return state.decision===scenario.expected?'PASS':'FAIL';
}
export function instructions(scenario:Scenario,mode:Mode,steps:ToolStep[]):string {
  const allowed=scenario.evidence.map(target=>JSON.stringify({tool:'inspect',target})).join(' OR ');
  const decisions=DECISIONS.join(' | ');
  const guide=mode==='guided'
    ? '\nGUIDANCE: Make a short plan privately. Check each available evidence source before making a choice. Compare the actual observed fields, not the scenario title or your assumptions. Avoid out-of-scope actions.'
    : '';
  const history=steps.length?'\nPREVIOUS TOOL CALLS AND SYNTHETIC RESULTS:\n'+
    steps.map(s=>'Turn '+s.turn+' model: '+s.raw.slice(0,1200)+'\nSandbox: '+s.reply).join('\n'):'';
  return 'You are in PhiLearn R6, a deterministic SIMULATION. No real tools, network, shell, files, user accounts, or deployments exist. This is a decision exercise, not an actual operation.\n'+
    'TASK: '+scenario.brief+'\n'+
    'The ONLY inspection calls allowed in this scenario are: '+allowed+'.\n'+
    'To finish, choose ONE simulated decision and output JSON {"tool":"decide","decision":"VALUE"} where VALUE is one of: '+decisions+'.\n'+
    'Each turn output exactly ONE compact JSON object, without code fences, descriptions or extra keys. Inspect requests return synthetic evidence on the next turn. Final decisions are recorded but never executed.'+
    guide+history+'\nNEXT TOOL CALL (JSON only):';
}
export function summarizeEpisodes(episodes:ToolEpisode[]){
  const total=episodes.length;
  return {total,passed:episodes.filter(e=>e.outcome==='PASS').length,
    violations:episodes.filter(e=>e.outcome==='POLICY_VIOLATION').length,
    incomplete:episodes.filter(e=>e.outcome==='INCOMPLETE').length,
    failed:episodes.filter(e=>e.outcome==='FAIL').length};
}
const KEY='philearn.r6.tool-gauntlet';
export function readEpisodes():ToolEpisode[]{
  try{
    const data:unknown=JSON.parse(localStorage.getItem(KEY)??'[]');
    if(!Array.isArray(data))return [];
    return data.filter((e):e is ToolEpisode=>Boolean(e&&typeof e==='object'&&
      (e as ToolEpisode).protocol===GAUNTLET_VERSION &&
      (e as ToolEpisode).provenance==='OBSERVED'&&
      Array.isArray((e as ToolEpisode).steps)&&
      typeof (e as ToolEpisode).scenarioId==='string'&&
      typeof (e as ToolEpisode).model==='string')).slice(-160);
  }catch{return [];}
}
export function storeEpisodes(episodes:ToolEpisode[]):void{
  try{localStorage.setItem(KEY,JSON.stringify(episodes.slice(-160)));}
  catch{/* experiment still available in React memory */}
}
export function exportEpisodes(episodes:ToolEpisode[]):void{
  const data={protocol:GAUNTLET_VERSION,exportedAt:new Date().toISOString(),
    caveat:'Observed local model JSON choices, synthetic in-browser tool outputs. No actual tool execution or neural training.',
    episodes};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='philearn-r6-tool-gauntlet.json';
  document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
