import {useMemo,useRef,useState} from 'react';
import {ArrowRight,BookOpen,BrainCircuit,CheckCircle2,Download,FlaskConical,Info,Play,RefreshCw,ShieldCheck,StopCircle,Trash2,Users} from 'lucide-react';
import {generate,type BridgeClient} from './bridge';
import {readVault,type SkillPacket} from './vault';
import {LESSONS} from './teaching';
import {
  TRANSFER_PROTOCOL,NEUTRAL_NOTE,CONDITIONS,crossTasksFor,eligibleSources,canCrossTransfer,
  crossPrompt,gradeCross,randomConditions,summarizeCross,crossSignal,readCrossSessions,
  storeCrossSessions,exportCrossSessions,
  type Answer,type Triple,type CrossSession,
} from './crossTransfer';

type Props={client:BridgeClient|null;models:string[];goToConnection:()=>void;goToVault:()=>void};
const title=(id:string)=>LESSONS.find(l=>l.id===id)?.title??id;
const localTime=(s:string)=>new Date(s).toLocaleString();

export default function CrossModelLab({client,models,goToConnection,goToVault}:Props) {
  const [packets,setPackets]=useState<SkillPacket[]>(readVault);
  const [packetId,setPacketId]=useState('');
  const [target,setTarget]=useState('');
  const [sessions,setSessions]=useState<CrossSession[]>(readCrossSessions);
  const [activeSessionId,setActiveSessionId]=useState('');
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState({done:0,total:9});
  const [message,setMessage]=useState('');
  const controller=useRef<AbortController|null>(null);

  const sources=useMemo(()=>eligibleSources(packets),[packets]);
  const packet=sources.find(p=>p.id===packetId)??sources[0];
  const targets=packet?models.filter(m=>m!==packet.sourceModel):[];
  const targetModel=targets.includes(target)?target:(targets[0]??'');
  const tasks=packet?crossTasksFor(packet.lessonId):[];
  const valid=Boolean(client&&packet&&canCrossTransfer(packet,targetModel)&&tasks.length===3);
  const session=sessions.find(s=>s.id===activeSessionId)??sessions[sessions.length-1];
  const metrics=session?summarizeCross(session):null;

  function refresh() {setPackets(readVault());setMessage('R2 packets refreshed from browser storage.');}
  function persist(rows:CrossSession[]) {setSessions(rows);storeCrossSessions(rows);}
  async function run() {
    if(!client||!packet||!valid||busy)return;
    const ctl=new AbortController();controller.current=ctl;
    setBusy(true);setMessage('');setProgress({done:0,total:tasks.length*CONDITIONS.length});
    const triples:Triple[]=[];
    try {
      for(const task of tasks){
        if(ctl.signal.aborted)break;
        const order=randomConditions();
        const answers:Partial<Record<(typeof CONDITIONS)[number],Answer>>={};
        for(const condition of order){
          if(ctl.signal.aborted)break;
          const response=await generate(client,targetModel,crossPrompt(task,condition,packet.note),ctl.signal);
          answers[condition]={text:response.response.trim(),
            correct:gradeCross(task,response.response),elapsedMs:response.elapsed_ms};
          setProgress({done:triples.length*3+Object.keys(answers).length,total:tasks.length*3});
        }
        if(ctl.signal.aborted||!answers.bare||!answers.neutral||!answers.relevant)break;
        triples.push({taskId:task.id,order,answers:{
          bare:answers.bare,neutral:answers.neutral,relevant:answers.relevant,
        }});
      }
      // Unlike an exploratory partial record, only the complete 3x3 comparison is saved.
      if(!ctl.signal.aborted&&triples.length===tasks.length){
        const next:CrossSession={id:'cross-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),
          at:new Date().toISOString(),protocol:TRANSFER_PROTOCOL,provenance:'OBSERVED',
          sourcePacketId:packet.id,sourceReceiptId:packet.sourceReceiptId,sourceModel:packet.sourceModel,
          targetModel,sourceOrigin:packet.origin,lessonId:packet.lessonId,
          noteSnapshot:packet.note,neutralSnapshot:NEUTRAL_NOTE,triples};
        const all=[...sessions,next].slice(-25);persist(all);setActiveSessionId(next.id);
        setMessage('Three complete trials recorded. Compare the relevant note against both controls below.');
      } else setMessage('Interrupted. Incomplete 3×3 comparison discarded. Earlier runs were preserved.');
    }catch(error){
      setMessage(ctl.signal.aborted?'Stopped. Incomplete comparison discarded.'
        :'Bridge error: '+(error instanceof Error?error.message:'Unknown error')+'. Incomplete run discarded.');
    }finally{controller.current=null;setBusy(false);}
  }
  function clear(){
    if(busy||!window.confirm('Permanently clear browser-local R4 transfer sessions? Export first if needed.'))return;
    persist([]);setActiveSessionId('');setMessage('R4 comparison history cleared.');
  }
  return <div className="cross-page">
    <section className="page-heading">
      <div className="eyebrow"><Users size={15}/> R4 / CROSS-MODEL TRANSFER</div>
      <h1>Can one agent help another?</h1>
      <p>Test whether a procedure that helped its original model also improves a different model's answers on fresh problems, compared with both no note and an unrelated reference note.</p>
    </section>
    <div className="teaching-hero-note"><ShieldCheck size={24}/><div>
      <strong>Three independent prompt conditions. Zero weight updates.</strong>
      <span>R2 evidence limits which source packets qualify. The recipient must be a different Ollama model. Each answer is an isolated call with randomized condition order. The result measures an in-context effect, not permanent learning.</span>
    </div></div>
    <div className="metrics-grid teaching-metrics">
      <div className="metric-card"><span className="mini-kicker">QUALIFIED SOURCES</span><div className="metric-value">{sources.length}</div><div className="metric-detail">R2 evidence-backed packets</div></div>
      <div className="metric-card"><span className="mini-kicker">COMPLETED STUDIES</span><div className="metric-value">{sessions.length}</div><div className="metric-detail">3 challenges × 3 conditions</div></div>
      <div className="metric-card"><span className="mini-kicker">RELEVANT PASS</span><div className="metric-value">{metrics?metrics.relevant+'/3':'—'}</div><div className="metric-detail">Most recent selected run</div></div>
      <div className="metric-card"><span className="mini-kicker">RELEVANT GAINS</span><div className="metric-value">{metrics?metrics.gainVsBare+' / '+metrics.gainVsNeutral:'—'}</div><div className="metric-detail">Versus bare / neutral</div></div>
    </div>
    <div className="teaching-columns">
      <section className="panel teaching-config">
        <div className="mini-kicker">01 / SOURCE MODEL</div><h3>Choose a transferable playbook</h3>
        <p className="panel-desc">Only a packet with R2 evidence-backed status can serve as a source. That status is not proof its text is universally correct.</p>
        {!sources.length&&<div className="teaching-empty"><BookOpen size={30}/><strong>No evidence-backed source packets yet</strong><span>Run R1 teaching, save the explanation in the R2 vault, and meet the R2 independent evaluation gate first.</span></div>}
        <label htmlFor="cross-packet" className="teaching-label">R2 SOURCE PACKET</label>
        <select id="cross-packet" className="model-select" value={packet?.id??''}
          disabled={busy||!sources.length} onChange={e=>{setPacketId(e.target.value);setTarget('');}}>
          {!sources.length&&<option value="">No eligible packets</option>}
          {sources.map(p=><option key={p.id} value={p.id}>{title(p.lessonId)} · {p.sourceModel} · {p.id.slice(-8)}</option>)}
        </select>
        {packet&&<div className="cross-source"><span className="vault-state evidence_backed">R2 EVIDENCE-BACKED</span>
          <p><strong>Teacher:</strong> {packet.sourceTeacher??'Curated reference'}<br/>
          <strong>Source learner:</strong> {packet.sourceModel}<br/>
          <strong>Origin:</strong> {packet.origin==='PEER_UNVERIFIED'?'UNVERIFIED PEER TEXT':'CURATED'}<br/>
          <strong>Receipt:</strong> {packet.sourceReceiptId}</p>
          <div className="cross-note">{packet.note}</div>
        </div>}
        <div className="vault-mini-actions"><button className="text-link" onClick={refresh} disabled={busy}><RefreshCw size={13}/> Refresh R2 packets</button><button className="text-link" onClick={goToVault}>Open Skill Vault <ArrowRight size={13}/></button></div>
        <div className="line-divider"/>
        <div className="mini-kicker">02 / RECIPIENT MODEL</div><h3>Transfer into a different model</h3>
        {!client&&<div className="teaching-connect"><Info size={17}/><span>Connect local Ollama from the Learning lab first.</span><button className="button button-outline" onClick={goToConnection}>Connect <ArrowRight size={14}/></button></div>}
        <label className="teaching-label" htmlFor="cross-target">TARGET MODEL</label>
        <select id="cross-target" className="model-select" disabled={busy||!client||!targets.length}
          value={targetModel} onChange={e=>setTarget(e.target.value)}>
          {!targets.length&&<option value="">No other available model</option>}
          {targets.map(m=><option value={m} key={m}>{m}</option>)}
        </select>
        <p className="teaching-muted">This test requires a distinct recipient model identifier. It does not copy parameters, change weights, or enable model-to-model tool execution.</p>
        {busy&&<div className="teaching-progress">Completed {progress.done}/{progress.total} isolated calls<div><span style={{width:progress.done/progress.total*100+'%'}}/></div></div>}
        <button className="button button-primary teaching-run" disabled={!valid||busy} onClick={run}><Play size={16}/> Run cross-model comparison <ArrowRight size={16}/></button>
        {busy&&<button className="button button-outline teaching-run" onClick={()=>controller.current?.abort()}><StopCircle size={16}/> Stop and discard incomplete</button>}
        {message&&<p className="vault-message" role="status">{message}</p>}
      </section>
      <section className="panel teaching-preview">
        <div className="mini-kicker">03 / CONTROLLED EXPERIMENT</div><h3>Same problems, three conditions</h3>
        <div className="cross-conditions">
          <div><span>CONTROL A</span><strong>Unassisted</strong><p>The recipient solves each problem with only the task instructions.</p></div>
          <div><span>CONTROL B</span><strong>Neutral note</strong><p>The recipient receives an unrelated botanical reference, controlling in part for extra context.</p></div>
          <div><span>TEST</span><strong>Relevant R2 playbook</strong><p>The recipient receives the source model's saved procedural note.</p></div>
        </div>
        <p className="panel-desc">Each of the three fresh R4 questions is attempted under every condition: nine sequential model requests. The system shuffles request order for every question and scores strict short answers without sending the grading key to Ollama.</p>
        {tasks.length>0&&<div className="cross-tasks">{tasks.map((t,i)=><div key={t.id}><span>{String(i+1).padStart(2,'0')}</span><p>{t.question}</p></div>)}</div>}
        <div className="teaching-annotation"><Info size={17}/><p>The unrelated note is an imperfect placebo. Different note length and phrasing may still affect results. Small, public, repeated questions can be contaminated; no statistical or causal claims are justified by one run.</p></div>
      </section>
    </div>
    <section className="panel teaching-ledger cross-ledger">
      <div className="teaching-ledger-head"><div><div className="mini-kicker">04 / INDEPENDENT EVIDENCE</div><h3>Cross-model transfer ledger</h3><p className="panel-desc">Complete trials only, with source and recipient identities, prompt order, note snapshots, raw answers and scores.</p></div>
        <div className="ledger-actions"><button className="button button-outline" disabled={!sessions.length} onClick={()=>exportCrossSessions(sessions)}><Download size={15}/> Export R4</button>
        <button className="button button-danger" disabled={!sessions.length||busy} onClick={clear}><Trash2 size={15}/> Clear</button></div></div>
      {sessions.length>1&&<label className="teaching-label">STUDY <select className="model-select" value={session?.id??''} onChange={e=>setActiveSessionId(e.target.value)}>{[...sessions].reverse().map(s=><option key={s.id} value={s.id}>{localTime(s.at)} · {s.sourceModel} → {s.targetModel} · {title(s.lessonId)}</option>)}</select></label>}
      {!session&&<div className="teaching-empty"><FlaskConical size={30}/><strong>Awaiting the first observed cross-model trial</strong><span>Trials are never fabricated. Connect Ollama and compare two different models.</span></div>}
      {session&&metrics&&<>
        <div className="cross-summary"><div><small>SOURCE → RECIPIENT</small><strong>{session.sourceModel} → {session.targetModel}</strong></div><div><small>CONTROL A</small><strong>{metrics.bare}/3</strong></div><div><small>CONTROL B</small><strong>{metrics.neutral}/3</strong></div><div><small>RELEVANT NOTE</small><strong>{metrics.relevant}/3</strong></div></div>
        <p className="cross-session-label">{localTime(session.at)} · <span className={'vault-state '+(crossSignal(session)==='REGRESSION'?'regressed':'inconclusive')}>{crossSignal(session).replaceAll('_',' ')}</span> · Source receipt: {session.sourceReceiptId} · {session.sourceOrigin}</p>
        {session.triples.map(triple=><div className="cross-triple" key={triple.taskId}>
          <strong>{triple.taskId}</strong><small>Random order: {triple.order.join(' → ')}</small>
          <div className="cross-answers">{CONDITIONS.map(c=><div key={c}><span>{c.toUpperCase()}</span><strong className={triple.answers[c].correct?'cross-pass':'cross-fail'}>{triple.answers[c].correct?'PASS':'FAIL'}</strong>
            <p>{triple.answers[c].text||'(empty response)'}</p><small>{Math.round(triple.answers[c].elapsedMs)} ms</small></div>)}</div>
        </div>)}
        <p className="teaching-footer-note"><CheckCircle2 size={15}/> Signal is only directional: R4 calls DIRECTIONAL_LIFT when the relevant note exceeds both controls across this three-question set without any paired regression. A single result never demonstrates persistent skill transfer, improved weights, or statistically reliable generalization.</p>
      </>}
    </section>
  </div>;
}
