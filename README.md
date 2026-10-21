# PhiLearn

**Adaptive Agent Learning & Evaluation Lab** · R1 v0.2.0 · MIT

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

## R2 ideas

- Randomized larger task libraries, repeated trials and confidence intervals.
- Actual *teaching episodes* with delayed transfer/retention measurement rather than prompt-only comparisons.
- Visual/audio/tool-use capability probes where supported.
- Agent demonstrations, sandboxed tool execution, independent adjudication.
- Consent-gated optional fine-tuning datasets with provenance receipts.
- NBG-inspired channel interaction studies: clearly hypotheses, not physics claims.

## License

MIT. Copyright © 2026 Michael Hughes.
