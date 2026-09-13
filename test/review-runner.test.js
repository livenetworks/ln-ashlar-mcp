import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectReviewerEngine, runReview } from "../lib/review-runner.js";

describe("detectReviewerEngine — mandatory crossover routing", () => {
	test("crossover overrides explicit reviewer when caller is detected", () => {
		// Claude caller → Gemini reviewer, even if agent explicitly asks for "claude"
		assert.equal(detectReviewerEngine({ reviewer: "claude", clientInfo: { name: "claude-code" } }), "gemini");
		// Antigravity caller → Claude reviewer, even if agent explicitly asks for "gemini"
		assert.equal(detectReviewerEngine({ reviewer: "gemini", caller: "antigravity" }), "claude");
	});

	test("Claude caller routes to Gemini reviewer", () => {
		assert.equal(detectReviewerEngine({ caller: "claude-code" }), "gemini");
		assert.equal(detectReviewerEngine({ clientInfo: { name: "claude" } }), "gemini");
		assert.equal(detectReviewerEngine({ clientInfo: { description: "Anthropic's agentic coding tool" } }), "gemini");
		assert.equal(detectReviewerEngine({ authInfo: { clientId: "anthropic-agent" } }), "gemini");
	});

	test("Antigravity / Gemini caller routes to Claude reviewer", () => {
		assert.equal(detectReviewerEngine({ caller: "antigravity" }), "claude");
		assert.equal(detectReviewerEngine({ clientInfo: { name: "Antigravity-IDE" } }), "claude");
		assert.equal(detectReviewerEngine({ caller: "agy" }), "claude");
		assert.equal(detectReviewerEngine({ clientInfo: { name: "gemini-agent" } }), "claude");
	});

	test("explicit reviewer honoured only when no caller is detected", () => {
		assert.equal(detectReviewerEngine({ reviewer: "gemini" }), "gemini");
		assert.equal(detectReviewerEngine({ reviewer: "claude", caller: "unknown-thing" }), "claude");
	});

	test("unknown caller defaults to Claude", () => {
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
