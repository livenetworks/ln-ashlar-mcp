import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runGemini, GeminiError, DEFAULT_CONFIG } from "../lib/gemini.js";
import { extractVerdict, buildReviewPrompt } from "../lib/gemini-prompts.js";
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

describe("buildReviewPrompt — iteration continuity", () => {
	test("includes 'Progress Since Last Review' when previousFeedback is set", () => {
		const prompt = buildReviewPrompt({
			planType: "implementation",
			plan: "some plan",
			previousFeedback: "previous critique text"
		});
		assert.match(prompt, /Progress Since Last Review/);
	});

	test("omits 'Progress Since Last Review' when previousFeedback is absent", () => {
		const prompt = buildReviewPrompt({
			planType: "implementation",
			plan: "some plan"
		});
		assert.doesNotMatch(prompt, /Progress Since Last Review/);
	});
});

describe("buildReviewPrompt — wrap_up retrospective", () => {
	test("wrapUp true produces the retrospective instruction and omits the normal criteria", () => {
		const prompt = buildReviewPrompt({
			planType: "implementation",
			plan: "final plan text",
			previousFeedback: "critique 1\ncritique 2",
			wrapUp: true
		});
		assert.match(prompt, /Review Summary/);
		assert.doesNotMatch(prompt, /senior engineer reviewing an implementation/);
	});
});

describe("review_plan handler — wrap_up exempt from iteration cap", () => {
	test("wrap_up: true with iteration 4 does not trigger the iteration-cap rejection", async () => {
		// The handler builds its own config/spawn via loadGeminiConfig()/runGemini() with no
		// injectable execFileFn seam, and the real gemini-cli is installed + quota-exhausted on
		// this host — a live call must not happen. Blanking PATH forces any attempted spawn of
		// "gemini" to fail fast with ENOENT (CLI_MISSING) inside the child's own environment,
		// without ever reaching the network/CLI. This still proves the iteration-cap guard
		// (which short-circuits BEFORE any spawn) was skipped: if the cap had fired we'd see the
		// "exceeds the maximum" text; instead we see the CLI_MISSING failure from the (blocked)
		// spawn attempt, proving execution proceeded past the guard.
		const originalPath = process.env.PATH;
		process.env.PATH = "";
		try {
			const result = await handler({ plan: "final plan", iteration: 4, wrap_up: true, previous_feedback: "c1\nc2" });
			assert.doesNotMatch(result.content[0].text, /exceeds the maximum/);
			assert.equal(result.isError, true);
			assert.match(result.content[0].text, /gemini-cli not found/);
		} finally {
			process.env.PATH = originalPath;
		}
	});
});
