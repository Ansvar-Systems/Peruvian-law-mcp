#!/usr/bin/env tsx
/**
 * Peruvian Law MCP -- Ingestion Pipeline
 *
 * Fetches Peruvian legislation from Diario Oficial El Peruano and converts it
 * into seed JSON files consumed by scripts/build-db.ts.
 *
 * Usage:
 *   npm run ingest                    # Full ingestion
 *   npm run ingest -- --limit 5       # Test with first 5 acts
 *   npm run ingest -- --skip-fetch    # Reuse cached HTML pages
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchWithRateLimit } from './lib/fetcher.js';
import { parsePeruvianHtml, KEY_PERUVIAN_ACTS, type ActIndexEntry, type ParsedAct } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

/** El Peruano HTML viewer endpoint */
const EL_PERUANO_HTML_BASE = 'https://busquedas.elperuano.pe/api/visor_html';

function parseArgs(): { limit: number | null; skipFetch: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

function buildTextUrl(act: ActIndexEntry): string {
  return `${EL_PERUANO_HTML_BASE}/${act.op}`;
}

function clearSeedJsonFiles(): void {
  if (!fs.existsSync(SEED_DIR)) return;
  for (const file of fs.readdirSync(SEED_DIR)) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(SEED_DIR, file));
    }
  }
}

async function fetchAndParseActs(acts: ActIndexEntry[], skipFetch: boolean): Promise<void> {
  console.log(`\nProcessing ${acts.length} Peruvian Acts from Diario Oficial El Peruano...\n`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  if (!skipFetch) {
    clearSeedJsonFiles();
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const results: { act: string; provisions: number; definitions: number; status: string }[] = [];

  for (const act of acts) {
    const sourceFile = path.join(SOURCE_DIR, `${act.op}.html`);
    const seedFile = path.join(SEED_DIR, `${act.id}.json`);

    if (skipFetch && fs.existsSync(seedFile)) {
      const existing = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as ParsedAct;
      const provCount = existing.provisions?.length ?? 0;
      const defCount = existing.definitions?.length ?? 0;
      totalProvisions += provCount;
      totalDefinitions += defCount;
      results.push({ act: act.shortName, provisions: provCount, definitions: defCount, status: 'cached' });
      skipped++;
      processed++;
      continue;
    }

    try {
      let html: string;

      if (fs.existsSync(sourceFile) && skipFetch) {
        html = fs.readFileSync(sourceFile, 'utf-8');
        console.log(`  Using cached ${act.shortName} (${act.op}) (${(html.length / 1024).toFixed(0)} KB)`);
      } else {
        const textUrl = buildTextUrl(act);
        process.stdout.write(`  Fetching ${act.shortName} (${act.op})...`);
        const result = await fetchWithRateLimit(textUrl);

        if (result.status !== 200) {
          console.log(` HTTP ${result.status}`);
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `HTTP ${result.status}` });
          failed++;
          processed++;
          continue;
        }

        html = result.body;

        // El Peruano returns this marker when there is no HTML-backed text.
        if (html.includes('The specified URL cannot be found')) {
          console.log(' NO_HTML_SOURCE');
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: 'NO_HTML_SOURCE' });
          failed++;
          processed++;
          continue;
        }

        if (!html.includes('<html') || !html.includes('Artículo')) {
          console.log(' INVALID_CONTENT');
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: 'INVALID_CONTENT' });
          failed++;
          processed++;
          continue;
        }

        fs.writeFileSync(sourceFile, html);
        console.log(` OK (${(html.length / 1024).toFixed(0)} KB)`);
      }

      const parsed = parsePeruvianHtml(html, act);
      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;
      console.log(`    -> ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions extracted`);
      results.push({
        act: act.shortName,
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        status: 'OK',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR ${act.shortName}: ${msg}`);
      results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `ERROR: ${msg.substring(0, 80)}` });
      failed++;
    }

    processed++;
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('Ingestion Report');
  console.log('='.repeat(72));
  console.log('\n  Source:       busquedas.elperuano.pe (official legal gazette)');
  console.log('  Method:       Official HTML retrieval via /api/visor_html/{op}');
  console.log(`  Processed:    ${processed}`);
  console.log(`  Cached:       ${skipped}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Total provisions:  ${totalProvisions}`);
  console.log(`  Total definitions: ${totalDefinitions}`);
  console.log('\n  Per-Act breakdown:');
  console.log(`  ${'Act'.padEnd(30)} ${'Provisions'.padStart(12)} ${'Definitions'.padStart(13)} ${'Status'.padStart(14)}`);
  console.log(`  ${'-'.repeat(30)} ${'-'.repeat(12)} ${'-'.repeat(13)} ${'-'.repeat(14)}`);
  for (const r of results) {
    console.log(`  ${r.act.padEnd(30)} ${String(r.provisions).padStart(12)} ${String(r.definitions).padStart(13)} ${r.status.padStart(14)}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const { limit, skipFetch } = parseArgs();

  console.log('Peruvian Law MCP -- Ingestion Pipeline');
  console.log('====================================\n');
  console.log('  Source: busquedas.elperuano.pe (Diario Oficial El Peruano)');
  console.log('  Format: Official HTML legal text by operation id (op)');

  if (limit) console.log(`  --limit ${limit}`);
  if (skipFetch) console.log('  --skip-fetch');

  const acts = limit ? KEY_PERUVIAN_ACTS.slice(0, limit) : KEY_PERUVIAN_ACTS;
  await fetchAndParseActs(acts, skipFetch);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
