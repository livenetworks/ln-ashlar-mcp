import { ensureIndex, configuredRepo, notConfiguredMessage } from "./ashlar/corpus.js";
import { validateCorpus } from "./ashlar/validate.js";

export const name = "validate_docs";

export const definition = {
  title: "Validate Docs",
  description:
    "Run the ln-ashlar docs-mcp contract validation (frontmatter, slug, classification, " +
    "normative headings, table columns, relative links) against the LIVE configured corpus " +
    "(always a fresh read, not the cached in-memory index). This is the only implementation " +
    "of contract validation.",
  inputSchema: {}
};

export const handler = async () => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const repoPath = configuredRepo();
  const results = validateCorpus(repoPath);

  const withProblems = results.filter((r) => r.problems.length > 0);
  const valid = results.filter((r) => r.problems.length === 0);

  const lines = [`${results.length} files checked, ${withProblems.length} with problems`, ""];

  for (const r of withProblems) {
    lines.push(`### ${r.file}`);
    for (const problem of r.problems) {
      lines.push(`- ${problem}`);
    }
    lines.push("");
  }

  if (valid.length > 0) {
    lines.push(`Valid: ${valid.map((r) => r.file).join(", ")}`);
  }

  return { content: [{ type: "text", text: lines.join("\n").trim() }] };
};
