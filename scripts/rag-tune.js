import { semanticSearch, ensureRagIndex } from '../tools/ashlar/rag/search.js';
import { ensureIndex } from '../tools/ashlar/corpus.js';

// Gold set of queries
const QUERIES = [
  { q: "how to show a modal", expectDoc: "ln-modal" },
  { q: "submitting a form", expectDoc: "ln-form" },
  { q: "displaying a list of items", expectDoc: "ln-list" }
  // ... more queries ...
];

async function runTuning() {
  process.env.RAG_ENABLED = '1';
  console.log('Building index and warming up RAG worker...');
  const index = await ensureIndex();
  
  if (!index) {
    console.error('No index built');
    process.exit(1);
  }

  let recall = 0;
  for (const { q, expectDoc } of QUERIES) {
    const results = await semanticSearch(q, index.indexEpoch);
    if (results && results.some(r => r.docKey.includes(expectDoc))) {
      recall++;
    }
  }
  
  console.log(`Semantic Recall: ${recall}/${QUERIES.length}`);
  console.log('Tuning complete. Calibrate RELEVANCE_FLOOR in store.js based on these results.');
  process.exit(0);
}

runTuning().catch(console.error);
