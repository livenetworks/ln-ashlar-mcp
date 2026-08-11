# MCP Server

[![M8ven Verified](https://m8ven.ai/badge/mcp/livenetworks-ln-ashlar-mcp-1u4m71)](https://m8ven.ai/mcp/livenetworks-ln-ashlar-mcp-1u4m71 ) <!-- m8ven-verify: b920ef8a7aa6c19c0152cd3c3c872cbc -->

Node.js (ESM) HTTP server exposing Model Context Protocol (MCP) tools (Streamable HTTP + legacy SSE transport) along with a custom OAuth 2.0 + PKCE authorization flow and a searchable knowledge base ([ln-ashlar](https://github.com/livenetworks/ln-ashlar) documentation).

## Technologies

- Node.js, Express 5
- `@modelcontextprotocol/sdk` (Streamable HTTP and SSE transports)
- `jsonwebtoken` for authorization code / access token
- `fuse.js` for fuzzy documentation search
- `winston` + `winston-daily-rotate-file` for logging

## Installation

```bash
npm install
```

Copy the example configuration files and populate them with real values (both files are in `.gitignore` and are NOT committed):

```bash
cp config/auth.example.json config/auth.json
cp config/jwt.example.json config/jwt.json
```

- `config/auth.json` — list of users (`{ users: { <username>: { clientId, token } } }`).
- `config/jwt.json` — secret (`secret`) for signing JWT codes/tokens. Generate a strong random value (e.g., `openssl rand -base64 48`).
- `config/oauth.json` — already present in the repository (contains no secrets), defines allowed `redirect_uri` values (`allowedRedirects`) and whether loopback (`localhost`/`127.0.0.1`) redirects are allowed.
- `config/gemini.json` — configuration for the `review_plan` tool (copy from `config/gemini.example.json`); contains no secrets in the file — authentication for gemini-cli uses gemini-cli's own encrypted credentials in the runner's `HOME` (`~/.gemini/gemini-credentials.json`), not via this repo.

## Corpus — Where Documentation Lives

The server DOES NOT have a built-in location for documentation. Where [ln-ashlar](https://github.com/livenetworks/ln-ashlar) (and any other product repository with a `docs-mcp/` folder) resides is determined by **a single environment variable**:

- `DOCS_CORPUS_ROOTS` — comma-separated list of **repository roots** (not the `docs-mcp` subfolder). Each root is read only if it contains `docs-mcp/`.
- `ASHLAR_DOCS_REPO` — legacy single-root fallback, used only when `DOCS_CORPUS_ROOTS` is not set.

The same setting feeds all consumers — ashlar tools (`tools/ashlar/corpus.js`, `configuredRoots()`), legacy knowledge index (`tools/knowledge/loader.js`), and `get_ln_schema`. There is no backup copy in this repo: if no root contains the schema, `get_ln_schema` returns an error instead of a stale response.

If the variable is not set, the server still boots up — tools report "not configured" instead of crashing.

### Routing Contract — `docs-mcp/component-router.md`

Every root **should** carry `docs-mcp/component-router.md` — a matrix for component selection (what it is used for, what it is NOT used for). This is the only top-level file served by the server **without indexing it as a document**:

- Its body is injected verbatim into MCP `instructions` during `initialize` (`tools/ashlar/instructions.js`, `buildInstructions()`). This is the only push channel in MCP — the client places it into the model's system prompt before the first token, without any tool call. This allows the model to know the exact component in advance, rather than browsing documentation and guessing.
- The same matrix is also served on demand via the `get_component_router` MCP tool (optional `root` for a single root).
- Descriptions of `get_markup`, `get_component`, `list_components`, and `search_docs` repeat the rule (`ROUTER_FIRST_HINT`) — a second safeguard at the moment a component is chosen.

It is read raw: **no frontmatter**, does not pass through `parseDoc()`, and intentionally does NOT enter `docs`/`registry`/`byName`/`fuse`. Two reasons: it does not need frontmatter, and its name must not collide with the actual `ln-router` component in `components/`.

Federation: N roots ⇒ N sections in `instructions`, each with a header `--- <rootLabel> / component router ---`, in the order of `DOCS_CORPUS_ROOTS`. A root without such a file is valid — it simply does not contribute a section (logs a `console.warn`). When no root has one, the server does not send `instructions` at all.

`instructions` are built **per session**, not on startup — meaning a commit to the corpus reaches the next session without restarting the server (following the same git-HEAD rule from "Documentation Refresh" below).

A clone in `resources/` is one possible setup, not a requirement. Locally, it can directly point to your working checkout:

```bash
DOCS_CORPUS_ROOTS=/home/mcp/ln-ashlar node server.js
```

```powershell
$env:DOCS_CORPUS_ROOTS = 'c:/laragon/www/ln-ashlar'; node server.js
```

## Running

### Linux Startup (CLI)

Start the server directly on Linux with the `ln-ashlar` corpus path:

```bash
DOCS_CORPUS_ROOTS=/home/mcp/ln-ashlar PORT=8080 node server.js
```

Or using `ASHLAR_DOCS_REPO`:

```bash
ASHLAR_DOCS_REPO=/home/mcp/ln-ashlar PORT=8080 npm start
```

### Linux Service (Systemd)

To run the server continuously in the background on Linux as a `systemd` service:

1. Create `/etc/systemd/system/ln-ashlar-mcp.service`:

```ini
[Unit]
Description=LN Ashlar MCP Server
After=network.target

[Service]
Type=simple
User=mcp
WorkingDirectory=/home/mcp/server
Environment=PORT=8080
Environment=DOCS_CORPUS_ROOTS=/home/mcp/ln-ashlar
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

2. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ln-ashlar-mcp
sudo systemctl start ln-ashlar-mcp
```

The server listens on `0.0.0.0:<PORT>` (default `8080`).

**Note:** The server does NOT hot-reload JS code — any changes in `server.js`, `routes/`, `middleware/`, or `tools/` require a process restart to take effect. Exceptions are corpus contents and users in `config/auth.json` — they can be refreshed without a restart (see below).

## Endpoints Overview

### OAuth 2.0 + PKCE Flow

- `GET /authorize` — displays an HTML login page (login template in `views/login.html`). Accepts `client_id`, `redirect_uri`, `state`, `response_type`, `code_challenge`, `code_challenge_method` (query).
- `POST /authorize` — handles login (username/token). On success, issues a short-lived (5 min) one-time authorization `code` — either redirects to `redirect_uri` with `code`/`state`, or returns `code` directly in a JSON response if `redirect_uri` is omitted. Protected by rate-limiting (10 attempts / 15 min per IP).
- `POST /token` — exchanges `code` (+ `code_verifier` for PKCE S256) for an `access_token` (valid 24h). Each `code` is single-use. Protected by rate-limiting (30 attempts / 15 min per IP).

Only `redirect_uri` values from `config/oauth.json` (`allowedRedirects`) or loopback addresses (if `allowLoopbackRedirects: true`) are accepted.

### MCP Transports (Require Authentication)

- `ALL /` and `ALL /mcp` — Streamable HTTP transport (protocol version `2025-11-25`). Sessions (`mcp-session-id`) are bound to the user who initiated them — attempting to use another user's session returns `403`.
- `GET /sse` and `POST /messages` — legacy SSE transport (protocol version `2024-11-05`), also bound to user per session.

Authentication (for all endpoints above + `/knowledge/*`): `Authorization: Bearer <token>` or as an API key (along with `X-Client-Id` header, or `client-id`/`token` query parameters — only on `/sse` and `/messages`) or as a JWT `access_token` issued by `/token`.

### Knowledge Base

Legacy index over **all** `.md` files in configured roots — including the internals layer (`js/ln-*/README.md`, `docs/architecture/`) which the ashlar corpus intentionally does not index. It is complementary to `search_docs`, not a duplicate. `node_modules/` and `.git/` are skipped.

Paths in results are prefixed with the root label (`ln-ashlar/docs/css/mixins.md`) to remain unambiguous when multiple roots exist; `knowledge_read` accepts both prefixed and standard repo-relative paths.

- `GET /knowledge/search?q=<term>` — fuzzy search. The same shared `search()` function (`tools/knowledge/search.js`) is used by both the REST route and the `knowledge_search` MCP tool. Returns `503` with `not_configured` when no root is configured.
- `POST /knowledge/reload` — reloads `.md` files from disk and rebuilds the Fuse index without a process restart. Returns `{ reloaded: true, docs: <doc_count> }`. Every reload is logged with Winston.

### Healthcheck

- MCP tool `healthcheck` (see `tools/healthcheck.js`), available via MCP transports once a session is established.

### review_plan

MCP tool (`tools/review_plan.js`) that sends a plan (architectural or implementation) to an independent Gemini reviewer via `gemini-cli`. Authentication to Gemini uses gemini-cli's own credentials stored securely in the runner's HOME (`~/.gemini/gemini-credentials.json`, currently API key) — no secrets or environment variables exist in this repo. The tool is stateless — the calling agent manages the loop: draft → review → revise, up to 3 iterations; on iterations 2–3, `previous_feedback` is passed along; stops on `APPROVE` or iteration 3. Configuration: `config/gemini.json` (model, timeout, concurrency, max iterations, isolated runner `HOME`/`cwd`). Logs: api-key id, plan_type, iteration, chars in/out, duration, verdict, model. Security: gemini-cli is restricted to pure text input/text output (`coreTools: []`, isolated `HOME`/empty `cwd`, never `--yolo`). The reviewer has read-only MCP access to the docs corpus on the same server (`gemini-reviewer` key, `review_plan` excluded from its tools to prevent recursion); due to these agentic tool round-trips, server timeout is 240s (`config/gemini.json`, `timeoutMs`). Each call is also logged to a dedicated audit log (`logs/review-audit-*.log`) with full prompt and response content, which can be disabled via `auditLog: false` in `config/gemini.json`. After loop completion (APPROVE or iteration 3), the calling agent can make an optional call with `wrap_up: true` (passing all previous feedback in `previous_feedback`) to receive a brief final summary of the entire review process.

## User Management

Users are loaded from `config/auth.json` via `middleware/user-store.js`, which caches the parsed file and automatically reloads it when the file's `mtime` changes. This means: adding/deleting a user in `config/auth.json` takes effect immediately, WITHOUT restarting the server (applies to `/authorize`, `/token`, and MCP authentication via `middleware/auth.js`).

## Documentation Refresh

The two indices have **different** freshness models — neither requires a restart, but they do not refresh in the same way:

- **Legacy Knowledge Index** (`/knowledge/*`, `knowledge_search`, `knowledge_read`) — on-demand reload: call `POST /knowledge/reload` with valid authentication. Also catches uncommitted disk changes.
- **Ashlar Corpus** (`search_docs`, `get_component`, `get_markup`, `validate_docs`, `get_ln_schema`, …) — reloads automatically when the root's git HEAD changes (`gitSignature()`, `tools/ashlar/corpus.js`). Thus, an **uncommitted** change in the root is NOT visible, even after `reload`; the change only reflects after it is committed (and on the server — after it pulls).

## Checks

Four independent checks — each covering aspects the other three do not:

```bash
npm test                                                    # 1. behavior
npm run sync:ln-attrs -- --check --root=/home/mcp/ln-ashlar   # 2. drift
npm run lint:snippets                                       # 3. ghost attributes + ATTR.*
npm run smoke:generators                                    # 4. contract template↔builder
```

1. **Behavior** — `node --test`, 203 tests. The only suite covering the security surface: full OAuth + PKCE flow, `/mcp` authentication, binding MCP sessions to users, path traversal in `knowledge_read`. The integration test boots a real server on `PORT=8099` and reads real credentials from `config/auth.json` at runtime — do not hardcode them.
2. **Drift** — `attributes.generated.js` must be fresh against [ln-ashlar](https://github.com/livenetworks/ln-ashlar) `js/**` + `scss/**`. Exit 1 when [ln-ashlar](https://github.com/livenetworks/ln-ashlar) moves ahead of generators. Run after every pull of [ln-ashlar](https://github.com/livenetworks/ln-ashlar).
3. **Ghost attributes + `ATTR.*`** — every `data-ln-*` in `_src/**.html` and in builders must exist in that set, and every `ATTR.x` reference must resolve. Unresolved references output `undefined="…"` — valid HTML, dead attribute.
4. **Contract template↔builder** — all 19 generators render under strict mode: every `{{key}}` provided by a builder must exist in the template.

Run all four checks before creating a PR.
