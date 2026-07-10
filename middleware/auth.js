import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { secureCompare } from './secure-compare.js';
import { getUsers } from './user-store.js';

// Resolve __dirname for ES module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const jwtSecretPath = path.resolve(__dirname, '../config', 'jwt.json');
let jwtSecret = '';
try {
  const raw = fs.readFileSync(jwtSecretPath, 'utf-8');
  jwtSecret = JSON.parse(raw).secret;
} catch (e) {
  console.error('Failed to load JWT secret:', e);
}

/**
 * Express middleware that validates either:
 *   • API‑key style: Authorization: Bearer <token> and X‑Client‑Id header
 *   • JWT style: Authorization: Bearer <jwt>
 * On success it attaches `req.user = { username, clientId }` and
 * `req.authUser = username` (used to bind MCP sessions to their owner).
 */
export default function authMiddleware(req, res, next) {
  const allowQueryCreds = req.path === '/sse' || req.path === '/messages';

  let authHeader = req.headers['authorization'] || (allowQueryCreds && (req.query['authorization'] || req.query['token']));
  let clientIdHeader = req.headers['x-client-id'] || (allowQueryCreds && (req.query['client-id'] || req.query['clientId']));

  if (authHeader) {
    authHeader = authHeader.trim();
    if (!authHeader.startsWith('Bearer ')) {
      authHeader = 'Bearer ' + authHeader;
    }
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = authHeader.slice('Bearer '.length).trim();

  // Determine if token looks like a JWT (three parts separated by '.')
  const isJwt = token.split('.').length === 3;
  let clientId = clientIdHeader ? String(clientIdHeader).trim() : undefined;

  const { users } = getUsers();

  if (isJwt) {
    try {
      const payload = jwt.verify(token, jwtSecret);
      clientId = payload.clientId;
    } catch (e) {
      return res.status(401).json({ error: 'Invalid JWT' });
    }
    if (!clientId || !users[clientId]) {
      return res.status(401).json({ error: 'Unknown clientId in JWT' });
    }
    req.user = { username: clientId, clientId };
    req.authUser = clientId;
    return next();
  }

  // API‑key path: require both token and clientId header
  if (!clientId) {
    return res.status(401).json({ error: 'Missing client ID header' });
  }

  // Find user matching both clientId and token
  const userEntry = Object.entries(users).find(
    ([, data]) => data.clientId === clientId && secureCompare(data.token, token)
  );
  if (!userEntry) {
    return res.status(401).json({ error: 'Invalid client ID or token' });
  }
  const [username] = userEntry;
  req.user = { username, clientId };
  req.authUser = username;
  next();
}
