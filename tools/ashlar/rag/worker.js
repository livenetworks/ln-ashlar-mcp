import { parentPort, workerData } from 'worker_threads';
import { RAG_CONFIG, loadCache, saveCache, MODELS_DIR } from './store.js';
import { generateChunks } from './chunker.js';
import { buildIndex, configuredRoots } from '../corpus.js';

let pipeline;
let indexData;

async function init() {
  try {
    // Check if we need to build
    const { roots, expectedEpoch } = workerData;
    const cache = loadCache(expectedEpoch);
    
    if (process.env.RAG_EMBEDDER === 'stub') {
      pipeline = async (texts) => {
        const arr = Array.isArray(texts) ? texts : [texts];
        return {
          tolist: () => arr.map(() => {
            const f = new Float32Array(RAG_CONFIG.DIMENSIONS);
            f[0] = 1.0;
            return f;
          })
        };
      };
      pipeline.tokenizer = (text) => ({ input_ids: text.split(' ') });
    } else {
      const { env, pipeline: hfPipeline } = await import('@huggingface/transformers');
      env.allowRemoteModels = true;
      env.cache_dir = MODELS_DIR;
      pipeline = await hfPipeline('feature-extraction', RAG_CONFIG.MODEL_ID, {
        dtype: 'q8',
      });
    }
    
    if (cache) {
      indexData = cache;
    } else {
      parentPort.postMessage({ type: 'status', status: 'building' });
      
      const corpusIndex = buildIndex(roots);
      
      // We need the tokenizer for chunking
      const tokenizer = pipeline.tokenizer;
      const chunks = generateChunks(corpusIndex, tokenizer, RAG_CONFIG);
      
      const texts = chunks.map(c => c.text);
      
      const vectors = new Float32Array(chunks.length * RAG_CONFIG.DIMENSIONS);
      
      // Batch size for processing
      const BATCH_SIZE = 32;
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const output = await pipeline(batch, { pooling: 'cls', normalize: true });
        const outputList = output.tolist();
        
        for (let j = 0; j < batch.length; j++) {
          const vector = outputList[j];
          vectors.set(vector, (i + j) * RAG_CONFIG.DIMENSIONS);
        }
      }
      
      const metadata = chunks.map(c => ({
        chunkId: c.chunkId,
        docKey: c.docKey,
        sectionIdx: c.sectionIdx
      }));
      
      saveCache(expectedEpoch, vectors, metadata);
      indexData = loadCache(expectedEpoch); // Reload to get map and exact buffers
      if (!indexData) {
        throw new Error("Failed to load cache after saving");
      }
    }
    
    // Warmup query
    await pipeline(RAG_CONFIG.QUERY_PREFIX + "test", { pooling: 'cls', normalize: true });
    
    parentPort.postMessage({ type: 'status', status: 'ready' });
  } catch (err) {
    parentPort.postMessage({ type: 'status', status: 'failed', error: err.message });
  }
}

init();

parentPort.on('message', async (msg) => {
  if (msg.type === 'query') {
    if (!pipeline || !indexData) {
      parentPort.postMessage({ type: 'result', id: msg.id, error: 'Not ready' });
      return;
    }
    try {
      const output = await pipeline(RAG_CONFIG.QUERY_PREFIX + msg.text, { pooling: 'cls', normalize: true });
      const queryVector = output.tolist()[0];
      
      // Compute cosine similarities
      const { vectors, metadata } = indexData;
      const similarities = [];
      const dim = RAG_CONFIG.DIMENSIONS;
      const allowedSet = msg.allowedDocKeys ? new Set(msg.allowedDocKeys) : null;
      
      for (let i = 0; i < metadata.length; i++) {
        const m = metadata[i];
        if (allowedSet && !allowedSet.has(m.docKey)) continue;
        
        let dot = 0;
        const offset = i * dim;
        for (let j = 0; j < dim; j++) {
          dot += queryVector[j] * vectors[offset + j];
        }
        
        if (dot >= RAG_CONFIG.RELEVANCE_FLOOR) {
          similarities.push({
            chunkId: m.chunkId,
            docKey: m.docKey,
            sectionIdx: m.sectionIdx,
            score: dot
          });
        }
      }
      
      // Sort by score desc and bound to top-100
      similarities.sort((a, b) => b.score - a.score);
      const topK = similarities.slice(0, 100);
      
      parentPort.postMessage({ type: 'result', id: msg.id, results: topK });
    } catch (err) {
      parentPort.postMessage({ type: 'result', id: msg.id, error: err.message });
    }
  }
});
