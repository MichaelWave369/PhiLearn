import {useMemo,useRef,useState} from 'react';
import {ArrowRight,BookOpen,CheckCircle2,Download,FlaskConical,Info,Play,ShieldCheck,StopCircle,Terminal,Trash2} from 'lucide-react';
import {generate,type BridgeClient} from './bridge';
import {GAUNTLET_VERSION,MAX_TURNS,SCENARIOS,blankState,parseAction,applyAction,outcome,instructions,
  readEpisodes,storeEpisodes,exportEpisodes,summarizeEpisodes,
  type Mode,type ToolEpisode,type ToolStep} from './toolGauntlet';

type Props={client:BridgeClient|null;models:string[];defaultModel:string;goToConnection:()=>void};
const display=(date:string)=>new Date(date).toLocaleString();
export default function ToolGauntlet({client,models,defaultModel,goToConnection}:Props){
  const [chosenModel,setChosenModel]=useState('');
  const [selectedId,setSelectedId]=useState(SCENARIOS[0].id);
  const [scope,setScope]=useState<'single'|'all'>('single');
  const [episodes,setEpisodes]=useState<ToolEpisode[]>(readEpisodes);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState({done:0,total:2});
  const [message,setMessage]=useState('');
  const [expanded,setExpanded]=useState<string|null>(null);
  const abort=useRef<AbortController|null>(null);
  const selected=SCENARIOS.find(s=>s.id===selectedId)??SCENARIOS[0];
  const model=models.includes(chosenModel)?chosenModel:(defaultModel||models[0]||'');
  const latest=useMemo(()=>[...episodes].slice(-2),[episodes]);
  const stats=useMemo(()=>summarizeEpisodes(episodes),[episodes]);

  async function run(){
    if(!client||!models.includes(model)||busy)return;
    const controller=new AbortController();abort.current=controller;
    setBusy(true);setMessage('');
    const queue=scope==='single'?[selected]:SCENARIOS;
    setProgress({done:0,total:queue.length*2});
    let finishedCount=0;
    try{
      for(const scenario of queue){
        if(controller.signal.aborted)break;
        const order:Mode[]=Math.random()<.5?['bare','guided']:['guided','bare'];
        for(const mode of order){
          if(controller.signal.aborted)break;
          let state=blankState();
          const steps:ToolStep[]=[];
          let interrupted=false;
          for(let turn=1;turn<=MAX_TURNS;turn++){
            if(controller.signal.aborted){interrupted=true;break;}
            try{
              // The only outside request is local model text generation. Tool outputs are fabricated by pure TS.
              const output=await generate(client,model,instructions(scenario,mode,steps),controller.signal);
              if(controller.signal.aborted){interrupted=true;break;}
              const parsed=parseAction(output.response.trim());
              const result=applyAction(scenario,state,parsed);
              state=result.state;
              steps.push({turn,raw:output.response,parsed,
                accepted:result.accepted,reply:result.reply,latencyMs:output.elapsed_ms});
              if(state.finished)break;
            }catch(error){
              if(controller.signal.aborted){interrupted=true;break;}
              setMessage('Model bridge interrupted: '+(error instanceof Error?error.message:'Unknown response')+'. Completed trials retained.');
              interrupted=true;break;
            }
          }
          if(interrupted)break;
          if(steps.length){
            const episode:ToolEpisode={
              id:'gauntlet-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),
              at:new Date().toISOString(),protocol:GAUNTLET_VERSION,provenance:'OBSERVED',
              scenarioId:scenario.id,model,mode,steps,outcome:outcome(scenario,state),decision:state.decision,
            };
            setEpisodes(previous=>{
              const next=[...previous,episode].slice(-160);
              storeEpisodes(next);return next;
            });
          }
          finishedCount++;
          setProgress({done:finishedCount,total:queue.length*2});
        }
        if(controller.signal.aborted)break;
      }
      if(!controller.signal.aborted){
        setMessage('Evaluation finished. Compare bare and guided traces below. Every inspection was synthetic and read-only.');
      }else setMessage('Stopped. Only fully evaluated episodes were retained.');
    }finally{
      abort.current=null;setBusy(false);
    }
  }
  function clear(){
    if(busy||!window.confirm('Delete the R6 browser-local tool-use ledger? Export first if you need it.'))return;
    setEpisodes([]);storeEpisodes([]);setExpanded(null);setMessage('R6 ledger cleared.');
  }

  return <div className="gauntlet-page">
    <section className="page-heading">
      <div className="eyebrow"><Terminal size={15}/> R6 / DETERMINISTIC TOOL GAUNTLET</div>
      <h1>Act on evidence.<br/>Not confidence.</h1>
      <p>Give a local AI an unfamiliar simulated task. It must choose allowed inspection tools, interpret synthetic evidence, and submit a bounded decision. We audit every action, including prohibited attempts.</p>
    </section>
    <div className="teaching-hero-note"><ShieldCheck size={22}/><div>
      <strong>Sandbox boundary: all tool results and decisions are synthetic.</strong>
      <span>No real system inspections, GitHub actions, accounts, secrets, deployments, filesystem operations, network scans, or shell commands. Only an Ollama text-response endpoint is invoked.</span>
    </div></div>
    <div className="metrics-grid teaching-metrics">
      <div className="metric-card"><span className="mini-kicker">OBSERVED EPISODES</span><div className="metric-value">{stats.total}</div><div className="metric-detail">Local AI responses</div></div>
      <div className="metric-card"><span className="mini-kicker">CLEAN PASSES</span><div className="metric-value">{stats.passed}</div><div className="metric-detail">Correct, no policy violations</div></div>
      <div className="metric-card"><span className="mini-kicker">POLICY VIOLATIONS</span><div className="metric-value">{stats.violations}</div><div className="metric-detail">Unpermitted or malformed calls</div></div>
      <div className="metric-card"><span className="mini-kicker">DECISION FAILURES</span><div className="metric-value">{stats.failed+stats.incomplete}</div><div className="metric-detail">Incorrect or incomplete</div></div>
    </div>
    <div className="teaching-columns">
      <section className="panel teaching-config">
        <div className="mini-kicker">01 / SIMULATION CONFIG</div><h3>Select the actor</h3>
        <p className="panel-desc">Two independently initialized episodes are run against the same synthetic task: bare instructions versus general evidence-first guidance.</p>
        {!client&&<div className="teaching-connect"><Info size={17}/><span>Start the authenticated localhost Ollama bridge from the Learning lab.</span><button className="button button-outline" onClick={goToConnection}>Connect <ArrowRight size={14}/></button></div>}
        <label className="teaching-label" htmlFor="r6-model">LOCAL OLLAMA MODEL</label>
        <select id="r6-model" className="model-select" value={model} onChange={e=>setChosenModel(e.target.value)} disabled={!client||busy}>
          {!models.length&&<option value="">Connect local Ollama first</option>}
          {models.map(item=><option key={item} value={item}>{item}</option>)}
        </select>
        <label className="teaching-label" htmlFor="r6-case">GAUNTLET SCENARIO</label>
        <select id="r6-case" className="model-select" value={selectedId} disabled={busy}
          onChange={e=>setSelectedId(e.target.value)}>
          {SCENARIOS.map(s=><option value={s.id} key={s.id}>{s.title} · {s.category}</option>)}
        </select>
        <div className="teaching-scope">
          <label><input type="radio" checked={scope==='single'} name="r6-scope" onChange={()=>setScope('single')} disabled={busy}/> Selected scenario</label>
          <label><input type="radio" checked={scope==='all'} name="r6-scope" onChange={()=>setScope('all')} disabled={busy}/> All six scenarios</label>
        </div>
        <div className="gauntlet-count"><span>Episode pairs:</span> <strong>{scope==='single'?2:12}</strong>
          <small>Maximum {MAX_TURNS} calls per episode</small></div>
        {busy&&<div className="teaching-progress">Completed {progress.done}/{progress.total} episodes<div><span style={{width:progress.done/progress.total*100+'%'}}/></div></div>}
        <button className="button button-primary teaching-run" disabled={!client||!models.includes(model)||busy} onClick={run}><Play size={16}/> Run tool-use comparison <ArrowRight size={16}/></button>
        {busy&&<button className="button button-outline teaching-run" onClick={()=>abort.current?.abort()}><StopCircle size={16}/> Stop and keep completed</button>}
        {message&&<p role="status" className="vault-message">{message}</p>}
      </section>
      <section className="panel teaching-preview">
        <div className="mini-kicker">02 / SIMULATED ENVIRONMENT</div><h3>{selected.title}</h3>
        <span className="count-tag">{selected.category}</span>
        <p className="panel-desc">{selected.brief}</p>
        <div className="gauntlet-tools">
          <div className="mini-kicker">ALLOWED INSPECTIONS</div>
          {selected.evidence.map(t=><div key={t}><Terminal size={14}/><code>{t}</code><span>synthetic / read-only</span></div>)}
        </div>
        <div className="teaching-annotation"><BookOpen size={18}/><p>The agent is allowed to submit a simulated decision only after requesting both permitted inspections. Early decisions, unrelated tools, arbitrary shell commands, and invalid JSON are recorded as policy violations. Even a correct final answer cannot erase them.</p></div>
        <div className="cross-conditions">
          <div><span>CONTROL</span><strong>Bare tool descriptions</strong><p>The model sees the task and strict JSON tool schema, without additional procedural guidance.</p></div>
          <div><span>TEST</span><strong>Evidence-first guidance</strong><p>The model receives the same task and tool schema plus a generic checklist. Its action choices remain its own.</p></div>
        </div>
      </section>
    </div>
    <section className="panel teaching-ledger gauntlet-ledger">
      <div className="teaching-ledger-head">
        <div><div className="mini-kicker">03 / TOOL TRACE LEDGER</div><h3>What the model actually attempted</h3>
          <p className="panel-desc">Observed local model JSON, simulated tool replies, rejection reasons and final grade. Completed episodes only, never invented success rates.</p></div>
        <div className="ledger-actions"><button className="button button-outline" disabled={!episodes.length} onClick={()=>exportEpisodes(episodes)}><Download size={15}/> Export R6</button>
          <button className="button button-danger" disabled={!episodes.length||busy} onClick={clear}><Trash2 size={15}/> Clear</button></div>
      </div>
      {!episodes.length&&<div className="teaching-empty"><FlaskConical size={30}/><strong>No observed tool-use trials yet.</strong><span>Connect a local model and run a deterministic simulation to create auditable action traces.</span></div>}
      {[...episodes].reverse().slice(0,30).map(episode=>{
        const caseTitle=SCENARIOS.find(s=>s.id===episode.scenarioId)?.title??episode.scenarioId;
        const open=expanded===episode.id;
        return <div key={episode.id} className="teaching-receipt">
          <button onClick={()=>setExpanded(open?null:episode.id)} aria-expanded={open} className="teaching-receipt-toggle">
            <span className={'vault-state '+(episode.outcome==='PASS'?'evidence_backed':episode.outcome==='POLICY_VIOLATION'?'regressed':'inconclusive')}>{episode.outcome.replaceAll('_',' ')}</span>
            <span className="teaching-receipt-ident"><strong>{caseTitle} · {episode.mode.toUpperCase()}</strong><small>{episode.model} · {episode.steps.length} attempted actions · {display(episode.at)}</small></span>
            <span className="gauntlet-decision">{episode.decision??'NO FINAL DECISION'}</span>
          </button>
          {open&&<div className="teaching-details">
            <p><strong>Provenance:</strong> OBSERVED Ollama output; tool observations SIMULATED. Protocol {episode.protocol}.</p>
            {episode.steps.map(step=><div key={step.turn} className="gauntlet-step">
              <div className="gauntlet-step-head"><strong>Turn {step.turn}</strong>
                <span className={'vault-state '+(step.accepted?'evidence_backed':'regressed')}>{step.accepted?'ALLOWED':'REJECTED'}</span>
                <small>{Math.round(step.latencyMs)} ms</small></div>
              <span>MODEL REQUEST</span><pre>{step.raw||'(empty)'}</pre>
              <span>SANDBOX RESULT</span><pre>{step.reply}</pre>
            </div>)}
          </div>}
        </div>;
      })}
      {episodes.length>30&&<p className="teaching-footer-note">Showing 30 most recent of {episodes.length} episodes. Export contains all retained runs.</p>}
      {latest.length===2&&latest[0].scenarioId===latest[1].scenarioId&&<p className="gauntlet-pair">
        <CheckCircle2 size={15}/> Most recent paired comparison: {latest.map(e=>e.mode+': '+e.outcome).join(' · ')}
      </p>}
      <p className="teaching-footer-note">R6 measures bounded JSON tool-selection and evidence-based decision behavior inside a fake environment. It is not real-world tool execution, environment training, reinforcement learning, model fine-tuning, persistent memory, or general capability validation. Fixed public tasks and up to five turns per condition have substantial methodological limits.</p>
    </section>
  </div>;
}
