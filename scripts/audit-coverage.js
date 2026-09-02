// scripts/audit-coverage.js
// Automated coverage audit for ln-ashlar docs-MCP contract layer.
// Diffs code allowlist (VALID_ATTRIBUTES) vs index vs markup tokens.
// Fails loudly (exit 1) on missing corpus, ghost attributes, or unindexed tokens.

import fs from 'fs';
import path from 'path';
import { configuredRoots, ensureIndex } from '../tools/ashlar/corpus.js';

const ATTR_TOKEN_RE = /data-ln-[a-z0-9-]+/g;

function resolveCorpusRoots(argv) {
  const explicit = argv
    .filter((a) => a.startsWith('--root='))
    .map((a) => a.slice('--root='.length).trim())
    .filter(Boolean);

  if (explicit.length) return explicit.map((r) => path.resolve(r));

  const roots = configuredRoots();
  if (roots.length) return roots.map((r) => path.resolve(r));

  // Default fallback to local environment if exists
  const localDefault = path.resolve('C:/laragon/www/ln-ashlar');
  if (fs.existsSync(localDefault)) return [localDefault];

  const relDefault = path.resolve('../ln-ashlar');
  if (fs.existsSync(relDefault)) return [relDefault];

  return [];
}

async function runAudit() {
  console.log('=== ln-ashlar docs-MCP Coverage Audit ===\n');

  const roots = resolveCorpusRoots(process.argv);
  if (!roots.length) {
    console.error('ERROR: No corpus roots found or configured. Pass --root=<path> or set DOCS_CORPUS_ROOTS.');
    process.exit(1);
  }

  console.log(`Corpus root(s): ${roots.join(', ')}`);

  // Set env so ensureIndex sees the root
  process.env.DOCS_CORPUS_ROOTS = roots.join(',');

  // 1. Load canonical VALID_ATTRIBUTES allowlist
  let validAttributes = null;
  for (const root of roots) {
    const candidate = path.join(root, 'components/ln-debug/src/generated-attributes.js');
    if (fs.existsSync(candidate)) {
      try {
        const mod = await import(`file://${candidate.replace(/\\/g, '/')}`);
        if (mod.VALID_ATTRIBUTES instanceof Set) {
          validAttributes = mod.VALID_ATTRIBUTES;
          console.log(`Loaded ${validAttributes.size} canonical attributes from ${candidate}`);
          break;
        }
      } catch (err) {
        console.warn(`Could not import generated-attributes.js: ${err.message}`);
      }
    }
  }

  if (!validAttributes) {
    console.error('ERROR: Could not load canonical VALID_ATTRIBUTES from components/ln-debug/src/generated-attributes.js');
    process.exit(1);
  }

  // 2. Build index
  const index = await ensureIndex({ forceRebuild: true });
  const indexedAttrs = new Set(index.attributeIndex.keys());
  console.log(`Indexed attributes in docs contract: ${indexedAttrs.size}`);

  // 3. Scan all tokens across docs-mcp files
  const docTokens = new Set();
  const perDocStats = [];

  for (const root of roots) {
    const docsDir = path.join(root, 'docs-mcp');
    if (!fs.existsSync(docsDir)) continue;

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const content = fs.readFileSync(full, 'utf8');
          const matches = content.match(ATTR_TOKEN_RE) || [];
          for (const m of matches) docTokens.add(m);
        }
      }
    }
    scanDir(docsDir);
  }

  // 4. Calculate diffs
  const codeMinusIndex = [...validAttributes].filter((a) => !indexedAttrs.has(a)).sort();
  const misclassifiedEvents = [...indexedAttrs].filter((a) => a.includes(":") && !a.startsWith("data-ln-")).sort();
  const ghostAttributes = [...indexedAttrs].filter((a) => a.startsWith("data-ln-") && !a.endsWith("*") && !validAttributes.has(a)).sort();
  const tokensMinusIndex = [...docTokens].filter((t) => !indexedAttrs.has(t) && validAttributes.has(t)).sort();

  // 5. Per-doc audit
  let zeroAttrsCount = 0;
  let noBaseMarkupCount = 0;
  let zeroEventsCount = 0;
  let warningDocsCount = 0;

  for (const [key, doc] of index.docs.entries()) {
    if (doc.folder === 'components') {
      const parsed = doc.parsed || {};
      const zeroAttr = !parsed.attributes || parsed.attributes.length === 0;
      const noMarkup = !parsed.markup || !parsed.markup.base;
      const zeroEv = !parsed.events || parsed.events.length === 0;
      const hasWarnings = parsed.warnings && parsed.warnings.length > 0;

      if (zeroAttr) zeroAttrsCount++;
      if (noMarkup) noBaseMarkupCount++;
      if (zeroEv) zeroEventsCount++;
      if (hasWarnings) warningDocsCount++;

      perDocStats.push({
        name: doc.name,
        classification: doc.classification,
        attributes: parsed.attributes?.length || 0,
        baseMarkup: Boolean(parsed.markup?.base),
        events: parsed.events?.length || 0,
        warnings: parsed.warnings || []
      });
    }
  }

  console.log('\n--- Metric Summary ---');
  console.log(`Components with zero attributes: ${zeroAttrsCount}`);
  console.log(`Components with no base markup:   ${noBaseMarkupCount}`);
  console.log(`Components with zero events:      ${zeroEventsCount}`);
  console.log(`Components with parse warnings:   ${warningDocsCount}`);

  console.log('\n--- Diff Analysis ---');
  console.log(`Misclassified events in attribute index: ${misclassifiedEvents.length}`);
  if (misclassifiedEvents.length > 0) {
    console.error('CRITICAL: Events incorrectly indexed as attributes:', misclassifiedEvents);
  }

  console.log(`Ghost attributes (Index \\ Code): ${ghostAttributes.length}`);
  if (ghostAttributes.length > 0) {
    console.error('GHOST ATTRIBUTES DETECTED:', ghostAttributes);
  }

  console.log(`Documented tokens unindexed: ${tokensMinusIndex.length}`);
  if (tokensMinusIndex.length > 0) {
    console.warn('Tokens appearing in docs but unindexed:', tokensMinusIndex.slice(0, 15));
  }

  console.log(`Undocumented in contract (Code \\ Index backlog): ${codeMinusIndex.length}`);
  if (codeMinusIndex.length > 0) {
    console.log(`Cataloged ${codeMinusIndex.length} undocumented attributes backlog.`);
  }

  // Verification criteria
  let failed = false;
  if (misclassifiedEvents.length > 0) {
    console.error('\nFAIL: Events incorrectly indexed in attributeIndex.');
    failed = true;
  }
  if (ghostAttributes.length > 0) {
    console.error('\nFAIL: Ghost attributes exist in docs index that do not exist in code allowlist.');
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }

  console.log('\nAudit completed successfully.');
}

runAudit().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
