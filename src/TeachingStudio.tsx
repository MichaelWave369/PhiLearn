import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, CircleHelp, Download, GraduationCap, Info, Play, ShieldCheck, StopCircle, Trash2, Users } from 'lucide-react';
import { generate, type BridgeClient } from './bridge';
import {
  LESSONS, CURRICULUM, baselinePrompt, coachedPrompt, teacherPrompt, score, verdict,
  readTeachingLedger, saveTeachingLedger, downloadTeachingLedger,
  type Attempt, type Coaching, type Lesson, type TeachingReceipt, type TrialKind,
} from './teaching';

type Props = { client: BridgeClient | null; models: string[]; defaultModel: string; goToConnection: () => void };
type Scope = 'one' | 'all';

function ms(value: number) { return `${Math.round(value).toLocaleString()} ms`; }
function count(rows: TeachingReceipt[], kind: 'baseline' | 'coached') {
  return rows.reduce((n, r) => n + Number(r[kind].correct), 0);
}
const colour: Record<TeachingReceipt['verdict'], string> = {
  IMPROVED: 'improved', REGRESSED: 'regressed',
  UNCHANGED_PASS: 'steady', UNCHANGED_FAIL: 'unresolved',
};

export default function TeachingStudio({ client, models, defaultModel, goToConnection }: Props) {
  const [student, setStudent] = useState(defaultModel);
  const [teacher, setTeacher] = useState('');
  const [coaching, setCoaching] = useState<Coaching>('curated');
  const [lessonId, setLessonId] = useState(LESSONS[0].id);
  const [scope, setScope] = useState<Scope>('one');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [error, setError] = useState('');
  const [receipts, setReceipts] = useState<TeachingReceipt[]>(readTeachingLedger);
  const [expanded, setExpanded] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const lesson = LESSONS.find(item => item.id === lessonId) ?? LESSONS[0];

  useEffect(() => {
    if (!models.includes(student)) setStudent(defaultModel || models[0] || '');
  }, [models, defaultModel, student]);

  const summary = useMemo(() => ({
    n: receipts.length,
    base: count(receipts, 'baseline'),
    coached: count(receipts, 'coached'),
    gains: receipts.filter(r => r.verdict === 'IMPROVED').length,
    losses: receipts.filter(r => r.verdict === 'REGRESSED').length,
  }), [receipts]);

  async function run() {
    if (!client || !student || busy) return;
    const tutor = teacher || student;
    if (coaching === 'peer' && !models.includes(tutor)) { setError('Select a connected teacher model.'); return; }
    const queue = scope === 'one' ? [lesson] : LESSONS;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError('');
    setProgress({ done: 0, total: queue.length });
    try {
      for (let i = 0; i < queue.length; i++) {
        if (controller.signal.aborted) break;
        const item: Lesson = queue[i];
        // A peer teacher gets the worked example but NEVER the held-out task.
        const explanation = coaching === 'peer'
          ? (await generate(client, tutor, teacherPrompt(item), controller.signal)).response.slice(0, 3500).trim()
          : item.verifiedTeaching;
        const conditions: TrialKind[] = Math.random() < 0.5
          ? ['baseline', 'coached'] : ['coached', 'baseline'];
        const answers: Partial<Record<TrialKind, Attempt>> = {};
        for (const condition of conditions) {
          if (controller.signal.aborted) break;
          const prompt = condition === 'baseline'
            ? baselinePrompt(item) : coachedPrompt(item, explanation);
          const response = await generate(client, student, prompt, controller.signal);
          answers[condition] = {
            response: response.response.trim(),
            correct: score(item, response.response),
            elapsedMs: response.elapsed_ms,
          };
        }
        // Never persist half-pairs or describe incomplete work as measured improvement.
        if (controller.signal.aborted || !answers.baseline || !answers.coached) break;
        const receipt: TeachingReceipt = {
          id: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 9)}`,
          at: new Date().toISOString(),
          curriculum: CURRICULUM,
          provenance: 'OBSERVED',
          lessonId: item.id,
          student,
          teacher: coaching === 'peer' ? tutor : null,
          coaching,
          order: conditions,
          explanation,
          baseline: answers.baseline,
          coached: answers.coached,
          verdict: verdict(answers.baseline.correct, answers.coached.correct),
        };
        setReceipts(previous => {
          const next = [...previous, receipt].slice(-120);
          saveTeachingLedger(next);
          return next;
        });
        setProgress({ done: i + 1, total: queue.length });
      }
      if (controller.signal.aborted) setError('Stopped. Only fully completed paired trials were recorded.');
    } catch (e) {
      setError(controller.signal.aborted
        ? 'Stopped. Only fully completed paired trials were recorded.'
        : `Trial interrupted: ${e instanceof Error ? e.message : 'Unknown error'}. Completed pairs were retained.`);
    } finally {
      setBusy(false);
      controllerRef.current = null;
    }
  }

  function clear() {
    if (busy || !window.confirm('Delete locally stored R1 teaching receipts? Export them first if needed.')) return;
    setReceipts([]);
    saveTeachingLedger([]);
    setExpanded(null);
  }

  return (
    <div className="teaching-studio">
      <section className="page-heading">
        <div className="eyebrow"><GraduationCap size={15}/> R1 / THE AGENT CLASSROOM</div>
        <h1>Teaching episodes.</h1>
        <p>Can a demonstrated lesson help another model solve a fresh task? Compare independent baseline and coached prompts, without claiming weight updates or lasting learning.</p>
      </section>
      <div className="teaching-hero-note">
        <ShieldCheck size={23}/>
        <div><strong>A controlled comparison, not a trained neural network.</strong><span>A teacher sees only the worked example. The transfer challenge is withheld. Each condition is a stateless model call, and the order is randomized.</span></div>
      </div>
      <div className="metrics-grid teaching-metrics">
        <div className="metric-card"><span className="mini-kicker">COMPLETE PAIRED TRIALS</span><div className="metric-value">{summary.n}</div><div className="metric-detail">Real Ollama responses only</div></div>
        <div className="metric-card"><span className="mini-kicker">BASELINE CORRECT</span><div className="metric-value">{summary.n ? `${summary.base}/${summary.n}` : '—'}</div><div className="metric-detail">Without a lesson</div></div>
        <div className="metric-card"><span className="mini-kicker">COACHED CORRECT</span><div className="metric-value">{summary.n ? `${summary.coached}/${summary.n}` : '—'}</div><div className="metric-detail">With a lesson</div></div>
        <div className="metric-card"><span className="mini-kicker">PAIRED OUTCOMES</span><div className="metric-value">{summary.gains} <span className="teaching-metric-divider">/</span> {summary.losses}</div><div className="metric-detail">Improved / regressed</div></div>
      </div>
      <div className="teaching-columns">
        <div className="panel teaching-config">
          <div className="mini-kicker">01 / CLASSROOM SETUP</div>
          <h3>Build a teaching episode</h3>
          <p className="panel-desc">Select the learner, choose how the lesson is explained, then run paired transfer checks.</p>
          {!client && <div className="teaching-connect"><Info size={17}/><span>Start and connect the local bridge from the Learning lab. The hosted Pages site cannot run Ollama for you.</span><button className="button button-outline" onClick={goToConnection}>Connect <ArrowRight size={14}/></button></div>}
          <label className="teaching-label" htmlFor="r1-student">LEARNER MODEL</label>
          <select id="r1-student" className="model-select" value={student} disabled={busy || !client} onChange={e => setStudent(e.target.value)}>
            {!models.length && <option value="">Connect Ollama to select a model</option>}
            {models.map(name => <option value={name} key={name}>{name}</option>)}
          </select>
          <div className="teaching-label">TEACHING METHOD</div>
          <div className="teaching-methods">
            <button type="button" disabled={busy} className={coaching === 'curated' ? 'active' : ''} onClick={() => setCoaching('curated')}><BookOpen size={19}/><strong>Curated demonstration</strong><small>Fixed, checked explanation. Reproducible.</small></button>
            <button type="button" disabled={busy} className={coaching === 'peer' ? 'active' : ''} onClick={() => setCoaching('peer')}><Users size={19}/><strong>Agent teaches agent</strong><small>A local tutor generates the explanation.</small></button>
          </div>
          {coaching === 'peer' && <><label htmlFor="r1-teacher" className="teaching-label">PEER TEACHER MODEL</label><select id="r1-teacher" className="model-select" value={teacher || student} disabled={busy || !client} onChange={e => setTeacher(e.target.value)}>{models.map(name => <option key={name} value={name}>{name}</option>)}</select><p className="teaching-muted">Peer explanations are <strong>unverified model-generated text</strong>, even if the transfer answer scores correctly.</p></>}
          <label htmlFor="r1-lesson" className="teaching-label">CURRICULUM MODULE</label>
          <select id="r1-lesson" className="model-select" value={lessonId} disabled={busy} onChange={e => setLessonId(e.target.value)}>{LESSONS.map(item => <option key={item.id} value={item.id}>{item.title} · {item.category}</option>)}</select>
          <div className="teaching-scope"><label><input type="radio" name="teach-scope" checked={scope === 'one'} disabled={busy} onChange={() => setScope('one')}/> This module</label><label><input type="radio" name="teach-scope" checked={scope === 'all'} disabled={busy} onChange={() => setScope('all')}/> Full curriculum ({LESSONS.length})</label></div>
          <div className="teaching-run-info"><span>Study calls</span><strong>{(scope === 'one' ? 1 : LESSONS.length) * (coaching === 'peer' ? 3 : 2)}</strong><small>Model requests, sequential</small></div>
          {busy && <div className="teaching-progress"><span>Completed {progress.done} / {progress.total} pairs</span><div><span style={{ width: `${progress.done / progress.total * 100}%` }}/></div></div>}
          <button className="button button-primary teaching-run" onClick={run} disabled={busy || !client || !student}><Play size={16}/> Run observed teaching trial <ArrowRight size={16}/></button>
          {busy && <button className="button button-outline teaching-run" onClick={() => controllerRef.current?.abort()}><StopCircle size={16}/> Stop after current request</button>}
          {error && <p role="alert" className="teaching-error">{error}</p>}
        </div>
        <div className="panel teaching-preview">
          <div className="mini-kicker">02 / TRANSFER CHALLENGE</div>
          <h3>{lesson.title}</h3>
          <span className="count-tag">{lesson.category}</span>
          <p className="panel-desc">{lesson.concept}</p>
          <div className="teaching-example">
            <span>WORKED EXAMPLE (SHARED WITH TEACHER)</span>
            <p>{lesson.example}</p>
            <strong>Reference: {lesson.exampleAnswer}</strong>
          </div>
          <div className="teaching-transfer">
            <span>EVALUATION / HELD OUT FROM TEACHER</span>
            <p>{lesson.transfer}</p>
          </div>
          <div className="teaching-annotation"><CircleHelp size={18}/><p>Both student conditions answer the exact same evaluation question. The coached condition also receives the example and lesson. The prompt order is randomized to reduce order bias, not eliminate it.</p></div>
        </div>
      </div>
      <div className="panel teaching-ledger">
        <div className="teaching-ledger-head"><div><div className="mini-kicker">03 / EVIDENCE RECEIPTS</div><h3>What actually changed?</h3><p className="panel-desc">All records are browser-local. Explore the raw outputs, tutor explanation, model IDs, and latency for each paired trial.</p></div><div className="ledger-actions"><button className="button button-outline" disabled={!receipts.length} onClick={() => downloadTeachingLedger(receipts)}><Download size={15}/> Export R1</button><button className="button button-danger" disabled={!receipts.length || busy} onClick={clear}><Trash2 size={15}/> Clear R1</button></div></div>
        {!receipts.length && <div className="teaching-empty"><GraduationCap size={32}/><strong>No observed teaching episodes yet.</strong><span>Connect a local model and launch your first paired trial. There are no fabricated scores.</span></div>}
        {[...receipts].reverse().map(receipt => {
          const item = LESSONS.find(l => l.id === receipt.lessonId);
          return <div className="teaching-receipt" key={receipt.id}>
            <button className="teaching-receipt-toggle" onClick={() => setExpanded(expanded === receipt.id ? null : receipt.id)} aria-expanded={expanded === receipt.id}>
              <span className={`teaching-result ${colour[receipt.verdict]}`}>{receipt.verdict.replaceAll('_', ' ')}</span>
              <span className="teaching-receipt-ident"><strong>{item?.title ?? receipt.lessonId}</strong><small>{receipt.student} · {receipt.coaching === 'peer' ? `Peer tutor: ${receipt.teacher}` : 'Curated lesson'} · {new Date(receipt.at).toLocaleString()}</small></span>
              <span className="teaching-scores"><span>{receipt.baseline.correct ? 'PASS' : 'FAIL'}</span><ArrowRight size={14}/><span>{receipt.coached.correct ? 'PASS' : 'FAIL'}</span></span>
            </button>
            {expanded === receipt.id && <div className="teaching-details">
              <p><strong>Provenance:</strong> OBSERVED model outputs · <strong>Curriculum:</strong> {receipt.curriculum} · <strong>Order:</strong> {receipt.order.join(' → ')}</p>
              <p><strong>Teaching note ({receipt.coaching === 'peer' ? 'UNVERIFIED PEER TEXT' : 'CURATED'}):</strong> {receipt.explanation}</p>
              <div className="teaching-answers"><div><strong>Baseline · {ms(receipt.baseline.elapsedMs)}</strong><pre>{receipt.baseline.response || '[empty response]'}</pre></div><div><strong>Coached · {ms(receipt.coached.elapsedMs)}</strong><pre>{receipt.coached.response || '[empty response]'}</pre></div></div>
              <div className="teaching-receipt-note"><CheckCircle2 size={15}/> Scored by strict reference-answer comparison; not a proof of model retraining, persistent memory, or general ability.</div>
            </div>}
          </div>;
        })}
      </div>
      <p className="teaching-footer-note">Methodological limitation: small fixed task bank, no confidence interval, one observed pair per module per run, repeated exposure and prompt-format effects possible. These are in-context teaching comparisons, not evidence of model weight changes or retained skills.</p>
    </div>
  );
}
