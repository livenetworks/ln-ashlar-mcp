import { z } from "zod";
import winston from "winston";
import "winston-daily-rotate-file";
import { runReview, detectReviewerEngine, loadReviewConfig } from "../lib/review-runner.js";
import { buildAuditReviewPrompt, extractVerdict } from "../lib/gemini-prompts.js";
import { createReviewJob, updateReviewJob, estimateWaitTime, formatDuration } from "../lib/review-jobs.js";

// Winston logger for review_audit operations
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

export const name = "review_audit";

export const definition = {
	title: "Review Audit Report",
	description:
		"Submit a component audit report for forensic verification against JS, SCSS, README, schema, and ln-ashlar DOCTRINE.",
	inputSchema: {
		component: z.string().min(1).describe("Component name (e.g. ln-toggle)"),
		audit: z.string().min(1).describe("The audit markdown text to be reviewed"),
		caller: z.string().min(1).describe("Identifier of calling agent (e.g. 'gemini', 'claude', 'antigravity')"),
		project_files: z.string().optional().describe("Source files: JS, SCSS, README, schema, tests"),
		previous_feedback: z.string().optional().describe("The critique received on the previous iteration, when revising"),
		iteration: z.number().int().min(1).optional().describe("Current iteration number; server rejects values above the configured max (default 3)"),
		reviewer: z
			.enum(["claude", "gemini", "auto"])
			.optional()
			.describe("Reviewer AI engine to use ('claude', 'gemini', or 'auto' for complementary crossover review). Default: 'auto'"),
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
	const { component, audit, project_files, caller, previous_feedback, iteration, wrap_up, reviewer, async: isAsync } = args;
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
				text: `Iteration ${currentIteration} exceeds the maximum of ${cfg.maxIterations}. Stop iterating and finalize your audit report.`
			}],
			isError: true
		};
	}

	const prompt = buildAuditReviewPrompt({ component, audit, projectFiles: project_files, previousFeedback: previous_feedback, wrapUp: wrap_up });
	const start = Date.now();

	if (isAsync) {
		const job = createReviewJob({
			audit,
			iteration: currentIteration,
			engine: resolvedEngine,
			model: cfg.model,
			chars: prompt.length,
			type: "audit"
		});

		(async () => {
			try {
				const { text, engine, model, parsed } = await runReview(prompt, {
					engine: resolvedEngine,
					caller,
					extra,
					config: cfg
				});
				const durationMs = Date.now() - start;
				const verdict = extractVerdict(text);

				const inputTokens = parsed?.usage?.input_tokens ?? 0;
				const outputTokens = parsed?.usage?.output_tokens ?? 0;
				const totalTokens = parsed?.usage?.total_tokens ?? (inputTokens + outputTokens);
				const costUSD = parsed?.total_cost_usd ?? 0;

				logger.info({
					event: "review_audit_async_completed",
					job_id: job.id,
					engine,
					apiKeyId,
					component,
					iteration: currentIteration,
					wrap_up: !!wrap_up,
					charsIn: prompt.length,
					charsOut: text.length,
					inputTokens,
					outputTokens,
					totalTokens,
					costUSD,
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
						component,
						iteration: currentIteration,
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
					event: "review_audit_async_failed",
					job_id: job.id,
					engine: resolvedEngine,
					apiKeyId,
					component,
					iteration: currentIteration,
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
						component,
						iteration: currentIteration,
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

		const waitTimeFormatted = formatDuration(estimateWaitTime(prompt.length));
		return {
			content: [{
				type: "text",
				text: `⏳ **Audit review started in the background.**\n\n` +
					`- **Job ID:** \`${job.id}\`\n` +
					`- **Reviewer Engine:** ${resolvedEngine}\n` +
					`- **Model:** ${cfg.model}\n` +
					`- **Component:** ${component}\n` +
					`- **Iteration:** ${currentIteration}\n\n` +
					`**Next step:** Wait about ${waitTimeFormatted}, then call the \`get_review_result\` tool with:\n` +
					`\`\`\`json\n{\n  "job_id": "${job.id}"\n}\n\`\`\`\n` +
					`If the review is still running, wait a few moments and call \`get_review_result\` again.`
			}]
		};
	}

	try {
		const { text, engine, model, parsed } = await runReview(prompt, {
			engine: resolvedEngine,
			caller,
			extra,
			config: cfg
		});
		const durationMs = Date.now() - start;
		const verdict = extractVerdict(text);

		const inputTokens = parsed?.usage?.input_tokens ?? 0;
		const outputTokens = parsed?.usage?.output_tokens ?? 0;
		const totalTokens = parsed?.usage?.total_tokens ?? (inputTokens + outputTokens);
		const costUSD = parsed?.total_cost_usd ?? 0;

		logger.info({
			event: "review_audit",
			engine,
			apiKeyId,
			component,
			iteration: currentIteration,
			wrap_up: !!wrap_up,
			charsIn: prompt.length,
			charsOut: text.length,
			inputTokens,
			outputTokens,
			totalTokens,
			costUSD,
			durationMs,
			verdict,
			model
		});
		if (cfg.auditLog) {
			auditLogger.info({
				event: "review_audit",
				engine,
				apiKeyId,
				component,
				iteration: currentIteration,
				wrap_up: !!wrap_up,
				model,
				durationMs,
				prompt,
				response: text
			});
		}

		return {
			content: [{
				type: "text",
				text
			}]
		};
	} catch (e) {
		const durationMs = Date.now() - start;
		logger.warn({
			event: "review_audit_failed",
			engine: resolvedEngine,
			apiKeyId,
			component,
			iteration: currentIteration,
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
				component,
				iteration: currentIteration,
				wrap_up: !!wrap_up,
				model: cfg.model,
				durationMs,
				prompt,
				response: e.message
			});
		}

		return {
			content: [{
				type: "text",
				text: `❌ Audit review failed (${e.code || "ERROR"}): ${e.message}`
			}],
			isError: true
		};
	}
};
