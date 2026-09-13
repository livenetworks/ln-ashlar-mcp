import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildAuditReviewPrompt } from "../lib/gemini-prompts.js";
import { handler, name, definition } from "../tools/review_audit.js";

describe("review_audit tool export & definition", () => {
	test("exports correct tool name and definition schema", () => {
		assert.equal(name, "review_audit");
		assert.equal(definition.title, "Review Audit Report");
		assert.match(definition.description, /Submit a component audit report for forensic verification/);
		assert.ok(definition.inputSchema.component);
		assert.ok(definition.inputSchema.audit);
		assert.ok(definition.inputSchema.caller);
	});
});

describe("buildAuditReviewPrompt — forensic audit rubric", () => {
	test("produces audit review criteria and forensic sections", () => {
		const prompt = buildAuditReviewPrompt({
			component: "ln-toggle",
			audit: "# Audit Report for ln-toggle\n- Finding 1: missing aria-checked",
			projectFiles: "=== src/ln-toggle.js ===\nclass LnToggle extends HTMLElement {}",
			previousFeedback: "Check missing findings"
		});

		assert.match(prompt, /independent forensic architect/i);
		assert.match(prompt, /Factual Accuracy/i);
		assert.match(prompt, /Omitted Findings/i);
		assert.match(prompt, /False Findings/i);
		assert.match(prompt, /Doctrinal Purity/i);
		assert.match(prompt, /## Target Component/);
		assert.match(prompt, /## Audit Report Under Review/);
		assert.match(prompt, /## Your Previous Review Feedback/);
	});

	test("wrap_up produces retrospective for audit review", () => {
		const prompt = buildAuditReviewPrompt({
			component: "ln-toggle",
			audit: "final audit report",
			previousFeedback: "critique 1\ncritique 2",
			wrapUp: true
		});

		assert.match(prompt, /Review Summary/);
		assert.match(prompt, /## Final Audit Report/);
		assert.doesNotMatch(prompt, /independent forensic architect/);
	});
});

describe("review_audit handler — iteration cap and wrap_up", () => {
	test("iteration > 3 returns isError with exceeds-the-maximum message", async () => {
		const result = await handler({ component: "ln-toggle", audit: "audit report", caller: "gemini", iteration: 4 });
		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /exceeds the maximum/);
	});

	test("wrap_up: true with iteration 4 is exempt from iteration cap", async () => {
		const originalPath = process.env.PATH;
		process.env.PATH = "";
		try {
			const result = await handler({ component: "ln-toggle", audit: "final audit report", caller: "gemini", iteration: 4, wrap_up: true, previous_feedback: "c1" });
			assert.doesNotMatch(result.content[0].text, /exceeds the maximum/);
			assert.equal(result.isError, true);
			assert.match(result.content[0].text, /binary not found/);
		} finally {
			process.env.PATH = originalPath;
		}
	});

	test("async: true returns job_id immediately", async () => {
		const result = await handler({ component: "ln-toggle", audit: "audit content", caller: "gemini", async: true });
		assert.equal(result.isError, undefined);
		assert.match(result.content[0].text, /Job ID:\*\* `(rev_[a-f0-9]+)`/);
		assert.match(result.content[0].text, /get_review_result/);
	});
});
