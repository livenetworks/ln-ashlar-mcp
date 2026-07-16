import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let publicBaseUrl = '';
try {
	const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../config', 'oauth.json'), 'utf-8'));
	publicBaseUrl = cfg.publicBaseUrl || '';
} catch (e) {
	console.warn('[public-url] Could not read oauth.json, will derive base URL from requests:', e.message);
}

/**
 * Resolve the server's public origin (scheme + host, no trailing slash).
 * Precedence: configured publicBaseUrl → X-Forwarded-Proto → req.protocol.
 */
export function getBaseUrl(req) {
	if (publicBaseUrl) return publicBaseUrl.replace(/\/+$/, '');
	const xfProto = req.headers['x-forwarded-proto'];
	const proto = (xfProto ? String(xfProto).split(',')[0].trim() : req.protocol) || 'https';
	const host = req.headers['host'] || 'localhost';
	return `${proto}://${host}`;
}

/** Full URL of the protected-resource metadata document, for WWW-Authenticate. */
export function resourceMetadataUrl(req) {
	return `${getBaseUrl(req)}/.well-known/oauth-protected-resource`;
}
