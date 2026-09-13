import { z } from "zod";
import { getReviewJob, deleteReviewJob, estimateWaitTime, formatDuration } from "../lib/review-jobs.js";

export const name = "get_review_result";

export const definition = {
	title: "Get Review Result",
	description:
		"Check the status and retrieve the critique and verdict of an asynchronous review job started via review_plan, review_code, or review_audit. " +
		"Call this tool 1-2 minutes after starting an async review using the returned job_id.",
	inputSchema: {
		job_id: z.string().min(1).describe("The job ID returned from an async review call (e.g. 'rev_1a2b3c4d5e6f')")
	}
};

export const handler = async (args) => {
	const { job_id } = args;
	const job = getReviewJob(job_id);

	if (!job) {
		return {
			content: [{
				type: "text",
				text: `❌ Review job \`${job_id}\` not found. It may have expired or the server was restarted.`
			}],
			isError: true
		};
	}

	if (job.status === "running") {
		const elapsedMs = Date.now() - job.createdAt;
		const elapsedSec = Math.round(elapsedMs / 1000);
		let waitMessage = "~2.0 minutes";
		if (job.chars) {
			const estimatedMs = estimateWaitTime(job.chars);
			const remainingMs = Math.max(60000, estimatedMs - elapsedMs); // at least 1 minute
			waitMessage = `~${formatDuration(remainingMs)}`;
		}
		return {
			content: [{
				type: "text",
				text: `⏳ Review job \`${job_id}\` is still running (elapsed: ${elapsedSec}s, model: ${job.model || "unknown"}).\nPlease wait ${waitMessage} and call \`get_review_result\` again with \`{"job_id": "${job_id}"}\`.`
			}]
		};
	}

	// Job is completed or failed, so we can clean it up now that it's being read
	deleteReviewJob(job_id);

	if (job.status === "failed") {
		return {
			content: [{
				type: "text",
				text: `❌ Review job \`${job_id}\` failed:\n${job.error || "Unknown error"}`
			}],
			isError: true
		};
	}

	return {
		content: [{
			type: "text",
			text: job.result
		}]
	};
};
