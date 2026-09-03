import { randomBytes } from "crypto";

const jobs = new Map();
const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours TTL

/**
 * Creates a new background review job.
 */
export function createReviewJob({ planType, diff, iteration, engine, model }) {
	const id = `rev_${randomBytes(6).toString("hex")}`;
	const job = {
		id,
		status: "running",
		type: planType ? "plan" : "code",
		planType,
		iteration: iteration ?? 1,
		engine,
		model,
		createdAt: Date.now(),
		completedAt: null,
		durationMs: null,
		verdict: null,
		result: null,
		error: null
	};
	jobs.set(id, job);

	// Auto-cleanup after TTL
	const timer = setTimeout(() => {
		jobs.delete(id);
	}, JOB_TTL_MS);
	if (timer.unref) timer.unref();

	return job;
}

/**
 * Retrieves a review job by its ID.
 */
export function getReviewJob(id) {
	return jobs.get(id);
}

/**
 * Updates a review job with completion or error details.
 */
export function updateReviewJob(id, updates) {
	const job = jobs.get(id);
	if (!job) return null;
	Object.assign(job, updates);
	return job;
}

/**
 * Test helper to clear in-memory jobs.
 */
export function _clearJobsForTest() {
	jobs.clear();
}
