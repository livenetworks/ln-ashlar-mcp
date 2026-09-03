import { execFile } from "node:child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve __dirname for ES module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const claudeConfigPath = path.resolve(__dirname, "../config", "claude.json");

export const DEFAULT_CLAUDE_CONFIG = {
	model: "opus",
	effort: "medium",
	timeoutMs: 240000,
	concurrency: 2,
	maxIterations: 3,
	claudeBin: process.env.CLAUDE_BIN || "claude",
	claudeHome: process.env.HOME || "/home/mcp", // isolated HOME for the runner
	claudeCwd: process.env.REPO_DIR || "/home/mcp/ln-ashlar", // repository directory
	tools: "Read,Glob,Grep",  // read-only repo tools, no writes/bash/mcp
	maxOutputBytes: 1048576,  // 1 MiB output cap
	auditLog: true
};

let cachedConfig = { ...DEFAULT_CLAUDE_CONFIG };
let cachedMtimeMs = 0;

/**
 * Reload config/claude.json from disk if its mtime changed since the last read,
 * merged over DEFAULT_CLAUDE_CONFIG. On any read/parse failure, keeps the previous
 * cache (or falls back to DEFAULT_CLAUDE_CONFIG on first load).
 */
export function loadClaudeConfig() {
	let stat;
	try {
		stat = fs.statSync(claudeConfigPath);
	} catch (e) {
		return cachedConfig;
	}

	if (stat.mtimeMs === cachedMtimeMs) {
		return cachedConfig;
	}

	try {
		const raw = fs.readFileSync(claudeConfigPath, "utf-8");
		const parsed = JSON.parse(raw);
		cachedConfig = { ...DEFAULT_CLAUDE_CONFIG, ...parsed };
		cachedMtimeMs = stat.mtimeMs;
	} catch (e) {
		console.warn("[claude] Failed to reload claude.json, keeping previous cache:", e.message);
	}

	return cachedConfig;
}

export class ClaudeError extends Error {
	constructor(code, message) {
		super(message);
		this.name = "ClaudeError";
		this.code = code;
	}
}

function sanitizeCliError(err, stdout, stderr, bin) {
	let raw = (stderr || stdout || err?.message || "").trim();
	if (!raw) {
		raw = err?.message || "Unknown execution error";
	}
	if (bin) {
		const binRegex = new RegExp(`\\b${bin}\\b`, "g");
		raw = raw.replace(binRegex, "Reviewer CLI");
	}
	raw = raw.replace(/\/home\/[^\s:]+/g, "<path>");
	const lines = raw
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	return lines.join("\n");
}

let inFlight = 0;

export function runClaude(prompt, { config, execFileFn = execFile } = {}) {
	const cfg = config || loadClaudeConfig();
	if (inFlight >= cfg.concurrency) {
		return Promise.reject(new ClaudeError("BUSY",
			"Claude reviewer is busy (max concurrent reviews reached). Retry shortly."));
	}
	inFlight++;
	return new Promise((resolve, reject) => {
		const home = cfg.claudeHome || process.env.HOME || "/home/mcp";
		let pathEnv = process.env.PATH;
		if (pathEnv && !pathEnv.includes("/.local/bin")) {
			pathEnv = `${pathEnv}:${home}/.local/bin`;
		}

		const args = [
			"-p",
			"--output-format", "json",
			"--no-session-persistence",
			"--dangerously-skip-permissions",
			`--tools=${cfg.tools !== undefined ? cfg.tools : "Read,Glob,Grep"}`
		];
		if (cfg.model) {
			args.push("--model", cfg.model);
		}
		if (cfg.effort) {
			args.push("--effort", cfg.effort);
		}
		args.push("--", prompt);

		// Explicit, minimal env — HOME/cwd isolated per security guidelines.
		const env = { PATH: pathEnv, HOME: home };
		if (process.env.ANTHROPIC_API_KEY) {
			env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
		}

		const opts = {
			cwd: cfg.claudeCwd || "/tmp",
			env,
			timeout: cfg.timeoutMs,     // execFile kills the child on expiry
			killSignal: "SIGTERM",
			maxBuffer: cfg.maxOutputBytes,
			windowsHide: true
		};

		let settled = false;
		const done = (fn, arg) => { if (!settled) { settled = true; inFlight--; fn(arg); } };
		let child;
		try {
			child = execFileFn(cfg.claudeBin, args, opts, (err, stdout, stderr) => {
				if (err) {
					if (err.code === "ENOENT")
						return done(reject, new ClaudeError("CLI_MISSING",
							`Reviewer CLI binary not found in the server's PATH. Check installation.`));
					if (err.killed || err.signal === "SIGTERM" || err.code === "ETIMEDOUT")
						return done(reject, new ClaudeError("TIMEOUT", `Claude review timed out after ${cfg.timeoutMs} ms.`));
					if (err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
						return done(reject, new ClaudeError("OVERSIZED", "Claude output exceeded the configured size cap."));
					const blob = `${stderr || ""} ${err.message || ""}`;
					if (/429|quota|rate.?limit|overloaded/i.test(blob))
						return done(reject, new ClaudeError("QUOTA", "Claude quota exhausted, retry later."));
					const cleanMsg = sanitizeCliError(err, stdout, stderr, cfg.claudeBin);
					return done(reject, new ClaudeError("CLI_ERROR", `Reviewer CLI failed:\n${cleanMsg}`));
				}
				let parsed;
				try {
					const firstBrace = (stdout || "").indexOf("{");
					const lastBrace = (stdout || "").lastIndexOf("}");
					if (firstBrace !== -1 && lastBrace > firstBrace) {
						parsed = JSON.parse(stdout.slice(firstBrace, lastBrace + 1));
					} else {
						parsed = JSON.parse(stdout);
					}
				} catch {
					return done(reject, new ClaudeError("NON_JSON", "Claude returned non-JSON output."));
				}

				if (parsed.is_error) {
					const errMsg = parsed.result || "Claude execution error";
					if (/auth|login|token|oauth|expired|unauthorized/i.test(errMsg)) {
						return done(reject, new ClaudeError("AUTH_ERROR", `Claude authentication error: ${errMsg}`));
					}
					return done(reject, new ClaudeError("CLI_ERROR", `Claude reviewer error: ${errMsg}`));
				}

				const text = typeof parsed.result === "string" ? parsed.result.trim() : (typeof parsed.response === "string" ? parsed.response.trim() : null);
				if (!text) {
					const detail = stderr ? stderr.trim().slice(0, 300) : 'Claude JSON had no usable "result" field.';
					return done(reject, new ClaudeError("NON_JSON", detail));
				}
				return done(resolve, { text, parsed });
			});
		} catch (e) {
			return done(reject, new ClaudeError("CLI_MISSING", `Failed to spawn Reviewer CLI: ${e.message}`));
		}

		// Long plans can go via stdin as well
		try {
			if (child && child.stdin) {
				child.stdin.on?.("error", () => {});
				child.stdin.write(prompt);
				child.stdin.end();
			}
		} catch { /* callback path handles failure */ }
	});
}
