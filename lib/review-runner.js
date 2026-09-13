import { runGemini, loadGeminiConfig, GeminiError, DEFAULT_CONFIG as DEFAULT_GEMINI_CONFIG } from "./gemini.js";
import { runClaude, loadClaudeConfig, ClaudeError, DEFAULT_CLAUDE_CONFIG } from "./claude.js";

/**
 * Determines which reviewer engine to use (Gemini or Claude).
 *
 * Mandatory crossover — the reviewer is always the OTHER model:
 *   - Caller is Claude/Anthropic  → reviewer is Gemini (agy, gemini-3.8-flash-high).
 *   - Caller is Antigravity/Gemini → reviewer is Claude (claude cli, opus).
 *
 * Crossover detection takes absolute priority; the `reviewer` parameter
 * from the calling agent is only honoured as a fallback when no caller
 * identity can be detected (e.g. raw HTTP with no clientInfo).
 */
export function detectReviewerEngine({ reviewer, caller, clientInfo, authInfo, authUser, reqHeaders } = {}) {
	// ── 1. Crossover: detect caller identity and route to the OTHER engine ──
	const candidates = [
		caller,
		clientInfo?.name,
		clientInfo?.description,
		authInfo?.clientId,
		authUser,
		reqHeaders?.["user-agent"]
	].filter(Boolean).map(s => String(s).toLowerCase());

	for (const candidate of candidates) {
		if (candidate.includes("claude") || candidate.includes("anthropic")) {
			return "gemini";   // Claude calls → Gemini reviews
		}
		if (
			candidate.includes("antigravity") ||
			candidate.includes("gemini") ||
			candidate.includes("agy") ||
			candidate.includes("google")
		) {
			return "claude";   // Gemini/Antigravity calls → Claude reviews
		}
	}

	// ── 2. Fallback: no caller detected — honour explicit `reviewer` param ──
	if (reviewer && reviewer !== "auto") {
		const norm = String(reviewer).toLowerCase().trim();
		if (norm === "gemini" || norm === "claude") {
			return norm;
		}
	}

	// ── 3. Last resort ──
	return "claude";
}

/**
 * Loads the config for the specified engine.
 */
export function loadReviewConfig(engine = "claude") {
	if (engine === "gemini") {
		return loadGeminiConfig();
	}
	return loadClaudeConfig();
}

/**
 * Unified reviewer runner supporting both Claude and Gemini engines.
 */
export async function runReview(prompt, {
	engine = "auto",
	caller,
	clientInfo,
	extra,
	config,
	execFileFn
} = {}) {
	const effectiveEngine = detectReviewerEngine({
		reviewer: engine,
		caller,
		clientInfo: clientInfo || extra?.clientInfo,
		authInfo: extra?.authInfo,
		authUser: extra?.authUser
	});

	if (effectiveEngine === "gemini") {
		const cfg = config || loadGeminiConfig();
		const result = await runGemini(prompt, { config: cfg, execFileFn });
		return { ...result, engine: "gemini", model: cfg.model, config: cfg };
	} else {
		const cfg = config || loadClaudeConfig();
		const result = await runClaude(prompt, { config: cfg, execFileFn });
		return { ...result, engine: "claude", model: cfg.model, config: cfg };
	}
}

export {
	runGemini,
	loadGeminiConfig,
	GeminiError,
	DEFAULT_GEMINI_CONFIG,
	runClaude,
	loadClaudeConfig,
	ClaudeError,
	DEFAULT_CLAUDE_CONFIG
};
