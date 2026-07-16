# Brief: `review_plan` MCP tool — Gemini cross-review via gemini-cli

Status: **approved brief, awaiting "go"** (Chief Architect → js-architect)
Date: 2026-07-16

## Goal

Add an MCP tool `review_plan` to the ln-ashlar server that submits a plan
(architecture spec OR implementation/executor plan) to Gemini Flash for
critique, using the **gemini-cli** installed on the server (OAuth
subscription auth — NOT a Gemini API key). Any MCP client authenticated
via the existing `config/auth.json` middleware can use it. The calling
agent drives the loop: draft → review → revise → review, max 3 iterations.

The tool is **stateless** — review history travels in the request
parameters, no server-side sessions.

## Phase 1 — Ops (manual, done with the user, NOT part of the code plan)

1. Node 20+ present; `npm i -g @google/gemini-cli`.
2. Headless OAuth login (`NO_BROWSER=1 gemini`, paste-back flow);
   credentials cached in the runner's `~/.gemini/`.
3. Smoke test: `gemini -p "ping" -m gemini-2.5-flash` — confirm the exact
   model id available under subscription (Code Assist) quota, record
   observed limits.

## Phase 2 — Code (this plan)

### 1. CLI wrapper — suggested `lib/gemini.js` (new dir; js-architect may relocate)

- `execFile` (no shell), prompt piped via **stdin** (plans are long; avoid
  ARG_MAX), `--output-format json`, model from config.
- Hard timeout ~120s; kill the process on expiry.
- Concurrency cap: max 2 in-flight calls (shared account quota); further
  calls queue briefly or fail with a clear "busy" error.
- Output size cap; robust parse (non-JSON output → structured error).

### 2. MCP tool — `tools/review_plan.js` (follow existing tool patterns + zod)

Params:
- `plan` (string, required) — the plan text (markdown).
- `plan_type` (enum `architecture` | `implementation`, optional; default
  generic) — selects reviewer criteria.
- `context` (string, optional) — project background, constraints.
- `previous_feedback` (string, optional) — Gemini's critique from the
  prior iteration.
- `iteration` (int, optional, default 1) — server rejects > 3.

Reviewer system prompt (per `plan_type`):
- **architecture**: gaps, contradictions, missing edge cases, risks,
  simpler alternatives, boundary/data-flow concerns.
- **implementation**: step completeness and ordering, dependency
  correctness, testable acceptance criteria, plausible file paths,
  verification/rollback steps.

Required output structure (enforced by prompt): verdict `APPROVE` /
`REVISE`, brief strengths, numbered issues (severity + concrete
suggestion each), open questions.

Tool description must teach the calling agent the protocol: pass
`previous_feedback` on iterations 2–3, stop at APPROVE or iteration 3.

### 3. Security hardening — MANDATORY, not optional

gemini-cli is an *agentic* CLI (file tools, shell). On a server, fed
third-party text, it must be castrated to pure text-in/text-out:
- Runner `settings.json` with `coreTools: []`, no MCP servers configured,
  never `--yolo` / auto-approve.
- Isolated HOME + empty working directory (dedicated low-privilege OS
  user preferred).
- Treat plan text as untrusted input end-to-end.

### 4. Config & logging

- Config: model id, timeout, concurrency, max iterations — alongside
  existing config files; no secrets (OAuth creds live in the runner HOME).
- Winston: API-key id, plan_type, iteration, chars in/out, duration,
  verdict, model. One shared quota — visibility of who spends it matters.

### 5. Errors surfaced to the client

- CLI not installed / not authenticated → explicit setup error.
- Quota/429 from CLI → "Gemini quota exhausted, retry later".
- Timeout, oversized output → structured tool errors, never hangs.

### 6. Tests (`node --test`, mock `child_process`)

Happy path (JSON parse → response), timeout kill, non-JSON output,
concurrency limit, iteration > 3 rejection, CLI-missing error.

### 7. Docs

Tool entry in server README; usage note (iteration protocol) in the tool
description itself.

## Phase 3 — Future (explicitly OUT of scope now)

Verifier mode: reviewing actual changed files. Likely shape: the **client
sends the diff** as a parameter (the calling agent already has the files),
keeping the server dumb — no repo access on the server needed. To be
planned separately.
