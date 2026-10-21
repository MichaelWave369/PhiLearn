import { useMemo, useRef, useState } from 'react';
import { ArrowRight, BrainCircuit, Database, Download, Info, Play, Search, ShieldCheck, StopCircle, Trash2 } from 'lucide-react';
import { generate, type BridgeClient } from './bridge';
import { readVault, packetStatus, type SkillPacket } from './vault';
import { RETRIEVAL_PROTOCOL, TASKS_R3, retrieve, r3Prompt, gradeR3,
  sessionStats, readRetrievalSessions, storeRetrievalSessions, exportRetrievalSessions,
  type Condition, type RetrievalAttempt, type RetrievalReceipt, type RetrievalSession } from './retrieval';

type Props = {
  client: BridgeClient | null; models: string[]; defaultModel: string;
  goToConnection: () => void; goToVault: () => void;
};
type Mode = 'one' | 'all';
export default function RetrievalArena({client,models,defaultModel,goToConnection,goToVault}: Props) {
  const [model,setModel]=useState('');
  const [mode,setMode]=useState<Mode>('one');
  const [taskId,setTaskId]=useState(TASKS_R3[0].id);
  const [packets,setPackets]=useState<SkillPacket[]>(readVault);
  const [sessions,setSessions]=useState<RetrievalSession[]>(readRetrievalSessions);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState({done:0,total:1});
  const [message,setMessage]=useState('');
  const [expanded,setExpanded]=useState<string|null>(null);
  const abortRef=useRef<AbortController|null>(null);
  const activeModel=models.includes(model) ? model : defaultModel || models[0] || '';
  const task=TASKS_R3.find(t=>t.id===taskId) || TASKS_R3[0];
  const preview=retrieve(task.question,activeModel,packets);
  const eligible=packets.filter(p=>p.sourceModel===activeModel && packetStatus(p)==='EVIDENCE_BACKED');
  const latest=sessions[sessions.length-1];
  const totals=useMemo(()=>latest ? sessionStats(latest) : null,[latest]);

  function refreshVault() {
    setPackets(readVault());setMessage('Skill Vault refreshed from local browser storage.');
  }
  async function run() {
    if (!client || busy || !activeModel || !models.includes(activeModel)) return;
    const queue=mode==='one' ? [task] : TASKS_R3;
    const controller=new AbortController();
    abortRef.current=controller;setBusy(true);setMessage('');
    setProgress({done:0,total:queue.length});
    const rows:RetrievalReceipt[]=[];
    try {
      for (const item of queue) {
        if (controller.signal.aborted) break;
        const choice=retrieve(item.question,activeModel,packets);
        const observedBase={id:'retrieval-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),
          at:new Date().toISOString(),protocol:RETRIEVAL_PROTOCOL,provenance:'OBSERVED' as const,
          taskId:item.id,model:activeModel,decision:choice.decision,
          packetId:choice.packet?.id ?? null,packetSourceReceiptId:choice.packet?.sourceReceiptId ?? null,
          matchScore:choice.score,matchMargin:choice.score-choice.secondScore,reason:choice.reason};
        if (choice.decision!=='RETRIEVED' || !choice.packet) {
          rows.push({...observedBase,order:[],bare:null,retrieved:null});
          setProgress({done:rows.length,total:queue.length});
          continue;
        }
        const order:Condition[]=Math.random()<0.5 ? ['bare','retrieved'] : ['retrieved','bare'];
        const attempts:Partial<Record<Condition,RetrievalAttempt>>={};
        for (const condition of order) {
          if (controller.signal.aborted) break;
          const note=condition==='retrieved' ? choice.packet.note : undefined;
          const output=await generate(client,activeModel,r3Prompt(item,note),controller.signal);
          attempts[condition]={text:output.response.trim(),correct:gradeR3(item,output.response),elapsedMs:output.elapsed_ms};
        }
        if (controller.signal.aborted || !attempts.bare || !attempts.retrieved) break;
        rows.push({...observedBase,order,bare:attempts.bare,retrieved:attempts.retrieved});
        setProgress({done:rows.length,total:queue.length});
      }
      if (rows.length) {
        const session:RetrievalSession={id:'s-'+Date.now().toString(36),at:new Date().toISOString(),
          protocol:RETRIEVAL_PROTOCOL,model:activeModel,receipts:rows};
        setSessions(current=>{
          const next=[...current,session].slice(-25);
          storeRetrievalSessions(next);return next;
        });
      }
      setMessage(controller.signal.aborted
        ? 'Stopped. Only completed paired comparisons and deterministic abstentions were saved.'
        : 'Evaluation complete. Inspect the retrieved playbooks and paired results below.');
    } catch(e) {
      if(rows.length) {
        const partial:RetrievalSession={id:'partial-'+Date.now().toString(36),at:new Date().toISOString(),
          protocol:RETRIEVAL_PROTOCOL,model:activeModel,receipts:rows};
        setSessions(current=>{
          const next=[...current,partial].slice(-25);
          storeRetrievalSessions(next);return next;
        });
      }
      setMessage(controller.signal.aborted?'Stopped. Only complete rows retained.'
        :'Bridge error: '+(e instanceof Error ? e.message : 'Unknown failure')+'. Partial pairs discarded.');
    } finally {setBusy(false);abortRef.current=null;}
  }
  function clear() {
    if(busy || !window.confirm('Delete R3 retrieval sessions stored in this browser? Export first if needed.'))return;
    setSessions([]);storeRetrievalSessions([]);setExpanded(null);setMessage('R3 session ledger cleared.');
  }
  return <div className="retrieval-page">
    <section className="page-heading">
      <div className="eyebrow"><Search size={15}/> R3 / SKILL RETRIEVAL ARENA</div>
      <h1>Retrieve. Apply. Prove.</h1>
      <p>A deterministic local router finds an R2 evidence-backed playbook relevant to a new challenge. Then the same learner answers with and without the retrieved note.</p>
    </section>
    <div className="teaching-hero-note"><ShieldCheck size={22}/><div><strong>Evidence-gated retrieval with abstention.</strong>
      <span>Only same-model R2 evidence-backed packets qualify. Unclear matches are rejected; a saved playbook is never assumed correct on new tasks. No tools execute and no model weights change.</span></div></div>
    <div className="metrics-grid teaching-metrics">
      <div className="metric-card"><span className="mini-kicker">ELIGIBLE PACKETS</span><div className="metric-value">{eligible.length}</div><div className="metric-detail">For selected learner</div></div>
      <div className="metric-card"><span className="mini-kicker">LATEST RETRIEVALS</span><div className="metric-value">{totals?.retrieved ?? '—'}</div><div className="metric-detail">Of {totals?.total ?? 0} attempted routes</div></div>
      <div className="metric-card"><span className="mini-kicker">PAIRED GAINS</span><div className="metric-value">{totals?.gains ?? '—'}</div><div className="metric-detail">Failures corrected with a note</div></div>
      <div className="metric-card"><span className="mini-kicker">PAIRED REGRESSIONS</span><div className="metric-value">{totals?.regressions ?? '—'}</div><div className="metric-detail">Baseline passes lost with a note</div></div>
    </div>
    <div className="teaching-columns">
      <section className="panel teaching-config">
        <div className="mini-kicker">01 / ROUTER SETTINGS</div><h3>Choose your learner</h3>
        <p className="panel-desc">An R3 retrieval can use only playbooks whose original R2 learner matches this Ollama model exactly.</p>
        {!client && <div className="teaching-connect"><Info size={17}/><span>Connect your local Ollama bridge in Learning lab.</span><button className="button button-outline" onClick={goToConnection}>Connect <ArrowRight size={14}/></button></div>}
        <label className="teaching-label" htmlFor="r3-model">LEARNER MODEL</label>
        <select id="r3-model" className="model-select" value={activeModel} onChange={e=>setModel(e.target.value)} disabled={!client || busy}>
          {!models.length && <option value="">Connect Ollama first</option>}
          {models.map(item=><option key={item} value={item}>{item}</option>)}
        </select>
        <div className="vault-mini-actions"><button className="text-link" onClick={refreshVault} disabled={busy}>Refresh skill packets <ArrowRight size={14}/></button><button className="text-link" onClick={goToVault}>Open Skill Vault <ArrowRight size={14}/></button></div>
        <div className="line-divider"/>
        <label className="teaching-label" htmlFor="r3-task">CHALLENGE</label>
        <select id="r3-task" className="model-select" value={taskId} onChange={e=>setTaskId(e.target.value)} disabled={busy}>{TASKS_R3.map(t=><option key={t.id} value={t.id}>{t.id}: {t.question.slice(0,59)}</option>)}</select>
        <div className="teaching-scope">
          <label><input type="radio" name="r3-mode" checked={mode==='one'} onChange={()=>setMode('one')} disabled={busy}/> Selected challenge</label>
          <label><input type="radio" name="r3-mode" checked={mode==='all'} onChange={()=>setMode('all')} disabled={busy}/> Full suite ({TASKS_R3.length})</label>
        </div>
        <div className="retrieval-preview">
          <span className="mini-kicker">PREVIEW / NO MODEL CALLS</span>
          <strong>{preview.decision.replaceAll('_',' ')}</strong>
          <p>{preview.reason}</p>
          <small>Score {preview.score}, runner-up {preview.secondScore}; threshold ≥ 4, margin ≥ 2.</small>
          {preview.packet && <div>Packet: <b>{preview.packet.id}</b><small> Original source: {preview.packet.sourceReceiptId}</small></div>}
        </div>
        {mode==='all' && <p className="teaching-muted">Full suite includes two unrelated questions to test abstention. Only successfully routed questions create model calls; up to {TASKS_R3.length * 2} student calls.</p>}
        {busy && <div className="teaching-progress">Processed {progress.done} / {progress.total} tasks<div><span style={{width:(progress.done/progress.total*100)+'%'}}/></div></div>}
        <button className="button button-primary teaching-run" onClick={run} disabled={!client || busy || !activeModel}><Play size={16}/> Run retrieval experiment <ArrowRight size={16}/></button>
        {busy && <button className="button button-outline teaching-run" onClick={()=>abortRef.current?.abort()}><StopCircle size={16}/> Stop and save completed</button>}
        {message && <p className="vault-message" role="status">{message}</p>}
      </section>
      <section className="panel teaching-preview">
        <div className="mini-kicker">02 / ELIGIBILITY & PROVENANCE</div><h3>Evidence before retrieval</h3>
        <p className="panel-desc">A simple frozen keyword router, not an embedding search or a second AI making unverified assertions. The routing code sees only the task text and eligible skill categories, not reference answers.</p>
        {!eligible.length && <div className="teaching-empty"><Database size={31}/><strong>No eligible packets for {activeModel || 'a model'}.</strong><span>Run R1 teaching, capture the explanation in R2, and pass the R2 transfer gate. Then return here.</span></div>}
        {eligible.map(p=><div className="retrieval-eligible" key={p.id}><div><strong>{p.lessonId}</strong><small>{p.origin==='PEER_UNVERIFIED'?'Unverified peer-origin note':'Curated-origin note'}</small></div><span className="vault-state evidence_backed">R2 EVIDENCE-BACKED</span></div>)}
        <div className="teaching-annotation"><Info size={18}/><p>Matching answers on small frozen tasks does not establish genuine learning or broad reliability. Even an evidence-backed packet remains untrusted reference text. On no match, the router abstains instead of inventing a skill.</p></div>
      </section>
    </div>
    <section className="panel teaching-ledger">
      <div className="teaching-ledger-head"><div><div className="mini-kicker">03 / RETRIEVAL LEDGER</div><h3>Independent evidence trail</h3><p className="panel-desc">Records include route decisions, abstentions, selected packet references, both model outputs, pass/fail scores, order, and latency.</p></div>
        <div className="ledger-actions"><button className="button button-outline" disabled={!sessions.length} onClick={()=>exportRetrievalSessions(sessions)}><Download size={15}/> Export R3</button>
          <button className="button button-danger" disabled={!sessions.length || busy} onClick={clear}><Trash2 size={15}/> Clear</button></div></div>
      {!sessions.length && <div className="teaching-empty"><BrainCircuit size={30}/><strong>No retrieval experiments recorded yet.</strong><span>Complete an R2 evidence gate, then try a new task.</span></div>}
      {latest && <><div className="retrieval-session-line"><strong>{latest.model}</strong><span>{new Date(latest.at).toLocaleString()}</span><span>{latest.receipts.length} challenge(s), {totals?.abstained} abstention(s)</span></div>
        {latest.receipts.map(row=>{
          const item=TASKS_R3.find(t=>t.id===row.taskId);
          const open=expanded===row.id;
          return <div className="teaching-receipt" key={row.id}>
            <button className="teaching-receipt-toggle" onClick={()=>setExpanded(open?null:row.id)} aria-expanded={open}>
              <span className={'vault-state '+(row.decision==='RETRIEVED'?'evidence_backed':'inconclusive')}>{row.decision.replaceAll('_',' ')}</span>
              <span className="teaching-receipt-ident"><strong>{item?.id ?? row.taskId}</strong><small>{item?.question ?? ''}</small></span>
              {row.bare&&row.retrieved && <span className="teaching-scores">{row.bare.correct?'PASS':'FAIL'} <ArrowRight size={13}/> {row.retrieved.correct?'PASS':'FAIL'}</span>}
            </button>
            {open && <div className="teaching-details"><p><b>Reason:</b> {row.reason}</p><p><b>Packet:</b> {row.packetId ?? '(abstained)'} · <b>R1 source:</b> {row.packetSourceReceiptId ?? 'none'} · <b>Match score:</b> {row.matchScore}, margin {row.matchMargin}</p>
              <p><b>Request order:</b> {row.order.join(' → ') || '(none)'}</p>
              {row.bare && row.retrieved && <div className="teaching-answers"><div><strong>No note · {Math.round(row.bare.elapsedMs)} ms · {row.bare.correct?'PASS':'FAIL'}</strong><pre>{row.bare.text || '(empty)'}</pre></div>
                <div><strong>Retrieved note · {Math.round(row.retrieved.elapsedMs)} ms · {row.retrieved.correct?'PASS':'FAIL'}</strong><pre>{row.retrieved.text || '(empty)'}</pre></div></div>}
            </div>}
          </div>;
        })}
      </>}
    </section>
    <p className="teaching-footer-note">This R3 protocol tests retrieval-augmented in-context task performance using a small transparent benchmark, not model training, causal proof, autonomous tool use, durable memory, or statistical generalization. All data remains in browser storage unless manually exported.</p>
  </div>;
}
