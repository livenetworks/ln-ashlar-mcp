import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { secureCompare } from '../middleware/secure-compare.js';
import { escapeHtml, isAllowedRedirect } from '../routes/oauth.js';
import { handler as knowledgeReadHandler } from '../tools/knowledge_read.js';

describe('secureCompare', () => {
  test('returns true for equal strings', () => {
    assert.equal(secureCompare('same-token', 'same-token'), true);
  });

  test('returns false for different strings of equal length', () => {
    assert.equal(secureCompare('token-aaaa', 'token-bbbb'), false);
  });

  test('returns false for strings of different length', () => {
    assert.equal(secureCompare('short', 'a-much-longer-token'), false);
  });

  test('returns false when one side is null/undefined', () => {
    assert.equal(secureCompare(null, 'token'), false);
    assert.equal(secureCompare('token', undefined), false);
    assert.equal(secureCompare(null, undefined), true); // both coerce to empty string
  });
});

describe('escapeHtml', () => {
  test('escapes &', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
  });

  test('escapes <', () => {
    assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  });

  test('escapes >', () => {
    assert.equal(escapeHtml('a>b'), 'a&gt;b');
  });

  test('escapes "', () => {
    assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
  });

  test("escapes '", () => {
    assert.equal(escapeHtml("it's"), 'it&#39;s');
  });
});

describe('isAllowedRedirect', () => {
  test('accepts a whitelisted origin+path', () => {
    assert.equal(isAllowedRedirect('https://claude.ai/api/mcp/auth_callback'), true);
  });

  test('rejects an evil host', () => {
    assert.equal(isAllowedRedirect('https://evil.example/cb'), false);
  });

  test('accepts loopback redirects when allowLoopbackRedirects is enabled', () => {
    assert.equal(isAllowedRedirect('http://localhost:1234/callback'), true);
    assert.equal(isAllowedRedirect('http://127.0.0.1:1234/callback'), true);
  });

  test('rejects an invalid URL', () => {
    assert.equal(isAllowedRedirect('not-a-valid-url'), false);
  });

  test('rejects empty/missing redirect_uri', () => {
    assert.equal(isAllowedRedirect(''), false);
    assert.equal(isAllowedRedirect(undefined), false);
  });
});

describe('knowledge_read path traversal protection', () => {
  test('rejects a path traversal attempt', async () => {
    const result = await knowledgeReadHandler({ filePath: '../../../etc/passwd' });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Access denied/);
  });

  test('allows a legitimate relative path within the docs root', async () => {
    const result = await knowledgeReadHandler({ filePath: 'README.md' });
    assert.equal(result.isError, undefined);
    assert.equal(typeof result.content[0].text, 'string');
    assert.ok(result.content[0].text.length > 0);
  });
});
