import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { configuredRoots } from "./ashlar/corpus.js";

const execFileAsync = promisify(execFile);

function getGraphifyBin() {
  if (process.env.GRAPHIFY_BIN && fs.existsSync(process.env.GRAPHIFY_BIN)) {
    return process.env.GRAPHIFY_BIN;
  }
  if (fs.existsSync("/home/mcp/.local/bin/graphify")) {
    return "/home/mcp/.local/bin/graphify";
  }
  return "graphify";
}

export const name = "graphify_query";

export const definition = {
  title: "Graphify Query",
  description:
    "Query the Graphify AST knowledge graph for codebase architecture, symbol dependencies, call paths, and structural relationships.",
  inputSchema: {
    query: z
      .string()
      .describe("Natural language query or symbol to search in the knowledge graph (e.g. 'ln-data-coordinator', 'How do components handle events?')"),
    dfs: z
      .boolean()
      .optional()
      .describe("Use Depth-First Search (DFS) instead of default Breadth-First Search (BFS)"),
    budget: z
      .number()
      .optional()
      .describe("Token budget limit for output (default: 2000)"),
    root: z
      .string()
      .optional()
      .describe("Corpus or repository root directory (defaults to primary configured root)")
  }
};

export const handler = async ({ query, dfs, budget, root }) => {
  const roots = configuredRoots();
  const targetRoot = root ? path.resolve(root) : (roots[0] || "/home/mcp/ln-ashlar");

  if (!fs.existsSync(targetRoot)) {
    return {
      content: [
        {
          type: "text",
          text: `Target directory not found: ${targetRoot}`
        }
      ]
    };
  }

  const graphJson = path.join(targetRoot, "graphify-out", "graph.json");
  const bin = getGraphifyBin();

  // Auto-build graph if missing
  if (!fs.existsSync(graphJson)) {
    try {
      await execFileAsync(bin, [".", "--code-only", "--no-viz"], { cwd: targetRoot });
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to build graphify index: ${err.message}`
          }
        ]
      };
    }
  }

  const args = ["query", query];
  if (dfs) args.push("--dfs");
  if (budget) {
    args.push("--budget", String(budget));
  }

  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd: targetRoot,
      maxBuffer: 5 * 1024 * 1024
    });

    const output = (stdout || stderr || "No results returned from Graphify.").trim();

    return {
      content: [
        {
          type: "text",
          text: output
        }
      ]
    };
  } catch (error) {
    const out = error.stdout || error.stderr || error.message;
    return {
      content: [
        {
          type: "text",
          text: `Graphify Query Error: ${out}`
        }
      ]
    };
  }
};
