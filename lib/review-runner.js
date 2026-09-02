import { runGemini, loadGeminiConfig, GeminiError, DEFAULT_CONFIG as DEFAULT_GEMINI_CONFIG } from "./gemini.js";
import { runClaude, loadClaudeConfig, ClaudeError, DEFAULT_CLAUDE_CONFIG } from "./claude.js";

/**
 * Determines which reviewer engine to use (Gemini or Claude).
 *
 * Routing rules:
 * 1. If `reviewer` is explicitly 'gemini' or 'claude', use that.
 * 2. If 'auto' or unspecified, inspect caller/clientInfo:
 *    - If caller is Claude/Anthropic -> route to Gemini (Antigravity/Gemini).
 *    - If caller is Antigravity/Gemini -> route to Claude.
 * 3. Default fallback: Claude.
 */
export function detectReviewerEngine({ reviewer, caller, clientInfo, authInfo, authUser, reqHeaders } = {}) {
	if (reviewer && reviewer !== "auto") {
		const norm = String(reviewer).toLowerCase().trim();
		if (norm === "gemini" || norm === "claude") {
			return norm;
		}
	}

	const candidates = [
		caller,
		clientInfo?.name,
		authInfo?.clientId,
		authUser,
		reqHeaders?.["user-agent"]
	].filter(Boolean).map(s => String(s).toLowerCase());

	for (const candidate of candidates) {
		if (candidate.includes("claude") || candidate.includes("anthropic")) {
			return "gemini";
		}
		if (
			candidate.includes("antigravity") ||
			candidate.includes("gemini") ||
			candidate.includes("agy") ||
			candidate.includes("sojic") ||
			candidate.includes("google")
		) {
			return "claude";
		}
	}

	// Default fallback reviewer
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
