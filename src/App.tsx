import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, ArrowUpRight, BookOpen, BrainCircuit, Cable, Check, CheckCircle2, ChevronRight, CircleDot, Clock3, Cpu, Database, Download, ExternalLink, FlaskConical, Github, Info, LayoutDashboard, LockKeyhole, Menu, Play, ShieldCheck, Sparkles, StopCircle, Terminal, Trash2, X, Zap } from 'lucide-react';
import { DEFAULT_BRIDGE, generate, listModels, type BridgeClient } from './bridge';
import { aggregate, grade, LANES, makePrompt, rowsByLane, TASKS, type LaneId, type Phase, type ResultRow } from './experiment';
import { downloadLedger, readLedger, writeLedger } from './storage';
import TeachingStudio from './TeachingStudio';
import SkillVault from './SkillVault';
import RetrievalArena from './RetrievalArena';
import CrossModelLab from './CrossModelLab';
import DelayedLab from './DelayedLab';
import ToolGauntlet from './ToolGauntlet';
import CertificationLab from './CertificationLab';
import SkillPassportLab from './SkillPassportLab';

type Section = 'overview' | 'laboratory' | 'teaching' | 'vault' | 'retrieval' | 'cross' | 'delayed' | 'gauntlet' | 'certification' | 'passport' | 'ledger' | 'protocol';
const NAV: { id: Section; title: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', title: 'Overview', icon: LayoutDashboard },
  { id: 'laboratory', title: 'Learning lab', icon: FlaskConical },
  { id: 'teaching', title: 'Teaching studio', icon: BrainCircuit },
  { id: 'vault', title: 'Skill vault', icon: ShieldCheck },
  { id: 'retrieval', title: 'Retrieval arena', icon: Zap },
  { id: 'cross', title: 'Cross-model lab', icon: BrainCircuit },
  { id: 'delayed', title: 'Delayed re-check', icon: Clock3 },
  { id: 'gauntlet', title: 'Tool-use gauntlet', icon: Terminal },
  { id: 'certification', title: 'Certification audit', icon: ShieldCheck },
  { id: 'passport', title: 'Skill Passport', icon: BookOpen },
  { id: 'ledger', title: 'Evidence ledger', icon: Database },
  { id: 'protocol', title: 'Methodology', icon: BookOpen },
];

function randomRunId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function percent(value: number) { return `${Math.round(value)}%`; }
function roundTime(value: number) { return value ? `${Math.round(value)}ms` : '—'; }

const SAMPLE_PATTERNS: Record<LaneId, number[]> = {
  direct: [1, 1, 0, 1, 0, 1], example: [1, 1, 1, 1, 0, 1],
  structured: [1, 1, 1, 1, 1, 1], reflect: [1, 0, 1, 1, 1, 1],
};

function App() {
  const [section, setSection] = useState<Section>('overview');
  const [navOpen, setNavOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('practice');
  const [lanePreview, setLanePreview] = useState<LaneId>('direct');
  const [ledger, setLedger] = useState<ResultRow[]>(readLedger);
  const [endpoint, setEndpoint] = useState(DEFAULT_BRIDGE);
  const [token, setToken] = useState('');
  const [client, setClient] = useState<BridgeClient | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 24 });
  const [error, setError] = useState('');
  const cancelRef = useRef<AbortController | null>(null);

  const latestRunId = useMemo(() => [...ledger].reverse().find(row => row.phase === phase)?.runId, [ledger, phase]);
  const latestRows = useMemo(() => ledger.filter(row => row.runId === latestRunId && row.phase === phase), [ledger, latestRunId, phase]);
  const metrics = useMemo(() => aggregate(latestRows), [latestRows]);
  const laneStats = useMemo(() => rowsByLane(latestRows), [latestRows]);
  const isSample = latestRows.length > 0 && latestRows.every(row => row.provenance === 'SIMULATED');
  const sampleTask = TASKS.find(task => task.phase === phase)!;
  const modelTitle = latestRows[0]?.model ?? 'No run selected';
  const phaseTasks = TASKS.filter(task => task.phase === phase);
  const allObserved = ledger.filter(row => row.provenance === 'OBSERVED');

  function saveLedger(rows: ResultRow[]) { setLedger(rows); writeLedger(rows); }
  function navigate(id: Section) { setSection(id); setNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  async function connect() {
    const next: BridgeClient = { origin: endpoint.trim().replace(/\/+$/, ''), token: token.trim() };
    if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(next.origin)) {
      setError('For safety, the bridge must use http://127.0.0.1:<port> or localhost.'); return;
    }
    if (!next.token) { setError('Paste the one-time token printed by the local Python bridge.'); return; }
    setConnecting(true); setError('');
    try {
      const response = await listModels(next);
      setModels(response.models);
      setModel(current => response.models.includes(current) ? current : (response.models[0] ?? ''));
      setClient(next);
      setToken(''); // token is held only in React session memory
      if (!response.models.length) setError('Bridge connected, but Ollama has no models installed yet.');
    } catch (e) { setClient(null); setModels([]); setError(e instanceof Error ? e.message : 'Unable to reach the local bridge.'); }
    finally { setConnecting(false); }
  }

  function loadSample() {
    const runId = randomRunId(); const now = new Date().toISOString();
    const rows: ResultRow[] = LANES.flatMap((lane, laneIndex) => phaseTasks.map((task, index) => {
      const correct = SAMPLE_PATTERNS[lane.id][index] === 1;
      return {
        id: `${runId}-${lane.id}-${task.id}`, runId, taskId: task.id,
        lane: lane.id, model: 'Illustrative agent • not measured',
        phase, provenance: 'SIMULATED',
        answer: correct ? task.accepted[0] : 'INCORRECT', correct,
        latencyMs: 420 + laneIndex * 130 + index * 63, at: now,
      };
    }));
    saveLedger([...ledger, ...rows]); setError('');
    navigate('overview');
  }

  async function runComparison() {
    if (!client || !model || busy) return;
    const controller = new AbortController(); cancelRef.current = controller;
    const runId = randomRunId(); const nextRows: ResultRow[] = [];
    const total = LANES.length * phaseTasks.length;
    setProgress({ done: 0, total }); setError(''); setBusy(true);
    try {
      // Each prompt is an independent Ollama call with the same task and no chat history.
      // Rotate lane order per task to mitigate systematic warm-up / order effects.
      for (let index = 0; index < phaseTasks.length; index++) {
        const task = phaseTasks[index];
        const ordered = [...LANES.slice(index % LANES.length), ...LANES.slice(0, index % LANES.length)];
        for (const lane of ordered) {
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const start = performance.now();
          const result = await generate(client, model, makePrompt(task, lane.id), controller.signal);
          const row: ResultRow = {
            id: `${runId}-${lane.id}-${task.id}`, runId, taskId: task.id,
            lane: lane.id, model, phase, provenance: 'OBSERVED',
            answer: result.response.trim(), correct: grade(task, result.response),
            latencyMs: Math.round(result.elapsed_ms || performance.now() - start),
            at: new Date().toISOString(),
          };
          nextRows.push(row);
          setProgress({ done: nextRows.length, total });
        }
      }
    } catch (e) {
      setError(controller.signal.aborted ? 'Run stopped. Completed tasks were saved as a partial run.' : `Run interrupted: ${e instanceof Error ? e.message : 'Unknown error'}. Completed tasks were saved.`);
    } finally {
      if (nextRows.length) saveLedger([...ledger, ...nextRows]);
      setBusy(false); cancelRef.current = null;
      if (nextRows.length) navigate('overview');
    }
  }

  function clearLedger() {
    if (busy || !window.confirm('Delete locally stored PhiLearn results? Export first if you want a copy.')) return;
    saveLedger([]);
  }

  return (
    <div className="app-shell">
      <button className="mobile-menu" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation">{navOpen ? <X size={21}/> : <Menu size={21}/>}</button>
      {navOpen && <div className="mobile-backdrop" onClick={() => setNavOpen(false)}/>}
      <aside className={`sidebar ${navOpen ? 'sidebar-open' : ''}`}>
        <button className="brand" onClick={() => navigate('overview')}>
          <div className="brand-mark"><BrainCircuit size={25} strokeWidth={1.7}/><span className="brand-glow"/></div>
          <span className="brand-text"><strong>Phi<span>Learn</span></strong><small>AGENT LEARNING LAB</small></span>
        </button>
        <div className="sidebar-kicker">WORKSPACE</div>
        <nav aria-label="Main navigation" className="side-nav">
          {NAV.map(link => {
            const Icon = link.icon;
            return <button key={link.id} className={`nav-link ${section === link.id ? 'active' : ''}`} onClick={() => navigate(link.id)}><Icon size={18}/><span>{link.title}</span>{section === link.id && <span className="nav-active-dot"/>}</button>;
          })}
        </nav>
        <div className="sidebar-divider"/>
        <div className="sidebar-kicker">ENVIRONMENT</div>
        <div className="environment-card"><div className="environment-icon"><Cpu size={18}/></div><div><strong>{client ? 'Local Ollama' : 'Preview workspace'}</strong><span>{client ? `${models.length} model${models.length === 1 ? '' : 's'} available` : 'No bridge connected'}</span></div><span className={`tiny-led ${client ? 'live' : ''}`}/></div>
        <div className="sidebar-spacer"/>
        <div className="sidebar-bottom"><div className="principle-icon"><ShieldCheck size={20}/></div><p><strong>LEDGER ABOVE EGO.</strong><br/>Every capability claim needs evidence.</p></div>
        <a className="sidebar-github" href="https://github.com/MichaelWave369/PhiLearn" target="_blank" rel="noreferrer"><Github size={17}/> Open source on GitHub <ArrowUpRight size={15}/></a>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb">LABORATORY <ChevronRight size={13}/> <span>{NAV.find(nav => nav.id === section)?.title}</span></div><div className="topbar-right"><span className="version-pill"><CircleDot size={12}/> R8 • v0.9.0</span><span className={`status-pill ${client ? 'connected' : ''}`}><span className="dot"/>{client ? 'LOCAL CONNECTED' : 'LOCAL FIRST'}</span></div></header>
        <div className="page-content">
          {section === 'overview' && <>
            <section className="hero"><div className="hero-body"><div className="eyebrow"><Sparkles size={14}/> THE ADAPTIVE INTELLIGENCE EXPERIMENT</div><h1>Learning isn’t<br/>one-size-<em>fits-all.</em></h1><p>Different instructions. Same challenges. Measurable outcomes. Discover what actually helps an agent perform, one verified experiment at a time.</p><div className="hero-actions"><button className="button button-primary" onClick={() => navigate('laboratory')}><FlaskConical size={17}/> Open learning lab <ArrowRight size={17}/></button><button className="button button-secondary" onClick={() => navigate('protocol')}>Explore the method <ArrowUpRight size={16}/></button></div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-outer"/><div className="orbit orbit-middle"/><div className="orbit orbit-inner"/><div className="orbit-center"><BrainCircuit size={48} strokeWidth={1.2}/></div><span className="orbit-point point-a"/><span className="orbit-point point-b"/><span className="orbit-point point-c"/><span className="orbit-point point-d"/><div className="art-label label-a">INPUT</div><div className="art-label label-b">FEEDBACK</div><div className="art-label label-c">EVIDENCE</div></div><div className="hero-grid"/></section>
            <div className="section-title-row"><div><div className="mini-kicker">AT A GLANCE</div><h2>Experiment overview</h2></div><div className="phase-switch" role="group" aria-label="Experimental phase"><button className={phase === 'practice' ? 'selected' : ''} onClick={() => setPhase('practice')}>Practice</button><button className={phase === 'holdout' ? 'selected' : ''} onClick={() => setPhase('holdout')}>Holdout</button></div></div>
            <div className="metrics-grid">
              <Metric icon={<Activity size={19}/>} label="Evaluated responses" value={metrics.total ? String(metrics.total) : '—'} detail={metrics.total ? 'Latest comparison' : 'Awaiting first run'} tint="violet" />
              <Metric icon={<CheckCircle2 size={19}/>} label="Average accuracy" value={metrics.total ? percent(metrics.accuracy) : '—'} detail={metrics.total ? `${metrics.correct} / ${metrics.total} correct` : 'No verified score yet'} tint="green"/>
              <Metric icon={<Clock3 size={19}/>} label="Average latency" value={roundTime(metrics.latencyMs)} detail="Per model response" tint="cyan"/>
              <Metric icon={<Database size={19}/>} label="Observed results" value={allObserved.length.toString()} detail="Excludes demo data" tint="amber"/>
            </div>
            <div className="dashboard-grid"><div className="panel performance"><div className="panel-head"><div><div className="mini-kicker">SIDE-BY-SIDE</div><h3>Instruction channel results</h3></div><span className={`data-tag ${isSample ? 'demo' : ''}`}>{isSample ? 'SIMULATED DATA' : latestRows.length ? 'OBSERVED DATA' : 'NO DATA'}</span></div><p className="panel-desc">Same six tasks across each instruction channel. Scores from the latest {phase} comparison.</p><div className="bars">{laneStats.map(stat => <div className="bar-row" key={stat.lane.id}><div className="bar-label"><span className={`legend-dot ${stat.lane.tint}`}/>{stat.lane.name}</div><div className="bar-track"><div className={`bar-fill ${stat.lane.tint}`} style={{ width: `${stat.accuracy}%` }}/></div><strong>{stat.total ? percent(stat.accuracy) : '—'}</strong></div>)}</div><div className="panel-foot"><span>{latestRows.length ? `${modelTitle} • ${new Date(latestRows[0].at).toLocaleDateString()}` : 'No comparisons yet. Your first experiment starts in the lab.'}</span><button className="text-link" onClick={() => navigate('laboratory')}>{latestRows.length ? 'New experiment' : 'Get started'} <ArrowRight size={15}/></button></div></div>
              <div className="panel methodology-short"><div className="panel-head"><div><div className="mini-kicker">THE EXPERIMENT</div><h3>Test. Measure. Verify.</h3></div><span className="round-icon"><Zap size={18}/></span></div><div className="steps"><Step n="01" title="Select a model" copy="Connect local Ollama or explore with clearly labeled sample data."/><Step n="02" title="Compare four channels" copy="Equal tasks, independent prompts, predictable answer formats."/><Step n="03" title="Validate on holdout" copy="See whether results persist on questions outside the practice set."/></div><button className="full-cta" onClick={() => navigate('laboratory')}>Launch an experiment <ArrowUpRight size={17}/></button></div></div>
            {!latestRows.length && <div className="sample-banner"><div className="sample-banner-icon"><Info size={21}/></div><div><strong>Want to explore before connecting a model?</strong><span>Load a fully synthetic comparison to preview the interface. Sample scores are never counted as real evidence.</span></div><button className="button button-outline" onClick={loadSample}>Preview sample data <ArrowRight size={16}/></button></div>}
            <Footer/>
          </>}

          {section === 'laboratory' && <><PageHeading overline="THE EXPERIMENT ENGINE" title="Learning laboratory" description="Compare four instruction strategies on the same tasks. Results are measured per response, not invented personality types."/><div className="lab-grid"><div className="lab-main"><div className="panel lab-panel"><div className="panel-head"><div><div className="mini-kicker">01 / CONFIGURATION</div><h3>Choose your environment</h3></div><span className="round-icon"><Cable size={18}/></span></div><div className="field-heading">DATA SOURCE</div><div className="source-cards"><div className={`source-card ${client ? 'chosen' : ''}`}><div className="source-card-heading"><Terminal size={20}/><strong>Local Ollama</strong>{client && <CheckCircle2 size={16} className="source-check"/>}</div><p>Real model calls, run on your computer through the authenticated loopback bridge.</p></div><button className="source-card" onClick={loadSample}><div className="source-card-heading"><Sparkles size={20}/><strong>Sample preview</strong><ArrowUpRight size={16}/></div><p>Synthetic results to explore the interface. Explicitly not a scientific result.</p></button></div><div className="connection-fields"><label>BRIDGE URL<input value={endpoint} onChange={e => setEndpoint(e.target.value)} disabled={busy || Boolean(client)} spellCheck={false}/></label>{!client && <label>SESSION TOKEN<input type="password" autoComplete="off" placeholder="Paste token from bridge terminal" value={token} onChange={e => setToken(e.target.value)} spellCheck={false}/></label>}<button className={`button ${client ? 'button-outline' : 'button-primary'} connect-button`} disabled={connecting || busy} onClick={client ? () => { setClient(null); setModels([]); setModel(''); } : connect}>{connecting ? 'Connecting…' : client ? 'Disconnect' : 'Connect bridge'} {client ? <X size={15}/> : <ArrowRight size={15}/>}</button></div><p className="helper-text"><LockKeyhole size={14}/> The bridge binds to 127.0.0.1. Session tokens are never saved. <a href="https://github.com/MichaelWave369/PhiLearn#local-ollama-bridge" target="_blank" rel="noreferrer">Setup instructions <ExternalLink size={12}/></a></p><div className="line-divider"/><label className="field-heading" htmlFor="model-select">MODEL</label><select id="model-select" className="model-select" value={model} disabled={!client || busy || !models.length} onChange={e => setModel(e.target.value)}><option value="">{client ? 'No models detected' : 'Connect bridge to select a model'}</option>{models.map(name => <option value={name} key={name}>{name}</option>)}</select></div><div className="panel lab-panel"><div className="panel-head"><div><div className="mini-kicker">02 / STUDY DESIGN</div><h3>Choose the challenge set</h3></div><span className="count-tag">6 TASKS × 4 CHANNELS</span></div><div className="phase-choice"><button className={phase === 'practice' ? 'chosen' : ''} onClick={() => setPhase('practice')} disabled={busy}><div><strong>Practice set</strong><span>Known curriculum, six test tasks</span></div><Check size={18}/></button><button className={phase === 'holdout' ? 'chosen' : ''} onClick={() => setPhase('holdout')} disabled={busy}><div><strong>Holdout set</strong><span>Separate questions for evaluation</span></div><Check size={18}/></button></div><div className="task-list">{phaseTasks.map((task, index) => <div className="task-row" key={task.id}><span className="task-index">{String(index + 1).padStart(2, '0')}</span><strong>{task.title}</strong><span>{task.category}</span></div>)}</div></div></div>
            <div className="lab-side"><div className="panel channel-panel"><div className="panel-head"><div><div className="mini-kicker">03 / METHODS</div><h3>Learning channels</h3></div></div><p className="panel-desc">Four controllable text-only prompt variants. These are not fixed cognitive identities.</p><div className="channel-list">{LANES.map((lane, index) => <button key={lane.id} className={`channel-item ${lanePreview === lane.id ? 'chosen' : ''}`} onClick={() => setLanePreview(lane.id)}><span className={`channel-number ${lane.tint}`}>0{index + 1}</span><span><strong>{lane.name}</strong><small>{lane.subtitle}</small></span><ChevronRight size={16}/></button>)}</div><div className="prompt-peek"><div className="field-heading">LIVE PROMPT PREVIEW</div><pre>{makePrompt(sampleTask, lanePreview)}</pre></div></div><div className="panel run-panel"><div className="mini-kicker">04 / EXECUTION</div><h3>Ready to learn something?</h3><p>Runs 24 independent evaluations and records correctness, latency, task, model, and provenance.</p><div className="run-meter"><div style={{ width: `${busy ? progress.done / progress.total * 100 : 0}%` }}/></div>{busy && <span className="progress-text">{progress.done} of {progress.total} responses evaluated</span>}<button className="button button-primary run-button" disabled={!client || !model || busy} onClick={runComparison}><Play size={17}/> Run comparison <ArrowRight size={16}/></button>{busy && <button className="button button-outline run-button" onClick={() => cancelRef.current?.abort()}><StopCircle size={17}/> Stop and save partial</button>}{!client && <p className="run-hint">Connect Ollama above to run measured tests, or load sample data to explore.</p>}</div></div></div>{error && <div className="error-banner" role="alert"><Info size={17}/>{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}<Footer/></>}

          {section === 'teaching' && <><TeachingStudio client={client} models={models} defaultModel={model} goToConnection={() => navigate('laboratory')}/><Footer/></>}
          {section === 'vault' && <><SkillVault client={client} models={models} goToConnection={() => navigate('laboratory')} goToTeaching={() => navigate('teaching')}/><Footer/></>}
          {section === 'retrieval' && <><RetrievalArena client={client} models={models} defaultModel={model} goToConnection={() => navigate('laboratory')} goToVault={() => navigate('vault')}/><Footer/></>}
          {section === 'cross' && <><CrossModelLab client={client} models={models} goToConnection={() => navigate('laboratory')} goToVault={() => navigate('vault')}/><Footer/></>}
          {section === 'delayed' && <><DelayedLab client={client} models={models} goToConnection={() => navigate('laboratory')} goToCross={() => navigate('cross')}/><Footer/></>}
          {section === 'gauntlet' && <><ToolGauntlet client={client} models={models} defaultModel={model} goToConnection={() => navigate('laboratory')}/><Footer/></>}
          {section === 'certification' && <><CertificationLab models={models} goToGauntlet={() => navigate('gauntlet')}/><Footer/></>}
          {section === 'passport' && <><SkillPassportLab goToCertifications={() => navigate('certification')} goToGauntlet={() => navigate('gauntlet')}/><Footer/></>}
          {section === 'ledger' && <><PageHeading overline="TRANSPARENT BY DESIGN" title="Evidence ledger" description="An auditable local record of what was tested, on which model, by which method, with which result."/><div className="ledger-toolbar"><div><span className="number-big">{ledger.length}</span><span className="ledger-subtitle">responses recorded <span className="ledger-separator">·</span> {allObserved.length} observed</span></div><div className="ledger-actions"><button className="button button-outline" onClick={() => downloadLedger(ledger)} disabled={!ledger.length}><Download size={16}/> Export JSON</button><button className="button button-danger" disabled={!ledger.length || busy} onClick={clearLedger}><Trash2 size={16}/> Clear</button></div></div><div className="panel ledger-panel"><div className="ledger-table-wrap"><table><thead><tr><th>TIME</th><th>MODEL / TASK</th><th>CHANNEL</th><th>PHASE</th><th>RESULT</th><th>PROVENANCE</th></tr></thead><tbody>{[...ledger].reverse().slice(0, 100).map(row => <tr key={row.id}><td className="muted-td">{new Date(row.at).toLocaleString()}</td><td><strong>{row.model}</strong><small>{TASKS.find(task => task.id === row.taskId)?.title ?? row.taskId} • {roundTime(row.latencyMs)}</small></td><td>{LANES.find(lane => lane.id === row.lane)?.name ?? row.lane}</td><td className="muted-td">{row.phase}</td><td><span className={`result-badge ${row.correct ? 'pass' : 'fail'}`}>{row.correct ? 'PASS' : 'FAIL'}</span></td><td><span className={`provenance-badge ${row.provenance === 'SIMULATED' ? 'sample' : ''}`}>{row.provenance}</span></td></tr>)}</tbody></table>{!ledger.length && <div className="empty-state"><Database size={35}/><h3>Nothing to audit yet.</h3><p>Your first comparison will create a local, exportable evidence trail.</p><button className="button button-primary" onClick={() => navigate('laboratory')}>Go to lab <ArrowRight size={16}/></button></div>}</div></div>{ledger.length > 100 && <p className="small-note">Showing the newest 100 of {ledger.length} responses. Export includes all retained rows.</p>}<Footer/></>}

          {section === 'protocol' && <><PageHeading overline="THE RESEARCH CONTRACT" title="Evidence over intuition." description="A practical methodology for checking which instruction formats improve agent task performance, without claiming unsupported fixed learning styles."/><div className="protocol-hero"><div className="protocol-emblem"><ShieldCheck size={35}/></div><div><span>FOUNDATIONAL PRINCIPLE</span><h2>Measure capabilities.<br/><em>Never invent them.</em></h2><p>A model is not a “visual learner” or “kinesthetic learner” because one prompt happened to work. Channels are experimental conditions, not permanent labels.</p></div></div><div className="protocol-grid"><ProtocolCard n="01" title="Comparable conditions" copy="Each model gets the same closed-answer questions across four prompt variants. There is no chat history between tasks; lane order rotates to reduce systematic ordering effects."/><ProtocolCard n="02" title="Separate holdout" copy="Practice and holdout use distinct questions. Keep the holdout separate while exploring strategies, and avoid repeatedly tuning to its scores."/><ProtocolCard n="03" title="Deterministic grading" copy="Expected outputs are pinned in the local task catalog. A strict normalizer handles casing and light formatting; free-form explanations do not count as correct."/><ProtocolCard n="04" title="Provenance enforced" copy="SIMULATED means illustrative sample data. OBSERVED means a model response was collected through the bridge. Neither means neural weights changed or the method caused learning."/><ProtocolCard n="05" title="Privacy boundaries" copy="Your model runs on your Ollama installation. A token-protected, loopback-only bridge forwards only the built-in synthetic benchmark prompts to local Ollama. Results stay in browser storage until you export them."/><ProtocolCard n="06" title="Future research" copy="R1 measures teaching, R2 tests saved procedures, R3 gates retrieval, R4 compares cross-model assistance, R5 checks delayed assistance, R6 records synthetic tool choices, R7 replays bounded evidence and R8 packages these R6/R7 traces for passive cross-system inspection. Imported passports are permanently untrusted and never authorize tools, change models, or affect source ledgers. No neural-weight learning or independent identity authentication is claimed."/></div><div className="method-callout"><Info size={20}/><div><strong>R0 measures prompting performance, not changes in model weights.</strong><p>A single trial on six simple tasks cannot establish general superiority of any method. Treat these measurements as instrumentation and initial hypotheses.</p></div></div><Footer/></>}
        </div>
      </main>
    </div>
  );
}

function Metric({icon,label,value,detail,tint}:{icon:ReactNode;label:string;value:string;detail:string;tint:string}) {return <div className="metric-card"><div className={`metric-icon ${tint}`}>{icon}</div><div className="metric-value">{value}</div><div className="metric-name">{label}</div><div className="metric-detail">{detail}</div></div>}
function Step({n,title,copy}:{n:string;title:string;copy:string}) {return <div className="step"><span>{n}</span><div><h4>{title}</h4><p>{copy}</p></div></div>}
function PageHeading({overline,title,description}:{overline:string;title:string;description:string}) {return <section className="page-heading"><div className="eyebrow"><CircleDot size={13}/>{overline}</div><h1>{title}</h1><p>{description}</p></section>}
function ProtocolCard({n,title,copy}:{n:string;title:string;copy:string}) {return <div className="panel protocol-card"><div className="protocol-index">{n} / 06</div><h3>{title}</h3><p>{copy}</p></div>}
function Footer() {return <footer className="footer"><span><BrainCircuit size={16}/> PhiLearn R8</span><span>BUILT TO QUESTION. DESIGNED TO VERIFY.</span><a href="https://github.com/MichaelWave369/PhiLearn" target="_blank" rel="noreferrer">MIT LICENSE <ArrowUpRight size={13}/></a></footer>}

export default App;
