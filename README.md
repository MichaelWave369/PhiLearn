# PhiLearn

**Adaptive Agent Learning & Evaluation Lab** · R8 v0.9.0 · MIT

> **Ledger above ego.** Every agent capability claim should be tied to reproducible evidence.

PhiLearn compares the performance of a local AI model on identical task sets under four different **text instruction conditions**. The app records accuracy, latency, model, task, experimental phase, and provenance in an exportable local ledger. It is an instrument for initial experiments, **not evidence that an AI has a fixed learning style or that model weights have changed**.

## Features

- React + TypeScript laboratory, mobile-friendly visual dashboard, GitHub Pages compatible.
- Four prompt channels: direct instruction, worked example, structured steps, self-check.
- Six practice tasks and six separate holdout tasks, scored with a strict closed-answer grader.
- Compare 24 independent model responses per run; rotate channel order for each task.
- Connect to locally installed Ollama models through an authenticated Python standard-library bridge.
- Sample preview distinctly marked `SIMULATED`; real responses marked `OBSERVED`.
- Export/delete the local evidence ledger (browser localStorage); no hosted account, analytics or cloud database.
- Tests and GitHub Actions deployment.

## Run the frontend locally

Prerequisites: **Node.js 20+** and npm.

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5173. Without Ollama, the **Preview sample data** button generates illustrative results, never passed off as measured results.

## Local Ollama bridge

Prerequisites: **Python 3.10+**, a running [Ollama](https://ollama.com) instance on `http://127.0.0.1:11434`, and at least one installed model (for example `ollama pull gemma3:1b`).

```bash
python3 bridge/server.py
```

The terminal prints a random **session token**. Open PhiLearn's **Learning lab**, enter `http://127.0.0.1:8765` and paste that token, then click **Connect bridge**. Select a discovered model and run a comparison. The token is stored in React memory **only for the lifetime of the page**, not in browser storage. Stop the server with Ctrl+C.

**Security:** The bridge binds to `127.0.0.1`, uses a unique token per process, checks browser origins, forwards requests only to the configured Ollama URL, bounds request sizes, and does not log prompts or secrets. Do not expose it using tunnels or public port forwarding. Only open the live application from origins you trust: origins are an additional boundary, not an alternative to the session token. If you host PhiLearn on a different origin, set `PHILEARN_ALLOWED_ORIGINS` to an exact comma-separated list before starting the bridge. `PHILEARN_PORT` and `PHILEARN_OLLAMA_URL` are configurable.

**Browser caveat:** Some browser configurations block public HTTPS sites from calling loopback HTTP services. If GitHub Pages cannot connect to your local bridge, run the frontend at `http://127.0.0.1:5173` using `npm run dev` instead. Avoid disabling browser security controls.

## Methodology and limitations

1. Each of four lanes receives the *same task questions* but a different prompt wrapper. Model generations use `temperature: 0`, `num_predict: 48`, no shared chat history.
2. The task bank contains six practice and six holdout questions, covering simple networking, arithmetic, text, safety, and data extraction. Holdout questions should not be used to revise the prompts.
3. Each output is normalized (whitespace, casing, lightweight answer formatting) and compared with a pinned reference. Incorrect verbose answers remain incorrect.
4. Recorded `OBSERVED` means the bridge returned a model response. `SIMULATED` means a deliberately fabricated UI preview. Both are distinct from `VERIFIED` model capability or training efficacy.
5. Models are evaluated on only six questions per phase. Scores are descriptive, not statistically robust. The exercise measures **prompt-condition performance**, not weight-level learning, multimodal competence, or long-term retention.
6. Real research requires larger item banks, repeated independent trials, error bars, randomized presentation, and untouched holdout data. Planned for subsequent versions.

## Build and test

```bash
npm install
npm test
npm run build
GITHUB_PAGES=true npm run build
```

## Publish on GitHub Pages

The workflow `.github/workflows/deploy.yml` builds from `main` using the Vite base `/PhiLearn/`. In **Settings → Pages**, select **GitHub Actions** as the build source if it is not already selected. The expected URL is <https://michaelwave369.github.io/PhiLearn/> after a successful deployment.

## R1: Agent classroom / teaching episodes (v0.2.0)

The **Teaching studio** tab introduces in-context instructional transfer experiments. This is not weight training.

1. Connect the local Python/Ollama bridge from **Learning lab**.
2. Choose a **learner** model and a curriculum module (or the full six-module curriculum).
3. Choose **Curated demonstration** for reproducible, fixed teaching text or **Agent teaches agent** for model-generated explanations from a selected local **peer tutor**.
4. Run a paired trial. The learner answers the *same transfer question* in independent, stateless requests, once with only the task and once with an instructional example. Their order is randomized per lesson.
5. Compare exact-answer baseline/coached scores, response latency, and evidence. Export the **R1 teaching receipts** separately from the existing R0 ledger.

**Tutor isolation:** The peer-tutor prompt contains the lesson concept, the worked example, and its reference answer but **not** the fresh transfer question or the expected transfer answer. The tutor's explanation is explicitly marked unverified model-generated text. The evaluation answer is graded against a pinned closed-answer reference. Tutor output is not treated as factual simply because a trial scores correctly.

**Receipts:** Each fully completed paired trial records the model identities, method, prompt order, responses, exact-answer grades, latencies, curriculum version, and 'OBSERVED' provenance. Incomplete pairs are discarded when a run is stopped; completed receipts remain in local browser storage. Demo data from R0 is never mixed into this R1 ledger.

**Scientific boundaries:** This experiment evaluates temporary **in-context instruction effects**. A positive before/after difference is **not evidence of weight updates, durable skill acquisition, memory, or causal superiority**. Because there are only six exercises and no repeats, the results are exploratory, without meaningful statistical power; model sampling and task-order effects still matter. Compare fresh tasks and repeated independent runs before drawing conclusions.

**Safety and privacy:** The bridge is loopback-only with an ephemeral bearer token. No code execution, shell access, external web crawling, fine-tuning, or model downloads are triggered by lessons. Peer tutor text is not automatically trusted or executed. It is possible for a peer explanation to be wrong. Only intentionally built-in benchmark examples are sent to the local model.

## R2: Skill Vault / evidence-backed procedural memory (v0.3.0)

R2 adds the **Skill vault** workspace to reuse an **observed R1 teaching explanation** as an explicit browser-persistent procedural note. It does **not** claim that a model learned or remembered anything internally.

### Workflow

1. Run **R1 Teaching studio** against a connected local Ollama learner. One successful, observed teaching receipt is enough to create a *candidate*.
2. In **Skill vault**, select the R1 receipt and choose **Save note**. The packet stores its source receipt ID, model identity, tutor origin, and exact note. A peer-produced explanation is always marked **PEER_UNVERIFIED**.
3. Connect to the same learner model through the authenticated local bridge and run **three R2 transfer probes**. These questions do not duplicate the R1 task. Each probe is attempted independently without a note and then with the note (order randomized per probe).
4. Compare scores, exact model outputs, latency and response order. A *fully completed* three-probe run is saved with the packet; aborted/partial evaluations are discarded rather than promoted.
5. Export all browser-local packets and trial receipts to versioned JSON if desired. You can delete a candidate and its evidence at any time.

### Bounded evidence labels

- **CANDIDATE:** No independent transfer run completed.
- **EVIDENCE_BACKED:** In the latest complete, same-model R2 run, assisted responses scored correctly on all three fresh probes, at least one response improved over its unassisted counterpart, and no response regressed.
- **NO_LIFT:** Both conditions scored correctly on all three, so assistance did not yield an observed gain.
- **REGRESSED:** At least one probe that passed without the note failed with it.
- **INCONCLUSIVE:** Completed runs with mixed outcomes or an invalid/noncomparable protocol.

**Scientific boundaries:** "Evidence-backed" applies *only* to the frozen three-question protocol for that model and note. Small fixed tasks permit leakage through application inspection, and scores are not statistically robust. A peer explanation is not fact-checked merely by being saved. These labels do not demonstrate persistent model cognition, actual skill acquisition, weight changes, generalization beyond the probes, or a causal training effect. Repeated exposure can contaminate further evaluations. For serious scientific work, add larger concealed task banks, repeated randomized trials, independent grading, and delayed follow-up sessions.

**Security:** Notes are **untrusted prompt content**, forwarded only as text to the local Ollama inference endpoint. The system never executes notes as shell commands, scripts, tools, or instructions to access external systems. The bridge remains authenticated and loopback-only.

## R3: Evidence-Gated Retrieval Arena (v0.4.0)

**New navigation:** Retrieval arena. This is the third rung after R1 Teaching Studio and R2 Skill Vault.

### How to run

1. Run an **observed R1 teaching episode** using Ollama.
2. Capture that episode into an R2 Skill Vault packet and earn R2's narrowly defined **EVIDENCE_BACKED** status by passing its three independent transfer probes (assisted 3/3, at least one improvement, zero regressions).
3. Return to the **Retrieval arena** and select the **exact same student model** through the locally authenticated Ollama bridge.
4. Choose one new challenge or the full 14-item challenge suite. R3 uses twelve fresh in-domain tasks (two per R1 skill) plus two out-of-domain probes.
5. Inspect the **router preview**: ranked token/phrase relevance, decision, reason, and packet provenance. There are no background model calls.
6. Run the comparison. On a *successful* retrieval, the same model answers the same fresh question in independent, randomized-order prompts without and with the saved note. On non-retrieval, the router abstains **without an Ollama call**.
7. Audit exact outputs, grading, latencies, request order, source packet IDs, and abstentions. Export or clear the browser-local R3 ledger.

### Safety and model limitations

- **Eligibility:** An R2 EVIDENCE_BACKED designation on the packet's most recent complete run is required, and its source student model must **exactly** match the selected R3 model. New failures or ambiguous evidence stop retrieval.
- **Routing:** Deterministic **lexical**, not semantic/embedding retrieval. Keywords are frozen per skill. A match requires score >= 4, with score margin >= 2 against the next closest eligible skill. Duplicate evidence-backed packets in the same skill are reduced to the newest. The router cannot see reference answer keys or the task's category ground truth.
- **Abstention:** No eligible evidence, no sufficiently relevant match, or ambiguous matches lead to abstention and **no student inference call**. Those are **INFERRED** route decisions, not observed model answers.
- **Instruction trust:** Saved lessons are always treated as *untrusted reference text*, not executable code or tool commands. Nothing invokes shells, browsers, agents, or remote APIs. The existing bridge remains token-protected and loopback-only.
- **Scientific limits:** R3 measures an **in-context retrieval assistance effect** on a tiny, public, fixed task set. A pass does not establish actual model weight training, durable learning, autonomous problem solving, performance on general tasks, independent verification of a peer tutor's claims, or causal improvement. Since task data and answers ship in the client bundle, they are not secret from code inspection; they are withheld from *generated model prompts*. Repeating the suite can contaminate future scores. Use larger independently hosted holdouts and confidence intervals for stronger science.

The R3 sessions have their own localStorage namespace. No records are uploaded automatically.

## R4: Cross-Model Transfer Lab (v0.5.0)

R4 asks: **does an R2 evidence-backed procedure for one model help a *different* model answer fresh tasks?** It does not transfer neural network weights, fine-tune models, or prove any permanent learning.

### Setup and experimental design

1. Use R1 Teaching Studio to generate an observed teaching receipt from a local Ollama model.
2. Use R2 Skill Vault to capture and independently validate a procedural note. The source packet must currently be **EVIDENCE_BACKED**, with a successful three-question assisted transfer result and no regression in its most recent R2 run.
3. Navigate to **Cross-model lab** and choose the eligible R2 source packet.
4. Select a **different local Ollama model**, which acts as the recipient. Identical source and recipient model identifiers are rejected.
5. Start the R4 controlled comparison. The recipient answers *three fresh tasks* from that packet's skill domain under three independent randomized-order conditions, nine sequential model requests per study:
   - **Bare:** short task instructions only.
   - **Neutral:** same task with an unrelated botanical note (an imperfect extra-context control).
   - **Relevant:** same task with the source model's saved procedural note.
6. Review the 3×3 answer matrix, output text, pass/fail, timing, order, source receipt, and model identities. Only completed comparisons are persisted to the separate R4 browser-local ledger. Export or delete local study records.

### Interpreting the directional signal

R4 reports the three condition scores (out of three) and paired changes. **DIRECTIONAL_LIFT** means that the relevant-note score exceeded *both* control scores and had *zero* individual regressions versus either control. **REGRESSION** means at least one reference-note response failed while a control passed; otherwise the label is **NO_CLEAR_LIFT**.

These labels are **descriptive**, not inferential or causal. Three small, fixed, public examples per domain cannot prove statistically reliable transfer or retained skill. The neutral note is not a matched-length placebo. Prompts and expected answers are bundled with the open-source app, so they are only hidden from the Ollama request, not from someone reading frontend source. Independent problem banks, repeated randomized tests and additional controls are needed before publishing efficacy claims.

### Provenance, privacy and trust

- Source packet must have observed R2 evidence and retains its origin: **CURATED** or **PEER_UNVERIFIED**. Peer-authored content remains untrusted even if it helps on a test.
- Original packet text is included as a snapshot alongside the observed target answers in the exported receipt. Evidence in the ledger is labelled **OBSERVED**, and incomplete studies are discarded.
- Notes are forwarded only as inert text via the existing token-protected, loopback-only Ollama bridge. They never become executable tool commands or secret-access instructions.
- No automatic cloud transmission. All R4 records are browser-local unless the user explicitly exports them.

## R5: Delayed Re-check / Longitudinal Assistance (v0.6.0)

This workspace examines whether an **external saved procedural note** still assists a separate local model *after time has passed*. It is **not** a claim that the model has retained learning internally.

### Manual workflow

1. Use the **Cross-model lab (R4)** to complete a 3×3 study: source and recipient are distinct Ollama models, and the recipient answers three tasks under **bare, unrelated neutral note, and relevant source playbook** conditions.
2. In **Delayed re-check (R5)**, select an observed, complete R4 study. Enroll a **1-, 3-, or 7-day** follow-up. The earliest due time is pinned to the original R4 timestamp, not the day you register the follow-up.
3. R5 saves the *exact source playbook snapshot*, *neutral note*, recipient model identity, source provenance and baseline scores, so later changes to the R2 packet cannot silently modify this experiment.
4. Reopen PhiLearn **manually** on or after the displayed due time. The UI refreshes its eligibility clock periodically; the Run button stays disabled until the delay has elapsed.
5. Reconnect the authenticated local Ollama bridge with the **same model identifier** as the original R4 recipient. R5 uses three **new** task prompts in that same skill category, distinct from the R1–R4 banks. It calls the model independently three times per question, with shuffled condition order, for nine requests total.
6. Only complete studies are saved. Interrupted or errored studies remain pending, with no partial score promotion. The ledger compares all three condition scores from R4 and R5 and records every model response and timing; exports are versioned JSON.

The delay is enforced using the **client device clock**, not an independently trusted server timestamp. R5 **does not schedule a background action, send a reminder, automatically run Ollama at the due date, or perform hidden inference**. The user must reopen the application and start each follow-up. Clock changes can invalidate elapsed-time assumptions. Model tags can point to updated weights between sessions, despite identical displayed identifiers, and the app cannot attest an unchanged model binary.

### Scientific and security boundaries

- This is delayed testing of **retrieval-augmented, in-context assistance** from stored browser instructions, not retention of an internal neural skill or changes to model weights.
- Fresh questions reduce exact task repetition but do not rule out contamination. As an open-source browser app, benchmark questions and expected answers are in the client bundle, not in model prompts.
- The neutral reference is not matched in length or topic, and three items per condition cannot establish statistical significance. An apparent score difference across time can reflect task difficulty, quantization/model changes, prompt-format sensitivity, sampling, or random variation.
- Saved peer tutor text remains explicitly untrusted. The local bridge only forwards strings to Ollama. There is no shell execution, no new network connector, and no permissions to retrieve secrets or perform external actions.
- R5 records are local-only until you choose to export them; deleting them clears the R5 study ledger from that browser.

## R6: Deterministic Agent Tool-Use Gauntlet (v0.7.0)

The **Tool-use gauntlet** is the first PhiLearn benchmark requiring a local AI model to emit strict JSON tool requests, inspect simulated evidence, and submit a decision. **No real shell commands, web/network scans, deployments, account changes, or file operations are available.** The tool simulator runs exclusively as deterministic TypeScript in the browser.

### Use

1. Connect a local Ollama model using the existing authenticated localhost Python bridge from **Learning lab**. Enter **Tool-use gauntlet**.
2. Pick a model and one of six cases (or the full six-case suite). Each case is independently evaluated in **bare** and **guided evidence-first** modes, with randomized condition order.
3. On each turn, the model may emit a strict JSON object such as {"tool":"inspect","target":"router_status"} or {"tool":"decide","decision":"NO_CHANGE"}. Only two scenario-specific read-only inspection targets are allowed. An episode has at most five model turns.
4. A decision is valid only after the two required synthetic observations. An agent gets **PASS** only if it chooses the correct response and made **zero** rejected, malformed, premature, or out-of-scope requests. Other outcomes are **FAIL**, **INCOMPLETE**, or **POLICY_VIOLATION**.
5. Inspect and export every model JSON response, synthetic sandbox reply, accept/reject decision, latency, model ID, mode, and final outcome. R6 results are browser-local.

### Scenarios

| Category | Positive case | Negative case |
| --- | --- | --- |
| Networking | Healthy gateway and accurate DNS / no change | Stale DNS / propose repair |
| Release engineering | Passed CI + passed security / recommend release | Failed CI / block release |
| Account policy | Verified, authorized read-only synthetic audit / permit read-only | Unverified MFA-reset request / escalate |

The simulator exposes synthetic inspections and simulated decisions only. It does **not** execute a proposed repair, perform a deployment, or access a real account.

### Trust and provenance

- **Strict allowlists:** JSON action parser accepts only an exact two-field structure with supported inspection targets or decision identifiers. Unknown tool names, extra fields, arbitrary commands, Markdown, and premature decisions are rejected.
- **Model responses are OBSERVED; the environment is simulated:** Tool observations carry SYNTHETIC_INSPECTION markers and recommendations carry SIMULATED_DECISION markers. No model confidence statements determine grading.
- **No neural training:** These are bounded, stateless **agent tool-selection and evidence-following** tests, not reinforcement learning, changed weights, retained skills, real-world tool execution, or statistically generalizable capability evidence.
- **Security:** The existing localhost, session-token-protected inference bridge remains unchanged. No production tools or extra network requests are exposed. The benchmark data and answer keys ship in the open-source client and are not secret from source inspection.

## R7: Scoped Agent Skill Certification / Audit (v0.8.0)

R7 adds a **Certification audit** workspace for **browser-local, unsigned attestations of the R6 synthetic tool-use benchmark**. It does not certify real-world technical proficiency, issue professional credentials, verify model weights, change neural training, or grant agent permission to touch production systems.

### Earning a narrow R7 local receipt

1. Run **R6 Tool-use gauntlet** with a local Ollama model on **all six deterministic scenarios**. Run the **bare** and/or **guided** modes to create real observed JSON action traces.
2. Open **Certification audit**, choose the exact model ID and either bare or guided mode. These are evaluated **separately**. A guided success cannot make bare pass.
3. R7 chooses the **latest recorded R6 episode for each scenario** under that model and mode. Old passing attempts never override newer failures.
4. The verifier **replays each raw model JSON output** through R6's original strict parser and synthetic action state machine. It verifies sequential turn numbers, allowed inspection targets, both-evidence prerequisites, exact synthetic tool replies, final recommendations, latency fields, outcome and the absence of any policy violations.
5. Only **six distinct scenario PASS traces**, each validated by deterministic replay, qualify for a narrow local receipt. Incomplete, missing, invalid, or policy-violating traces do not.
6. When qualified, click **Issue scoped local receipt**. The app pins six source episode IDs and computes a SHA-256 digest of their source evidence. You can re-verify the stored receipt against those episodes later and export all certification/audit evidence as JSON.

### Evidence summary from R1–R5

The same page shows model-specific counts for observed R1 teaching episodes, R2 evidence-backed source packets, R3 retrieval comparisons, R4 cross-model recipient studies, R5 completed follow-ups, and R2 peer-authored note origins. **These are contextual research signals, not substitute qualifications**, and are never merged into a single universal score.

### Scope, authenticity and operational restrictions

- A passing report's exact scope is **R6_SYNTHETIC_JSON_TOOL_GAUNTLET_6_CASES**, for one chosen model identifier and one specific mode (bare or guided). It means *this browser currently contains six matching clean synthetic tool-choice traces*. Nothing broader.
- **LOCAL_UNTRUSTED provenance:** A browser can edit localStorage, upload fabricated records, or change the frontend code. No server signs certificates and no trusted external witness verifies their authenticity. A SHA-256 digest detects changes against source records but **is not a digital signature** and cannot establish source integrity, authorship, real identity, or secure model attestation.
- The six tasks are fixed and public; results do not support statistical generalization, real-world capability, cross-environment authorization, safe deployment practices, reinforcement learning or fine-tuning.
- R7 performs **no model inference** during certification and grants no additional privileges. It only examines and hashes existing browser-local R6 evidence, then stores a locally issued receipt. R6's fake sandbox remains isolated from actual shells, accounts, networks and infrastructure.
- Re-verification requires the original R6 source episodes still to be present and unchanged. A changed evidence payload breaks the digest. Issuance snapshots supporting R1–R5 counts but does not independently validate their claims.

Use R7's scoped results as an **experimental ledger artifact**, not an accreditation or trust bypass.

## R8: Portable Skill Passport (v0.9.0)

**Goal:** carry evidence between local or future PhiBots systems, while ensuring no receiving application mistakes portable JSON for a trusted identity, authorization, model weight state, or training certificate.

The new **Skill Passport** workspace exports a **self-contained, versioned R7/R6 evidence bundle** and imports such bundles into a separate **quarantine**, with replay verification and strictly no new permissions. This defines a possible future interoperability contract for BrainC and SuperPhiVessel; **it does not modify or connect to those repositories in R8**.

### Export a portable passport

1. Complete all six R6 synthetic tool-use scenarios using one local Ollama model and either bare or guided mode.
2. In R7, issue the narrow browser-local synthetic certification once all six latest traces replay as clean PASS.
3. Go to **Skill Passport**, select the R7 receipt and click **Export self-contained passport**.
4. Before export, PhiLearn **re-verifies that certificate against all existing local R6 episodes**. Missing source traces, corrupt data, or a newer failure invalidate export. The file includes the certificate and exactly six original tool-action traces, one for each public synthetic scenario, in its canonical order.
5. The JSON passport also contains a SHA-256 consistency checksum over its versioned payload. This checksum is **not a cryptographic signature** and provides no independent source authenticity.

### Import a Skill Passport (passive, isolated)

1. Use the **Choose Skill Passport JSON** control. Imports are capped at **256 KB**, and the version and JSON structure are checked before quarantine.
2. The loader enforces the immutable **authority = NONE**, **usage = INSPECT_ONLY**, and empty **requestedPermissions** fields; any additional top-level fields, changed or unexpected scopes, and invalid model/scenario structure are rejected. The importer does not execute code or fetch anything from the network.
3. It recomputes the passport payload checksum, verifies the embedded R7 certificate's original R6 evidence digest, and **replays all six raw JSON tool traces** using the R6 deterministic simulation. An error results in **REPLAY_FAIL_UNTRUSTED**.
4. A matching bundle is marked **REPLAY_PASS_UNTRUSTED**, *never trusted*. Imported episodes are **NOT** merged into the local R6 observation ledger or R7 certification register. The imported file cannot earn additional certification, install a skill, invoke an Ollama model, add an agent, call a tool or grant any role.
5. Optionally mark **inspected locally** after reading. This flag is simply a local annotation and does not change authority. Re-run verification, inspect six enclosed cases, or delete the quarantined item. Duplicate passports are detected by the consistency checksum.

### Versioned wire contract

The documented format is **philearn.skill-passport.v1**.

| Field | Meaning |
| --- | --- |
| format | Exact version identifier (unsupported versions are rejected) |
| exportedAt | Self-reported export timestamp |
| issuerClaim | Self-reported app label: PhiLearn; no verified signer |
| subject | Claimed model ID and exactly one R6 condition (bare or guided) |
| scope | R6_SYNTHETIC_JSON_TOOL_GAUNTLET_6_CASES |
| boundary | authority NONE, requestedPermissions [], usage INSPECT_ONLY |
| certificate | R7 unsigned scoped receipt, its evidence IDs and evidence SHA-256 |
| episodes | Six complete synthetic R6 JSON-action traces, in frozen scenario order |
| payloadSha256 | SHA-256 of the JSON body with this checksum field omitted |

The consumer must parse bounded JSON, validate the full schema, replay synthetic evidence, and keep the result in quarantine without granting trust. Do **not** rely on the declared issuer, model name, checksums, dates, pass flags, or manually recorded review flags for security decisions.

**No cross-repo runtime API is installed by this PR.** BrainC and SuperPhiVessel can adopt the documented contract later through separate reviews and sandboxed integrations.

### What this does *not* prove

- An adversary controlling the browser, file or source code can forge synthetic model responses, build internally consistent traces, and recompute the hashes. **Replaying a passport only validates internal consistency**, not historical truth.
- No trusted witness, signature, timestamp service, hardware attestation, model-weight signature, or independent external benchmark is present. An apparently valid imported file is not a trustworthy identity credential.
- This benchmark does not establish general agent competence, real operational safety, persistent learning, model fine-tuning, real-world tooling, or a right to execute system actions.
- A production consumer would need independently authenticated provenance, a policy engine, explicit human approval for separate actions, and stronger blinded evaluation. **Even a legitimate receipt must not automatically promote model privileges.**

## R9 ideas

- Randomized larger task libraries, repeated trials and confidence intervals.
- Actual *teaching episodes* with delayed transfer/retention measurement rather than prompt-only comparisons.
- Visual/audio/tool-use capability probes where supported.
- Agent demonstrations, sandboxed tool execution, independent adjudication.
- Consent-gated optional fine-tuning datasets with provenance receipts.
- NBG-inspired channel interaction studies: clearly hypotheses, not physics claims.

## License

MIT. Copyright © 2026 Michael Hughes.


## R9: Independent Skill Passport compatibility consumers (v0.10)

The R8 passport no longer requires PhiLearn's browser to be inspected. A **standalone Node.js verifier**, with zero npm dependencies, lives in interop/skill-passport-verifier.mjs. Run it against a locally selected JSON file with:

    node interop/verify-passport.mjs path/to/passport.json

R9 also adds matching **separate, passive consumer implementations** to BrainC (Python 3.11+ standard library) and SuperPhiVessel (Node.js 20+). Each consumer independently validates schema limits, locked no-authority fields, R7/R8 evidence hashes, and the original six synthetic R6 action traces. Conformance tests include forged action attempts and recomputed checksums.

**All consumers return REPLAY_PASS_UNTRUSTED or REPLAY_FAIL_UNTRUSTED.** Replayed JSON is not historical authentication, an agent credential, training, or permission to execute tools. No memory imports, routing updates, external network operations or API privileges occur. Future live wiring would require an independently verified issuer and explicitly approved actions, not just a passport.

See interop/README.md for the exact wire contract, usage and exit codes.


## R10: Optional Ed25519 signed Skill Passport provenance

R10 adds a **read-only offline signature-verification layer** to the existing R8/R9 portable Skill Passport. The outer format is philearn.signed-skill-passport.v1, enclosing an unchanged R8 philearn.skill-passport.v1 record. Signature checking is optional and requires an independently operator-pinned public key; **receiving a public key from the sender is not sufficient authentication**.

### Operator workflow (Node.js 20+)

Run on a trusted operator-owned machine:

    node interop/r10-cli.mjs keygen /secure/operator-dir field-lab
    node interop/r10-cli.mjs sign passport.json /secure/operator-dir/issuer.private.pem field-lab signed.json

Keygen creates a private Ed25519 PEM and a candidate public trust file. The **unencrypted private key** is saved with permission mode 0600, but must be protected using local access controls, excluded from Git, and kept out of shared or cloud-synced directories. For higher-risk signing prefer hardware-backed key protection. The recipient separately authenticates the issuer identity and public key fingerprint through an out-of-band channel, then pins that key in their own local trust-store copy. A key delivered along with an untrusted passport must not be automatically accepted.

Verify using an already authenticated receiver-controlled local trust store:

    node interop/r10-cli.mjs verify signed.json /local/operator-pinned-trust.json

Optional --review is an *explicit inspection acknowledgment*, not a permission change. Unknown keys, revoked/inactive keys, wrong scope, modified payloads, forged signatures or missing evidence fail closed. Without a trust store the signature remains UNPINNED_SIGNATURE. Key revocation is manual at the receiver and never auto-synchronized.

The Ed25519 signature covers a versioned domain separator, issuer ID, SHA-256 DER-SPKI public key fingerprint, claimed signing time and validated R8 passport payload digest. The verifier always validates the six frozen synthetic R6 tool traces and the R7/R8 hashes *before* accepting provenance.

### Consumers and boundaries

- PhiLearn: offline Node 20+ signer/verifier and conformance checks.
- BrainC: offline Python 3.11+ verifier using cryptography; no FastAPI integration.
- SuperPhiVessel: offline Node 20+ verifier; no routing or local-console integration.

In all outcomes, even after a valid pinned-key signature and manual inspection: authority NONE, permissions [], and actionAllowed false. A valid signature confirms use of the matching operator-pinned private key, **not** the historic truth of an editable synthetic benchmark, real-world model ability, changes to weights, an externally attested clock, or permission to execute actions. No signing keys are committed to the repository.

### Conformance checks

    node --test interop/r10-signed-passport.node-check.mjs


## R11: Governed agent evidence enrollment (inspection-only)

R11 keeps **signing-key identity, demonstrated synthetic benchmark evidence, and operational permissions** as three different concepts. The last remains **completely outside this module**. The receiver cannot enroll anything for action execution, even when every test succeeds.

A standalone receiver-controlled **inspection enrollment registry** records the operator's explicit approval to inspect one exact R10 Ed25519 signed R8 Skill Passport. The review entry is bound to the entire signed envelope's SHA-256, issuer ID, signing key fingerprint, model label, the exact R6 synthetic-only scope, the reviewing operator, and a short lease (1–168 hours). The system replays the six synthetic R6 traces and validates R10's operator-pinned public key every time. The receiving machine's local registry is not a cryptographic credential. Keep it outside shared/untrusted locations.

### Offline operator workflow

Node.js 20+ (PhiLearn or SuperPhiVessel):

    node interop/r11-cli.mjs init local-registry.json
    node interop/r11-cli.mjs check signed.json /local/pinned-keys.json local-registry.json
    node interop/r11-cli.mjs approve signed.json /local/pinned-keys.json local-registry.json operator-id 24 reviewed-registry.json
    node interop/r11-cli.mjs check signed.json /local/pinned-keys.json reviewed-registry.json

To revoke, copy the enrollmentId from your locally approved registry and run:

    node interop/r11-cli.mjs revoke reviewed-registry.json <enrollment-sha256> operator-id revoked-registry.json

BrainC Python 3.11+ with cryptography installed:

    python3 scripts/r11_enrollment.py init local-registry.json
    python3 scripts/r11_enrollment.py approve signed.json /local/pinned-keys.json local-registry.json operator-id 24 reviewed-registry.json
    python3 scripts/r11_enrollment.py check signed.json /local/pinned-keys.json reviewed-registry.json
    python3 scripts/r11_enrollment.py revoke reviewed-registry.json <enrollment-sha256> operator-id revoked-registry.json

All *approve* and *revoke* operations require explicit CLI invocation. Updates are written to new files rather than silently overwriting existing registries; operators decide whether and when to replace the active receiver-controlled file.

### Fail-closed decision states

- SIGNATURE_REJECTED: R10 signer pin or R8/R9 source replay failed.
- REGISTRY_REJECTED / NOT_ENROLLED: absent, malformed, mismatched, or unapproved receiver-local registry.
- NOT_YET_VALID / EXPIRED: local enrollment clock outside the bounded lease.
- REVOKED: operator revoked this exact envelope; same envelope cannot be silently renewed.
- APPROVED_FOR_INSPECTION_ONLY: exact payload, pinned key, valid evidence replay, and receiver's manually approved unexpired inspection lease.

**Invariant:** Every result carries authority NONE, permissions [], actionAllowed false. Even approval authorizes only *local passive evidence inspection*. This is not executable agent enrollment, an access token, deployment approval, a persisted learned skill, or a privilege escalation. No API endpoints, tool bridges, model calls, agent-memory writes, shell execution from evidence, key generation, network exchange, or runtime permission modifications were added by R11. No signing key is checked in.

The registry can be edited by whoever controls the host, and local timestamps depend on that machine's clock. It therefore does not establish an independently verified human approver or trusted time. A more advanced release would require authenticated operator decisions, tamper-evident log storage, key lifecycle operations and a separate real-world action policy gate before permitting any tool execution.


## R12: Tamper-evident, operator-signed governance event ledger

R12 adds a **separate, offline operator event history** on top of R10 pinned-key provenance and R11 inspection-only enrollment. It is intentionally **not** wired into live BrainC or Vessie APIs, agents, model routing, memory, authorization or tooling.

The event log's scope is limited to **inspection of evidence**. It records an operator-signed event for APPROVE_INSPECTION, REVOKE_INSPECTION, or EXPIRE_INSPECTION, with an incrementing sequence number, SHA-256 of the prior signed event, exact signed passport envelope hash, pinned issuer key fingerprint, model label, claim scope, reviewing operator's pinned Ed25519 key fingerprint, timestamp, and bounded expiry (at most seven days).

A receiver independently validates every Ed25519 event signature using a **separate, operator-controlled R12 public-key trust store**, reconstructs the hash-linked chain, validates state transitions, compares the entire event chain with an **independently preserved checkpoint** (event count + head SHA-256), and then rechecks the underlying R10 signed passport and R6 synthetic replay. A changed, reordered, forged, truncated or stale log is rejected when the receiver has the authentic latest checkpoint. A signed revocation or explicit expiry is terminal for that exact enrollment.

**Critical limitations:** The chain alone does not prevent deletion or rewriting. If an attacker can also replace the receiver's checkpoint or pinned keys, a local verification cannot detect all tampering. Keep the latest known head independently from the writable ledger, ideally replicated to independent protected storage. Ed25519 authenticates possession of a pinned operator signing key, not an independently verified human identity or honest historical action. Local timestamps are untrusted. All CLI operations create new files, not silent in-place overwrites. Private operator keys must be generated and stored outside Git or synced folders.

**Invariant:** Even a valid checkpointed and operator-approved report returns authority NONE, permissions [], actionAllowed false. It authorizes *passive evidence inspection only*. No runtime permissions, agent tool grants, live deployment approval, memory-writing, or model execution exist in R12.

### Operator commands

The full offline signing and event-authoring CLI is included with PhiLearn:

    node interop/r12-cli.mjs operator-keygen /secure/outside-repo/dir operator.alpha
    node interop/r12-cli.mjs init new-ledger.json new-checkpoint.json
    node interop/r12-cli.mjs approve signed.json R10-pinned-keys.json R12-operator-keys.json ledger.json operator-private.pem operator.alpha 24 prior-checkpoint.json next-ledger.json next-checkpoint.json --confirm
    node interop/r12-cli.mjs revoke enrollment-sha256 R12-operator-keys.json ledger.json operator-private.pem operator.alpha prior-checkpoint.json next-ledger.json next-checkpoint.json --confirm
    node interop/r12-cli.mjs expire enrollment-sha256 R12-operator-keys.json ledger.json operator-private.pem operator.alpha prior-checkpoint.json next-ledger.json next-checkpoint.json --confirm
    node interop/r12-cli.mjs check signed.json R10-pinned-keys.json R12-operator-keys.json ledger.json independent-checkpoint.json

The operator-keygen command creates an **unencrypted** mode-0600 private key PEM and a candidate public trust-store JSON. Recipients must verify and pin the public key through a separate authenticated process before accepting it. Do not commit either real private keys or approvals as authorization credentials. Explicit event expiry is optional because elapsed lease expiry is enforced during verification even without a new event.

BrainC has its own Python 3.11+ standard-library/cryptography implementation in scripts/r12_governance.py. SuperPhiVessel includes a passive read-only Node verifier in interop/r12-check.mjs, with the matching shared Node event-chain implementation. These implementations deliberately **do not connect** the ledger to real privileges.

Only signature-chain consistency, separately known head continuity, and synthetic-evidence replay are established. This remains a research governance audit, not a trustworthy external authorization system.



## R13: Signed cross-runtime parity and independent checkpoint witnesses

R13 introduces an OPTIONAL, separately pinned Ed25519 **witness** that signs one exact R12 inspection-governance checkpoint (event count + SHA-256 head fingerprint). The witness signing key must not be the operator signing key. Receiver-controlled public-key pins are authenticated out of band, and a bounded separately retained minimum event count can detect replay of an older, genuinely signed ledger.

### Cross-language conformance

The exact same deterministic, SYNTHETIC TEST-ONLY fixture is generated by Node at interop/r13-fixture.mjs. It contains a fabricated R8 passport, R10 issuer signature, R12 operator signature and event chain, R12 checkpoint, and R13 independent witness signature. Test seeds are public and NEVER production credentials; the fixture does not represent genuine model behavior.

PhiLearn and SuperPhiVessel validate the fixture with Node 22. BrainC runs this same Node producer in CI and independently validates the R10, R12, and R13 Ed25519 signature bytes, hashes and replay semantics in Python. Python can also regenerate an identical R13 witness receipt.

### Operator commands

PhiLearn Node 20+:

    node interop/r13-cli.mjs keygen /outside-repo/private witness.alpha
    node interop/r13-cli.mjs sign ledger.json operator-pins.json witness-pins.json witness.private.pem witness.alpha receipt.json
    node interop/r13-cli.mjs check ledger.json operator-pins.json witness-pins.json receipt.json RECEIVER_MIN_COUNT

BrainC Python 3.11+ with cryptography:

    python3 scripts/r13_check.py ledger.json operator-pins.json witness-pins.json receipt.json RECEIVER_MIN_COUNT

SuperPhiVessel passive Node 20+:

    node interop/r13-check.mjs ledger.json operator-pins.json witness-pins.json receipt.json RECEIVER_MIN_COUNT

The witness private PEM is unencrypted and written with local filesystem mode 0600. Operators must keep it outside Git, shared directories, and cloud sync, and independently validate the public witness key fingerprint before pinning. Protect the minimum event count in storage separate from the ledger and receipt, NEVER read it from the incoming packet itself.

### Boundaries and limitations

Even a valid witness cannot independently establish that synthetic R6 model observations occurred, that timestamps are true, that human signers are institutionally independent, or that history is immutable. Retaining a minimum count catches rollback to shorter histories but does not by itself rule out different histories with the same number of events. A separately protected latest head hash is stronger. If a malicious actor controls both witness pins and protected checkpoint state, signatures cannot save the audit.

All checks are entirely offline and read-only to the actual agent runtimes. Every report, including PASS, states authority NONE, permissions [], and actionAllowed false. No model access, network API, agent execution, skill installation, routing or permission changes.
