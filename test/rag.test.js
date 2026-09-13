import { test, after } from 'node:test';
import assert from 'node:assert';
import { getRagState, ensureRagIndex, shutdownRag } from '../tools/ashlar/rag/search.js';
import { ensureIndex } from '../tools/ashlar/corpus.js';
import { handler as searchDocs } from '../tools/search_docs.js';
import { saveCache, loadCache, RAG_CONFIG, _setCacheDir } from '../tools/ashlar/rag/store.js';
import { generateChunks } from '../tools/ashlar/rag/chunker.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

after(() => {
  shutdownRag();
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, 'fixtures', 'ashlar-repo');

test('RAG degrades gracefully when RAG_ENABLED=0', async () => {
  process.env.DOCS_CORPUS_ROOTS = fixtureRoot;
  process.env.RAG_ENABLED = '0';
  await ensureIndex();
  assert.strictEqual(getRagState(), 'disabled');
});

test('RAG degraded mode produces identical results to lexical-only', async () => {
  process.env.DOCS_CORPUS_ROOTS = fixtureRoot;
  process.env.RAG_ENABLED = '0';
  await ensureIndex();
  
  const result1 = await searchDocs({ query: 'button', limit: 5 });
  
  const expectedText = `- **ln-patho-4col** › (summary): Pathological fixture testing 4-column attribute table resolution. (summary: Pathological fixture testing 4-column attribute table resolution.)`;
  
  assert.strictEqual(result1.content[0].text, expectedText);
});

test('RAG hybrid search with stub embedder', async () => {
  const fixtureRoot2 = path.join(__dirname, 'fixtures', 'ashlar-repo2');
  process.env.DOCS_CORPUS_ROOTS = `${fixtureRoot},${fixtureRoot2}`;
  process.env.RAG_ENABLED = '1';
  process.env.RAG_EMBEDDER = 'stub';
  
  const index = await ensureIndex();
  
  // Wait for worker to finish building
  let retries = 0;
  while (getRagState() === 'building' && retries < 50) {
    await new Promise(r => setTimeout(r, 100));
    retries++;
  }
  
  assert.strictEqual(getRagState(), 'ready');
  
  const result = await searchDocs({ query: 'button', limit: 10 });
  assert.ok(result.content[0].text.length > 0);
  
  // caps and backfill
  const lines = result.content[0].text.split('\n');
  assert.ok(lines.length <= 10);
});

test('saveCache -> loadCache preserves vectors.byteOffset === 0', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-'));
  _setCacheDir(tmpDir);

  const epoch = 'test-epoch';
  const metadata = [{ chunkId: '1', docKey: 'a:b', sectionIdx: 0 }];
  const vectors = new Float32Array(RAG_CONFIG.DIMENSIONS);
  for (let i = 0; i < vectors.length; i++) vectors[i] = Math.random();
  
  saveCache(epoch, vectors, metadata);
  const cache = loadCache(epoch);
  
  assert.ok(cache !== null);
  assert.strictEqual(cache.vectors.byteOffset, 0);
  assert.deepStrictEqual(cache.metadata, metadata);
});

test('chunker recursive split handles over-length chunks', () => {
  const RAG_CONFIG_TEST = { MAX_TOKENS: 5 };
  
  const doc = {
    key: 'test:doc',
    name: 'doc',
    parsed: {
      sections: [
        {
          title: 'Section 1',
          text: 'One two three four five six seven eight nine ten eleven twelve.'
        }
      ]
    }
  };
  
  const index = { docs: new Map([['test:doc', doc]]) };
  
  // Mock tokenizer that just counts words as tokens
  const tokenizer = (text) => ({ input_ids: { size: text.trim().split(/\s+/).length } });
  
  const chunks = generateChunks(index, tokenizer, RAG_CONFIG_TEST);
  
  // The full text has prefix "[doc] Section 1: " + words.
  // Prefix is 3 tokens. Max is 5. So it only allows 2 words per chunk.
  // Expect it to successfully split recursively without infinite loop.
  assert.ok(chunks.length > 2);
  chunks.forEach(c => {
    // Assert all generated chunks fit within the token limit
    const tokens = tokenizer(c.text);
    assert.ok(tokens.input_ids.size <= RAG_CONFIG_TEST.MAX_TOKENS, `Chunk exceeded MAX_TOKENS: ${tokens.input_ids.size} > ${RAG_CONFIG_TEST.MAX_TOKENS}`);
  });
});
