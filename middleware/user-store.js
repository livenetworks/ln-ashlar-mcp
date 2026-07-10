import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authConfigPath = path.resolve(__dirname, '../config', 'auth.json');

let cachedUsers = { users: {} };
let cachedMtimeMs = 0;

/**
 * Reload config/auth.json from disk if its mtime changed since the last read.
 * On parse/read failure, keeps the previous cache and logs a warning.
 */
function refreshIfChanged() {
  let stat;
  try {
    stat = fs.statSync(authConfigPath);
  } catch (e) {
    console.warn('[user-store] Failed to stat auth.json, keeping previous cache:', e.message);
    return;
  }

  if (stat.mtimeMs === cachedMtimeMs) {
    return;
  }

  try {
    const raw = fs.readFileSync(authConfigPath, 'utf-8');
    const parsed = JSON.parse(raw);
    cachedUsers = parsed;
    cachedMtimeMs = stat.mtimeMs;
  } catch (e) {
    console.warn('[user-store] Failed to reload auth.json, keeping previous cache:', e.message);
  }
}

/**
 * Returns the full parsed contents of config/auth.json (`{ users: {...} }`),
 * transparently reloading it if the file changed on disk since the last call.
 */
export function getUsers() {
  refreshIfChanged();
  return cachedUsers;
}

/**
 * Returns the user entry for `username`, or undefined if not found.
 */
export function getUser(username) {
  const { users } = getUsers();
  return users ? users[username] : undefined;
}
