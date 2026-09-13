import { Worker } from 'worker_threads';
import path from 'path';

let ragState = 'disabled'; // ready, building, failed, disabled
let worker = null;
let initPromise = null;
let currentEpoch = null;

let queryIdCounter = 0;
const pendingQueries = new Map();

export function getRagState() {
  return ragState;
}

export function shutdownRag() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  ragState = 'disabled';
  pendingQueries.clear();
}

export function ensureRagIndex(roots, expectedEpoch) {
  if (expectedEpoch !== currentEpoch) {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    initPromise = null;
    currentEpoch = expectedEpoch;
  }

  if (initPromise) return initPromise;

  const toggle = process.env.RAG_ENABLED;
  if (toggle === '0') {
    ragState = 'disabled';
    return Promise.resolve();
  }

  initPromise = (async () => {
    if (toggle !== '1') {
      try {
        await import('@huggingface/transformers');
      } catch {
        ragState = 'disabled';
        return;
      }
    }

    ragState = 'building';

    return new Promise((resolve, reject) => {
      try {
        worker = new Worker(path.resolve(import.meta.dirname, 'worker.js'), {
          workerData: { roots, expectedEpoch }
        });

        worker.unref();

        worker.on('message', (msg) => {
          if (msg.type === 'status') {
            ragState = msg.status;
            if (msg.status === 'failed' && msg.error) {
              console.error("RAG worker failed:", msg.error);
            }
            if (msg.status === 'ready' || msg.status === 'failed') {
              resolve();
            }
          } else if (msg.type === 'result') {
            const cb = pendingQueries.get(msg.id);
            if (cb) {
              pendingQueries.delete(msg.id);
              if (msg.error) {
                cb.reject(new Error(msg.error));
              } else {
                cb.resolve(msg.results);
              }
            }
          }
        });

        worker.on('error', (err) => {
          console.error("RAG worker error:", err);
          ragState = 'failed';
          resolve();
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            ragState = 'failed';
          }
          resolve();
        });
      } catch (err) {
        if (toggle === '1') {
          reject(err);
        } else {
          ragState = 'failed';
          resolve();
        }
      }
    });
  })();

  return initPromise;
}

export async function semanticSearch(text, expectedEpoch, allowedDocKeys) {
  if (expectedEpoch !== currentEpoch) return null;
  if (ragState !== 'ready') return null;
  
  return new Promise((resolve) => {
    const id = ++queryIdCounter;
    
    const timeout = setTimeout(() => {
      if (pendingQueries.has(id)) {
        pendingQueries.delete(id);
        resolve(null);
      }
    }, 250);
    
    pendingQueries.set(id, {
      resolve: (res) => {
        clearTimeout(timeout);
        resolve(res);
      },
      reject: (err) => {
        clearTimeout(timeout);
        resolve(null);
      }
    });
    
    worker.postMessage({ type: 'query', id, text, allowedDocKeys: allowedDocKeys ? Array.from(allowedDocKeys) : null });
  });
}
