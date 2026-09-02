import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runClaude, ClaudeError, DEFAULT_CLAUDE_CONFIG } from "../lib/claude.js";
import { extractVerdict } from "../lib/gemini-prompts.js";

function fakeExec(result) {
	return (file, args, opts, cb) => {
		const child = { stdin: { write() {}, end() {}, on() {} } };
		queueMicrotask(() => cb(result.error || null, result.stdout ?? "", result.stderr ?? ""));
		return child;
	};
}

describe("runClaude — happy path", () => {
	test("resolves with text containing APPROVE, extractVerdict matches", async () => {
		const execFileFn = fakeExec({
			stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "## Verdict\nAPPROVE\nAll good." })
		});
		const result = await runClaude("some plan", { config: DEFAULT_CLAUDE_CONFIG, execFileFn });
		assert.match(result.text, /APPROVE/);
		assert.equal(extractVerdict(result.text), "APPROVE");
	});

	test("handles terminal prefix noise before JSON", async () => {
		const execFileFn = fakeExec({
			stdout: "B " + JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "## Verdict\nAPPROVE\n" })
		});
		const result = await runClaude("some plan", { config: DEFAULT_CLAUDE_CONFIG, execFileFn });
		assert.match(result.text, /APPROVE/);
	});
});

describe("runClaude — timeout kill", () => {
	test("rejects with ClaudeError code TIMEOUT", async () => {
		const execFileFn = fakeExec({ error: Object.assign(new Error("killed"), { killed: true, signal: "SIGTERM" }) });
		await assert.rejects(
			() => runClaude("some plan", { config: DEFAULT_CLAUDE_CONFIG, execFileFn }),
			(e) => {
				assert.ok(e instanceof ClaudeError);
				assert.equal(e.code, "TIMEOUT");
				return true;
			}
		);
	});
});

describe("runClaude — non-JSON output", () => {
	test("rejects with ClaudeError code NON_JSON", async () => {
		const execFileFn = fakeExec({ stdout: "not json at all" });
		await assert.rejects(
			() => runClaude("some plan", { config: DEFAULT_CLAUDE_CONFIG, execFileFn }),
			(e) => {
				assert.ok(e instanceof ClaudeError);
				assert.equal(e.code, "NON_JSON");
				return true;
			}
		);
	});
});

describe("runClaude — concurrency limit", () => {
	test("second call rejects BUSY while first is held; releasing first restores inFlight", async () => {
		const cfg = { ...DEFAULT_CLAUDE_CONFIG, concurrency: 1 };
		let heldCb;
		const heldExecFileFn = (file, args, opts, cb) => {
			heldCb = cb;
			return { stdin: { write() {}, end() {}, on() {} } };
		};

		const firstPromise = runClaude("plan A", { config: cfg, execFileFn: heldExecFileFn });

		await assert.rejects(
			() => runClaude("plan B", { config: cfg, execFileFn: fakeExec({ stdout: JSON.stringify({ result: "x" }) }) }),
			/busy/i
		);

		heldCb(null, JSON.stringify({ type: "result", is_error: false, result: "## Verdict\nAPPROVE\n" }), "");
		await firstPromise;
	});
});

describe("runClaude — CLI missing", () => {
	test("rejects with ClaudeError code CLI_MISSING", async () => {
		const execFileFn = fakeExec({ error: Object.assign(new Error("nope"), { code: "ENOENT" }) });
		await assert.rejects(
			() => runClaude("some plan", { config: DEFAULT_CLAUDE_CONFIG, execFileFn }),
			(e) => {
				assert.ok(e instanceof ClaudeError);
				assert.equal(e.code, "CLI_MISSING");
				return true;
			}
		);
	});
});

describe("runClaude — auth error detection", () => {
	test("rejects with ClaudeError code AUTH_ERROR when session expired", async () => {
		const execFileFn = fakeExec({
			stdout: JSON.stringify({
				type: "result",
				is_error: true,
				result: "Failed to authenticate: OAuth session expired and could not be refreshed"
			})
		});
		await assert.rejects(
			() => runClaude("some plan", { config: DEFAULT_CLAUDE_CONFIG, execFileFn }),
			(e) => {
				assert.ok(e instanceof ClaudeError);
				assert.equal(e.code, "AUTH_ERROR");
				assert.match(e.message, /authentication error/i);
				return true;
			}
		);
	});
});
