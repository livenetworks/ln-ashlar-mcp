const OUTPUT_CONTRACT_BASE = `Respond in GitHub-flavored Markdown with EXACTLY these sections, in order:

## Verdict
A single word on its own line: APPROVE or REVISE.

## Strengths
2–4 bullet points on what the plan gets right.

## Issues
A numbered list. Each item: **[severity: high|medium|low]** the problem, then a concrete, actionable suggestion to fix it. If there are no issues, write "None".

## Open Questions
Bullet points for anything ambiguous or unspecified. If none, write "None".`;

const PROGRESS_SECTION = `## Progress Since Last Review
Bullet points: which of your previous issues the revision addressed, which remain.`;

const SOURCES_SECTION = `## Sources Consulted
Bullet list of the docs/tools you consulted (component names, doctrine entries). If you consulted none, write "None".`;

const TOOLS_NOTE =
	"You have read-only tools from the ln-ashlar MCP server (search_docs, list_components, " +
	"get_component, get_doctrine, get_markup, and related docs tools). Before judging, consult " +
	"the documentation corpus where relevant — verify component names, doctrine rules, and " +
	"patterns the plan references. Ground your critique in what the docs actually say, not " +
	"assumptions.";

const WRAP_UP_INSTRUCTION =
	"The review loop has concluded. Below is the full review history and the final plan. " +
	"Write a brief retrospective in GitHub-flavored Markdown with sections: " +
	"## Review Summary (how the plan evolved across iterations, 1 short paragraph), " +
	"## Key Improvements (bullets), ## Remaining Risks (bullets or None), " +
	"## Verdict (APPROVE or REVISE for the final version).";

const CRITERIA = {
	architecture:
		"You are a senior software architect doing an independent design review. " +
		"Judge the plan for: gaps and missing requirements, internal contradictions, " +
		"missing edge cases, risks and failure modes, simpler alternatives, and " +
		"boundary / data-flow / responsibility concerns.",
	implementation:
		"You are a senior engineer reviewing an implementation / executor plan. " +
		"Judge it for: step completeness and correct ordering, dependency correctness, " +
		"testable acceptance criteria, plausible and consistent file paths, and the " +
		"presence of verification and rollback steps.",
	generic:
		"You are a senior reviewer giving an independent critique of the plan below. " +
		"Assess correctness, completeness, risks, and clarity."
};

export function buildReviewPrompt({ planType, context, previousFeedback, plan, wrapUp }) {
	if (wrapUp) {
		const parts = [WRAP_UP_INSTRUCTION, ""];
		if (context) parts.push("## Project Context", context, "");
		if (previousFeedback) parts.push(
			"## Review History (all previous critiques, concatenated)",
			previousFeedback, "");
		parts.push("## Final Plan", plan);
		return parts.join("\n");
	}

	const criteria = CRITERIA[planType] || CRITERIA.generic;
	const contractParts = [OUTPUT_CONTRACT_BASE];
	if (previousFeedback) contractParts.push("", PROGRESS_SECTION);
	contractParts.push("", SOURCES_SECTION);
	const outputContract = contractParts.join("\n");

	const parts = [criteria, "", TOOLS_NOTE, "", outputContract, ""];
	if (context) parts.push("## Project Context", context, "");
	if (previousFeedback) parts.push(
		"## Your Previous Feedback (the author revised the plan to address this)",
		previousFeedback, "");
	parts.push("## Plan Under Review", plan);
	return parts.join("\n");
}

export function extractVerdict(text) {
	if (!text) return "UNKNOWN";
	const m = text.match(/\b(APPROVE|REVISE)\b/i);
	return m ? m[1].toUpperCase() : "UNKNOWN";
}
