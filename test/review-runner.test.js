import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectReviewerEngine, runReview } from "../lib/review-runner.js";

describe("detectReviewerEngine — crossover routing", () => {
	test("explicit reviewer overrides any caller", () => {
		assert.equal(detectReviewerEngine({ reviewer: "gemini", caller: "antigravity" }), "gemini");
		assert.equal(detectReviewerEngine({ reviewer: "claude", caller: "claude" }), "claude");
	});

	test("Claude caller routes to Gemini reviewer", () => {
		assert.equal(detectReviewerEngine({ caller: "claude-code" }), "gemini");
		assert.equal(detectReviewerEngine({ clientInfo: { name: "claude" } }), "gemini");
		assert.equal(detectReviewerEngine({ authInfo: { clientId: "anthropic-agent" } }), "gemini");
	});

	test("Antigravity / Gemini caller routes to Claude reviewer", () => {
		assert.equal(detectReviewerEngine({ caller: "antigravity" }), "claude");
		assert.equal(detectReviewerEngine({ clientInfo: { name: "Antigravity-IDE" } }), "claude");
		assert.equal(detectReviewerEngine({ authInfo: { clientId: "sojic" } }), "claude");
	});

	test("Unknown caller defaults to Claude", () => {
		assert.equal(detectReviewerEngine({}), "claude");
		assert.equal(detectReviewerEngine({ caller: "unknown-agent" }), "claude");
	});
});

describe("runReview — routing execution", () => {
	function fakeExec(result) {
		return (file, args, opts, cb) => {
			const child = { stdin: { write() {}, end() {}, on() {} } };
			queueMicrotask(() => cb(result.error || null, result.stdout ?? "", result.stderr ?? ""));
			return child;
		};
	}

	test("routes to Gemini when caller is claude", async () => {
		const execFileFn = fakeExec({
			stdout: JSON.stringify({ response: "## Verdict\nAPPROVE\n" })
		});
		const res = await runReview("plan", { caller: "claude", execFileFn });
		assert.equal(res.engine, "gemini");
		assert.match(res.text, /APPROVE/);
	});

	test("routes to Claude when caller is antigravity", async () => {
		const execFileFn = fakeExec({
			stdout: JSON.stringify({ type: "result", is_error: false, result: "## Verdict\nAPPROVE\n" })
		});
		const res = await runReview("plan", { caller: "antigravity", execFileFn });
		assert.equal(res.engine, "claude");
		assert.match(res.text, /APPROVE/);
	});
});
