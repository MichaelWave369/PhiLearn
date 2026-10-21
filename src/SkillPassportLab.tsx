import {useMemo,useRef,useState} from 'react';
import {ArrowRight,BookOpen,CheckCircle2,Download,FileCheck2,FileJson,Info,LockKeyhole,RefreshCw,ShieldCheck,Trash2,Upload,XCircle} from 'lucide-react';
import {readEpisodes,SCENARIOS,type ToolEpisode} from './toolGauntlet';
import {readCertificates,type Certificate,replayEpisode} from './certification';
import {
  PASSPORT_FORMAT,PASSPORT_MAX_BYTES,createPassport,downloadPassport,
  parsePassportJson,checkPassport,addToQuarantine,
  readQuarantine,saveQuarantine,
  type QuarantinedPassport,
} from './skillPassport';

type Props={goToCertifications:()=>void;goToGauntlet:()=>void};
const display=(s:string)=>new Date(s).toLocaleString();
const short=(s:string)=>s.length>19?s.slice(0,16)+'…':s;
export default function SkillPassportLab({goToCertifications,goToGauntlet}:Props){
  const [certificates,setCertificates]=useState<Certificate[]>(readCertificates);
  const [episodes,setEpisodes]=useState<ToolEpisode[]>(readEpisodes);
  const [items,setItems]=useState<QuarantinedPassport[]>(readQuarantine);
  const [chosen,setChosen]=useState('');
  const [selected,setSelected]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const fileRef=useRef<HTMLInputElement|null>(null);
  const candidate=certificates.find(c=>c.id===chosen)??certificates[certificates.length-1];
  const selectedItem=items.find(p=>p.id===selected)??items[items.length-1];
  const validCount=useMemo(()=>items.filter(x=>x.check==='REPLAY_PASS_UNTRUSTED').length,[items]);

  function persist(rows:QuarantinedPassport[]){
    setItems(rows);saveQuarantine(rows);
  }
  function refresh(){
    setCertificates(readCertificates());setEpisodes(readEpisodes());setItems(readQuarantine());
    setMessage('Reloaded local receipts and quarantined passports. Imported evidence is never merged into your R6/R7 ledgers.');
  }
  async function exportLocal(){
    if(!candidate||busy)return;
    setBusy(true);setMessage('');
    try{
      const passport=await createPassport(candidate,episodes);
      downloadPassport(passport);
      setMessage('Exported a self-contained passport with six synthetic tool traces. Its checksum does not authenticate the claimed issuer.');
    }catch(e){
      setMessage('Could not export: '+(e instanceof Error?e.message:'Unrecognized error'));
    }finally{setBusy(false);}
  }
  async function importFile(file:File){
    if(busy)return;
    setBusy(true);setMessage('');
    try{
      if(file.size>PASSPORT_MAX_BYTES)throw Error('File exceeds 256 KB import limit.');
      const parsed=await parsePassportJson(await file.text());
      const checked=await checkPassport(parsed);
      const next=addToQuarantine(items,parsed,checked);
      persist(next);setSelected(parsed.payloadSha256);
      setMessage(checked.valid?
        'Imported into isolation: all six bundled synthetic traces replay. Provenance remains UNTRUSTED; no permissions were granted.'
        :'Imported into isolation with REPLAY FAILURE. It cannot be used as a verified record.');
    }catch(e){
      setMessage('Import rejected: '+(e instanceof Error?e.message:'Unknown input error'));
    }finally{
      if(fileRef.current)fileRef.current.value='';
      setBusy(false);
    }
  }
  async function recheck(item:QuarantinedPassport){
    if(busy)return;
    setBusy(true);
    try{
      const checked=await checkPassport(item.passport);
      persist(items.map(x=>x.id===item.id?{...x,checkedAt:new Date().toISOString(),
        check:checked.status,reason:checked.reason,reviewedLocally:false}:x));
      setMessage(checked.valid?
        'Independent local deterministic replay passed. Origin and identity are still unauthenticated.'
        :'Re-check failed. The imported evidence must not be treated as trustworthy.');
    }catch(e){setMessage('Re-check unavailable: '+(e instanceof Error?e.message:'Unknown error'));}
    finally{setBusy(false);}
  }
  function reviewed(item:QuarantinedPassport){
    if(busy||item.check!=='REPLAY_PASS_UNTRUSTED')return;
    persist(items.map(x=>x.id===item.id?{...x,reviewedLocally:!x.reviewedLocally}:x));
    setMessage('Manual review noted locally. This marker is NOT a trust grant, credential, or permission.');
  }
  function remove(item:QuarantinedPassport){
    if(busy||!window.confirm('Delete the isolated imported passport? No source R6/R7 evidence will be changed.'))return;
    const next=items.filter(x=>x.id!==item.id);
    persist(next);setSelected(next[next.length-1]?.id??'');
    setMessage('Imported passport deleted from quarantine.');
  }
  function clear(){
    if(busy||!window.confirm('Clear all quarantined Skill Passports? Existing local R6 and R7 records will remain untouched.'))return;
    persist([]);setSelected('');setMessage('Quarantine cleared. Local evidence ledgers unchanged.');
  }

  return <div className="passport-page">
    <section className="page-heading">
      <div className="eyebrow"><FileJson size={15}/> R8 / PORTABLE SKILL PASSPORT</div>
      <h1>Carry the evidence.<br/>Not the authority.</h1>
      <p>Export a self-contained six-scenario R7 tool-use receipt, or import one from another machine for local replay. Portable evidence is inspected in quarantine, never silently promoted to a trusted agent identity.</p>
    </section>
    <div className="teaching-hero-note"><LockKeyhole size={22}/><div>
      <strong>No implicit permissions. No cross-system execution.</strong>
      <span>Passport bundles are unsigned, user-controllable JSON. Import cannot connect an external agent, change a local model, install a skill, authorize tools, or add evidence to R6/R7. A replay PASS means only that the enclosed synthetic traces are internally consistent.</span>
    </div></div>
    <div className="metrics-grid teaching-metrics">
      <div className="metric-card"><span className="mini-kicker">LOCAL R7 RECEIPTS</span><div className="metric-value">{certificates.length}</div><div className="metric-detail">Export candidates, subject to source re-check</div></div>
      <div className="metric-card"><span className="mini-kicker">QUARANTINED</span><div className="metric-value">{items.length}</div><div className="metric-detail">Isolated imported bundles</div></div>
      <div className="metric-card"><span className="mini-kicker">REPLAY CONSISTENT</span><div className="metric-value">{validCount}</div><div className="metric-detail">Still untrusted external provenance</div></div>
      <div className="metric-card"><span className="mini-kicker">GRANTED PERMISSIONS</span><div className="metric-value">0</div><div className="metric-detail">Enforced import boundary</div></div>
    </div>
    <div className="teaching-columns">
      <section className="panel teaching-config">
        <div className="mini-kicker">01 / EXPORT FROM PHILEARN</div><h3>Create a portable proof bundle</h3>
        <p className="panel-desc">Choose a locally issued R7 certificate. Export is allowed only when its referenced R6 traces are still present, replay cleanly, and have not been superseded by newer failures.</p>
        <label className="teaching-label" htmlFor="passport-local-cert">LOCAL R7 CERTIFICATE</label>
        <select className="model-select" id="passport-local-cert"
          value={candidate?.id??''} disabled={busy||!certificates.length}
          onChange={e=>setChosen(e.target.value)}>
          {!certificates.length&&<option value="">No local R7 certificates</option>}
          {certificates.map(c=><option key={c.id} value={c.id}>{c.model} · {c.mode} · {display(c.issuedAt)}</option>)}
        </select>
        {candidate&&<div className="passport-facts">
          <span><strong>Model:</strong> {candidate.model}</span>
          <span><strong>Mode:</strong> {candidate.mode.toUpperCase()}</span>
          <span><strong>Scope:</strong> synthetic six-case JSON-tool gauntlet</span>
          <span><strong>Checksum:</strong> {short(candidate.evidenceSha256)}</span>
        </div>}
        <button className="button button-primary teaching-run" disabled={!candidate||busy} onClick={exportLocal}><Download size={16}/> Export self-contained passport</button>
        <div className="vault-mini-actions">
          <button className="text-link" disabled={busy} onClick={refresh}><RefreshCw size={14}/> Refresh local evidence</button>
          <button className="text-link" onClick={goToCertifications}>Open R7 audit <ArrowRight size={14}/></button>
        </div>
        <div className="line-divider"/>
        <div className="mini-kicker">02 / IMPORT TO QUARANTINE</div><h3>Inspect an external passport</h3>
        <p className="panel-desc">Select a local JSON passport. PhiLearn validates its bounded versioned format, checks two SHA-256 digests, and replays all six synthetic tool traces. No model calls or external APIs occur during verification.</p>
        <label htmlFor="passport-json-file" className="passport-file-label"><Upload size={17}/>
          {busy?'Checking passport…':'Choose Skill Passport JSON'}</label>
        <input ref={fileRef} id="passport-json-file" type="file" accept=".json,application/json"
          disabled={busy} className="passport-file-input" onChange={e=>{
            const file=e.currentTarget.files?.[0];
            if(file)void importFile(file);
          }}/>
        <p className="teaching-muted">Maximum {Math.round(PASSPORT_MAX_BYTES/1000)} KB. Strict passive JSON only. Invalid format or permission-bearing bundles are rejected before storage.</p>
        {message&&<p role="status" className="vault-message">{message}</p>}
      </section>
      <section className="panel teaching-preview">
        <div className="mini-kicker">03 / INTEROPERABILITY CONTRACT</div><h3>Prepared for BrainC and SuperPhiVessel</h3>
        <p className="panel-desc">R8 defines a portable evidence format, not an active integration into other repositories. Future consumers can implement the same isolated parser and replay verifier without accepting the sender's claimed identity or granting tool access.</p>
        <div className="passport-boundaries">
          <div><CheckCircle2 size={18}/><span><strong>Can inspect</strong> Version, model label, scoped claim, six source receipts, tool-action JSON, simulated replies and exact replay consistency</span></div>
          <div><CheckCircle2 size={18}/><span><strong>Can compare</strong> Evidence across copies and flag changed payloads or stale local attestations</span></div>
          <div><XCircle size={18}/><span><strong>Cannot authorize</strong> Production deployment, filesystem access, network calls, MFA changes, new models or role escalation</span></div>
          <div><XCircle size={18}/><span><strong>Cannot authenticate</strong> Issuer identity, model weights or origin of forgeable local traces without an external signature and trust infrastructure</span></div>
        </div>
        <div className="passport-wire">
          <div className="mini-kicker">WIRE FORMAT</div>
          <code>{PASSPORT_FORMAT}</code>
          <p>Boundary: <b>authority = NONE</b>, <b>usage = INSPECT_ONLY</b>, <b>requestedPermissions = []</b>. Each imported bundle stays in its own separate browser-local quarantine.</p>
        </div>
        <div className="teaching-annotation"><Info size={17}/><p>An adversary with control of the exported JSON can construct an internally consistent synthetic transcript and recompute both checksums. Replay validity is not proof the claimed model actually produced those answers. Never use this passport alone to authorize agents or tools.</p></div>
      </section>
    </div>
    <section className="panel teaching-ledger passport-ledger">
      <div className="teaching-ledger-head"><div><div className="mini-kicker">04 / PASSIVE IMPORT REGISTER</div><h3>Quarantined evidence bundles</h3>
        <p className="panel-desc">Replay-consistent is not trusted. Manual review is an annotation, never an automatic promotion or transfer of permissions.</p></div>
        <div className="ledger-actions"><button className="button button-outline" onClick={goToGauntlet}>R6 source trials <ArrowRight size={15}/></button>
        <button className="button button-danger" disabled={!items.length||busy} onClick={clear}><Trash2 size={15}/> Clear quarantine</button></div></div>
      {!items.length&&<div className="teaching-empty"><FileCheck2 size={30}/><strong>Quarantine is empty</strong><span>Import a Skill Passport JSON file to inspect its enclosed synthetic evidence.</span></div>}
      {items.length>0&&<label className="teaching-label" htmlFor="passport-selected">IMPORTED BUNDLE
        <select id="passport-selected" className="model-select" value={selectedItem?.id??''} onChange={e=>setSelected(e.target.value)} disabled={busy}>
          {[...items].reverse().map(item=><option key={item.id} value={item.id}>{item.passport.subject.model} · {item.passport.subject.mode} · {display(item.importedAt)}</option>)}
        </select>
      </label>}
      {selectedItem&&<>
        <div className="passport-summary"><span className={'vault-state '+(selectedItem.check==='REPLAY_PASS_UNTRUSTED'?'evidence_backed':'regressed')}>
          {selectedItem.check.replaceAll('_',' ')}</span>
          <span className="vault-state inconclusive">UNSIGNED · NO AUTHORITY</span>
          {selectedItem.reviewedLocally&&<span className="vault-state inconclusive">HUMAN REVIEW NOTED</span>}</div>
        <p className="passport-reason">{selectedItem.reason}</p>
        <div className="passport-facts">
          <span><strong>Claimed model:</strong> {selectedItem.passport.subject.model}</span>
          <span><strong>Claimed issuer:</strong> PhiLearn (self-reported)</span>
          <span><strong>Mode:</strong> {selectedItem.passport.subject.mode}</span>
          <span><strong>Imported:</strong> {display(selectedItem.importedAt)}</span>
          <span><strong>Bundle SHA-256:</strong> <code>{selectedItem.id}</code></span>
          <span><strong>Permissions:</strong> none</span>
        </div>
        <div className="passport-case-grid">{selectedItem.passport.episodes.map((ep,i)=>{
          const replay=replayEpisode(ep,SCENARIOS[i]);
          return <div className="passport-case" key={ep.id}>
            {replay.pass?<CheckCircle2 size={16}/>:<XCircle size={16}/>}
            <div><strong>{SCENARIOS[i].title}</strong><small>{ep.steps.length} simulated actions · {ep.outcome} · {ep.mode}</small></div>
          </div>;
        })}</div>
        <div className="cert-actions">
          <button className="button button-outline" disabled={busy} onClick={()=>void recheck(selectedItem)}><ShieldCheck size={15}/> Replay verification</button>
          <button className="button button-outline" disabled={busy||selectedItem.check!=='REPLAY_PASS_UNTRUSTED'}
            onClick={()=>reviewed(selectedItem)}><BookOpen size={15}/>{selectedItem.reviewedLocally?'Clear review note':'Mark inspected locally'}</button>
          <button className="button button-danger" disabled={busy} onClick={()=>remove(selectedItem)}><Trash2 size={15}/> Delete bundle</button>
        </div>
      </>}
      <p className="teaching-footer-note">Import uses JSON parsing and deterministic in-memory simulation only. Quarantined passports never feed a live agent, R6 qualification, R7 certification, or any real-world tools. No signatures or independent identity attestations exist in R8.</p>
    </section>
  </div>;
}
