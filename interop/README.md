# PhiLearn R9: Skill Passport consumer compatibility

This folder contains a standalone, offline Node.js 20+ consumer of the frozen PhiLearn R8 Skill Passport v1 JSON protocol. It is deliberately separate from PhiLearn's React/Vite app.

## CLI

Node.js 20+ installed:

    node interop/verify-passport.mjs ./my-skill-passport.json

Exit codes:
- 0: six synthetic tool traces replay successfully and R7/R8 consistency hashes match, labelled REPLAY_PASS_UNTRUSTED
- 1: input unreadable, oversized, altered, or failed deterministic replay
- 2: incorrect CLI usage

JavaScript API: import verifyText or verifyObject from interop/skill-passport-verifier.mjs. Pass only locally selected JSON text or parsed data. Results always return authority NONE and an empty permissions array. No npm dependencies, model calls, dynamic imports of passport data, browser storage, or HTTP requests.

Conformance tests: node --test interop/skill-passport-verifier.test.mjs

## Compatibility consumers

- PhiLearn: this independent Node consumer, plus the browser R8 importer.
- BrainC: Python 3.11+ standard-library offline verifier at scripts/skill_passport_verify.py in a separate BrainC PR.
- SuperPhiVessel: vendored standalone Node consumer at interop/skill-passport-verifier.mjs and matching CLI in a separate SPV PR.

These are passive adapters, NOT active bridges for model routing, agent identity, skills, BrainC databases, SPV memory, or tool execution. Nothing is auto-installed on import.

## Frozen format

- format: philearn.skill-passport.v1
- certificate: philearn-r7-scoped-audit-v1
- source trace: philearn-r6-gauntlet-v1
- scope: R6_SYNTHETIC_JSON_TOOL_GAUNTLET_6_CASES
- bounded UTF-8 JSON (256,000 bytes max); six episodes, in the original R6 scenario order
- SHA-256 over exact reconstructed R7 evidence and R8 body JSON payload
- authority NONE, requestedPermissions empty list, usage INSPECT_ONLY

Each consumer replays raw JSON tool choices through its independent deterministic copy of the synthetic R6 environment; a stored PASS flag cannot bypass the replay.

## Inviolable trust boundary

This is a consistency check, NOT authentication. Both digest checks can be recomputed by anyone who controls the JSON. An attacker can also fabricate a fully internally consistent synthetic transcript. Neither passed replay nor a manually noted review can grant identity, privileges, production access, tool calls, model weights, persistent learning, or independent scientific validity.

Never use a passport to bypass the receiving system's existing approval gates. Future integration must add a separate source-authentication mechanism, a policy decision point, and explicit human authorization for any real-world action.
