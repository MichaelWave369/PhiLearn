import {useMemo,useState} from 'react';
import {ArrowRight,Award,BookOpen,CheckCircle2,Download,FileCheck2,FlaskConical,Info,RefreshCw,ShieldCheck,Trash2,XCircle} from 'lucide-react';
import {SCENARIOS,readEpisodes,type Mode} from './toolGauntlet';
import {
  CERT_PROTOCOL,CERT_SCOPE,auditModel,localEvidenceFor,issueCertificate,verifyCertificate,
  readCertificates,saveCertificates,exportCertificateData,
  type Certificate,type SupportingEvidence,
} from './certification';

interface Props {models:string[];goToGauntlet:()=>void}
const formatTime=(s:string)=>new Date(s).toLocaleString();
const short=(s:string)=>s.slice(0,12)+'…';

export default function CertificationLab({models,goToGauntlet}:Props){
  const [episodes,setEpisodes]=useState(readEpisodes);
  const [certificates,setCertificates]=useState<Certificate[]>(readCertificates);
  const [modelInput,setModelInput]=useState('');
  const [mode,setMode]=useState<Mode>('guided');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [checked,setChecked]=useState<Record<string,string>>({});
  const knownModels=useMemo(()=>[...new Set([...models,...episodes.map(e=>e.model),...certificates.map(c=>c.model)])]
    .filter(Boolean).sort(),[models,episodes,certificates]);
  const model=knownModels.includes(modelInput)?modelInput:(knownModels[0]??'');
  const audit=useMemo(()=>auditModel(model,mode,episodes),[model,mode,episodes]);
  const support=useMemo<SupportingEvidence>(()=>localEvidenceFor(model),[model,episodes,certificates]);
  const relevant=certificates.filter(c=>c.model===model&&c.mode===mode);
  const missing=audit.cases.filter(c=>!c.pass);

  function refresh(){
    setEpisodes(readEpisodes());setCertificates(readCertificates());setChecked({});
    setMessage('Evidence reloaded from browser storage. This does not independently verify its origin.');
  }
  async function issue(){
    if(audit.state!=='QUALIFIED'||busy)return;
    setBusy(true);setMessage('');
    try{
      const issued=await issueCertificate(audit,support);
      const next=[...certificates,issued].slice(-80);
      setCertificates(next);saveCertificates(next);
      setChecked({...checked,[issued.id]:'Receipt issued locally; verify against source traces below.'});
      setMessage('A scoped, unsigned local R6 gauntlet receipt was issued. It is not a professional credential or tool authorization.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not issue local report.');}
    finally{setBusy(false);}
  }
  async function verify(certificate:Certificate){
    setBusy(true);
    try{
      const result=await verifyCertificate(certificate,episodes);
      setChecked(prev=>({...prev,[certificate.id]:(result.valid?'PASS: ':'FAIL: ')+result.reason}));
    }catch(error){setChecked(prev=>({...prev,[certificate.id]:'Verification unavailable: '+(error instanceof Error?error.message:'Unknown error')}));}
    finally{setBusy(false);}
  }
  function remove(id:string){
    if(busy||!window.confirm('Delete this browser-local certificate? Original R6 source traces remain unchanged.'))return;
    const next=certificates.filter(c=>c.id!==id);setCertificates(next);saveCertificates(next);
    setMessage('Local certificate deleted. R6 evidence was not changed.');
  }

  return <div className="cert-page">
    <section className="page-heading">
      <div className="eyebrow"><Award size={15}/> R7 / SKILL CERTIFICATION AUDIT</div>
      <h1>Receipts before recognition.</h1>
      <p>Audit a model's real R6 tool-selection traces against the synthetic benchmark. Only six clean, independently replayable scenario results in the same mode qualify for a narrowly scoped local receipt.</p>
    </section>
    <div className="teaching-hero-note"><ShieldCheck size={22}/><div>
      <strong>Not a license. Not a real-world capability certification.</strong>
      <span>Issued receipts are unsigned browser-local attestations of six public synthetic tasks. Neither a SHA-256 digest nor a model label verifies identity, underlying weights, external skill, or safe production access.</span>
    </div></div>
    <div className="metrics-grid teaching-metrics">
      <div className="metric-card"><span className="mini-kicker">REPLAY VERIFIED</span><div className="metric-value">{audit.passed}/{audit.required}</div><div className="metric-detail">{mode} tool-use traces</div></div>
      <div className="metric-card"><span className="mini-kicker">AUDIT STATE</span><div className="metric-value cert-state-number">{audit.state.replaceAll('_',' ')}</div><div className="metric-detail">Latest result per scenario</div></div>
      <div className="metric-card"><span className="mini-kicker">R1 TEACHING</span><div className="metric-value">{support.teachingEpisodes}</div><div className="metric-detail">Observed source-model episodes</div></div>
      <div className="metric-card"><span className="mini-kicker">R2 EVIDENCE</span><div className="metric-value">{support.r2BackedPackets}</div><div className="metric-detail">Evidence-backed model packets</div></div>
    </div>
    <div className="teaching-columns">
      <section className="panel teaching-config">
        <div className="mini-kicker">01 / WHO IS BEING AUDITED?</div><h3>Model-specific certification</h3>
        <p className="panel-desc">Choose a model that has R6 evidence in this browser. The mode is certified separately: guided successes never substitute for bare successes.</p>
        <label className="teaching-label" htmlFor="cert-model">MODEL IDENTITY</label>
        <select className="model-select" id="cert-model" value={model} onChange={e=>setModelInput(e.target.value)} disabled={busy}>
          {!knownModels.length&&<option value="">Run an observed R6 episode first</option>}
          {knownModels.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
        <label className="teaching-label" htmlFor="cert-mode">AUDIT MODE</label>
        <select className="model-select" id="cert-mode" value={mode} onChange={e=>setMode(e.target.value as Mode)} disabled={busy}>
          <option value="guided">Guided evidence-first</option><option value="bare">Bare tool protocol</option>
        </select>
        <div className="cert-scope">
          <div><span className="mini-kicker">SCOPE</span><strong>{CERT_SCOPE}</strong></div>
          <div><span className="mini-kicker">PROTOCOL</span><strong>{CERT_PROTOCOL}</strong></div>
          <div><span className="mini-kicker">RULE</span><strong>6 distinct latest clean PASS traces, validated by deterministic replay</strong></div>
        </div>
        <div className="vault-mini-actions"><button className="text-link" onClick={refresh} disabled={busy}><RefreshCw size={14}/> Refresh local evidence</button>
          <button className="text-link" onClick={goToGauntlet}>Open R6 gauntlet <ArrowRight size={14}/></button></div>
        {!model&&<div className="teaching-empty"><BookOpen size={30}/><strong>No model evidence yet</strong><span>Run all six R6 cases for one model. The R7 audit checks the results without making a new model call.</span></div>}
        {model&&audit.state!=='QUALIFIED'&&<div className="teaching-annotation"><Info size={18}/><p>Not qualified: {missing.length} of six scenario slots are missing, invalid, or failed. A newer failure takes precedence over an older success, so prior wins cannot be cherry-picked.</p></div>}
        <button className="button button-primary teaching-run" disabled={busy||audit.state!=='QUALIFIED'} onClick={issue}>
          <Award size={16}/> Issue scoped local receipt <ArrowRight size={16}/>
        </button>
        <button className="button button-outline teaching-run" disabled={busy||(!episodes.length&&!certificates.length)}
          onClick={()=>exportCertificateData(certificates,audit,support)}><Download size={15}/> Export full audit JSON</button>
        {message&&<p className="vault-message" role="status">{message}</p>}
      </section>
      <section className="panel teaching-preview">
        <div className="mini-kicker">02 / DETERMINISTIC REPLAY</div><h3>The six required checks</h3>
        <p className="panel-desc">The R7 auditor parses the stored raw JSON and reruns every turn against R6's frozen in-browser simulator. It checks the exact reply, accept/reject result, decision, grade, model and mode.</p>
        <div className="cert-cases">
          {audit.cases.map(c=><div key={c.scenarioId} className="cert-case">
            <div>{c.pass?<CheckCircle2 size={18} color="#86e9b4"/>:<XCircle size={18} color="#c4a5a5"/>}
              <strong>{SCENARIOS.find(s=>s.id===c.scenarioId)?.title??c.scenarioId}</strong></div>
            <span className={'vault-state '+(c.pass?'evidence_backed':'inconclusive')}>{c.pass?'REPLAY PASS':c.outcome}</span>
            <small>{c.category} · {c.episodeId??'missing source'}</small>
            <p>{c.reason}</p>
          </div>)}
        </div>
      </section>
    </div>
    <section className="panel teaching-ledger cert-support">
      <div className="mini-kicker">03 / OTHER RESEARCH EVIDENCE</div><h3>Supporting signals, not automatic qualifications</h3>
      <p className="panel-desc">PhiLearn also reports what this model has actually participated in across R1–R5. These heterogeneous experiments cannot substitute for an R6 tool-use pass and are not collapsed into a misleading universal skill score.</p>
      <div className="cert-support-grid">
        <div><span>R1 observed teaching</span><strong>{support.teachingEpisodes}</strong></div>
        <div><span>R2 evidence-backed source notes</span><strong>{support.r2BackedPackets}</strong></div>
        <div><span>R3 retrieved comparison pairs</span><strong>{support.r3RetrievedPairs}</strong></div>
        <div><span>R4 cross-model recipient studies</span><strong>{support.r4TargetComparisons}</strong></div>
        <div><span>R5 complete delayed studies</span><strong>{support.r5CompleteFollowups}</strong></div>
        <div><span>R2 evidence-backed peer-origin notes</span><strong>{support.peerOriginBackedPackets}</strong></div>
      </div>
      <p className="teaching-footer-note"><FlaskConical size={14}/> Positive results in one test protocol do not imply expertise in another. R2 peer-authored notes remain unverified as instructional content, and R5's device-clock timing is not independently attested.</p>
    </section>
    <section className="panel teaching-ledger cert-issued">
      <div className="mini-kicker">04 / LOCAL RECEIPT REGISTER</div>
      <h3>Issued attestations</h3>
      <p className="panel-desc">A certificate freezes the six source receipt IDs and a SHA-256 digest of their evidence. It is not signed. Source records can be deleted or edited in browser storage, and verification may then fail.</p>
      {!relevant.length&&<div className="teaching-empty"><FileCheck2 size={30}/><strong>No local certificates for this model and mode</strong><span>All six latest R6 scenarios must pass trace replay before issuing one.</span></div>}
      {[...relevant].reverse().map(cert=><div className="cert-receipt" key={cert.id}>
        <div className="cert-receipt-head"><div><span className="mini-kicker">SYNTHETIC-ONLY LOCAL ATTESTATION</span><strong>{cert.model} · {cert.mode.toUpperCase()}</strong>
          <small>Issued {formatTime(cert.issuedAt)} · {cert.id}</small></div>
          <span className="vault-state evidence_backed">6 / 6 WHEN ISSUED</span></div>
        <div className="cert-hash"><span>SHA-256 evidence digest</span><code title={cert.evidenceSha256}>{short(cert.evidenceSha256)}</code></div>
        <p>{cert.summary}</p>
        <div className="cert-actions"><button className="button button-outline" disabled={busy} onClick={()=>verify(cert)}><ShieldCheck size={15}/> Re-verify sources</button>
          <button className="button button-danger" disabled={busy} onClick={()=>remove(cert.id)}><Trash2 size={15}/> Delete local receipt</button></div>
        {checked[cert.id]&&<p className="vault-message" role="status">{checked[cert.id]}</p>}
      </div>)}
      <p className="teaching-footer-note">Certification here means passing a bounded synthetic benchmark. The unsigned browser-owned receipt offers no cryptographic authenticity, regulatory approval, real-world access rights, or evidence of model weight updates.</p>
    </section>
  </div>;
}
