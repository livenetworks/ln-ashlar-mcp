#!/usr/bin/env node
// tools/ashlar/lint-cli.js
// CLI entry point for the docs-mcp contract linter. Lives inside tools/ashlar/
// (not tools/) so the server.js auto-loader — which only scans tools/*.js and
// skips directories — never mistakes it for an MCP tool.
//
// Usage:
//   node tools/ashlar/lint-cli.js [rootPath...]
//
// With no args, uses the configured roots (DOCS_CORPUS_ROOTS, or the legacy
// ASHLAR_DOCS_REPO). Args, when given, override env config entirely.
//
// Exit codes: 0 = clean, 1 = findings present, 2 = no corpus configured.

import { validateCorpus } from './validate.js';
import { configuredRoots } from './corpus.js';

function main() {
  const argRoots = process.argv.slice(2);
  const roots = argRoots.length ? argRoots : configuredRoots();

  if (!roots.length) {
    console.error(
      'ashlar lint: no corpus roots configured. Pass root path(s) as CLI args, or set ' +
        'DOCS_CORPUS_ROOTS (comma-separated) / the legacy ASHLAR_DOCS_REPO.'
    );
    process.exit(2);
  }

  const results = validateCorpus(roots);

  let totalFiles = 0;
  let totalProblems = 0;

  for (const root of results) {
    console.log(`\n== Root: ${root.rootLabel} (${root.rootPath}) ==`);
    if (!root.files.length) {
      console.log('  (no corpus found / no indexable files)');
      continue;
    }
    for (const f of root.files) {
      totalFiles++;
      if (f.problems.length === 0) continue;
      totalProblems += f.problems.length;
      console.log(`  ${f.file}`);
      for (const p of f.problems) {
        console.log(`    - ${p}`);
      }
    }
  }

  console.log(`\n${totalFiles} files checked, ${totalProblems} problem(s) found.`);
  process.exit(totalProblems > 0 ? 1 : 0);
}

main();
