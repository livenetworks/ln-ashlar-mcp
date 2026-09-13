import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATS_FILE = path.resolve(__dirname, "..", ".review-stats.json");

const jobs = new Map();
const JOB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL

// Track recent completions to estimate wait times based on prompt size
const stats = {
	history: [] // array of { chars: number, durationMs: number }
};

// Load existing stats if available
try {
	if (fs.existsSync(STATS_FILE)) {
		const data = fs.readFileSync(STATS_FILE, "utf8");
		const parsed = JSON.parse(data);
		if (Array.isArray(parsed)) {
			stats.history = parsed.slice(-50);
		}
	}
} catch (e) {
	console.error("Failed to load review stats:", e);
}

function updateStats(job, durationMs) {
	const chars = job.chars || 0;
	const entry = {
		timestamp: Date.now(),
		id: job.id,
		type: job.type,
		planType: job.planType || null,
		iteration: job.iteration,
		engine: job.engine,
		model: job.model,
		chars,
		durationMs
	};

	// Append to permanent record
	try {
		let allStats = [];
		if (fs.existsSync(STATS_FILE)) {
			const data = fs.readFileSync(STATS_FILE, "utf8");
			allStats = JSON.parse(data);
		}
		allStats.push(entry);
		fs.writeFileSync(STATS_FILE, JSON.stringify(allStats, null, 2));
	} catch (e) {
		console.error("Failed to save review stats:", e);
	}

	// Update in-memory for estimation
	stats.history.push({ chars, durationMs });
	if (stats.history.length > 50) {
		stats.history.shift(); // keep last 50
	}
}

/**
 * Estimates the wait time (in ms) for a given prompt length and model with a 20% safety buffer.
 */
export function estimateWaitTime(chars, model = "gemini-3.1-pro-high") {
	let estimatedSec;
	const m = (model || "").toLowerCase();

	if (m.includes("opus")) {
		// Claude Opus (r = 0.80): 20s base + 4.9s / 1k chars
		estimatedSec = 20 + ((chars || 0) / 1000) * 4.9;
	} else if (m.includes("flash")) {
		// Flash models: constant ~135s
		estimatedSec = 135;
	} else {
		// Gemini Pro / Default (r = 0.23): 66s base + 8.4s / 10k chars
		estimatedSec = 66 + ((chars || 0) / 10000) * 8.4;
	}

	// Add 20% safety buffer
	const bufferedMs = estimatedSec * 1.20 * 1000;

	return Math.round(Math.max(30000, bufferedMs));
}

/**
 * Formats milliseconds into a human-readable duration string (e.g. "60 seconds" or "2.5 minutes").
 */
export function formatDuration(ms) {
	const totalSec = Math.round(ms / 1000);
	if (totalSec < 90) {
		return `${totalSec} seconds`;
	}
	const minutes = (ms / 1000 / 60).toFixed(1);
	return `${minutes} minutes`;
}

/**
 * Creates a new background review job.
 */
export function createReviewJob({ planType, diff, audit, type, iteration, engine, model, chars }) {
	const id = `rev_${randomBytes(6).toString("hex")}`;
	const job = {
		id,
		status: "running",
		type: type || (planType ? "plan" : (audit ? "audit" : "code")),
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
 * Deletes a review job by its ID.
 */
export function deleteReviewJob(id) {
	return jobs.delete(id);
}

/**
 * Updates a review job with completion or error details.
 */
export function updateReviewJob(id, updates) {
	const job = jobs.get(id);
	if (!job) return null;
	Object.assign(job, updates);
	
	if (updates.status === "completed" && updates.durationMs && job.chars) {
		updateStats(job, updates.durationMs);
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
