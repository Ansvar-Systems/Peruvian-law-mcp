#!/usr/bin/env tsx
/**
 * Character-by-character verification for selected provisions.
 *
 * For each fixture entry:
 * 1) fetches official HTML from El Peruano,
 * 2) parses provisions,
 * 3) compares official extracted text vs SQLite content exactly,
 * 4) verifies pinned SHA-256 hash.
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { fetchWithRateLimit } from './lib/fetcher.js';
import { parsePeruvianHtml, type ActIndexEntry } from './lib/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hashesPath = join(__dirname, '../fixtures/golden-hashes.json');
const dbPath = join(__dirname, '../data/database.db');
const upstreamBase = 'https://busquedas.elperuano.pe/api/visor_html';

interface GoldenHash {
  id: string;
  description: string;
  document_id: string;
  provision_ref: string;
  op: string;
  expected_sha256: string;
}

interface HashFixture {
  version: string;
  provisions: GoldenHash[];
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function main(): Promise<void> {
  console.log('Peruvian Law MCP — Source Verification');
  console.log('======================================\n');

  const fixture = JSON.parse(readFileSync(hashesPath, 'utf-8')) as HashFixture;
  const db = new Database(dbPath, { readonly: true });

  let passed = 0;
  let failed = 0;

  for (const row of fixture.provisions) {
    try {
      const doc = db.prepare(
        'SELECT id, title, short_name, issued_date, in_force_date, status, url, description FROM legal_documents WHERE id = ?'
      ).get(row.document_id) as {
        id: string;
        title: string;
        short_name: string | null;
        issued_date: string | null;
        in_force_date: string | null;
        status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
        url: string | null;
        description: string | null;
      } | undefined;

      if (!doc) {
        console.log(`  FAIL ${row.id}: document_id missing from legal_documents (${row.document_id})`);
        failed++;
        continue;
      }

      const act: ActIndexEntry = {
        id: doc.id,
        title: doc.title,
        shortName: doc.short_name ?? doc.id,
        status: doc.status,
        issuedDate: doc.issued_date ?? '1900-01-01',
        inForceDate: doc.in_force_date ?? doc.issued_date ?? '1900-01-01',
        op: row.op,
        url: doc.url ?? `https://busquedas.elperuano.pe/dispositivo/NL/${row.op}`,
        description: doc.description ?? undefined,
      };

      const result = await fetchWithRateLimit(`${upstreamBase}/${row.op}`);
      if (result.status !== 200) {
        console.log(`  FAIL ${row.id}: HTTP ${result.status} from upstream`);
        failed++;
        continue;
      }

      const parsed = parsePeruvianHtml(result.body, act);
      const official = parsed.provisions.find(p => p.provision_ref === row.provision_ref);
      if (!official) {
        console.log(`  FAIL ${row.id}: provision not parsed from upstream (${row.provision_ref})`);
        failed++;
        continue;
      }

      const dbProvision = db.prepare(
        'SELECT content FROM legal_provisions WHERE document_id = ? AND provision_ref = ?'
      ).get(row.document_id, row.provision_ref) as { content: string } | undefined;

      if (!dbProvision) {
        console.log(`  FAIL ${row.id}: provision missing in database`);
        failed++;
        continue;
      }

      const exactMatch = official.content === dbProvision.content;
      const actualHash = sha256(official.content);
      const hashMatch = actualHash === row.expected_sha256;

      if (exactMatch && hashMatch) {
        console.log(`  OK   ${row.id}: exact_match=true hash=${actualHash.slice(0, 12)}...`);
        passed++;
      } else {
        console.log(
          `  FAIL ${row.id}: exact_match=${String(exactMatch)} hash_match=${String(hashMatch)} actual_hash=${actualHash}`
        );
        failed++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR ${row.id}: ${msg}`);
      failed++;
    }
  }

  db.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
