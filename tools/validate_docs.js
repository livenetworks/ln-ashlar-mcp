import { ensureIndex, configuredRoots, notConfiguredMessage } from "./ashlar/corpus.js";
import { validateCorpus } from "./ashlar/validate.js";

export const name = "validate_docs";

export const definition = {
  title: "Validate Docs",
  description:
    "Run the ln-ashlar docs-mcp contract validation (frontmatter, slug, classification, " +
    "normative headings, table columns, Direction/Kind enums, duplicate names within a root) " +
    "against the LIVE configured corpus roots (always a fresh read, not the cached in-memory " +
    "index), grouped per root then per file. Dangling relative links are valid planned docs, " +
    "not findings. This is the only implementation of contract validation (also available as " +
    "the CLI linter tools/ashlar/lint-cli.js / npm run lint:docs).",
  inputSchema: {}
};

export const handler = async () => {
  const index = await ensureIndex();
  if (!index) {
    return { content: [{ type: "text", text: notConfiguredMessage() }] };
  }

  const roots = configuredRoots();
  const results = validateCorpus(roots);

  const lines = [];
  let totalFiles = 0;
  let totalWithProblems = 0;

  for (const root of results) {
    lines.push(`## Root: ${root.rootLabel} (${root.rootPath})`, "");

    if (!root.files.length) {
      lines.push("(no corpus found / no indexable files)", "");
      continue;
    }

    const withProblems = root.files.filter((f) => f.problems.length > 0);
    const valid = root.files.filter((f) => f.problems.length === 0);
    totalFiles += root.files.length;
    totalWithProblems += withProblems.length;

    lines.push(`${root.files.length} files checked, ${withProblems.length} with problems`, "");

    for (const f of withProblems) {
      lines.push(`### ${f.file}`);
      for (const problem of f.problems) {
        lines.push(`- ${problem}`);
      }
      lines.push("");
    }

    if (valid.length > 0) {
      lines.push(`Valid: ${valid.map((f) => f.file).join(", ")}`, "");
    }
  }

  lines.unshift(`${totalFiles} files checked across ${results.length} root(s), ${totalWithProblems} with problems`, "");

  return { content: [{ type: "text", text: lines.join("\n").trim() }] };
};
