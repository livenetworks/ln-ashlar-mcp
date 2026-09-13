const fs = require('fs');
const content = fs.readFileSync('/home/mcp/server/lib/review-jobs.js', 'utf8');

const newCode = `import { randomBytes } from "crypto";

const jobs = new Map();
const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours TTL

// Track recent completions to estimate wait times based on prompt size
const stats = {
	history: [] // array of { chars: number, durationMs: number }
};

function updateStats(chars, durationMs) {
	stats.history.push({ chars, durationMs });
	if (stats.history.length > 50) {
		stats.history.shift(); // keep last 50
	}
}

/**
 * Estimates the wait time (in ms) for a given prompt length.
 */
export function estimateWaitTime(chars) {
	if (stats.history.length === 0) {
		return 5 * 60 * 1000; // default 5 minutes
	}
	
	let totalChars = 0;
	let totalTime = 0;
	for (const h of stats.history) {
		totalChars += h.chars;
		totalTime += h.durationMs;
	}
	
	const msPerChar = totalTime / totalChars;
	let estimatedMs = chars * msPerChar;
	
	// Minimum 1 minute, buffer of 30%
	return Math.round(Math.max(60000, estimatedMs * 1.3));
}

/**
 * Formats milliseconds into a human-readable duration string (e.g. "2.5 minutes").
 */
export function formatDuration(ms) {
	const minutes = (ms / 1000 / 60).toFixed(1);
	return \`\${minutes} minutes\`;
}

/**
 * Creates a new background review job.
 */
export function createReviewJob({ planType, diff, iteration, engine, model, chars }) {
	const id = \`rev_\${randomBytes(6).toString("hex")}\`;
	const job = {
		id,
		status: "running",
		type: planType ? "plan" : "code",
		planType,
		iteration: iteration ?? 1,
		engine,
		model,
		chars: chars || 0,
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
	
	if (updates.status === "completed" && updates.durationMs && job.chars) {
		updateStats(job.chars, updates.durationMs);
	}
	
	return job;
}

/**
 * Test helper to clear in-memory jobs.
 */
export function _clearJobsForTest() {
	jobs.clear();
	stats.history = [];
}
`;

fs.writeFileSync('/home/mcp/server/lib/review-jobs.js', newCode);
console.log("Patched review-jobs.js");
