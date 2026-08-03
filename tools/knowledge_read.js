import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { configuredRoots, notConfiguredMessage } from './ashlar/corpus.js';

export const name = "knowledge_read";

export const definition = {
  title: "Knowledge Read",
  description: "Read the full content of a project documentation or knowledge file for ln-ashlar",
  inputSchema: {
    filePath: z
      .string()
      .describe("Path as returned by knowledge_search, root-label prefixed (e.g. 'ln-ashlar/docs/css/mixins.md'). A plain repo-relative path ('docs/css/mixins.md') is also accepted and resolved against each configured root in order.")
  }
};

const fail = (text) => ({ content: [{ type: "text", text: `Error: ${text}` }], isError: true });

export const handler = async ({ filePath }) => {
  const roots = configuredRoots().map((r) => path.resolve(r));
  if (!roots.length) return fail(notConfiguredMessage([]));

  let denied = false;

  for (const root of roots) {
    const label = path.basename(root) || root;

    // Accept both the prefixed form knowledge_search emits and a plain
    // repo-relative path.
    const candidates = [filePath];
    if (filePath.startsWith(`${label}/`)) candidates.push(filePath.slice(label.length + 1));

    for (const rel of candidates) {
      const resolved = path.resolve(root, rel);
      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        denied = true;
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(resolved);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;

      return { content: [{ type: "text", text: fs.readFileSync(resolved, 'utf8') }] };
    }
  }

  if (denied) return fail("Access denied: Path is outside the documentation directory.");
  return fail(`File not found: ${filePath}`);
};
