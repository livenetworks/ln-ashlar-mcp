import { execFile } from "node:child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Resolve __dirname for ES module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const geminiConfigPath = path.resolve(__dirname, "../config", "gemini.json");

export const DEFAULT_CONFIG = {
	model: "gemini-2.5-flash",
	timeoutMs: 120000,
	concurrency: 2,
	maxIterations: 3,
	geminiBin: "gemini",
	geminiHome: "",          // isolated HOME for the runner (set in config/gemini.json)
	geminiCwd: "",           // empty working dir for the runner
	maxOutputBytes: 1048576, // 1 MiB output cap
	auditLog: true
};

let cachedConfig = { ...DEFAULT_CONFIG };
let cachedMtimeMs = 0;

/**
 * Reload config/gemini.json from disk if its mtime changed since the last read,
 * merged over DEFAULT_CONFIG. On any read/parse failure, keeps the previous
 * cache (or falls back to DEFAULT_CONFIG on first load).
 */
export function loadGeminiConfig() {
	let stat;
	try {
		stat = fs.statSync(geminiConfigPath);
	} catch (e) {
		console.warn("[gemini] Failed to stat gemini.json, keeping previous cache:", e.message);
		return cachedConfig;
	}

	if (stat.mtimeMs === cachedMtimeMs) {
		return cachedConfig;
	}

	try {
		const raw = fs.readFileSync(geminiConfigPath, "utf-8");
		const parsed = JSON.parse(raw);
		cachedConfig = { ...DEFAULT_CONFIG, ...parsed };
		cachedMtimeMs = stat.mtimeMs;
	} catch (e) {
		console.warn("[gemini] Failed to reload gemini.json, keeping previous cache:", e.message);
	}

	return cachedConfig;
}

export class GeminiError extends Error {
	constructor(code, message) {
		super(message);
		this.name = "GeminiError";
		this.code = code;
	}
}

let inFlight = 0;

export function runGemini(prompt, { config, execFileFn = execFile } = {}) {
	const cfg = config || loadGeminiConfig();
	if (inFlight >= cfg.concurrency) {
		return Promise.reject(new GeminiError("BUSY",
			"Gemini reviewer is busy (max concurrent reviews reached). Retry shortly."));
	}
	inFlight++;
	return new Promise((resolve, reject) => {
		const args = ["--output-format", "json", "-m", cfg.model];
		// Explicit, minimal env — HOME/cwd isolated per §3. NEVER inherit full process.env.
		const opts = {
			cwd: cfg.geminiCwd,
			env: { PATH: process.env.PATH, HOME: cfg.geminiHome },
			timeout: cfg.timeoutMs,     // execFile kills the child on expiry
			killSignal: "SIGTERM",
			maxBuffer: cfg.maxOutputBytes,
			windowsHide: true
		};
		let settled = false;
		const done = (fn, arg) => { if (!settled) { settled = true; inFlight--; fn(arg); } };
		let child;
		try {
			child = execFileFn(cfg.geminiBin, args, opts, (err, stdout, stderr) => {
				if (err) {
					if (err.code === "ENOENT")
						return done(reject, new GeminiError("CLI_MISSING",
							"gemini-cli not found or not authenticated. Install @google/gemini-cli and complete the runner OAuth login."));
					if (err.killed || err.signal === "SIGTERM" || err.code === "ETIMEDOUT")
						return done(reject, new GeminiError("TIMEOUT", `Gemini review timed out after ${cfg.timeoutMs} ms.`));
					if (err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
						return done(reject, new GeminiError("OVERSIZED", "Gemini output exceeded the configured size cap."));
					const blob = `${stderr || ""} ${err.message || ""}`;
					if (/429|quota|rate.?limit|resource.?exhausted/i.test(blob))
						return done(reject, new GeminiError("QUOTA", "Gemini quota exhausted, retry later."));
					return done(reject, new GeminiError("CLI_ERROR", `gemini-cli failed: ${blob.trim().slice(0, 500)}`));
				}
				let parsed;
				try { parsed = JSON.parse(stdout); }
				catch { return done(reject, new GeminiError("NON_JSON", "Gemini returned non-JSON output.")); }
				const text = typeof parsed.response === "string" ? parsed.response : null;
				if (!text) return done(reject, new GeminiError("NON_JSON", 'Gemini JSON had no usable "response" field.'));
				return done(resolve, { text, parsed });
			});
		} catch (e) {
			return done(reject, new GeminiError("CLI_MISSING", `Failed to spawn gemini-cli: ${e.message}`));
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
