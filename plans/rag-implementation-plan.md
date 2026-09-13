# RAG over MCP Implementation Plan for ln-ashlar (Phase 1a)

## Objective
Enhance the `mcp-http-server` with a Retrieval-Augmented Generation (RAG) system for semantic search over `docs-mcp/` documentation. 
- *Note on Scope:* Excludes `theme/` and `components/*.js` code for Phase 1a.
- *Dependencies:* `@huggingface/transformers` v3 as an `optionalDependency` (which transitively pulls `onnxruntime-node`). `engines.node` must be `>=20.11.0` in `package.json`.
- *Tri-State Toggle:* Controlled by `RAG_ENABLED`. Unset: auto-detect optional deps. `0`: hard off (clean boot). `1`: hard on (fails if missing).
- *Degradation:* Gracefully degrades to pure lexical (Fuse.js) search if `0`, building, failed, or if `corpusEpoch` mismatches. Degraded mode output is **byte-identical** to the current implementation.

## 1. Indexing & Storage Architecture
- **Embedding Engine**: Use `Xenova/bge-small-en-v1.5` (384d). 
  - Required params: `{ pooling: 'cls', normalize: true, dtype: 'q8' }`. Query prefix: `"Represent this sentence for searching relevant passages: "`.
  - **Weight Provisioning**: Set `env.allowRemoteModels = true` and `env.cache_dir = path.resolve(import.meta.dirname, '../../../cache/models')`. First-boot download is acceptable.
- **In-Memory Immutable Tuple**:
  - Format: `{ epoch: number, vectors: Float32Array, metadata: Array, hashToRowIndex: Map }`.
  - `epoch` is strictly bound to `corpus.js`'s `combinedSignature(roots)`.
  - Memory Alignment: `new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))`.
- **Cache & Git Sync**:
  - Path: `path.resolve(import.meta.dirname, '../../../cache/rag-vectors.bin')`. Add `cache/` to `.gitignore`.
  - Cache header: `{ magic: 'RAG1', schemaVersion: 1, modelId: '...', dtype: 'q8', dim: 384, corpusEpoch: '...', chunkCount: N }`. Stale or mismatched reads fail loudly and trigger a cold build. Compaction uses tmp-then-rename.
- **Worker Thread & Build Mutex**:
  - `ensureRagIndex()` wraps the worker trigger in a single-flight promise.
  - Queries have a 250ms timeout. Slow queries fall back to lexical, and their correlation-ID entry is deleted. Workers are `unref()`'d.
  - Worker must execute a dummy warmup query before transitioning state to `ready` to avoid cold-start timeouts.

## 2. Chunking Strategy & Shared ID Space
- **Shared ID Space Mapping**: 
  - The shared identity relies on a stable `sectionIdx`. `corpus.js` must be modified to push `sectionIdx` into `sectionUnits` (index within `parsed.sections`). The synthetic `(summary)` gets a reserved sentinel index (e.g., `-1`).
  - `chunkId` format: `"<compositeKey>#<sectionIdx_padded>#<chunkIdx_padded>"`. The `docKey` is explicitly the composite `key` (`<rootIndex>:<name>`).
  - Candidate Pool is the **UNION** of `semantic top-K` and `lexical top-K`. Lexical-only chunks are materialized as parent section units contributing only their lexical RRF term. Semantic-only chunks contribute only their semantic term. Ranks are 1-indexed.
- **Chunk Construction**:
  - Token limit is strictly `<= 300` measured by the HF tokenizer (accounting for the 512 max length minus the context prefix).
  - Prepend contextual identity (e.g., `[ln-modal] Attribute: data-ln-modal-for ...`).
  - Serialize tables per-row. Exclude HTML markup and `(summary)`.

## 3. Search Pipeline & RRF (search_docs.js)
- **Unified Filter Predicate**: Apply `makeDocFilter({classification, domain, context, status, tags})` consistently across Stage 0, pre-filter semantic, and post-filter lexical. Context filters apply ONLY to skills.
- **Stage 0 Exact Match**: 
  - Looks up normalized query in `attributeIndex`/`eventIndex`/`apiIndex`. Applies unified filter.
  - Generates synthetic heading (e.g., `Attribute: data-ln-modal-for`). Stage 0 hit ID: `STAGE0:<compositeKey>:<heading>`.
- **Hybrid Search (RRF) & Guard Order**:
  1. **Pre-fusion Floor**: Discard vectors with raw **cosine similarity** `< RELEVANCE_FLOOR`. Floor is a constant in `store.js` initialized to `0.65`, calibrated via tuning script. (Applies ONLY to semantic candidates).
  2. **Fusion**: RRF `score = 1 / (60 + rank_semantic) + 1 / (60 + rank_lexical)`. Tie-break: lexicographic sort on padded `chunkId`.
  3. **Diversity Caps**: 
      - Max 1 chunk per `sectionIdx` (to prevent duplicate headings).
      - Max 3 chunks per composite `docKey`.
  4. **Prepend Stage 0**: Prepended and deduped against hybrid hits matching the synthetic ID.
  5. **Limit & Backfill**: Slice output to user `limit` (default 10). If diversity caps drop results below `limit`, re-admit capped chunks in RRF order.
  6. **Output Format**: `- **<doc>** › <heading>: <chunk_preview> (summary: …)`.

## 4. Evaluation & Rollout
- **Phase 1 Eval Harness**: `scripts/rag-tune.js` measures `recall@10` (aligned with tool `limit`) against a hand-labeled gold set of 30 queries created *before* tuning. Pass bar: `recall@10 >= Fuse baseline` + no catastrophic regressions on exact-match queries. Calibrates `RELEVANCE_FLOOR`.
- **Regression Test**: 
  - `test/rag.test.js` uses `RAG_EMBEDDER=stub` to avoid HF dependencies.
  - `package.json` test script passes `RAG_ENABLED=0` to ensure legacy tests use degraded path without downloading weights.
- **Rollout**: `healthcheck.js` description updated; returns `"OK (RAG: ready|building|failed|disabled)"`.

## 5. File Manifest
- **Created**:
  - `tools/ashlar/rag/chunker.js`, `store.js`, `worker.js`, `search.js`
  - `scripts/rag-tune.js` & `test/rag.test.js`
- **Modified**:
  - `tools/search_docs.js`, `tools/ashlar/corpus.js` (worker lifecycle, `indexEpoch`, `sectionIdx` mapping)
  - `tools/healthcheck.js`, `tools/ashlar/README.md`
  - `package.json` (add `@huggingface/transformers` as `optionalDependency`, update `engines.node`, update `test` script)
  - `.gitignore` (add `cache/`)
