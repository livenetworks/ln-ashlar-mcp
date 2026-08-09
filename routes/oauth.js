import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { randomUUID, createHash } from 'crypto';
import { secureCompare } from '../middleware/secure-compare.js';
import { getUsers } from '../middleware/user-store.js';
import { getBaseUrl } from '../middleware/public-url.js';
import { rateLimit } from '../middleware/rate-limit.js';

// Resolve __dirname for ES module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = express.Router();

// JWT configuration
const jwtSecret = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../config', 'jwt.json'), 'utf-8')).secret;

// OAuth configuration (allowed redirect_uri whitelist)
const oauthCfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../config', 'oauth.json'), 'utf-8'));

export const isAllowedRedirect = (uri) => {
  if (!uri) return false;
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (oauthCfg.allowedRedirects.includes(parsed.origin + parsed.pathname)) return true;
  if (oauthCfg.allowLoopbackRedirects
    && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) return true;
  return false;
};

// One-time use tracking for authorization codes (jti -> expiry ms)
const usedAuthCodes = new Map();

// Rotated (invalidated) refresh-token jti -> expiry ms
const usedRefreshTokens = new Map();

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Drop expired entries from an in-memory jti->expiry map (bounded memory)
const pruneExpired = (map) => {
  const now = Date.now();
  for (const [jti, expiry] of map) {
    if (expiry <= now) map.delete(jti);
  }
};

// Build the standard token response, including a fresh refresh token
const issueTokens = (username) => {
  const access_token = jwt.sign({ clientId: username }, jwtSecret, { expiresIn: '24h' });
  const refresh_token = jwt.sign(
    { clientId: username, type: 'refresh', jti: randomUUID() },
    jwtSecret,
    { expiresIn: '30d' }
  );
  return { access_token, token_type: 'Bearer', expires_in: 86400, refresh_token };
};

// rateLimit is imported from ../middleware/rate-limit.js

// Premium HTML Login Page Template - loaded once at start
const loginHtmlTemplate = fs.readFileSync(path.resolve(__dirname, '../views', 'login.html'), 'utf-8');

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderLoginHtml = (error, clientId, redirectUri, state, responseType, codeChallenge, codeChallengeMethod) => {
  let errHtml = '';
  if (error) {
    errHtml = `<div class="error-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>${escapeHtml(error)}</span>
      </div>`;
  }
  return loginHtmlTemplate
    .replace('{{error}}', errHtml)
    .replace('{{client_id}}', escapeHtml(clientId))
    .replace('{{redirect_uri}}', escapeHtml(redirectUri))
    .replace('{{state}}', escapeHtml(state))
    .replace('{{response_type}}', escapeHtml(responseType))
    .replace('{{username_value}}', escapeHtml(clientId))
    .replace('{{code_challenge}}', escapeHtml(codeChallenge))
    .replace('{{code_challenge_method}}', escapeHtml(codeChallengeMethod));
};

// GET /authorize - Render the login page
router.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, state, response_type, code_challenge, code_challenge_method } = req.query;

  if (redirect_uri && !isAllowedRedirect(redirect_uri)) {
    return res.status(400).send(renderLoginHtml('Недозволен redirect_uri.', '', '', '', ''));
  }

  res.send(renderLoginHtml('', client_id, redirect_uri, state, response_type, code_challenge, code_challenge_method));
});

// POST /authorize - Handle login form submission
router.post('/authorize', rateLimit(10, 15 * 60 * 1000), (req, res) => {
  const { username, token, client_id, redirect_uri, state, response_type, code_challenge, code_challenge_method } = req.body;

  if (redirect_uri && !isAllowedRedirect(redirect_uri)) {
    return res.status(400).send(renderLoginHtml('Недозволен redirect_uri.', '', '', '', ''));
  }

  if (!username || !token) {
    return res.status(400).send(renderLoginHtml('Корисничкото име и токенот се задолжителни.', client_id, redirect_uri, state, response_type, code_challenge, code_challenge_method));
  }

  // Load auth config to verify credentials
  let authCfg;
  try {
    authCfg = getUsers();
  } catch (e) {
    console.error('Failed to load auth config', e);
    return res.status(500).send(renderLoginHtml('Серверска грешка при проверка на корисникот.', client_id, redirect_uri, state, response_type, code_challenge, code_challenge_method));
  }

  const user = authCfg.users[username];
  if (!user || !secureCompare(user.token, token)) {
    return res.status(401).send(renderLoginHtml('Невалидно корисничко име или токен.', client_id, redirect_uri, state, response_type, code_challenge, code_challenge_method));
  }

  if (code_challenge && code_challenge_method !== 'S256') {
    return res.status(400).send(renderLoginHtml('Само S256 code_challenge_method е поддржан.', client_id, redirect_uri, state, response_type, code_challenge, code_challenge_method));
  }

  // Success: generate authorization code (short-lived JWT containing username)
  const codePayload = { username, jti: randomUUID(), client_id, redirect_uri };
  if (code_challenge) {
    codePayload.code_challenge = code_challenge;
  }
  const code = jwt.sign(codePayload, jwtSecret, { expiresIn: '5m' });

  if (redirect_uri) {
    try {
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', code);
      if (state) {
        redirectUrl.searchParams.set('state', state);
      }
      return res.redirect(redirectUrl.toString());
    } catch (err) {
      return res.status(400).send(renderLoginHtml('Невалиден URL за редирекција (redirect_uri).', client_id, redirect_uri, state, response_type, code_challenge, code_challenge_method));
    }
  }

  res.json({ code });
});

// POST /token - Exchange authorization code for access token
router.post('/token', rateLimit(30, 15 * 60 * 1000), (req, res) => {
  const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier } = req.body;

  if (grant_type !== 'authorization_code' && grant_type !== 'refresh_token') {
    return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Само authorization_code и refresh_token се поддржани.' });
  }

  if (grant_type === 'refresh_token') {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Недостасува refresh_token.' });
    }
    let rPayload;
    try {
      rPayload = jwt.verify(refresh_token, jwtSecret);
    } catch (err) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Истечен или невалиден refresh_token.' });
    }
    if (rPayload.type !== 'refresh') {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Токенот не е refresh_token.' });
    }
    pruneExpired(usedRefreshTokens);
    if (rPayload.jti && usedRefreshTokens.has(rPayload.jti)) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'refresh_token е веќе искористен.' });
    }
    let authCfgR;
    try {
      authCfgR = getUsers();
    } catch (e) {
      return res.status(500).json({ error: 'server_error', error_description: 'Серверска грешка при проверка на корисникот.' });
    }
    if (!authCfgR.users[rPayload.clientId]) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Корисникот повеќе не постои.' });
    }
    // Rotate: invalidate the presented refresh token, issue a fresh pair
    if (rPayload.jti) {
      usedRefreshTokens.set(rPayload.jti, Date.now() + REFRESH_TTL_MS);
    }
    if (usedRefreshTokens.size > 10000) pruneExpired(usedRefreshTokens);
    return res.json(issueTokens(rPayload.clientId));
  }

  if (!code) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'Недостасува код (code).' });
  }

  try {
    const payload = jwt.verify(code, jwtSecret);
    const username = payload.username;

    // Verify client_id matches the issued code
    if (payload.client_id && payload.client_id !== client_id) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'client_id не одговара на издадениот код.' });
    }
    // Verify redirect_uri matches the issued code
    if (payload.redirect_uri && payload.redirect_uri !== redirect_uri) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri не одговара на издадениот код.' });
    }

    // Clean up expired one-time-use records
    const now = Date.now();
    for (const [jti, expiry] of usedAuthCodes) {
      if (expiry <= now) usedAuthCodes.delete(jti);
    }

    if (payload.jti && usedAuthCodes.has(payload.jti)) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Кодот е веќе искористен.' });
    }

    if (payload.code_challenge) {
      if (!code_verifier) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Недостасува code_verifier.' });
      }
      const computed = createHash('sha256').update(code_verifier).digest('base64url');
      if (computed !== payload.code_challenge) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Невалиден code_verifier.' });
      }
    }

    // Verify user exists in config
    let authCfg;
    try {
      authCfg = getUsers();
    } catch (e) {
      return res.status(500).json({ error: 'server_error', error_description: 'Серверска грешка при проверка на корисникот.' });
    }

    if (!authCfg.users[username]) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Корисникот повеќе не постои.' });
    }

    if (payload.jti) {
      usedAuthCodes.set(payload.jti, now + 5 * 60 * 1000);
    }

    // Issue access + refresh tokens (access 24h, refresh 30d)
    res.json(issueTokens(username));
  } catch (err) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Истечен или невалиден код за авторизација.' });
  }
});

// --- OAuth discovery metadata (public, consumed by strict MCP clients) ---

// RFC 8414 — Authorization Server Metadata
router.get([
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-authorization-server/*splat'
], (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post']
  });
});

// RFC 9728 — Protected Resource Metadata
router.get([
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/*splat'
], (req, res) => {
  const base = getBaseUrl(req);
  res.json({
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: ['header']
  });
});

export default router;
