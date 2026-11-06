'use strict';

/**
 * Rebuilds the sandbox database from the deterministic seed.
 *
 * Usage:
 *   npm run seed
 *   S4_DATA_FILE=/tmp/sandbox.json npm run seed
 *
 * The target file is taken from S4_DATA_FILE when set, otherwise
 * data/database.json in the project root is replaced.
 */

const store = require('../src/store');

function formatCount(value) {
  return String(value).padStart(5, ' ');
}

function main() {
  const database = store.reset();
  const counts = store.counts();
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  console.log('');
  console.log('S/4HANA sandbox data reset');
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`  Data file   ${store.DATA_FILE}`);
  console.log(`  Seeded at   ${database.meta.seededAt}`);
  console.log(`  Generator   ${database.meta.generator} v${database.meta.version}`);
  console.log(`  Records     ${total}`);
  console.log('──────────────────────────────────────────────────────────────');

  for (const [key, count] of Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${formatCount(count)}  ${key}`);
  }

  console.log('──────────────────────────────────────────────────────────────');
  console.log(`  ${formatCount(total)}  TOTAL`);
  console.log('');
}

try {
  main();
} catch (error) {
  console.error(`Failed to reset the sandbox data: ${error.message}`);
  process.exitCode = 1;
}
