import { execFile } from "node:child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve __dirname for ES module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gptConfigPath = path.resolve(__dirname, "../config", "gpt.json");

export const DEFAULT_GPT_CONFIG = {
	model: "GPT-OSS 120B (Medium)",
	timeoutMs: 240000,
	concurrency: 2,
	maxIterations: 3,
	gptBin: "agy",
	gptHome: process.env.HOME || "/home/mcp", // isolated HOME for the runner
	gptCwd: "",           // empty working dir for the runner
	maxOutputBytes: 1048576, // 1 MiB output cap
	auditLog: true
};

let cachedConfig = { ...DEFAULT_GPT_CONFIG };
let cachedMtimeMs = 0;

/**
 * Reload config/gpt.json from disk if its mtime changed since the last read,
 * merged over DEFAULT_GPT_CONFIG. On any read/parse failure, keeps the previous
 * cache (or falls back to DEFAULT_GPT_CONFIG on first load).
 */
export function loadGptConfig() {
	let stat;
	try {
		stat = fs.statSync(gptConfigPath);
	} catch (e) {
		console.warn("[gpt] Failed to stat gpt.json, keeping previous cache:", e.message);
		return cachedConfig;
	}

	if (stat.mtimeMs === cachedMtimeMs) {
		return cachedConfig;
	}

	try {
		const raw = fs.readFileSync(gptConfigPath, "utf-8");
		const parsed = JSON.parse(raw);
		cachedConfig = { ...DEFAULT_GPT_CONFIG, ...parsed };
		cachedMtimeMs = stat.mtimeMs;
	} catch (e) {
		console.warn("[gpt] Failed to reload gpt.json, keeping previous cache:", e.message);
	}

	return cachedConfig;
}

export class GptError extends Error {
	constructor(code, message) {
		super(message);
		this.name = "GptError";
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
	raw = raw.replace(/\b[a-zA-Z0-9_-]+\.go:\d+\]?/g, "");
	raw = raw.replace(/\/home\/[^\s:]+/g, "<path>");
	const lines = raw
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	return lines.join("\n");
}

let gptInFlight = 0;

export function runGpt(prompt, { config, execFileFn = execFile } = {}) {
	const cfg = config || loadGptConfig();
	if (gptInFlight >= cfg.concurrency) {
		return Promise.reject(new GptError("BUSY",
			"GPT reviewer is busy (max concurrent reviews reached). Retry shortly."));
	}
	gptInFlight++;
	return new Promise((resolve, reject) => {
		const home = cfg.gptHome || process.env.HOME || "/home/mcp";
		let pathEnv = process.env.PATH;
		if (pathEnv && !pathEnv.includes("/.local/bin")) {
			pathEnv = `${pathEnv}:${home}/.local/bin`;
		}

		const args = ["--output-format", "json", "--dangerously-skip-permissions"];
		if (cfg.model) {
			args.push("--model", cfg.model);
		}
		args.push("--print", prompt);

		// Explicit, minimal env — HOME/cwd isolated per §3. NEVER inherit full process.env.
		const opts = {
			cwd: cfg.gptCwd,
			env: { PATH: pathEnv, HOME: home },
			timeout: cfg.timeoutMs,     // execFile kills the child on expiry
			killSignal: "SIGTERM",
			maxBuffer: cfg.maxOutputBytes,
			windowsHide: true
		};
		let settled = false;
		const done = (fn, arg) => { if (!settled) { settled = true; gptInFlight--; fn(arg); } };
		let child;
		try {
			child = execFileFn(cfg.gptBin, args, opts, (err, stdout, stderr) => {
				if (err) {
					if (err.code === "ENOENT")
						return done(reject, new GptError("GPT_MISSING",
							`Reviewer CLI binary not found in the server's PATH. Check installation.`));
					if (err.killed || err.signal === "SIGTERM" || err.code === "ETIMEDOUT")
						return done(reject, new GptError("TIMEOUT", `GPT review timed out after ${cfg.timeoutMs} ms.`));
					if (err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
						return done(reject, new GptError("OVERSIZED", "GPT output exceeded the configured size cap."));
					const blob = `${stderr || ""} ${err.message || ""}`;
					if (/429|quota|rate.?limit|resource.?exhausted/i.test(blob))
						return done(reject, new GptError("QUOTA", "GPT quota exhausted, retry later."));
					const cleanMsg = sanitizeCliError(err, stdout, stderr, cfg.gptBin);
					return done(reject, new GptError("CLI_ERROR", `Reviewer CLI failed:\n${cleanMsg}`));
				}
				let parsed;
				try { parsed = JSON.parse(stdout); }
				catch { return done(reject, new GptError("NON_JSON", "GPT returned non-JSON output.")); }
				const text = typeof parsed.response === "string" ? parsed.response.trim() : null;
				if (!text) {
					const detail = stderr ? stderr.trim().slice(0, 300) : 'GPT JSON had no usable "response" field.';
					return done(reject, new GptError("NON_JSON", detail));
				}
				return done(resolve, { text, parsed });
			});
		} catch (e) {
			return done(reject, new GptError("GPT_MISSING", `Failed to spawn Reviewer CLI: ${e.message}`));
		}
		// Long plans go via stdin to avoid ARG_MAX.
		try {
			if (child && child.stdin) {
				child.stdin.on?.("error", () => {});   // swallow EPIPE; the exec callback owns the outcome
				child.stdin.write(prompt);
				child.stdin.end();
			}
		} catch { /* callback path handles failure */ }
	});
}
