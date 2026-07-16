# Implementation Plan: `review_plan` MCP tool (Gemini cross-review)

Refines: `plans/review-plan-tool.md` (approved brief). **Phase 2 code only.**
Phase 1 (ops: install gemini-cli, headless OAuth, runner HOME) and Phase 3
(verifier mode) are OUT of scope.

Repo: `/home/mcp/server` — Node.js, ESM (`"type": "module"`), tabs, `const`
by default. Runtime deps already present: `zod@4`, `winston`,
`winston-daily-rotate-file`, `@modelcontextprotocol/sdk`, `express`. **No new
npm dependencies.** gemini-cli is an external binary invoked via
`node:child_process` — not an npm dependency of this project.

---

## 1. File-layout decision

**Wrapper goes in a new top-level `lib/` dir — CONFIRMED as suggested by the
brief.**

Rationale: `tools/ashlar/` is ashlar-domain-only shared code (the brief itself
warns against putting it there); `middleware/` is Express request-pipeline
code; `tools/*.js` are MCP tool entrypoints. A Gemini CLI wrapper is
general-purpose infrastructure shared by (future) tools, so a new `lib/`
directory is the correct home — consistent with how the repo already
separates concerns by directory rather than dumping shared code into a domain
folder.

Files:

| Path | Kind | Purpose |
|------|------|---------|
| `lib/gemini.js` | CREATE | execFile runner, concurrency gate, config loader, typed errors |
| `lib/gemini-prompts.js` | CREATE | reviewer system prompts per `plan_type` + prompt composer + verdict extractor |
| `config/gemini.json` | CREATE | model / timeout / concurrency / iterations / runner paths (no secrets) |
| `config/gemini.example.json` | CREATE | committed template (mirrors `oauth.example.json` precedent) |
| `tools/review_plan.js` | CREATE | MCP tool (zod schema, handler, winston logging) |
| `test/review-plan.test.js` | CREATE | `node --test`, `child_process` injected/mocked |
| `middleware/auth.js` | MODIFY | set `req.auth` so the tool handler can log the api-key id |
| `README.md` | MODIFY | tool entry + ops/config note |

`config/gemini.json` follows the `config/oauth.json` precedent (committed, no
secrets — it is NOT gitignored; only `auth.json`/`jwt.json` are). The OAuth
credentials that DO need protecting live in the runner's isolated `HOME`, never
in this repo.

---

## 2. File-by-file spec

### 2.1 `lib/gemini.js` — CLI wrapper

Imports: `execFile` from `node:child_process`, `fs`, `path`,
`fileURLToPath` from `node:url`.

**Config loader** — mirrors `middleware/user-store.js` (mtime-cached
`fs.readFileSync` + `JSON.parse`, resolve path via `fileURLToPath`):

```
export const DEFAULT_CONFIG = {
	model: "gemini-2.5-flash",
	timeoutMs: 120000,
	concurrency: 2,
	maxIterations: 3,
	geminiBin: "gemini",
	geminiHome: "",          // isolated HOME for the runner (set in config/gemini.json)
	geminiCwd: "",           // empty working dir for the runner
	maxOutputBytes: 1048576  // 1 MiB output cap
};

export function loadGeminiConfig() { /* mtime-cached read of config/gemini.json, merged over DEFAULT_CONFIG; on any read/parse failure keep previous cache or fall back to DEFAULT_CONFIG */ }
```

**Typed error:**

```
export class GeminiError extends Error {
	constructor(code, message) { super(message); this.name = "GeminiError"; this.code = code; }
}
```

Error codes: `BUSY`, `CLI_MISSING`, `TIMEOUT`, `OVERSIZED`, `QUOTA`,
`NON_JSON`, `CLI_ERROR`.

**Runner** — `execFile`, **no shell**, prompt piped via **stdin**, hard
timeout with process kill, concurrency cap, output-size cap, robust parse.
Dependency-injected `execFileFn` (defaults to real `execFile`) so tests never
spawn:

```
let inFlight = 0;

export function runGemini(prompt, { config, execFileFn = execFile } = {}) {
	const cfg = config || loadGeminiConfig();
	if (inFlight >= cfg.concurrency) {
		return Promise.reject(new GeminiError("BUSY",
			"Gemini reviewer is busy (max concurrent reviews reached). Retry shortly."));
	}
	inFlight++;
	return new Promise((resolve, reject) => {
		const args = ["--output-format", "json", "-m", cfg.model];
		// Explicit, minimal env — HOME/cwd isolated per §3. NEVER inherit full process.env.
		const opts = {
			cwd: cfg.geminiCwd,
			env: { PATH: process.env.PATH, HOME: cfg.geminiHome },
			timeout: cfg.timeoutMs,     // execFile kills the child on expiry
			killSignal: "SIGTERM",
			maxBuffer: cfg.maxOutputBytes,
			windowsHide: true
		};
		let settled = false;
		const done = (fn, arg) => { if (!settled) { settled = true; inFlight--; fn(arg); } };
		let child;
		try {
			child = execFileFn(cfg.geminiBin, args, opts, (err, stdout, stderr) => {
				if (err) {
					if (err.code === "ENOENT")
						return done(reject, new GeminiError("CLI_MISSING",
							"gemini-cli not found or not authenticated. Install @google/gemini-cli and complete the runner OAuth login."));
					if (err.killed || err.signal === "SIGTERM" || err.code === "ETIMEDOUT")
						return done(reject, new GeminiError("TIMEOUT", `Gemini review timed out after ${cfg.timeoutMs} ms.`));
					if (err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
						return done(reject, new GeminiError("OVERSIZED", "Gemini output exceeded the configured size cap."));
					const blob = `${stderr || ""} ${err.message || ""}`;
					if (/429|quota|rate.?limit|resource.?exhausted/i.test(blob))
						return done(reject, new GeminiError("QUOTA", "Gemini quota exhausted, retry later."));
					return done(reject, new GeminiError("CLI_ERROR", `gemini-cli failed: ${blob.trim().slice(0, 500)}`));
				}
				let parsed;
				try { parsed = JSON.parse(stdout); }
				catch { return done(reject, new GeminiError("NON_JSON", "Gemini returned non-JSON output.")); }
				const text = typeof parsed.response === "string" ? parsed.response : null;
				if (!text) return done(reject, new GeminiError("NON_JSON", 'Gemini JSON had no usable "response" field.'));
				return done(resolve, { text, parsed });
			});
		} catch (e) {
			return done(reject, new GeminiError("CLI_MISSING", `Failed to spawn gemini-cli: ${e.message}`));
		}
		// Long plans go via stdin to avoid ARG_MAX.
		try {
			if (child && child.stdin) {
				child.stdin.on?.("error", () => {});   // swallow EPIPE; the exec callback owns the outcome
				child.stdin.write(prompt);
				child.stdin.end();
			}
		} catch { /* callback path handles failure */ }
	});
}
```

Notes:
- `execFile` with a callback returns a `ChildProcess`; we write the prompt to
  `child.stdin` and `end()` it. The `execFileFn` seam is what makes the tests
  hermetic.
- `env` is built explicitly (only `PATH` + isolated `HOME`) — the process
  never inherits the server's full environment. This is a hard security
  requirement (§3), not a nicety.
- The concurrency gate is fail-fast (clear `BUSY` error) rather than queuing —
  deterministic and directly testable; acceptable per brief ("queue briefly or
  fail with a clear busy error").

### 2.2 `lib/gemini-prompts.js` — reviewer prompts + composer

Plain string constants (server-side logic prompts; the frontend "no hardcoded
strings" rule does not apply to LLM reviewer instructions).

```
const OUTPUT_CONTRACT = `Respond in GitHub-flavored Markdown with EXACTLY these sections, in order:

## Verdict
A single word on its own line: APPROVE or REVISE.

## Strengths
2–4 bullet points on what the plan gets right.

## Issues
A numbered list. Each item: **[severity: high|medium|low]** the problem, then a concrete, actionable suggestion to fix it. If there are no issues, write "None".

## Open Questions
Bullet points for anything ambiguous or unspecified. If none, write "None".`;

const CRITERIA = {
	architecture:
		"You are a senior software architect doing an independent design review. " +
		"Judge the plan for: gaps and missing requirements, internal contradictions, " +
		"missing edge cases, risks and failure modes, simpler alternatives, and " +
		"boundary / data-flow / responsibility concerns.",
	implementation:
		"You are a senior engineer reviewing an implementation / executor plan. " +
		"Judge it for: step completeness and correct ordering, dependency correctness, " +
		"testable acceptance criteria, plausible and consistent file paths, and the " +
		"presence of verification and rollback steps.",
	generic:
		"You are a senior reviewer giving an independent critique of the plan below. " +
		"Assess correctness, completeness, risks, and clarity."
};

export function buildReviewPrompt({ planType, context, previousFeedback, plan }) {
	const criteria = CRITERIA[planType] || CRITERIA.generic;
	const parts = [criteria, "", OUTPUT_CONTRACT, ""];
	if (context) parts.push("## Project Context", context, "");
	if (previousFeedback) parts.push(
		"## Your Previous Feedback (the author revised the plan to address this)",
		previousFeedback, "");
	parts.push("## Plan Under Review", plan);
	return parts.join("\n");
}

export function extractVerdict(text) {
	if (!text) return "UNKNOWN";
	const m = text.match(/\b(APPROVE|REVISE)\b/i);
	return m ? m[1].toUpperCase() : "UNKNOWN";
}
```

### 2.3 `config/gemini.json` (+ `config/gemini.example.json`)

Tabs, no secrets. Identical shape in both files; the example uses placeholder
paths.

```
{
	"model": "gemini-2.5-flash",
	"timeoutMs": 120000,
	"concurrency": 2,
	"maxIterations": 3,
	"geminiBin": "gemini",
	"geminiHome": "/home/gemini-runner",
	"geminiCwd": "/home/gemini-runner/work",
	"maxOutputBytes": 1048576
}
```

`geminiHome` / `geminiCwd` are provisioned by Phase 1 ops (isolated
low-privilege user HOME containing `.gemini/settings.json` + cached OAuth
creds, and an empty working dir). The example file uses
`"/path/to/gemini-runner"` placeholders and a comment-free JSON body (JSON has
no comments — document the fields in README instead).

### 2.4 `tools/review_plan.js` — MCP tool

Follows the `name` / `definition` / `handler` export contract that
`server.js` auto-loads (`tools/*.js`, skipping `knowledge`). Winston logger
constructed exactly like `tools/knowledge/index.js` (DailyRotateFile into
`logs/`).

zod inputSchema (zod v4, matches existing tools' `.describe()` style):

- `plan`: `z.string().min(1)` — required, the plan markdown.
- `plan_type`: `z.enum(["architecture", "implementation"]).optional()` — omit
  for a generic review.
- `context`: `z.string().optional()`.
- `previous_feedback`: `z.string().optional()`.
- `iteration`: `z.number().int().min(1).optional()` — server rejects
  `> maxIterations` (default 3).

Handler signature `async (args, extra)` — the MCP SDK passes
`RequestHandlerExtra` as the second argument; `extra.authInfo.clientId`
carries the api-key id once §2.6 is in place (fallback `"unknown"`).

Behavior:
1. `const cfg = loadGeminiConfig();` `const planType = plan_type || "generic";`
   `const apiKeyId = extra?.authInfo?.clientId ?? "unknown";`
2. If `iteration > cfg.maxIterations` → return
   `{ content: [{ type: "text", text: "Iteration N exceeds the maximum of M. Stop iterating and finalize your plan." }], isError: true }`.
   (No spawn.)
3. Build prompt via `buildReviewPrompt`. `const start = Date.now();`
4. `try { const { text } = await runGemini(prompt, { config: cfg }); ... }`
   - Success: `verdict = extractVerdict(text)`;
     `logger.info({ event: "review_plan", apiKeyId, plan_type: planType, iteration, charsIn: prompt.length, charsOut: text.length, durationMs, verdict, model: cfg.model })`;
     return `{ content: [{ type: "text", text }] }`.
5. `catch (e)`:
   `logger.warn({ event: "review_plan_failed", apiKeyId, plan_type: planType, iteration, charsIn: prompt.length, durationMs, code: e.code || "ERROR", model: cfg.model, error: e.message })`;
   return `{ content: [{ type: "text", text: e.message }], isError: true }`.

`isError: true` is standard MCP `CallToolResult` — used only for genuine
failures (busy, timeout, quota, CLI-missing, oversized, iteration cap). Normal
reviews return plain content text like the other tools.

The `definition.description` MUST teach the calling agent the loop protocol
(see the exact text in the executor prompt, step 4).

### 2.5 Config additions

Handled by `config/gemini.json` (§2.3) + `DEFAULT_CONFIG` fallback in
`lib/gemini.js`. No env vars introduced (the repo's env-var usage is limited to
`DOCS_CORPUS_ROOTS` / `PORT`; config for this tool belongs in a config file per
the brief).

### 2.6 `middleware/auth.js` — surface api-key id to the handler

The MCP SDK forwards `req.auth` to tool handlers as `extra.authInfo`
(verified: `streamableHttp.js` reads `const authInfo = req.auth` and passes it
through). Currently `auth.js` sets `req.user` / `req.authUser` but not
`req.auth`, so handlers cannot see who is calling. Add a minimal, additive
`req.auth` assignment at BOTH success points (JWT branch and API-key branch),
just before `next()`:

```
req.auth = { token: "***", clientId, scopes: [], extra: { username } };
```

- JWT branch: `clientId` = the JWT `clientId`, `username` = `clientId`.
- API-key branch: `clientId` = the `X-Client-Id`, `username` = resolved
  username.
- `token` is redacted (`"***"`) — nothing downstream verifies it; we only need
  `clientId` for quota-attribution logging. This is purely additive and does
  not alter any existing auth decision.

---

## 3. Security hardening — MANDATORY (brief §3, verbatim requirements)

gemini-cli is an agentic CLI (file + shell tools). Fed untrusted third-party
plan text on a server, it MUST be reduced to pure text-in / text-out:

1. **Runner `settings.json` with `coreTools: []`** — no built-in tools, **no
   MCP servers configured**, and the runner is **never** invoked with `--yolo`
   or any auto-approve/approval-mode flag. `lib/gemini.js` passes ONLY
   `["--output-format", "json", "-m", <model>]` — no tool-enabling or
   approval flags, ever. The `settings.json` lives at
   `${geminiHome}/.gemini/settings.json` and is provisioned by Phase 1 ops.
2. **Isolated `HOME` + empty working directory** — `lib/gemini.js` sets
   `env.HOME = cfg.geminiHome` and `cwd = cfg.geminiCwd` **explicitly** on
   every spawn and builds `env` from scratch (`{ PATH, HOME }` only) so the
   child never inherits the server process's environment or working directory.
   A dedicated low-privilege OS user is preferred (ops).
3. **Plan text is untrusted end-to-end** — it is only ever written to the
   child's **stdin** as prompt data; it is never interpolated into argv, a
   shell command, a file path, or any config. `execFile` (no shell) removes
   shell-injection surface.

The code plan's responsibility is (1) never passing tool/approval flags, (2)
explicit `HOME`/`cwd`/`env` on spawn, (3) stdin-only untrusted input. The
runner user, `settings.json`, and OAuth creds are Phase 1 ops.

---

## 4. Tests spec — `test/review-plan.test.js` (`node --test`)

Style matches `test/ashlar-handlers.test.js` (`import { test, describe } from
"node:test"`, `import assert from "node:assert/strict"`, direct handler/function
imports). `child_process` is never actually spawned — the runner's injected
`execFileFn` seam is used; the handler-level test hits the pre-spawn iteration
guard.

Helper — a fake `execFileFn` returning a stub child and invoking the callback
on a microtask:

```
function fakeExec(result) {
	return (file, args, opts, cb) => {
		const child = { stdin: { write() {}, end() {}, on() {} } };
		queueMicrotask(() => cb(result.error || null, result.stdout ?? "", result.stderr ?? ""));
		return child;
	};
}
```

Cases (all against `runGemini` unless noted), each with its own assertion:

1. **Happy path** — `fakeExec({ stdout: JSON.stringify({ response: "## Verdict\nAPPROVE\n..." }) })`
   → resolves; `result.text` contains `APPROVE`; `extractVerdict(result.text) === "APPROVE"`.
2. **Timeout kill** — `fakeExec({ error: Object.assign(new Error("killed"), { killed: true, signal: "SIGTERM" }) })`
   → rejects with `GeminiError` code `TIMEOUT`.
3. **Non-JSON output** — `fakeExec({ stdout: "this is not json" })`
   → rejects code `NON_JSON`.
4. **Concurrency limit** — config `{ ...DEFAULT_CONFIG, concurrency: 1 }`; a
   "held" `execFileFn` that stores its callback without invoking it; start call
   #1 (do not await), assert call #2 rejects `/busy/i` (code `BUSY`), then
   release call #1's callback and await it so `inFlight` returns to 0 (no
   cross-test leak).
5. **Iteration > 3 rejection** — `import { handler }`; call
   `handler({ plan: "x", iteration: 4 })` → result `isError === true` and text
   matches `/exceeds the maximum/`. (Returns before any spawn.)
6. **CLI-missing** — `fakeExec({ error: Object.assign(new Error("nope"), { code: "ENOENT" }) })`
   → rejects code `CLI_MISSING`.

(Optional extra: `QUOTA` via `fakeExec({ error: Object.assign(new Error("429"), { code: 1 }), stderr: "Resource exhausted" })` → code `QUOTA`.)

Import `runGemini`, `GeminiError`, `DEFAULT_CONFIG` from `../lib/gemini.js`;
`handler` from `../tools/review_plan.js`; `extractVerdict` from
`../lib/gemini-prompts.js`. Because `inFlight` is module-global, every case
must await settlement (case 4's release covers the held call) so state does not
bleed between tests.

---

## 5. Docs — `README.md`

Add a subsection under the MCP-tools area (near "Healthcheck", section ~93–96),
in Macedonian to match the file, e.g.:

> ### review_plan
>
> MCP алатка (`tools/review_plan.js`) што праќа план (архитектонски или
> имплементациски) на независен Gemini рецензент преку `gemini-cli`
> (subscription OAuth, НЕ API клуч). Алатката е stateless — повикувачкиот агент
> ја води јамката: draft → review → revise, најмногу 3 итерации; на итерации
> 2–3 се проследува `previous_feedback`; застани на `APPROVE` или итерација 3.
> Конфигурација: `config/gemini.json` (модел, timeout, concurrency, max
> iterations, изолиран runner `HOME`/`cwd`). Логира: api-key id, plan_type,
> iteration, chars in/out, времетраење, verdict, модел. Безбедност: gemini-cli
> е ограничен на чист текст-влез/текст-излез (`coreTools: []`, изолиран
> `HOME`/празен `cwd`, никогаш `--yolo`).

Also add a config line near the `config/oauth.json` bullet noting
`config/gemini.json` (копирај од `config/gemini.example.json`), нема тајни —
OAuth креденцијалите живеат во runner `HOME`.

The **iteration protocol** itself is taught in the tool's `description` (§2.4)
so calling agents learn it without reading the README.

---

## 6. Deviations from the brief

1. **Concurrency = fail-fast `BUSY`**, not a real queue. The brief permits
   "queue briefly OR fail with a clear busy error"; fail-fast is deterministic
   and directly testable. Chosen deliberately.
2. **`middleware/auth.js` gains a `req.auth` assignment.** The brief requires
   logging the api-key id (§4) but the current architecture never surfaces the
   caller to tool handlers. This minimal, additive change is the smallest way
   to satisfy that requirement; it changes no auth decision. Flagged because it
   touches a file outside `lib/` + `tools/`.
3. **`isError: true`** on failure results — standard MCP `CallToolResult`
   field; the existing ashlar tools happen not to use it, but structured error
   surfacing (brief §5) is better served by it. Normal reviews stay plain-text.
4. **Two `lib/` files** (`gemini.js` + `gemini-prompts.js`) instead of one, to
   keep the spawn/concurrency logic separately testable from the prompt text.

---

## Executor Prompt

**Context.** Add an MCP tool `review_plan` to the ln-ashlar MCP server
(`/home/mcp/server`, Node.js ESM). It submits a plan to an independent Gemini
reviewer via the external `gemini-cli` binary (invoked through
`node:child_process`) and returns the critique. The calling agent drives a
max-3-iteration review loop; the server is stateless. No new npm dependencies.

**Constraints.**
- Tabs for indentation. `const` by default, `let` only when reassigned, never
  `var`. ESM `import`/`export` throughout.
- No new npm dependencies. gemini-cli is an OS binary, not an npm dep.
- Tool files export `name`, `definition`, `handler` (auto-loaded by
  `server.js` from `tools/*.js`).
- Untrusted plan text goes ONLY to the child's stdin — never into argv, a
  shell, or a path. Use `execFile` (no shell). Set `HOME`/`cwd`/`env`
  explicitly on spawn; never pass `--yolo` or any tool/approval flag.

**Prerequisites — read these first.**
- `/home/mcp/server/plans/review-plan-tool-impl.md` (this plan — full specs
  and exact code sketches in §2).
- `/home/mcp/server/tools/get_component.js` and
  `/home/mcp/server/tools/validate_docs.js` — tool export shape, zod
  `.describe()` style, `{ content: [{ type: "text", text }] }` return.
- `/home/mcp/server/tools/knowledge/index.js` (lines 1–45) — the exact winston
  `createLogger` + `DailyRotateFile` setup to copy.
- `/home/mcp/server/middleware/user-store.js` — the mtime-cached
  `fileURLToPath` + `fs.readFileSync` + `JSON.parse` config-loader pattern.
- `/home/mcp/server/middleware/auth.js` — the two success points to add
  `req.auth` to.
- `/home/mcp/server/test/ashlar-handlers.test.js` (lines 1–20) — test import
  style.
- `/home/mcp/server/config/oauth.example.json` — config file formatting (tabs).

**Steps.**

1. CREATE `/home/mcp/server/lib/gemini.js` — implement `DEFAULT_CONFIG`,
   `loadGeminiConfig()` (mtime-cached read of `config/gemini.json` merged over
   `DEFAULT_CONFIG`, resilient fallback on failure), `GeminiError` class, and
   `runGemini(prompt, { config, execFileFn = execFile })` exactly as sketched
   in plan §2.1: module-level `inFlight` concurrency gate → `BUSY`; `execFile`
   with args `["--output-format", "json", "-m", cfg.model]`; explicit `opts`
   with `cwd`, `env: { PATH: process.env.PATH, HOME: cfg.geminiHome }`,
   `timeout`, `killSignal: "SIGTERM"`, `maxBuffer: cfg.maxOutputBytes`,
   `windowsHide: true`; prompt written to `child.stdin` then `end()`; error
   mapping ENOENT→`CLI_MISSING`, killed/SIGTERM/ETIMEDOUT→`TIMEOUT`,
   `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`→`OVERSIZED`,
   429/quota/rate-limit/resource-exhausted→`QUOTA`, other non-zero→`CLI_ERROR`;
   success parses stdout JSON, requires string `parsed.response`, else
   `NON_JSON`. Export `DEFAULT_CONFIG`, `loadGeminiConfig`, `GeminiError`,
   `runGemini`.

2. CREATE `/home/mcp/server/lib/gemini-prompts.js` — `OUTPUT_CONTRACT`,
   `CRITERIA` (`architecture` / `implementation` / `generic`),
   `buildReviewPrompt({ planType, context, previousFeedback, plan })`, and
   `extractVerdict(text)` exactly as in plan §2.2. Export `buildReviewPrompt`
   and `extractVerdict`.

3. CREATE `/home/mcp/server/config/gemini.json` and
   `/home/mcp/server/config/gemini.example.json` — tab-indented JSON with keys
   `model`, `timeoutMs`, `concurrency`, `maxIterations`, `geminiBin`,
   `geminiHome`, `geminiCwd`, `maxOutputBytes` (values from plan §2.3). In the
   `.example.json` use placeholder paths (`/path/to/gemini-runner` and
   `/path/to/gemini-runner/work`).

4. CREATE `/home/mcp/server/tools/review_plan.js` — winston logger copied from
   `knowledge/index.js`; `export const name = "review_plan"`; `definition`
   with `title: "Review Plan"` and this exact `description`:

   > "Submit a plan (architecture spec OR implementation/executor plan) to an
   > independent Gemini reviewer for critique. Stateless — YOU drive the loop.
   > Protocol: (1) call with your `plan` and `plan_type`; (2) read the returned
   > critique (a Verdict of APPROVE or REVISE, plus numbered issues); (3) if
   > REVISE, revise your plan and call again with `iteration` incremented AND
   > `previous_feedback` set to the critique you just received; (4) STOP when
   > the Verdict is APPROVE or when `iteration` reaches 3 — the server rejects
   > `iteration` > 3. Pass `context` (project background/constraints) on every
   > call so the reviewer judges against your constraints."

   inputSchema per plan §2.4 (zod v4, `.describe()` each). `handler(args,
   extra)` per plan §2.4: resolve `cfg`, `planType`, `apiKeyId =
   extra?.authInfo?.clientId ?? "unknown"`; iteration-cap guard returning
   `isError: true`; build prompt; `await runGemini(prompt, { config: cfg })`;
   on success log `event: "review_plan"` with `apiKeyId, plan_type, iteration,
   charsIn, charsOut, durationMs, verdict, model` and return the text; on catch
   log `event: "review_plan_failed"` and return `{ content: [...], isError:
   true }` with `e.message`. Export `name`, `definition`, `handler`.

5. MODIFY `/home/mcp/server/middleware/auth.js` — at BOTH success points (JWT
   branch after `req.authUser = clientId`, and API-key branch after
   `req.authUser = username`) add:
   `req.auth = { token: "***", clientId, scopes: [], extra: { username } };`
   (JWT branch: `username` is `clientId`.) Purely additive; change no existing
   logic.

6. CREATE `/home/mcp/server/test/review-plan.test.js` — per plan §4. Import
   `runGemini`, `GeminiError`, `DEFAULT_CONFIG` from `../lib/gemini.js`,
   `extractVerdict` from `../lib/gemini-prompts.js`, `handler` from
   `../tools/review_plan.js`. Implement the `fakeExec` helper and all six
   required cases (happy path, timeout kill, non-JSON, concurrency `BUSY`,
   iteration > 3 via `handler`, CLI-missing). Ensure every case awaits
   settlement so module-global `inFlight` never leaks (case 4 must release its
   held callback and await).

7. MODIFY `/home/mcp/server/README.md` — add the `review_plan` subsection near
   the Healthcheck section and a `config/gemini.json` note near the
   `config/oauth.json` bullet, per plan §5 (Macedonian, matching the file).

**Event/data flow (primary action — one review round):**

```
MCP client (calling agent)
  → tools/review_plan.js handler(args, extra)
      guard: iteration > cfg.maxIterations → isError result (STOP, no spawn)
      buildReviewPrompt(planType, context, previousFeedback, plan)
  → lib/gemini.js runGemini(prompt, { config })
      inFlight gate (BUSY if at cap)
      execFile("gemini", ["--output-format","json","-m",model],
               { cwd, env:{PATH,HOME}, timeout, maxBuffer })  ← prompt via stdin
  → gemini-cli (isolated HOME/cwd, coreTools:[])  → JSON { response, ... } on stdout
  → runGemini parses → { text, parsed }  (or GeminiError)
  → handler: extractVerdict(text); winston.info{apiKeyId,plan_type,iteration,
             charsIn,charsOut,durationMs,verdict,model}
  → { content: [{ type:"text", text }] }  back to the calling agent
      (agent: if REVISE → revise, iteration+1, previous_feedback=text, repeat ≤3)
```

**Acceptance criteria.**
- `cd /home/mcp/server && npm test` passes, including all six new cases in
  `test/review-plan.test.js`.
- `node -e "import('./tools/review_plan.js').then(m => { if (m.name==='review_plan' && m.definition && m.handler) { console.log('OK'); } else { process.exit(1); } })"`
  prints `OK`.
- `node -e "import('./lib/gemini.js').then(m => console.log(typeof m.runGemini, typeof m.loadGeminiConfig, typeof m.GeminiError))"`
  prints `function function function`.
- `grep -n "req.auth" /home/mcp/server/middleware/auth.js` shows two matches.
- No new entries under `dependencies` in `package.json`.
- `review_plan.js` passes ONLY `["--output-format","json","-m",...]` to
  execFile — no `--yolo`, no tool/approval flags (`grep -n "yolo\|coreTools\|--approval" lib/gemini.js` → no argv usage).

**Boundaries — do NOT touch.**
- Do not modify `server.js` (tool auto-loads from `tools/*.js`).
- Do not modify any existing `tools/*.js`, `tools/ashlar/*`, or existing tests.
- Do not add npm dependencies or run `npm install`.
- Do not create the runner OS user, `.gemini/settings.json`, or perform the
  gemini-cli OAuth login — that is Phase 1 ops, out of scope.
- Do not implement Phase 3 verifier/diff mode.
- Do not run any `git` command.

**Verify:** `cd /home/mcp/server && npm test`
