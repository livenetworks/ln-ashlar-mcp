import { z } from "zod";
import winston from "winston";
import "winston-daily-rotate-file";
import { runReview, detectReviewerEngine, loadReviewConfig } from "../lib/review-runner.js";
import { buildReviewPrompt, extractVerdict } from "../lib/gemini-prompts.js";
import { createReviewJob, updateReviewJob } from "../lib/review-jobs.js";

// Winston logger for review_plan operations
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

export const name = "review_plan";

export const definition = {
	title: "Review Plan",
	description:
		"MANDATORY before any implementation begins. Any plan that will be executed MUST be submitted here first. " +
		"Submit a plan (architecture spec OR implementation/executor plan) to an " +
		"independent reviewer for critique (Claude or Gemini/Antigravity). " +
		"Stateless — YOU drive the loop. " +
		"Protocol: (1) call with your `plan` and `plan_type`; (2) read the returned " +
		"critique (a Verdict of APPROVE or REVISE, plus numbered issues); (3) if " +
		"REVISE, revise your plan and call again with `iteration` incremented AND " +
		"`previous_feedback` set to the critique you just received; (4) STOP when " +
		"the Verdict is APPROVE or when `iteration` reaches 3 — the server rejects " +
		"`iteration` > 3. Pass `context` (project background/constraints) on every " +
		"call so the reviewer judges against your constraints. After APPROVE or " +
		"iteration 3, you MAY make one additional call with `wrap_up: true` " +
		"(concatenate ALL previous critiques into `previous_feedback` and pass the " +
		"final plan as `plan`) to get a short retrospective of the whole review " +
		"conversation for the user — this call is exempt from the iteration cap.",
	inputSchema: {
		plan: z.string().min(1).describe("The plan markdown to be reviewed"),
		plan_type: z
			.enum(["architecture", "implementation"])
			.optional()
			.describe("Type of plan under review; omit for a generic review"),
		context: z.string().optional().describe("Project background/constraints for the reviewer to judge against"),
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
			.describe("Set true on a final extra call AFTER the loop ends to get a short retrospective of the whole review conversation; pass ALL previous critiques concatenated in previous_feedback"),
		async: z
			.boolean()
			.optional()
			.describe("When true, runs the review asynchronously in the background and returns a job_id immediately so the HTTP connection never times out. Retrieve the result later using get_review_result.")
	}
};

export const handler = async (args, extra) => {
	const { plan, plan_type, context, previous_feedback, iteration, wrap_up, reviewer, caller, async: isAsync } = args;
	const planType = plan_type || "generic";
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
				text: `Iteration ${currentIteration} exceeds the maximum of ${cfg.maxIterations}. Stop iterating and finalize your plan.`
			}],
			isError: true
		};
	}

	const prompt = buildReviewPrompt({ planType, context, previousFeedback: previous_feedback, plan, wrapUp: wrap_up });
	const start = Date.now();

	if (isAsync) {
		const job = createReviewJob({
			planType,
			iteration: currentIteration,
			engine: resolvedEngine,
			model: cfg.model
		});

		(async () => {
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
					event: "review_plan_async_completed",
					job_id: job.id,
					engine,
					apiKeyId,
					plan_type: planType,
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
						job_id: job.id,
						engine,
						apiKeyId,
						plan_type: planType,
						iteration,
						wrap_up: !!wrap_up,
						model,
						durationMs,
						prompt,
						response: text
					});
				}
				updateReviewJob(job.id, {
					status: "completed",
					result: text,
					verdict,
					durationMs,
					completedAt: Date.now()
				});
			} catch (e) {
				const durationMs = Date.now() - start;
				logger.warn({
					event: "review_plan_async_failed",
					job_id: job.id,
					engine: resolvedEngine,
					apiKeyId,
					plan_type: planType,
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
						job_id: job.id,
						engine: resolvedEngine,
						apiKeyId,
						plan_type: planType,
						iteration,
						wrap_up: !!wrap_up,
						model: cfg.model,
						durationMs,
						prompt,
						response: e.message
					});
				}
				updateReviewJob(job.id, {
					status: "failed",
					error: e.message,
					durationMs,
					completedAt: Date.now()
				});
			}
		})();

		return {
			content: [{
				type: "text",
				text: `⏳ **Review started in the background.**\n\n` +
					`- **Job ID:** \`${job.id}\`\n` +
					`- **Reviewer Engine:** ${resolvedEngine}\n` +
					`- **Model:** ${cfg.model}\n` +
					`- **Plan Type:** ${planType}\n` +
					`- **Iteration:** ${currentIteration}\n\n` +
					`**Next step:** Wait about 1.5–2 minutes, then call the \`get_review_result\` tool with:\n` +
					`\`\`\`json\n{\n  "job_id": "${job.id}"\n}\n\`\`\`\n` +
					`If the review is still running, wait a few moments and call \`get_review_result\` again.`
			}]
		};
	}

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
			event: "review_plan",
			engine,
			apiKeyId,
			plan_type: planType,
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
				plan_type: planType,
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
			event: "review_plan_failed",
			engine: resolvedEngine,
			apiKeyId,
			plan_type: planType,
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
				plan_type: planType,
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
