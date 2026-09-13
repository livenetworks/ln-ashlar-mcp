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

export const name = "graphify_status";

export const definition = {
  title: "Graphify Status",
  description:
    "Check Graphify knowledge graph status, node/edge counts, or rebuild the AST index for the target repository.",
  inputSchema: {
    rebuild: z
      .boolean()
      .optional()
      .describe("Force a complete re-scan and rebuild of the AST knowledge graph"),
    root: z
      .string()
      .optional()
      .describe("Corpus or repository root directory (defaults to primary configured root)")
  }
};

export const handler = async ({ rebuild, root }) => {
  const roots = configuredRoots();
  const targetRoot = root ? path.resolve(root) : (roots[0] || "/home/mcp/ln-ashlar");

  if (!fs.existsSync(targetRoot)) {
    return {
      content: [{ type: "text", text: `Target directory not found: ${targetRoot}` }]
    };
  }

  const graphJson = path.join(targetRoot, "graphify-out", "graph.json");
  const bin = getGraphifyBin();

  if (rebuild || !fs.existsSync(graphJson)) {
    try {
      const { stdout } = await execFileAsync(bin, [".", "--code-only", "--no-viz", ...(rebuild ? ["--force"] : [])], {
        cwd: targetRoot,
        maxBuffer: 5 * 1024 * 1024
      });
      return {
        content: [{ type: "text", text: `Graphify index successfully built/updated:\n\n${stdout.trim()}` }]
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to build Graphify index: ${err.message}` }]
      };
    }
  }

  try {
    const stat = fs.statSync(graphJson);
    const raw = fs.readFileSync(graphJson, "utf-8");
    const data = JSON.parse(raw);
    const nodeCount = Array.isArray(data.nodes) ? data.nodes.length : (data.nodes ? Object.keys(data.nodes).length : 0);
    const edgeCount = Array.isArray(data.links) ? data.links.length : (Array.isArray(data.edges) ? data.edges.length : 0);

    return {
      content: [
        {
          type: "text",
          text: `Graphify status for ${targetRoot}:\n- Graph file: ${graphJson}\n- Size: ${Math.round(stat.size / 1024)} KB\n- Last updated: ${stat.mtime.toISOString()}\n- Nodes: ${nodeCount}\n- Edges: ${edgeCount}`
        }
      ]
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error reading Graphify graph file: ${err.message}` }]
    };
  }
};
