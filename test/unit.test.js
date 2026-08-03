import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { secureCompare } from '../middleware/secure-compare.js';
import { escapeHtml, isAllowedRedirect } from '../routes/oauth.js';

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

// knowledge_read (path traversal + root resolution) is covered in
// knowledge-roots.test.js, which needs a configured corpus root.
