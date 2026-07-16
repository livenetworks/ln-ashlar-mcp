import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8098;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProcess;

// Read real (test-environment) credentials from config/auth.json instead of hardcoding tokens.
const authCfg = JSON.parse(readFileSync(path.resolve(__dirname, '../config/auth.json'), 'utf-8'));
const usernames = Object.keys(authCfg.users);
const userA = usernames[0];
const tokenA = authCfg.users[userA].token;

function waitForServerReady(proc, timeoutMs = 10000) {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				reject(new Error('Server did not become ready in time'));
			}
		}, timeoutMs);

		const onData = (data) => {
			const text = data.toString();
			if (text.includes('MCP HTTP listening')) {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					resolve();
				}
			}
		};

		proc.stdout.on('data', onData);
		proc.stderr.on('data', onData);
		proc.on('error', (err) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(err);
			}
		});
		proc.on('exit', (code) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(new Error(`Server process exited early with code ${code}`));
			}
		});
	});
}

before(async () => {
	serverProcess = spawn('node', ['server.js'], {
		cwd: path.resolve(__dirname, '..'),
		env: { ...process.env, PORT: String(PORT) },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	await waitForServerReady(serverProcess);
});

after(() => {
	if (serverProcess && !serverProcess.killed) {
		serverProcess.kill('SIGTERM');
	}
});

test('GET /.well-known/oauth-authorization-server returns 200 with metadata, no auth', async () => {
	const res = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`);
	assert.equal(res.status, 200);
	const body = await res.json();
	assert.ok(body.issuer);
	assert.match(body.authorization_endpoint, /\/authorize$/);
	assert.match(body.token_endpoint, /\/token$/);
	assert.ok(body.grant_types_supported.includes('refresh_token'));
	assert.deepEqual(body.code_challenge_methods_supported, ['S256']);
});

test('GET /.well-known/oauth-protected-resource returns 200 with metadata, no auth', async () => {
	const res = await fetch(`${BASE_URL}/.well-known/oauth-protected-resource`);
	assert.equal(res.status, 200);
	const body = await res.json();
	assert.ok(body.resource);
	assert.ok(Array.isArray(body.authorization_servers) && body.authorization_servers.length > 0);
	assert.deepEqual(body.bearer_methods_supported, ['header']);
});

test('GET /.well-known/oauth-protected-resource/mcp (suffix variant) returns 200 with metadata', async () => {
	const res = await fetch(`${BASE_URL}/.well-known/oauth-protected-resource/mcp`);
	assert.equal(res.status, 200);
	const body = await res.json();
	assert.ok(body.resource);
	assert.ok(Array.isArray(body.authorization_servers) && body.authorization_servers.length > 0);
	assert.deepEqual(body.bearer_methods_supported, ['header']);
});

test('GET /mcp without credentials returns 401 with WWW-Authenticate header', async () => {
	const res = await fetch(`${BASE_URL}/mcp`);
	assert.equal(res.status, 401);
	const header = res.headers.get('www-authenticate');
	assert.match(header, /Bearer resource_metadata=".*\/\.well-known\/oauth-protected-resource"/);
});

let savedRefreshToken;

test('full PKCE authorization_code flow returns a refresh_token', async () => {
	const verifier = randomBytes(32).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	const redirectUri = `http://localhost:9999/callback`;

	const authRes = await fetch(`${BASE_URL}/authorize`, {
		method: 'POST',
		redirect: 'manual',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			username: userA,
			token: tokenA,
			redirect_uri: redirectUri,
			response_type: 'code',
			code_challenge: challenge,
			code_challenge_method: 'S256'
		})
	});

	assert.equal(authRes.status, 302);
	const location = authRes.headers.get('location');
	assert.ok(location, 'expected a Location header on redirect');
	const code = new URL(location).searchParams.get('code');
	assert.ok(code, 'expected an authorization code in the redirect URL');

	const tokenRes = await fetch(`${BASE_URL}/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri,
			code_verifier: verifier
		})
	});

	assert.equal(tokenRes.status, 200);
	const tokenBody = await tokenRes.json();
	assert.ok(typeof tokenBody.refresh_token === 'string' && tokenBody.refresh_token.length > 0);
	savedRefreshToken = tokenBody.refresh_token;
});

let rotatedRefreshToken;

test('refresh_token grant issues new access + refresh tokens', async () => {
	assert.ok(savedRefreshToken, 'prior test must have run');

	const res = await fetch(`${BASE_URL}/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: savedRefreshToken
		})
	});

	assert.equal(res.status, 200);
	const body = await res.json();
	assert.ok(body.access_token);
	assert.ok(body.refresh_token);
	assert.notEqual(body.refresh_token, savedRefreshToken);
	rotatedRefreshToken = body.refresh_token;
});

test('reused (rotated) refresh_token is rejected', async () => {
	assert.ok(savedRefreshToken, 'prior test must have run');

	const res = await fetch(`${BASE_URL}/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: savedRefreshToken
		})
	});

	assert.equal(res.status, 400);
	const body = await res.json();
	assert.equal(body.error, 'invalid_grant');
});

test('refresh token rejected as access token', async () => {
	assert.ok(rotatedRefreshToken, 'prior test must have run');

	const res = await fetch(`${BASE_URL}/knowledge/search?q=button`, {
		headers: { Authorization: `Bearer ${rotatedRefreshToken}` }
	});
	assert.equal(res.status, 401);
});
