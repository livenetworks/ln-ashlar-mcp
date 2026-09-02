import { z } from "zod";
import winston from "winston";
import "winston-daily-rotate-file";
import { runReview, detectReviewerEngine, loadReviewConfig } from "../lib/review-runner.js";
import { buildCodeReviewPrompt, extractVerdict } from "../lib/gemini-prompts.js";

// Winston logger for review_code operations
const logger = winston.createLogger({
	level: "info",
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.json()
	),
	transports: [
		new winston.transports.DailyRotateFile({
			dirname: "logs",
			filename: "mcp-%DATE%.log",
			datePattern: "YYYY-MM-DD",
			zippedArchive: true,
			maxSize: "20m",
			maxFiles: "14d"
		})
	]
});

// Winston logger for the full review audit trail (complete prompt + response text)
const auditLogger = winston.createLogger({
	level: "info",
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.json()
	),
	transports: [
		new winston.transports.DailyRotateFile({
			dirname: "logs",
			filename: "review-audit-%DATE%.log",
			datePattern: "YYYY-MM-DD",
			zippedArchive: true,
			maxSize: "20m",
			maxFiles: "14d"
		})
	]
});

export const name = "review_code";

export const definition = {
	title: "Review Code",
	description:
		"MANDATORY before finalizing or committing code changes. Submit a code diff or patch to an " +
		"independent reviewer for critique on correctness, plan conformance, and cleanup (Claude or Gemini/Antigravity). " +
		"Stateless — YOU drive the loop. " +
		"Protocol: (1) call with your `diff` and optional `context` (the architecture/implementation plan or task requirements); " +
		"(2) read the returned critique (a Verdict of APPROVE or REVISE, plus categorized issues under correctness, conformance, cleanup); " +
		"(3) if REVISE, fix your code and call again with `iteration` incremented AND `previous_feedback` set to the critique you just received; " +
		"(4) STOP when the Verdict is APPROVE or when `iteration` reaches 3 — the server rejects `iteration` > 3. " +
		"Pass `context` on every call so the reviewer judges against your requirements. After APPROVE or iteration 3, " +
		"you MAY make one additional call with `wrap_up: true` (concatenate ALL previous critiques into `previous_feedback` " +
		"and pass the final diff as `diff`) to get a short retrospective of the whole code review conversation for the user — " +
		"this call is exempt from the iteration cap.",
	inputSchema: {
		diff: z.string().min(1).describe("The code diff, patch, or modified code to be reviewed"),
		context: z.string().optional().describe("Task requirements, architecture plan, or acceptance criteria to judge conformance against"),
		previous_feedback: z.string().optional().describe("The critique received on the previous iteration, when revising"),
		iteration: z.number().int().min(1).optional().describe("Current iteration number; server rejects values above the configured max (default 3)"),
		reviewer: z
			.enum(["claude", "gemini", "auto"])
			.optional()
			.describe("Reviewer AI engine to use ('claude', 'gemini', or 'auto' for complementary crossover review). Default: 'auto'"),
		caller: z
			.string()
			.optional()
			.describe("Identifier of calling agent (e.g. 'claude', 'antigravity') if manual caller override is desired"),
		wrap_up: z
			.boolean()
			.optional()
			.describe("Set true on a final extra call AFTER the loop ends to get a short retrospective of the whole review conversation; pass ALL previous critiques concatenated in previous_feedback")
	}
};

export const handler = async (args, extra) => {
	const { diff, context, previous_feedback, iteration, wrap_up, reviewer, caller } = args;
	const apiKeyId = extra?.authInfo?.clientId ?? "unknown";

	const resolvedEngine = detectReviewerEngine({
		reviewer,
		caller,
		clientInfo: extra?.clientInfo,
		authInfo: extra?.authInfo,
		authUser: extra?.authUser
	});
	const cfg = loadReviewConfig(resolvedEngine);

	const currentIteration = iteration ?? 1;

	if (!wrap_up && currentIteration > cfg.maxIterations) {
		return {
			content: [{
				type: "text",
				text: `Iteration ${currentIteration} exceeds the maximum of ${cfg.maxIterations}. Stop iterating and finalize your changes.`
			}],
			isError: true
		};
	}

	const prompt = buildCodeReviewPrompt({ diff, context, previousFeedback: previous_feedback, wrapUp: wrap_up });
	const start = Date.now();

	try {
		const { text, engine, model } = await runReview(prompt, {
			engine: resolvedEngine,
			caller,
			extra,
			config: cfg
		});
		const durationMs = Date.now() - start;
		const verdict = extractVerdict(text);
		logger.info({
			event: "review_code",
			engine,
			apiKeyId,
			iteration,
			wrap_up: !!wrap_up,
			charsIn: prompt.length,
			charsOut: text.length,
			durationMs,
			verdict,
			model
		});
		if (cfg.auditLog) {
			auditLogger.info({
				event: "review_audit",
				engine,
				apiKeyId,
				type: "code",
				iteration,
				wrap_up: !!wrap_up,
				model,
				durationMs,
				prompt,
				response: text
			});
		}
		return { content: [{ type: "text", text }] };
	} catch (e) {
		const durationMs = Date.now() - start;
		logger.warn({
			event: "review_code_failed",
			engine: resolvedEngine,
			apiKeyId,
			iteration,
			wrap_up: !!wrap_up,
			charsIn: prompt.length,
			durationMs,
			code: e.code || "ERROR",
			model: cfg.model,
			error: e.message
		});
		if (cfg.auditLog) {
			auditLogger.info({
				event: "review_audit",
				engine: resolvedEngine,
				apiKeyId,
				type: "code",
				iteration,
				wrap_up: !!wrap_up,
				model: cfg.model,
				durationMs,
				prompt,
				response: e.message
			});
		}
		return { content: [{ type: "text", text: e.message }], isError: true };
	}
};
