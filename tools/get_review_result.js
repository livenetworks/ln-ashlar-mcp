import { z } from "zod";
import { getReviewJob } from "../lib/review-jobs.js";

export const name = "get_review_result";

export const definition = {
	title: "Get Review Result",
	description:
		"Check the status and retrieve the critique and verdict of an asynchronous review job started via review_plan or review_code. " +
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
		const elapsedSec = Math.round((Date.now() - job.createdAt) / 1000);
		return {
			content: [{
				type: "text",
				text: `⏳ Review job \`${job_id}\` is still running (elapsed: ${elapsedSec}s, model: ${job.model || "unknown"}).\nPlease wait ~30–60 seconds and call \`get_review_result\` again with \`{"job_id": "${job_id}"}\`.`
			}]
		};
	}

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
