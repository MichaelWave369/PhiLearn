# PhiLearn

**Adaptive Agent Learning & Evaluation Lab** · R4 v0.5.0 · MIT

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

## R5 ideas

- Randomized larger task libraries, repeated trials and confidence intervals.
- Actual *teaching episodes* with delayed transfer/retention measurement rather than prompt-only comparisons.
- Visual/audio/tool-use capability probes where supported.
- Agent demonstrations, sandboxed tool execution, independent adjudication.
- Consent-gated optional fine-tuning datasets with provenance receipts.
- NBG-inspired channel interaction studies: clearly hypotheses, not physics claims.

## License

MIT. Copyright © 2026 Michael Hughes.
