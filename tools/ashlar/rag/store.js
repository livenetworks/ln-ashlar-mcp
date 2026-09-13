import fs from 'fs';
import path from 'path';

export const RAG_CONFIG = {
  MODEL_ID: 'Xenova/bge-small-en-v1.5',
  DIMENSIONS: 384,
  MAX_TOKENS: 300,
  RELEVANCE_FLOOR: 0.65,
  QUERY_PREFIX: "Represent this sentence for searching relevant passages: ",
  MAGIC: 'RAG1',
  SCHEMA_VERSION: 1
};

export let CACHE_DIR = path.resolve(import.meta.dirname, '../../../cache');
export let CACHE_FILE = path.join(CACHE_DIR, 'rag-vectors.bin');
export const MODELS_DIR = path.join(CACHE_DIR, 'models');

export function _setCacheDir(dir) {
  CACHE_DIR = dir;
  CACHE_FILE = path.join(dir, 'rag-vectors.bin');
}

/**
 * @typedef {Object} RagIndex
 * @property {string} epoch
 * @property {Float32Array} vectors
 * @property {Array<any>} metadata
 * @property {Map<string, number>} hashToRowIndex
 */

export function loadCache(expectedEpoch) {
  if (!fs.existsSync(CACHE_FILE)) return null;
  
  try {
    const buffer = fs.readFileSync(CACHE_FILE);
    let offset = 0;
    
    const headerLen = buffer.readUInt32LE(offset);
    offset += 4;
    
    const headerJson = buffer.toString('utf8', offset, offset + headerLen);
    offset += headerLen;
    
    const parsed = JSON.parse(headerJson);
    
    if (
      parsed.magic !== RAG_CONFIG.MAGIC ||
      parsed.schemaVersion !== RAG_CONFIG.SCHEMA_VERSION ||
      parsed.modelId !== RAG_CONFIG.MODEL_ID ||
      parsed.corpusEpoch !== expectedEpoch
    ) {
      return null;
    }

    if (parsed.dim !== RAG_CONFIG.DIMENSIONS) {
      console.error(`RAG cache corruption: Expected dim ${RAG_CONFIG.DIMENSIONS}, got ${parsed.dim}`);
      return null;
    }

    if (parsed.dtype !== 'q8') {
      console.error(`RAG cache corruption: Expected dtype 'q8', got ${parsed.dtype}`);
      return null;
    }
    
    const vectorBytes = buffer.length - offset;
    const expectedBytes = parsed.chunkCount * parsed.dim * 4;
    if (vectorBytes !== expectedBytes) {
      console.error(`RAG cache corruption: Expected ${expectedBytes} bytes of vectors, got ${vectorBytes}`);
      return null;
    }

    // Align memory by slicing the underlying buffer
    const vectorBuffer = buffer.subarray(offset);
    const vectors = new Float32Array(vectorBuffer.buffer.slice(vectorBuffer.byteOffset, vectorBuffer.byteOffset + vectorBuffer.byteLength));
    
    const hashToRowIndex = new Map();
    parsed.metadata.forEach((m, i) => hashToRowIndex.set(m.chunkId, i));
    
    return Object.freeze({
      epoch: parsed.corpusEpoch,
      vectors,
      metadata: parsed.metadata,
      hashToRowIndex
    });
  } catch (err) {
    console.error("RAG Cache Error:", err);
    return null;
  }
}

export function saveCache(epoch, vectors, metadata) {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  
  const header = {
    magic: RAG_CONFIG.MAGIC,
    schemaVersion: RAG_CONFIG.SCHEMA_VERSION,
    modelId: RAG_CONFIG.MODEL_ID,
    dtype: 'q8',
    dim: RAG_CONFIG.DIMENSIONS,
    corpusEpoch: epoch,
    chunkCount: metadata.length,
    metadata
  };
  
  const headerBuffer = Buffer.from(JSON.stringify(header), 'utf8');
  const lenBuffer = Buffer.alloc(4);
  lenBuffer.writeUInt32LE(headerBuffer.length, 0);
  
  const vectorBuffer = Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength);
  
  const tmpFile = `${CACHE_FILE}.tmp.${Date.now()}`;
  let fd = null;
  try {
    fd = fs.openSync(tmpFile, 'w');
    fs.writeSync(fd, lenBuffer);
    fs.writeSync(fd, headerBuffer);
    fs.writeSync(fd, vectorBuffer);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpFile, CACHE_FILE);
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (err) {}
      try { fs.unlinkSync(tmpFile); } catch (err) {}
    }
  }
}

