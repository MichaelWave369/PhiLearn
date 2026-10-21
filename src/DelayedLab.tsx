import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,CalendarClock,CheckCircle2,Clock3,Download,FlaskConical,Info,Play,RefreshCw,ShieldCheck,StopCircle,Trash2} from 'lucide-react';
import {generate,type BridgeClient} from './bridge';
import {readCrossSessions,CONDITIONS,type Condition,type Answer,type Triple} from './crossTransfer';
import {LESSONS} from './teaching';
import {
  DELAYS_DAYS, DELAYED_PROTOCOL, createDelayedStudy,validSource,isDue,
  tasksForDelay,delayedPrompt,gradeDelayed,randomConditions,finishDelayedStudy,
  delayedSummary,readDelayedStudies,storeDelayedStudies,exportDelayedStudies,
  type DelayedStudy
} from './delayed';

type Props={client:BridgeClient|null;models:string[];goToConnection:()=>void;goToCross:()=>void};
const title=(id:string)=>LESSONS.find(l=>l.id===id)?.title??id;
const display=(iso:string)=>new Date(iso).toLocaleString();

export default function DelayedLab({client,models,goToConnection,goToCross}:Props) {
  const [sources,setSources]=useState(readCrossSessions);
  const [studies,setStudies]=useState<DelayedStudy[]>(readDelayedStudies);
  const [sourceId,setSourceId]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [delayDays,setDelayDays]=useState<number>(1);
  const [nowMs,setNowMs]=useState(()=>Date.now());
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState({done:0,total:9});
  const [message,setMessage]=useState('');
  const abort=useRef<AbortController|null>(null);

  useEffect(()=>{
    const id=window.setInterval(()=>setNowMs(Date.now()),60_000);
    return ()=>window.clearInterval(id);
  },[]);
  const readySources=useMemo(()=>sources.filter(s=>validSource(s)&&
    !studies.some(d=>d.sourceR4Id===s.id)),[sources,studies]);
  const source=readySources.find(s=>s.id===sourceId)??readySources[0];
  const selected=studies.find(s=>s.id===selectedId)??studies[studies.length-1];
  const due=selected?isDue(selected,nowMs):false;
  const hasTarget=Boolean(selected&&models.includes(selected.targetModel));
  const canRun=Boolean(client&&selected&&due&&hasTarget&&!busy);
  const summary=selected?delayedSummary(selected):null;
  const tasks=selected?tasksForDelay(selected.lessonId):[];
  const completed=studies.filter(s=>s.status==='COMPLETE').length;
  const scheduled=studies.filter(s=>s.status==='PENDING').length;
  const pendingDue=studies.filter(s=>isDue(s,nowMs)).length;

  function persist(rows:DelayedStudy[]){
    const saved=rows.slice(-40);
    setStudies(saved);
    storeDelayedStudies(saved);
  }
  function refresh(){
    setSources(readCrossSessions());setNowMs(Date.now());
    setMessage('Local R4 receipts and clock refreshed. Scheduled studies remain unchanged.');
  }
  function schedule(){
    if(busy||!source)return;
    try{
      const study=createDelayedStudy(source,delayDays,Date.now());
      persist([...studies,study]);setSelectedId(study.id);setSourceId('');
      setNowMs(Date.now());
      setMessage('Follow-up stored locally. Reopen PhiLearn on or after the due time to run new tests.');
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to schedule follow-up.');}
  }
  async function run(){
    if(!client||!selected||!isDue(selected,Date.now())||!models.includes(selected.targetModel)||busy)return;
    const ctl=new AbortController();abort.current=ctl;
    setBusy(true);setMessage('');setProgress({done:0,total:9});
    const finished:Triple[]=[];
    try{
      for(const task of tasks){
        if(ctl.signal.aborted)break;
        const order=randomConditions();
        const answers:Partial<Record<Condition,Answer>>={};
        for(const condition of order){
          if(ctl.signal.aborted)break;
          const result=await generate(client,selected.targetModel,
            delayedPrompt(task,condition,selected.noteSnapshot,selected.neutralSnapshot),ctl.signal);
          answers[condition]={text:result.response.trim(),
            correct:gradeDelayed(task,result.response),elapsedMs:result.elapsed_ms};
          setProgress({done:finished.length*3+Object.keys(answers).length,total:9});
        }
        if(ctl.signal.aborted||!answers.bare||!answers.neutral||!answers.relevant)break;
        finished.push({taskId:task.id,order,answers:{
          bare:answers.bare,neutral:answers.neutral,relevant:answers.relevant,
        }});
      }
      if(!ctl.signal.aborted&&finished.length===3){
        const completedStudy=finishDelayedStudy(selected,finished,new Date().toISOString());
        setStudies(current=>{
          const next=current.map(s=>s.id===selected.id?completedStudy:s);
          storeDelayedStudies(next);return next;
        });
        setMessage('Delayed re-check completed and saved. Compare its scores with the earlier R4 run.');
      }else setMessage('Stopped. Incomplete delayed study discarded; the scheduled study remains available.');
    }catch(e){
      setMessage(ctl.signal.aborted?'Stopped. Incomplete responses discarded.'
        :'Bridge or validation error: '+(e instanceof Error?e.message:'Unknown error')+'. Scheduled follow-up remains pending.');
    }finally{abort.current=null;setBusy(false);setNowMs(Date.now());}
  }
  function remove(){
    if(busy||!selected||!window.confirm('Delete the selected delayed study and all its results?'))return;
    const next=studies.filter(s=>s.id!==selected.id);
    persist(next);setSelectedId(next[next.length-1]?.id??'');
    setMessage('Local study deleted.');
  }
  function clear(){
    if(busy||!window.confirm('Clear all browser-local R5 studies and evidence?'))return;
    persist([]);setSelectedId('');setMessage('R5 studies cleared.');
  }
  return <div className="delayed-page">
    <section className="page-heading">
      <div className="eyebrow"><CalendarClock size={15}/> R5 / DELAYED RE-CHECK</div>
      <h1>Does the playbook still help later?</h1>
      <p>Revisit an R4 cross-model transfer comparison after a minimum 24-hour gap. Use brand-new questions and the same recipient model to inspect whether external procedural assistance remains useful over time.</p>
    </section>
    <div className="teaching-hero-note"><ShieldCheck size={22}/><div>
      <strong>Delayed external-memory re-check, not internal neural retention.</strong>
      <span>R5 stores a future test in this browser. It does not train a model, schedule a background job, send notifications, or verify the computer clock. Run the new study manually when it is due.</span>
    </div></div>
    <div className="metrics-grid teaching-metrics">
      <div className="metric-card"><span className="mini-kicker">SCHEDULED</span><div className="metric-value">{scheduled}</div><div className="metric-detail">Browser-local queues</div></div>
      <div className="metric-card"><span className="mini-kicker">READY TO RUN</span><div className="metric-value">{pendingDue}</div><div className="metric-detail">Client-clock eligibility</div></div>
      <div className="metric-card"><span className="mini-kicker">COMPLETED</span><div className="metric-value">{completed}</div><div className="metric-detail">Full nine-call comparisons</div></div>
      <div className="metric-card"><span className="mini-kicker">FRESH TASKS</span><div className="metric-value">18</div><div className="metric-detail">Three per existing skill</div></div>
    </div>
    <div className="teaching-columns">
      <section className="panel teaching-config">
        <div className="mini-kicker">01 / ENROLL FROM R4</div><h3>Register a follow-up</h3>
        <p className="panel-desc">Choose a complete observed R4 comparison. Its recipient identity, original time, source note and control note are pinned in the R5 record.</p>
        {!readySources.length&&<div className="teaching-empty"><CalendarClock size={30}/><strong>No new R4 sources available</strong><span>Run a cross-model comparison first, or select an existing scheduled study below.</span></div>}
        <label htmlFor="d-source" className="teaching-label">SOURCE R4 STUDY</label>
        <select id="d-source" className="model-select" value={source?.id??''} disabled={!readySources.length||busy} onChange={e=>setSourceId(e.target.value)}>
          {!readySources.length&&<option value="">No unused R4 comparison</option>}
          {readySources.map(s=><option key={s.id} value={s.id}>{display(s.at)} · {s.sourceModel} → {s.targetModel} · {title(s.lessonId)}</option>)}
        </select>
        <label htmlFor="d-delay" className="teaching-label">MINIMUM DELAY FROM R4 BASELINE</label>
        <select id="d-delay" className="model-select" value={delayDays} disabled={busy} onChange={e=>setDelayDays(Number(e.target.value))}>
          {DELAYS_DAYS.map(d=><option key={d} value={d}>{d} day{d>1?'s':''}</option>)}
        </select>
        {source&&<div className="delayed-source"><strong>R4 recipient: {source.targetModel}</strong><span>Original baseline: {display(source.at)}</span><span>Planned earliest re-check: {display(new Date(Date.parse(source.at)+delayDays*86400000).toISOString())}</span></div>}
        <button className="button button-primary teaching-run" disabled={!source||busy} onClick={schedule}><CalendarClock size={16}/> Save delayed study</button>
        <div className="vault-mini-actions"><button className="text-link" onClick={refresh} disabled={busy}><RefreshCw size={14}/> Refresh available R4 studies</button><button className="text-link" onClick={goToCross}>Open R4 lab <ArrowRight size={14}/></button></div>
        <div className="line-divider"/>
        <label className="teaching-label" htmlFor="d-selected">SAVED FOLLOW-UP</label>
        <select id="d-selected" className="model-select" value={selected?.id??''} disabled={!studies.length||busy} onChange={e=>setSelectedId(e.target.value)}>
          {!studies.length&&<option value="">No follow-ups scheduled</option>}
          {[...studies].reverse().map(s=><option key={s.id} value={s.id}>{s.status} · {title(s.lessonId)} · {s.targetModel} · due {display(s.dueAt)}</option>)}
        </select>
        {selected&&<div className="delayed-source">
          <strong>{selected.status==='COMPLETE'?'COMPLETED':due?'DUE / READY':'WAITING FOR DUE TIME'}</strong>
          <span>R4 source: {selected.sourceModel} → {selected.targetModel}</span>
          <span>Original R4: {display(selected.baselineAt)}</span>
          <span>Due: {display(selected.dueAt)} (minimum {selected.delayDays} day{selected.delayDays>1?'s':''})</span>
          <span>Frozen source receipt: {selected.sourceReceiptId}</span>
        </div>}
        {selected&&selected.status==='PENDING'&&!due&&<p className="teaching-muted">Due-time gate enforced in the browser. Return on or after the specified time to run the same recipient model on fresh tests. Changing the device clock can alter this gate; it is not independently timestamped.</p>}
        {selected&&selected.status==='PENDING'&&!client&&<div className="teaching-connect"><Info size={17}/><span>Connect the local Ollama bridge before running the follow-up.</span><button className="button button-outline" onClick={goToConnection}>Connect <ArrowRight size={14}/></button></div>}
        {selected&&selected.status==='PENDING'&&client&&!hasTarget&&<p className="teaching-error">Original recipient model {selected.targetModel} is not available through this bridge. Use the same model identity; avoid silently substituting a different model.</p>}
        {busy&&<div className="teaching-progress">Completed {progress.done}/{progress.total} model calls<div><span style={{width:progress.done/progress.total*100+'%'}}/></div></div>}
        <button className="button button-primary teaching-run" disabled={!canRun} onClick={run}><Play size={16}/> Run due follow-up <ArrowRight size={16}/></button>
        {busy&&<button className="button button-outline teaching-run" onClick={()=>abort.current?.abort()}><StopCircle size={16}/> Stop and discard incomplete</button>}
        {selected&&<button className="button button-danger teaching-run" disabled={busy} onClick={remove}><Trash2 size={15}/> Delete selected study</button>}
        {message&&<p role="status" className="vault-message">{message}</p>}
      </section>
      <section className="panel teaching-preview">
        <div className="mini-kicker">02 / THREE-CONDITION RE-CHECK</div><h3>Fresh challenge bank</h3>
        <p className="panel-desc">Exactly three questions not used in R1 through R4, each evaluated using the same model identity under three independent randomized-order prompts.</p>
        <div className="cross-conditions">
          <div><span>CONTROL A</span><strong>Unassisted</strong><p>Task prompt alone. No saved procedure.</p></div>
          <div><span>CONTROL B</span><strong>Frozen neutral reference</strong><p>The exact unrelated-note text captured during R4.</p></div>
          <div><span>TEST</span><strong>Frozen relevant procedure</strong><p>The exact R4 procedural playbook snapshot, not a later edited version.</p></div>
        </div>
        {tasks.length>0&&<div className="cross-tasks">{tasks.map((task,i)=><div key={task.id}><span>{String(i+1).padStart(2,'0')}</span><p>{task.question}</p></div>)}</div>}
        <div className="teaching-annotation"><Info size={18}/><p>The time gap is measured by the browser clock. The tests are new, but their answers are shipped in public app source. Model tags can be updated to different weights without changing their identifiers. R5 cannot prove unchanged weights or independent wall-clock time.</p></div>
      </section>
    </div>
    <section className="panel teaching-ledger delayed-ledger">
      <div className="teaching-ledger-head"><div><div className="mini-kicker">03 / LONGITUDINAL RECEIPT</div><h3>Earlier R4 versus delayed R5</h3><p className="panel-desc">Compare three separate control-condition scores at the initial and follow-up observations. Scores are out of three and use different task questions.</p></div>
        <div className="ledger-actions"><button className="button button-outline" disabled={!studies.length} onClick={()=>exportDelayedStudies(studies)}><Download size={15}/> Export R5</button>
        <button className="button button-danger" disabled={!studies.length||busy} onClick={clear}><Trash2 size={15}/> Clear all R5</button></div></div>
      {!selected&&<div className="teaching-empty"><Clock3 size={30}/><strong>No delayed study selected</strong><span>Enroll an R4 comparison and revisit when the selected time gap has elapsed.</span></div>}
      {selected&&<><div className="delayed-meta"><span>{title(selected.lessonId)}</span><span>Source packet {selected.sourcePacketId}</span><span>Protocol {DELAYED_PROTOCOL}</span></div>
        <div className="delayed-compare">
          <div><small>MEASUREMENT</small><strong>R4 BASELINE</strong><strong>R5 FOLLOW-UP</strong><strong>DIFFERENCE</strong></div>
          {CONDITIONS.map(c=><div key={c}><small>{c.toUpperCase()}</small><strong>{selected.baselineScores[c]}/3</strong><strong>{summary?summary.latest[c]+'/3':'Pending'}</strong>
            <strong>{summary?(summary.change[c]>=0?'+':'')+summary.change[c]:'—'}</strong></div>)}
        </div>
        {selected.status==='COMPLETE'&&<p className="delayed-result"><CheckCircle2 size={16}/> Re-check completed {display(selected.completedAt??'')} after {selected.elapsedHours?.toFixed(1)} hours. Relevant-note advantage over the best control: {summary?.relevantAdvantageThen} (R4) → {summary?.relevantAdvantageNow} (R5). This comparison is descriptive only.</p>}
        {selected.triples?.map(t=><div className="cross-triple" key={t.taskId}><strong>{t.taskId}</strong><small>Randomized call order: {t.order.join(' → ')}</small>
          <div className="cross-answers">{CONDITIONS.map(c=><div key={c}><span>{c.toUpperCase()}</span><strong className={t.answers[c].correct?'cross-pass':'cross-fail'}>{t.answers[c].correct?'PASS':'FAIL'}</strong><p>{t.answers[c].text||'(empty)'}</p><small>{Math.round(t.answers[c].elapsedMs)} ms</small></div>)}</div></div>)}
      </>}
      <p className="teaching-footer-note"><FlaskConical size={14}/> Delayed assistance is not neural retention. Observations use distinct small public tasks, possibly different model weights despite identical tags, a client-side clock, and an unrelated note rather than a perfectly matched placebo. No background check or automatic notification occurs.</p>
    </section>
  </div>;
}
