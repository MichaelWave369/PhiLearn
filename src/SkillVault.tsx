import { useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, BrainCircuit, CheckCircle2, Download, FlaskConical, Info, Play, ShieldCheck, StopCircle, Trash2 } from 'lucide-react';
import { generate, type BridgeClient } from './bridge';
import { readTeachingLedger, LESSONS, type TeachingReceipt } from './teaching';
import {
  VAULT_VERSION, makePacket, readVault, saveVault, exportVault, probesFor,
  packetStatus, probePrompt, scoreProbe, summarizeRun,
  type ProbeAttempt, type ProbePair, type PromptCondition, type SkillPacket, type VaultRun,
} from './vault';

interface Props {
  client: BridgeClient | null;
  models: string[];
  goToConnection: () => void;
  goToTeaching: () => void;
}
function latestStatus(packet: SkillPacket) { return packetStatus(packet).replaceAll('_', ' '); }
function lessonTitle(lessonId: string) { return LESSONS.find(l => l.id === lessonId)?.title ?? lessonId; }

export default function SkillVault({ client, models, goToConnection, goToTeaching }: Props) {
  const [packets, setPackets] = useState<SkillPacket[]>(readVault);
  const [sources, setSources] = useState<TeachingReceipt[]>(readTeachingLedger);
  const [sourceId, setSourceId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 3 });
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const selected = packets.find(p => p.id === selectedId) ?? packets[packets.length - 1];
  const eligible = sources.filter(receipt => receipt.provenance === 'OBSERVED' &&
    typeof receipt.explanation === 'string' && receipt.explanation.trim() &&
    !packets.some(packet => packet.sourceReceiptId === receipt.id));
  const counts = useMemo(() => ({
    total: packets.length,
    backed: packets.filter(p => packetStatus(p) === 'EVIDENCE_BACKED').length,
    tested: packets.filter(p => p.runs.length > 0).length,
    pairs: packets.reduce((n, p) => n + p.runs.reduce((sum, r) => sum + r.pairs.length, 0), 0),
  }), [packets]);

  function persist(next: SkillPacket[]) {
    setPackets(next);
    saveVault(next);
  }
  function refreshSources() {
    setSources(readTeachingLedger());
    setMessage('R1 teaching receipts refreshed.');
  }
  function capture() {
    if (busy) return;
    const receipt = eligible.find(r => r.id === sourceId) ?? eligible[0];
    if (!receipt) { setMessage('Run a real teaching trial in R1 before creating a skill packet.'); return; }
    try {
      const packet = makePacket(receipt);
      persist([...packets, packet].slice(-50));
      setSelectedId(packet.id);
      setSourceId('');
      setMessage('Created an unverified skill candidate. Now test it against new questions.');
    } catch(e) { setMessage(e instanceof Error ? e.message : 'Could not create candidate.'); }
  }

  async function evaluate() {
    if (!client || !selected || busy) return;
    const packet = selected;
    if (!models.includes(packet.sourceModel)) {
      setMessage('The original student model is not available on this Ollama bridge. Use the same model identity for reproducibility.');
      return;
    }
    const checks = probesFor(packet.lessonId);
    if (checks.length !== 3) { setMessage('This lesson does not have the required three probes.'); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setProgress({done:0,total:checks.length});
    setMessage('');
    const pairs: ProbePair[] = [];
    try {
      for (const probe of checks) {
        if (controller.signal.aborted) break;
        const order: PromptCondition[] = Math.random() < 0.5
          ? ['unassisted', 'assisted'] : ['assisted', 'unassisted'];
        const attempts: Partial<Record<PromptCondition, ProbeAttempt>> = {};
        for (const condition of order) {
          if (controller.signal.aborted) break;
          const note = condition === 'assisted' ? packet.note : undefined;
          const output = await generate(client, packet.sourceModel, probePrompt(probe, note), controller.signal);
          attempts[condition] = {text:output.response.trim(),
            correct:scoreProbe(probe,output.response),elapsedMs:output.elapsed_ms};
        }
        if (controller.signal.aborted || !attempts.unassisted || !attempts.assisted) break;
        pairs.push({probeId:probe.id,order,unassisted:attempts.unassisted,assisted:attempts.assisted});
        setProgress({done:pairs.length,total:checks.length});
      }
      if (pairs.length === checks.length && !controller.signal.aborted) {
        const run: VaultRun = {
          id:'r2-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8),
          at:new Date().toISOString(),model:packet.sourceModel,protocol:VAULT_VERSION,pairs,
        };
        setPackets(current => {
          // Immutable receipt: append a completed run, preserving all prior runs.
          const next = current.map(p => p.id === packet.id
            ? {...p,runs:[...p.runs,run].slice(-12)} : p);
          saveVault(next);
          return next;
        });
        setMessage('Complete: three paired checks were saved as observed responses. Review the results below.');
      } else {
        setMessage('Stopped: incomplete evaluations are discarded; earlier completed vault runs are kept.');
      }
    } catch(e) {
      setMessage(controller.signal.aborted
        ? 'Stopped: incomplete evaluations discarded.'
        : 'Bridge error: ' + (e instanceof Error ? e.message : 'Unknown error') + '. Incomplete evaluation discarded.');
    } finally { abortRef.current = null; setBusy(false); }
  }

  function removeSelected() {
    if (busy || !selected || !window.confirm('Delete this candidate and its locally stored evaluation receipts?')) return;
    const next = packets.filter(p => p.id !== selected.id);
    persist(next);
    setSelectedId(next[next.length - 1]?.id ?? null);
    setMessage('Packet removed from this browser.');
  }
  const run = selected?.runs[selected.runs.length - 1];
  const summary = run && summarizeRun(run);
  const status = selected ? packetStatus(selected) : 'CANDIDATE';

  return <div className="vault-page">
    <section className="page-heading">
      <div className="eyebrow"><BrainCircuit size={15}/> R2 / THE SKILL VAULT</div>
      <h1>Save the method.<br/>Test the transfer.</h1>
      <p>Carry teaching notes forward as inspectable playbooks. Independently evaluate whether they help the same model on new questions before granting an evidence-backed label.</p>
    </section>
    <div className="teaching-hero-note"><ShieldCheck size={23}/><div>
      <strong>Persistent playbooks, not persistent neural learning.</strong>
      <span>R2 stores candidate instructions and observed tests in this browser. It never changes model weights, retrains Ollama, or proves durable internal skill acquisition.</span>
    </div></div>
    <div className="metrics-grid teaching-metrics">
      <div className="metric-card"><span className="mini-kicker">SAVED PACKETS</span><div className="metric-value">{counts.total}</div><div className="metric-detail">Browser-local playbooks</div></div>
      <div className="metric-card"><span className="mini-kicker">EVIDENCE-BACKED</span><div className="metric-value">{counts.backed}</div><div className="metric-detail">Passed this narrow R2 protocol</div></div>
      <div className="metric-card"><span className="mini-kicker">EVALUATED</span><div className="metric-value">{counts.tested}</div><div className="metric-detail">Packets with complete runs</div></div>
      <div className="metric-card"><span className="mini-kicker">PAIRED PROBES</span><div className="metric-value">{counts.pairs}</div><div className="metric-detail">Stored real answer pairs</div></div>
    </div>
    <div className="teaching-columns vault-columns">
      <div className="panel teaching-config">
        <div className="mini-kicker">01 / CAPTURE FROM R1</div><h3>Candidate playbooks</h3>
        <p className="panel-desc">Import a real R1 teaching receipt from this browser. A tutor's text starts as unverified, regardless of its confidence.</p>
        <div className="vault-source-row">
          <select className="model-select" aria-label="Observed R1 teaching receipt" value={sourceId && eligible.some(r => r.id === sourceId) ? sourceId : (eligible[0]?.id ?? '')} onChange={e => setSourceId(e.target.value)} disabled={!eligible.length || busy}>
            {!eligible.length && <option value="">No unused observed teaching receipts</option>}
            {eligible.map(r => <option key={r.id} value={r.id}>{lessonTitle(r.lessonId)} · {r.student} · {r.coaching} · {new Date(r.at).toLocaleString()}</option>)}
          </select>
          <button className="button button-primary" onClick={capture} disabled={!eligible.length || busy}><BookOpen size={15}/> Save note</button>
        </div>
        <div className="vault-mini-actions">
          <button className="text-link" onClick={refreshSources}>Refresh R1 receipts <ArrowRight size={14}/></button>
          <button className="text-link" onClick={goToTeaching}>Open R1 classroom <ArrowRight size={14}/></button>
        </div>
        <div className="line-divider"/>
        <div className="mini-kicker">02 / SELECT A SKILL</div>
        {!packets.length && <div className="teaching-empty"><BookOpen size={30}/><strong>No skill packets yet</strong><span>Run a real R1 lesson first, then save one of its teaching notes here.</span></div>}
        <div className="vault-packet-list">
          {[...packets].reverse().map(packet =>
            <button key={packet.id} type="button" className={'vault-packet ' + (selected?.id === packet.id ? 'active' : '')}
              onClick={() => {setSelectedId(packet.id);setMessage('');}} disabled={busy}>
              <strong>{lessonTitle(packet.lessonId)}</strong><small>{packet.sourceModel} · {packet.origin === 'CURATED' ? 'Curated' : 'Peer / unverified'}</small>
              <span className={'vault-state ' + packetStatus(packet).toLowerCase()}>{latestStatus(packet)}</span>
            </button>)}
        </div>
      </div>
      <div className="panel teaching-preview">
        <div className="mini-kicker">03 / INDEPENDENT TRANSFER</div>
        <h3>{selected ? lessonTitle(selected.lessonId) : 'Select a skill packet'}</h3>
        {selected ? <>
          <p className="panel-desc">Source: R1 receipt {selected.sourceReceiptId} · Student {selected.sourceModel} · {selected.origin === 'PEER_UNVERIFIED' ? 'UNVERIFIED peer lesson' : 'Curated teaching text'}</p>
          <div className="teaching-example"><span>SAVED PROCEDURAL NOTE / UNTRUSTED UNTIL TESTED</span><p>{selected.note}</p></div>
          <div className="vault-test-count">
            <FlaskConical size={19}/><span>3 previously unused R2 transfer questions, each attempted without and with the saved note. Request order is randomized; each request has no shared chat history.</span>
          </div>
          {!client && <div className="teaching-connect"><Info size={17}/><span>Connect local Ollama in the Learning lab first.</span><button className="button button-outline" onClick={goToConnection}>Connect <ArrowRight size={13}/></button></div>}
          {client && !models.includes(selected.sourceModel) && <p className="teaching-error">Original learner {selected.sourceModel} is not available on this bridge.</p>}
          {busy && <div className="teaching-progress">Completed {progress.done} / {progress.total} probe pairs<div><span style={{width:(progress.done / progress.total * 100) + '%'}}/></div></div>}
          <button className="button button-primary teaching-run" onClick={evaluate} disabled={!client || busy || !models.includes(selected.sourceModel)}><Play size={16}/> Run three transfer probes <ArrowRight size={16}/></button>
          {busy && <button className="button button-outline teaching-run" onClick={() => abortRef.current?.abort()}><StopCircle size={16}/> Stop (discard incomplete)</button>}
          <div className="vault-buttons"><button className="button button-outline" onClick={() => exportVault(packets)} disabled={busy}><Download size={15}/> Export vault JSON</button><button className="button button-danger" onClick={removeSelected} disabled={busy}><Trash2 size={15}/> Delete packet</button></div>
        </> : <p className="panel-desc">Create a candidate from an R1 observed result to unlock evaluation.</p>}
      </div>
    </div>
    {message && <p className="vault-message" role="status">{message}</p>}
    {selected && <div className="panel teaching-ledger vault-evidence">
      <div className="mini-kicker">04 / AUDITABLE EVIDENCE</div>
      <h3>{lessonTitle(selected.lessonId)} <span className={'vault-state ' + status.toLowerCase()}>{latestStatus(selected)}</span></h3>
      {!run ? <p className="panel-desc">No independent R2 trials have run for this candidate yet. The note has not earned an evidence-backed designation.</p> :
        <>
          <p className="panel-desc">Last complete run: {new Date(run.at).toLocaleString()} · {run.model} · {run.protocol} · {selected.runs.length} recorded run(s)</p>
          <div className="vault-outcome-row"><span>Unassisted correct <strong>{summary?.unassisted}/3</strong></span><span>With saved note <strong>{summary?.assisted}/3</strong></span><span>Improvements <strong>{summary?.improvements}</strong></span><span>Regressions <strong>{summary?.regressions}</strong></span></div>
          <div className="vault-probes">
            {run.pairs.map(pair => <div className="vault-probe" key={pair.probeId}>
              <div><strong>{pair.probeId}</strong><small>Order: {pair.order.join(' → ')}</small></div>
              <div className="vault-answers"><div><small>NO NOTE · {Math.round(pair.unassisted.elapsedMs)} ms</small><span>{pair.unassisted.text || '(empty)'}</span><strong>{pair.unassisted.correct ? 'PASS' : 'FAIL'}</strong></div>
                <div><small>WITH NOTE · {Math.round(pair.assisted.elapsedMs)} ms</small><span>{pair.assisted.text || '(empty)'}</span><strong>{pair.assisted.correct ? 'PASS' : 'FAIL'}</strong></div></div>
            </div>)}
          </div>
        </>
      }
      <p className="teaching-footer-note"><CheckCircle2 size={14}/> EVIDENCE_BACKED requires all three note-assisted answers correct, at least one improvement over baseline, and no regressions in this particular run. NO_LIFT means both conditions were already correct. Results are small-sample, susceptible to repeated exposure, and not proof of persistent model learning.</p>
    </div>}
  </div>;
}
