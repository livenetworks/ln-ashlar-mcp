const OUTPUT_CONTRACT_BASE = `Respond in GitHub-flavored Markdown with EXACTLY these sections, in order:

## Verdict
A single word on its own line: APPROVE or REVISE.

## Strengths
2–4 bullet points on what the plan gets right.

## Issues
A numbered list. Each item: **[severity: high|medium|low]** the problem, then a concrete, actionable suggestion to fix it. If there are no issues, write "None".

## Open Questions
Bullet points for anything ambiguous or unspecified. If none, write "None".`;

const CODE_OUTPUT_CONTRACT_BASE = `Respond in GitHub-flavored Markdown with EXACTLY these sections, in order:

## Verdict
A single word on its own line: APPROVE or REVISE.

## Strengths
2–4 bullet points on what the code changes get right.

## Issues
A numbered list. Categorize each item with:
- **[severity: high|medium|low] [category: correctness|conformance|cleanup]** the problem, file/line context if applicable, then a concrete, actionable suggestion to fix it.
If there are no issues, write "None".

## Open Questions / Risks
Bullet points for edge cases, potential regressions, or unspecified behavior. If none, write "None".`;

const PROGRESS_SECTION = `## Progress Since Last Review
Bullet points: which of your previous issues the revision addressed, which remain.`;

const SOURCES_SECTION = `## Sources Consulted
Bullet list of files, doctrines, or components you consulted in the codebase. If none, write "None".`;

const TOOLS_NOTE =
	"You have read-only access to the **ln-ashlar design system** repository " +
	"(source code, mixins, tokens, component APIs, DOCTRINE.md). Use it to verify " +
	"design-system contracts: mixin signatures, token values, component APIs, and " +
	"doctrine rules.\n\n" +
	"CRITICAL — HIGHEST PRIORITY FOR INLINE PROJECT FILES:\n" +
	"The caller provides the current active working files in the \"Project Files\" section below. " +
	"These inline Project Files represent the ACTUAL working state of the client's workspace and MUST TAKE ABSOLUTE PRIORITY over any files found on disk or in the server repository. " +
	"If any file provided in \"Project Files\" differs from what is on disk/server, or if the server has an older/uncommitted copy, you MUST ALWAYS treat the inline \"Project Files\" version as the true, authoritative source under review. " +
	"Do NOT flag 'file not found' or judge issues against outdated disk/server versions when inline Project Files are provided. " +
	"Only flag missing information if neither the review document nor Project Files contain enough context to evaluate correctness.\n\n" +
	"You MUST conclude with a definitive Verdict: APPROVE or REVISE.";

const WRAP_UP_INSTRUCTION =
	"The review loop has concluded. Below is the full review history and the final plan. " +
	"Write a brief retrospective in GitHub-flavored Markdown with sections: " +
	"## Review Summary (how the plan evolved across iterations, 1 short paragraph), " +
	"## Key Improvements (bullets), ## Remaining Risks (bullets or None), " +
	"## Verdict (APPROVE or REVISE for the final version).";

const CODE_WRAP_UP_INSTRUCTION =
	"The code review loop has concluded. Below is the full review history and the final code/diff. " +
	"Write a brief retrospective in GitHub-flavored Markdown with sections: " +
	"## Review Summary (how the code evolved across iterations, 1 short paragraph), " +
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
	code:
		"You are a senior engineer performing an independent code review of the changes/diff below. " +
		"Judge the code for: (1) Correctness — bugs, regressions, off-by-one errors, logic flaws, " +
		"unhandled errors, input validation, and security; (2) Plan & Spec Conformance — whether the " +
		"changes strictly adhere to the intended architecture, implementation plan, and project doctrines; " +
		"(3) Cleanup & Quality — dead code, unused imports/variables, maintainability, naming, and adherence " +
		"to existing framework abstractions and styles.",
	audit:
		"You are an independent forensic architect checking a COMPONENT AUDIT REPORT for an ln-ashlar component against its source JS, SCSS, README, schema, and DOCTRINE.md.\n" +
		"Your goal IS NOT to look for code implementations or solutions! Your goal is strictly to evaluate the audit report according to four forensic criteria:\n" +
		"1. Factual Accuracy (Фактичка точност): Are findings and evidence in the audit 100% true and verifiable against the source JS and SCSS?\n" +
		"2. Omitted Findings (Испуштени наоди): Did the audit miss any doctrine violations, dead code, SCSS duplicates, lifecycle leaks, or doc-drift?\n" +
		"3. False Findings (Невистинити наоди): Does the audit claim something that is not true in reality?\n" +
		"4. Doctrinal Purity (Доктринарна чистота): Does the audit respect the principle: 'An audit does not fix — findings are reported, decisions belong to the user' (it must NOT turn into an implementation plan with solutions)?",
	generic:
		"You are a senior reviewer giving an independent critique of the plan below. " +
		"Assess correctness, completeness, risks, and clarity."
};

const AUDIT_OUTPUT_CONTRACT_BASE = `Respond in GitHub-flavored Markdown with EXACTLY these sections, in order:

## Verdict
A single word on its own line: APPROVE or REVISE.

## Strengths
2–4 bullet points on what the audit report gets right.

## Issues
A numbered list. Categorize each item with:
- **[severity: high|medium|low] [category: factual_accuracy|omitted_finding|false_finding|doctrinal_purity]** the problem, file/line context if applicable, then a concrete suggestion for the auditor to refine the audit report.
If there are no issues, write "None".

## Open Questions / Risks
Bullet points for anything ambiguous or unverified in the component or audit. If none, write "None".`;

const AUDIT_WRAP_UP_INSTRUCTION =
	"The audit review loop has concluded. Below is the full review history and the final component audit report. " +
	"Write a brief retrospective in GitHub-flavored Markdown with sections: " +
	"## Review Summary (how the audit report evolved across iterations, 1 short paragraph), " +
	"## Key Improvements (bullets), ## Remaining Risks (bullets or None), " +
	"## Verdict (APPROVE or REVISE for the final version).";

export function buildReviewPrompt({ planType, context, projectFiles, previousFeedback, plan, wrapUp }) {
	if (wrapUp) {
		const parts = [WRAP_UP_INSTRUCTION, ""];
		if (context) parts.push("## Project Context", context, "");
		if (projectFiles) parts.push(
			"## Project Files (current working source, provided by the caller)",
			"CRITICAL: These inline files are the ACTUAL ACTIVE WORKING SOURCE from the client workspace and MUST TAKE ABSOLUTE PRIORITY over any files on disk or server repository. " +
			"Use them as the primary authoritative source to verify the plan's claims about current state, " +
			"selectors, mixin usage, and specificity.", "",
			projectFiles, "");
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
	if (projectFiles) parts.push(
		"## Project Files (current working source, provided by the caller)",
		"CRITICAL: These inline files are the ACTUAL ACTIVE WORKING SOURCE from the client workspace and MUST TAKE ABSOLUTE PRIORITY over any files on disk or server repository. " +
		"Use them as the primary authoritative source to verify the plan's claims about current state, " +
		"selectors, mixin usage, and specificity.", "",
		projectFiles, "");
	if (previousFeedback) parts.push(
		"## Your Previous Feedback (the author revised the plan to address this)",
		previousFeedback, "");
	parts.push("## Plan Under Review", plan);
	return parts.join("\n");
}

export function buildCodeReviewPrompt({ diff, context, projectFiles, previousFeedback, wrapUp }) {
	if (wrapUp) {
		const parts = [CODE_WRAP_UP_INSTRUCTION, ""];
		if (context) parts.push("## Intended Plan / Context", context, "");
		if (projectFiles) parts.push(
			"## Project Files (current working source, provided by the caller)",
			"CRITICAL: These inline files are the ACTUAL ACTIVE WORKING SOURCE from the client workspace and MUST TAKE ABSOLUTE PRIORITY over any files on disk or server repository. " +
			"Use them as the primary authoritative source to verify the diff against the project's current state.", "",
			projectFiles, "");
		if (previousFeedback) parts.push(
			"## Review History (all previous critiques, concatenated)",
			previousFeedback, "");
		parts.push("## Final Code / Diff", diff);
		return parts.join("\n");
	}

	const criteria = CRITERIA.code;
	const contractParts = [CODE_OUTPUT_CONTRACT_BASE, "", SOURCES_SECTION];
	const outputContract = contractParts.join("\n");

	const parts = [criteria, "", TOOLS_NOTE, "", outputContract, ""];
	if (context) parts.push("## Intended Plan / Context", context, "");
	if (projectFiles) parts.push(
		"## Project Files (current working source, provided by the caller)",
		"CRITICAL: These inline files are the ACTUAL ACTIVE WORKING SOURCE from the client workspace and MUST TAKE ABSOLUTE PRIORITY over any files on disk or server repository. " +
		"Use them as the primary authoritative source to verify the diff against the project's current state.", "",
		projectFiles, "");
	if (previousFeedback) parts.push("## Your Previous Review Feedback", previousFeedback, "");
	parts.push("## Code / Diff Under Review", diff);
	return parts.join("\n");
}

export function buildAuditReviewPrompt({ component, audit, projectFiles, previousFeedback, wrapUp }) {
	if (wrapUp) {
		const parts = [AUDIT_WRAP_UP_INSTRUCTION, ""];
		if (component) parts.push("## Target Component", component, "");
		if (projectFiles) parts.push(
			"## Project Files (current working source JS, SCSS, README, schema, tests provided by the caller)",
			"CRITICAL: These inline files are the ACTUAL ACTIVE WORKING SOURCE from the client workspace and MUST TAKE ABSOLUTE PRIORITY over any files on disk or server repository. " +
			"Use them as the primary authoritative source to verify the audit claims against the actual component code.", "",
			projectFiles, "");
		if (previousFeedback) parts.push(
			"## Review History (all previous critiques, concatenated)",
			previousFeedback, "");
		parts.push("## Final Audit Report", audit);
		return parts.join("\n");
	}

	const criteria = CRITERIA.audit;
	const contractParts = [AUDIT_OUTPUT_CONTRACT_BASE];
	if (previousFeedback) contractParts.push("", PROGRESS_SECTION);
	contractParts.push("", SOURCES_SECTION);
	const outputContract = contractParts.join("\n");

	const parts = [criteria, "", TOOLS_NOTE, "", outputContract, ""];
	if (component) parts.push("## Target Component", component, "");
	if (projectFiles) parts.push(
		"## Project Files (current working source JS, SCSS, README, schema, tests provided by the caller)",
		"CRITICAL: These inline files are the ACTUAL ACTIVE WORKING SOURCE from the client workspace and MUST TAKE ABSOLUTE PRIORITY over any files on disk or server repository. " +
		"Use them as the primary authoritative source to verify the audit claims against the actual component code.", "",
		projectFiles, "");
	if (previousFeedback) parts.push(
		"## Your Previous Review Feedback (the auditor revised the report to address this)",
		previousFeedback, "");
	parts.push("## Audit Report Under Review", audit);
	return parts.join("\n");
}

export function extractVerdict(text) {
	if (!text) return "UNKNOWN";
	const m = text.match(/\b(APPROVE|REVISE)\b/i);
	return m ? m[1].toUpperCase() : "UNKNOWN";
}

