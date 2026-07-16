import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runGemini, GeminiError, DEFAULT_CONFIG } from "../lib/gemini.js";
import { extractVerdict } from "../lib/gemini-prompts.js";
import { handler } from "../tools/review_plan.js";

function fakeExec(result) {
	return (file, args, opts, cb) => {
		const child = { stdin: { write() {}, end() {}, on() {} } };
		queueMicrotask(() => cb(result.error || null, result.stdout ?? "", result.stderr ?? ""));
		return child;
	};
}

describe("runGemini — happy path", () => {
	test("resolves with text containing APPROVE, extractVerdict matches", async () => {
		const execFileFn = fakeExec({ stdout: JSON.stringify({ response: "## Verdict\nAPPROVE\n..." }) });
		const result = await runGemini("some plan", { config: DEFAULT_CONFIG, execFileFn });
		assert.match(result.text, /APPROVE/);
		assert.equal(extractVerdict(result.text), "APPROVE");
	});
});

describe("runGemini — timeout kill", () => {
	test("rejects with GeminiError code TIMEOUT", async () => {
		const execFileFn = fakeExec({ error: Object.assign(new Error("killed"), { killed: true, signal: "SIGTERM" }) });
		await assert.rejects(
			() => runGemini("some plan", { config: DEFAULT_CONFIG, execFileFn }),
			(e) => {
				assert.ok(e instanceof GeminiError);
				assert.equal(e.code, "TIMEOUT");
				return true;
			}
		);
	});
});

describe("runGemini — non-JSON output", () => {
	test("rejects with GeminiError code NON_JSON", async () => {
		const execFileFn = fakeExec({ stdout: "this is not json" });
		await assert.rejects(
			() => runGemini("some plan", { config: DEFAULT_CONFIG, execFileFn }),
			(e) => {
				assert.ok(e instanceof GeminiError);
				assert.equal(e.code, "NON_JSON");
				return true;
			}
		);
	});
});

describe("runGemini — concurrency limit", () => {
	test("second call rejects BUSY while first is held; releasing first restores inFlight", async () => {
		const cfg = { ...DEFAULT_CONFIG, concurrency: 1 };
		let heldCb;
		const heldExecFileFn = (file, args, opts, cb) => {
			heldCb = cb;
			return { stdin: { write() {}, end() {}, on() {} } };
		};

		const firstPromise = runGemini("plan A", { config: cfg, execFileFn: heldExecFileFn });

		await assert.rejects(
			() => runGemini("plan B", { config: cfg, execFileFn: fakeExec({ stdout: JSON.stringify({ response: "x" }) }) }),
			/busy/i
		);

		heldCb(null, JSON.stringify({ response: "## Verdict\nAPPROVE\n..." }), "");
		await firstPromise;
	});
});

describe("review_plan handler — iteration cap", () => {
	test("iteration > 3 returns isError with exceeds-the-maximum message, no spawn", async () => {
		const result = await handler({ plan: "x", iteration: 4 });
		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /exceeds the maximum/);
	});
});

describe("runGemini — CLI missing", () => {
	test("rejects with GeminiError code CLI_MISSING", async () => {
		const execFileFn = fakeExec({ error: Object.assign(new Error("nope"), { code: "ENOENT" }) });
		await assert.rejects(
			() => runGemini("some plan", { config: DEFAULT_CONFIG, execFileFn }),
			(e) => {
				assert.ok(e instanceof GeminiError);
				assert.equal(e.code, "CLI_MISSING");
				return true;
			}
		);
	});
});

describe("runGemini — quota exhausted (optional extra)", () => {
	test("rejects with GeminiError code QUOTA", async () => {
		const execFileFn = fakeExec({ error: Object.assign(new Error("429"), { code: 1 }), stderr: "Resource exhausted" });
		await assert.rejects(
			() => runGemini("some plan", { config: DEFAULT_CONFIG, execFileFn }),
			(e) => {
				assert.ok(e instanceof GeminiError);
				assert.equal(e.code, "QUOTA");
				return true;
			}
		);
	});
});
