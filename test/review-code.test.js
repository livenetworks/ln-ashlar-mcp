import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCodeReviewPrompt } from "../lib/gemini-prompts.js";
import { handler } from "../tools/review_code.js";

describe("buildCodeReviewPrompt — code review rubric", () => {
	test("produces code review criteria and sections without Progress Since Last Review", () => {
		const prompt = buildCodeReviewPrompt({
			diff: "diff --git a/file.js b/file.js\n+ const a = 1;",
			context: "Implement feature X per architecture doc",
			previousFeedback: "Fix bug on line 5"
		});

		assert.match(prompt, /independent code review/i);
		assert.match(prompt, /Correctness/);
		assert.match(prompt, /Plan & Spec Conformance/);
		assert.match(prompt, /Cleanup & Quality/);
		assert.match(prompt, /## Intended Plan \/ Context/);
		assert.match(prompt, /## Code \/ Diff Under Review/);
		assert.match(prompt, /## Your Previous Review Feedback/);
		// Progress Since Last Review must NOT be included for code/diff
		assert.doesNotMatch(prompt, /Progress Since Last Review/);
	});

	test("wrap_up produces retrospective for code review", () => {
		const prompt = buildCodeReviewPrompt({
			diff: "final code diff",
			previousFeedback: "critique 1\ncritique 2",
			wrapUp: true
		});

		assert.match(prompt, /Review Summary/);
		assert.match(prompt, /## Final Code \/ Diff/);
		assert.doesNotMatch(prompt, /independent code review/);
	});
});

describe("review_code handler — iteration cap and wrap_up", () => {
	test("iteration > 3 returns isError with exceeds-the-maximum message", async () => {
		const result = await handler({ diff: "const x = 1;", iteration: 4 });
		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /exceeds the maximum/);
	});

	test("wrap_up: true with iteration 4 is exempt from iteration cap", async () => {
		const originalPath = process.env.PATH;
		process.env.PATH = "";
		try {
			const result = await handler({ diff: "final diff", iteration: 4, wrap_up: true, previous_feedback: "c1" });
			assert.doesNotMatch(result.content[0].text, /exceeds the maximum/);
			assert.equal(result.isError, true);
			assert.match(result.content[0].text, /binary not found/);
		} finally {
			process.env.PATH = originalPath;
		}
	});
});
