import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handler as reviewPlanHandler } from "../tools/review_plan.js";
import { handler as getReviewResultHandler } from "../tools/get_review_result.js";
import { createReviewJob, updateReviewJob, getReviewJob, _clearJobsForTest } from "../lib/review-jobs.js";

describe("review async jobs & get_review_result", () => {
	beforeEach(() => {
		_clearJobsForTest();
	});

	test("review_plan with async: true immediately returns job_id without blocking", async () => {
		const result = await reviewPlanHandler({
			plan: "Test plan content",
			plan_type: "architecture",
			async: true
		});

		assert.equal(result.isError, undefined);
		assert.ok(result.content && result.content[0]);
		assert.match(result.content[0].text, /Job ID:\*\* `(rev_[a-f0-9]+)`/);
		assert.match(result.content[0].text, /get_review_result/);

		const match = result.content[0].text.match(/Job ID:\*\* `(rev_[a-f0-9]+)`/);
		const jobId = match[1];

		const job = getReviewJob(jobId);
		assert.ok(job, "Job was created in memory");
		assert.equal(job.id, jobId);
		assert.equal(job.planType, "architecture");
	});

	test("get_review_result returns running status while job is in progress", async () => {
		const job = createReviewJob({ planType: "architecture", model: "opus", engine: "claude" });

		const result = await getReviewResultHandler({ job_id: job.id });
		assert.equal(result.isError, undefined);
		assert.match(result.content[0].text, /is still running/);
		assert.match(result.content[0].text, new RegExp(job.id));
	});

	test("get_review_result returns full review text when job is completed", async () => {
		const job = createReviewJob({ planType: "architecture", model: "opus", engine: "claude" });
		updateReviewJob(job.id, {
			status: "completed",
			result: "## Verdict\nAPPROVE\nPlan looks solid.",
			verdict: "APPROVE",
			durationMs: 42000
		});

		const result = await getReviewResultHandler({ job_id: job.id });
		assert.equal(result.isError, undefined);
		assert.equal(result.content[0].text, "## Verdict\nAPPROVE\nPlan looks solid.");
	});

	test("get_review_result returns error if job failed", async () => {
		const job = createReviewJob({ planType: "architecture", model: "opus", engine: "claude" });
		updateReviewJob(job.id, {
			status: "failed",
			error: "Review CLI failed"
		});

		const result = await getReviewResultHandler({ job_id: job.id });
		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /failed/i);
		assert.match(result.content[0].text, /Review CLI failed/);
	});

	test("get_review_result returns not found error for invalid job_id", async () => {
		const result = await getReviewResultHandler({ job_id: "rev_nonexistent" });
		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /not found/i);
	});
});
