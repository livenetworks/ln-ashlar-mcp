import { z } from "zod";
import winston from "winston";
import "winston-daily-rotate-file";
import { loadGeminiConfig, runGemini } from "../lib/gemini.js";
import { buildReviewPrompt, extractVerdict } from "../lib/gemini-prompts.js";

// Winston logger for review_plan operations (Gemini cross-review calls)
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

export const name = "review_plan";

export const definition = {
	title: "Review Plan",
	description:
		"Submit a plan (architecture spec OR implementation/executor plan) to an " +
		"independent Gemini reviewer for critique. Stateless — YOU drive the loop. " +
		"Protocol: (1) call with your `plan` and `plan_type`; (2) read the returned " +
		"critique (a Verdict of APPROVE or REVISE, plus numbered issues); (3) if " +
		"REVISE, revise your plan and call again with `iteration` incremented AND " +
		"`previous_feedback` set to the critique you just received; (4) STOP when " +
		"the Verdict is APPROVE or when `iteration` reaches 3 — the server rejects " +
		"`iteration` > 3. Pass `context` (project background/constraints) on every " +
		"call so the reviewer judges against your constraints.",
	inputSchema: {
		plan: z.string().min(1).describe("The plan markdown to be reviewed"),
		plan_type: z
			.enum(["architecture", "implementation"])
			.optional()
			.describe("Type of plan under review; omit for a generic review"),
		context: z.string().optional().describe("Project background/constraints for the reviewer to judge against"),
		previous_feedback: z.string().optional().describe("The critique received on the previous iteration, when revising"),
		iteration: z.number().int().min(1).optional().describe("Current iteration number; server rejects values above the configured max (default 3)")
	}
};

export const handler = async (args, extra) => {
	const { plan, plan_type, context, previous_feedback, iteration } = args;
	const cfg = loadGeminiConfig();
	const planType = plan_type || "generic";
	const apiKeyId = extra?.authInfo?.clientId ?? "unknown";

	if (iteration > cfg.maxIterations) {
		return {
			content: [{
				type: "text",
				text: `Iteration ${iteration} exceeds the maximum of ${cfg.maxIterations}. Stop iterating and finalize your plan.`
			}],
			isError: true
		};
	}

	const prompt = buildReviewPrompt({ planType, context, previousFeedback: previous_feedback, plan });
	const start = Date.now();

	try {
		const { text } = await runGemini(prompt, { config: cfg });
		const durationMs = Date.now() - start;
		const verdict = extractVerdict(text);
		logger.info({
			event: "review_plan",
			apiKeyId,
			plan_type: planType,
			iteration,
			charsIn: prompt.length,
			charsOut: text.length,
			durationMs,
			verdict,
			model: cfg.model
		});
		return { content: [{ type: "text", text }] };
	} catch (e) {
		const durationMs = Date.now() - start;
		logger.warn({
			event: "review_plan_failed",
			apiKeyId,
			plan_type: planType,
			iteration,
			charsIn: prompt.length,
			durationMs,
			code: e.code || "ERROR",
			model: cfg.model,
			error: e.message
		});
		return { content: [{ type: "text", text: e.message }], isError: true };
	}
};
