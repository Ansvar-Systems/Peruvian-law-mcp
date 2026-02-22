#!/usr/bin/env tsx
/**
 * Peruvian Law MCP -- Ingestion Pipeline
 *
 * Fetches Peruvian legislation from Diario Oficial El Peruano and converts it
 * into seed JSON files consumed by scripts/build-db.ts.
 *
 * Usage:
 *   npm run ingest                                 # Full law-corpus ingestion
 *   npm run ingest -- --curated                   # Curated 10-act ingestion
 *   npm run ingest -- --types "LEY,DECRETO LEGISLATIVO"
 *   npm run ingest -- --limit 100                 # Stop after N discovered acts
 *   npm run ingest -- --skip-fetch                # Reuse cached HTML pages
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'node:child_process';
import { fetchWithRateLimit } from './lib/fetcher.js';
import { parsePeruvianHtml, KEY_PERUVIAN_ACTS, type ActIndexEntry } from './lib/parser.js';
import { discoverActs } from './lib/discovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const ACT_INDEX_CACHE = path.join(SOURCE_DIR, 'law-index.json');
const INGEST_REPORT_PATH = path.join(SOURCE_DIR, 'ingestion-report.json');
const NO_HTML_OPS_CACHE = path.join(SOURCE_DIR, 'no-html-ops.json');

/** El Peruano HTML viewer endpoint */
const EL_PERUANO_HTML_BASE = 'https://busquedas.elperuano.pe/api/visor_html';

const DEFAULT_LAW_TYPES = [
  'LEY',
  'DECRETO LEGISLATIVO',
  'DECRETO DE URGENCIA',
  'RESOLUCION LEGISLATIVA',
];
const ARTICLE_MARKER_RE = /art(?:[ií]|&iacute;|&#237;|&#x00ed;)culo/i;
const PROBE_USER_AGENT = 'Peruvian-Law-MCP/1.0 (https://github.com/Ansvar-Systems/Peruvian-law-mcp; hello@ansvar.ai)';

interface IngestArgs {
  limit: number | null;
  skipFetch: boolean;
  curated: boolean;
  startDate: string;
  endDate: string;
  types: string[];
  paginatedBy: number;
  refreshIndex: boolean;
  htmlRetries: number;
}

function todayYYYYMMDD(): string {
  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function parseArgs(): IngestArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;
  let curated = false;
  let startDate = '19000101';
  let endDate = todayYYYYMMDD();
  let types = [...DEFAULT_LAW_TYPES];
  let paginatedBy = 200;
  let refreshIndex = false;
  let htmlRetries = 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    } else if (args[i] === '--curated') {
      curated = true;
    } else if (args[i] === '--start-date' && args[i + 1]) {
      startDate = args[i + 1];
      i++;
    } else if (args[i] === '--end-date' && args[i + 1]) {
      endDate = args[i + 1];
      i++;
    } else if (args[i] === '--types' && args[i + 1]) {
      types = args[i + 1].split(',').map(v => v.trim()).filter(Boolean);
      i++;
    } else if (args[i] === '--paginated-by' && args[i + 1]) {
      paginatedBy = Math.max(1, parseInt(args[i + 1], 10) || 200);
      i++;
    } else if (args[i] === '--refresh-index') {
      refreshIndex = true;
    } else if (args[i] === '--html-retries' && args[i + 1]) {
      htmlRetries = Math.max(0, parseInt(args[i + 1], 10) || 1);
      i++;
    }
  }

  return { limit, skipFetch, curated, startDate, endDate, types, paginatedBy, refreshIndex, htmlRetries };
}

function buildTextUrl(act: ActIndexEntry): string {
  return `${EL_PERUANO_HTML_BASE}/${act.op}`;
}

function hasArticleMarker(html: string): boolean {
  return ARTICLE_MARKER_RE.test(html);
}

function loadNoHtmlOps(): Set<string> {
  if (!fs.existsSync(NO_HTML_OPS_CACHE)) return new Set<string>();

  try {
    const raw = JSON.parse(fs.readFileSync(NO_HTML_OPS_CACHE, 'utf-8')) as unknown;
    if (Array.isArray(raw)) {
      return new Set(raw.filter((v): v is string => typeof v === 'string' && v.length > 0));
    }
    if (raw && typeof raw === 'object' && Array.isArray((raw as { ops?: unknown[] }).ops)) {
      return new Set((raw as { ops: unknown[] }).ops.filter((v): v is string => typeof v === 'string' && v.length > 0));
    }
  } catch {
    // Ignore malformed cache file and continue with an empty set.
  }

  return new Set<string>();
}

function saveNoHtmlOps(noHtmlOps: Set<string>): void {
  fs.writeFileSync(
    NO_HTML_OPS_CACHE,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        ops: Array.from(noHtmlOps).sort(),
      },
      null,
      2
    )
  );
}

async function probeHasHtmlFromDispositivo(op: string): Promise<boolean | null> {
  const url = `https://busquedas.elperuano.pe/dispositivo/NL/${op}`;

  const fetchOnce = async (): Promise<string> => await new Promise<string>((resolve, reject) => {
    const args = [
      '-sS',
      '-L',
      '--http1.1',
      '--tls-max',
      '1.2',
      '--max-time',
      '20',
      '-A',
      PROBE_USER_AGENT,
      '-H',
      'Accept: text/html, */*',
      url,
    ];

    const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`curl exit ${code}: ${stderr.trim() || 'unknown error'}`));
        return;
      }
      resolve(stdout);
    });
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const body = await fetchOnce();
      const marker = body.match(/"hasHTML":(true|false)/);
      if (!marker) return null;
      return marker[1] === 'true';
    } catch {
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  return null;
}

function clearSeedJsonFiles(): void {
  if (!fs.existsSync(SEED_DIR)) return;
  for (const file of fs.readdirSync(SEED_DIR)) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(SEED_DIR, file));
    }
  }
}

async function fetchAndParseActs(acts: ActIndexEntry[], skipFetch: boolean, htmlRetries: number): Promise<void> {
  console.log(`\nProcessing ${acts.length} Peruvian Acts from Diario Oficial El Peruano...\n`);

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  if (!skipFetch) {
    clearSeedJsonFiles();
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0; // fetch/parse errors
  let noHtml = 0;
  let invalid = 0;
  let totalProvisions = 0;
  let totalDefinitions = 0;
  const results: { act: string; provisions: number; definitions: number; status: string }[] = [];
  const noHtmlOps = loadNoHtmlOps();

  for (const act of acts) {
    const actNumber = processed + 1;
    const verbose = actNumber <= 20 || actNumber % 100 === 0;
    const sourceFile = path.join(SOURCE_DIR, `${act.op}.html`);
    const seedFile = path.join(SEED_DIR, `${act.id}.json`);

    if (skipFetch && fs.existsSync(seedFile)) {
      skipped++;
      processed++;
      continue;
    }

    if (noHtmlOps.has(act.op)) {
      if (verbose) {
        console.log(`  Skipping [${actNumber}/${acts.length}] ${act.shortName} (${act.op})... NO_HTML_SOURCE (cached)`);
      }
      noHtml++;
      processed++;
      continue;
    }

    try {
      let html: string;
      let missingArticleMarker = false;

      if (fs.existsSync(sourceFile) && skipFetch) {
        html = fs.readFileSync(sourceFile, 'utf-8');
        missingArticleMarker = !/<html\b/i.test(html) || !hasArticleMarker(html);
        if (missingArticleMarker) {
          invalid++;
        }
        if (verbose) {
          console.log(`  Using cached ${act.shortName} (${act.op}) (${(html.length / 1024).toFixed(0)} KB)`);
          if (missingArticleMarker) {
            console.log('    -> no Artículo marker detected; attempting parse');
          }
        }
      } else {
        const textUrl = buildTextUrl(act);
        if (verbose) {
          process.stdout.write(`  Fetching [${actNumber}/${acts.length}] ${act.shortName} (${act.op})...`);
        }
        let result;
        try {
          result = await fetchWithRateLimit(textUrl, htmlRetries);
        } catch (fetchError) {
          const hasHtml = await probeHasHtmlFromDispositivo(act.op);
          if (hasHtml === false) {
            if (verbose) console.log(' NO_HTML_SOURCE');
            noHtmlOps.add(act.op);
            results.push({ act: act.shortName, provisions: 0, definitions: 0, status: 'NO_HTML_SOURCE' });
            noHtml++;
            processed++;
            continue;
          }
          throw fetchError;
        }

        if (result.status !== 200) {
          if (result.status === 404) {
            const hasHtml = await probeHasHtmlFromDispositivo(act.op);
            if (hasHtml === false) {
              if (verbose) console.log(' NO_HTML_SOURCE');
              noHtmlOps.add(act.op);
              results.push({ act: act.shortName, provisions: 0, definitions: 0, status: 'NO_HTML_SOURCE' });
              noHtml++;
              processed++;
              continue;
            }
          }
          if (verbose) console.log(` HTTP ${result.status}`);
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: `HTTP ${result.status}` });
          failed++;
          processed++;
          continue;
        }

        html = result.body;

        // El Peruano returns this marker when there is no HTML-backed text.
        if (html.includes('The specified URL cannot be found')) {
          if (verbose) console.log(' NO_HTML_SOURCE');
          noHtmlOps.add(act.op);
          results.push({ act: act.shortName, provisions: 0, definitions: 0, status: 'NO_HTML_SOURCE' });
          noHtml++;
          processed++;
          continue;
        }

        missingArticleMarker = !/<html\b/i.test(html) || !hasArticleMarker(html);
        if (missingArticleMarker) {
          if (verbose) console.log(' NO_ARTICLE_MARKER');
          invalid++;
        }

        fs.writeFileSync(sourceFile, html);
        if (verbose && !missingArticleMarker) {
          console.log(` OK (${(html.length / 1024).toFixed(0)} KB)`);
        }
      }

      const parsed = parsePeruvianHtml(html, act);
      fs.writeFileSync(seedFile, JSON.stringify(parsed, null, 2));
      totalProvisions += parsed.provisions.length;
      totalDefinitions += parsed.definitions.length;
      const status = missingArticleMarker
        ? (parsed.provisions.length > 0 ? 'OK_RECOVERED' : 'NO_PROVISIONS')
        : 'OK';
      if (verbose) {
        console.log(`    -> ${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions extracted (${status})`);
      }
      results.push({
        act: act.shortName,
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        status,
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
  console.log(`  No HTML:      ${noHtml}`);
  console.log(`  Invalid:      ${invalid}`);
  console.log(`  Total provisions:  ${totalProvisions}`);
  console.log(`  Total definitions: ${totalDefinitions}`);
  console.log('\n  Per-Act breakdown:');
  console.log(`  ${'Act'.padEnd(30)} ${'Provisions'.padStart(12)} ${'Definitions'.padStart(13)} ${'Status'.padStart(14)}`);
  console.log(`  ${'-'.repeat(30)} ${'-'.repeat(12)} ${'-'.repeat(13)} ${'-'.repeat(14)}`);
  for (const r of results) {
    console.log(`  ${r.act.padEnd(30)} ${String(r.provisions).padStart(12)} ${String(r.definitions).padStart(13)} ${r.status.padStart(14)}`);
  }

  saveNoHtmlOps(noHtmlOps);
  console.log(`\n  Saved no-HTML cache: ${NO_HTML_OPS_CACHE} (${noHtmlOps.size} ops)`);

  fs.writeFileSync(
    INGEST_REPORT_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: 'busquedas.elperuano.pe',
        method: 'api/visor_html/{op}',
        processed,
        cached: skipped,
        failed,
        no_html: noHtml,
        no_html_cache_size: noHtmlOps.size,
        invalid,
        total_provisions: totalProvisions,
        total_definitions: totalDefinitions,
        results,
      },
      null,
      2
    )
  );
  console.log(`\n  Saved report: ${INGEST_REPORT_PATH}`);
  console.log('');
}

async function main(): Promise<void> {
  const { limit, skipFetch, curated, startDate, endDate, types, paginatedBy, refreshIndex, htmlRetries } = parseArgs();

  console.log('Peruvian Law MCP -- Ingestion Pipeline');
  console.log('====================================\n');
  console.log('  Source: busquedas.elperuano.pe (Diario Oficial El Peruano)');
  console.log('  Format: Official HTML legal text by operation id (op)');
  console.log(`  Mode:   ${curated ? 'curated (10 acts)' : 'full law corpus'}`);

  if (limit) console.log(`  --limit ${limit}`);
  if (skipFetch) console.log('  --skip-fetch');
  if (refreshIndex) console.log('  --refresh-index');
  console.log(`  HTML retries: ${htmlRetries}`);
  if (!curated) {
    console.log(`  Date range: ${startDate} -> ${endDate}`);
    console.log(`  Types: ${types.join(', ')}`);
    console.log(`  Page size: ${paginatedBy}`);
  }

  const acts = curated
    ? (limit ? KEY_PERUVIAN_ACTS.slice(0, limit) : KEY_PERUVIAN_ACTS)
    : await (async () => {
      fs.mkdirSync(SOURCE_DIR, { recursive: true });

      const canUseCachedIndex = !refreshIndex && fs.existsSync(ACT_INDEX_CACHE);
      if (canUseCachedIndex) {
        const cached = JSON.parse(fs.readFileSync(ACT_INDEX_CACHE, 'utf-8')) as {
          acts: ActIndexEntry[];
        };
        console.log(`  Using cached discovery index: ${ACT_INDEX_CACHE} (${cached.acts.length} acts)`);
        return limit ? cached.acts.slice(0, limit) : cached.acts;
      }

      const discovered = await discoverActs({
        startDate,
        endDate,
        types,
        paginatedBy,
        maxActs: limit ?? undefined,
      });

      if (limit == null) {
        fs.writeFileSync(
          ACT_INDEX_CACHE,
          JSON.stringify({ generated_at: new Date().toISOString(), startDate, endDate, types, acts: discovered }, null, 2)
        );
        console.log(`  Saved discovery index: ${ACT_INDEX_CACHE}`);
      }

      return discovered;
    })();

  console.log(`\nDiscovered ${acts.length} act(s) for ingestion.`);
  await fetchAndParseActs(acts, skipFetch, htmlRetries);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
