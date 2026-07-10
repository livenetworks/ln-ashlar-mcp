import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const DOCS_ROOT = path.resolve(import.meta.dirname, '../resources/ln-ashlar');

export const name = "knowledge_read";

export const definition = {
  title: "Knowledge Read",
  description: "Read the full content of a project documentation or knowledge file for ln-ashlar",
  inputSchema: {
    filePath: z.string().describe("Relative path to the file (e.g., 'docs/css/mixins.md' or 'docs/architecture/mindset.md')")
  }
};

export const handler = async ({ filePath }) => {
  try {
    const resolvedPath = path.resolve(DOCS_ROOT, filePath);
    // Security check: ensure path is within DOCS_ROOT
    if (resolvedPath !== DOCS_ROOT && !resolvedPath.startsWith(DOCS_ROOT + path.sep)) {
      throw new Error("Access denied: Path is outside the documentation directory.");
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const content = fs.readFileSync(resolvedPath, 'utf8');
    return {
      content: [{ type: "text", text: content }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
};
