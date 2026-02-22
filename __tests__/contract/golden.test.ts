/**
 * Golden contract tests for Peruvian Law MCP.
 * Validates core tool functionality against real ingested source data.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = DELETE');
});

describe('Database integrity', () => {
  it('should have a large legal-documents corpus', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_documents WHERE id != 'eu-cross-references'"
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(1000);
  });

  it('should have at least 8k provisions', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM legal_provisions').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(8000);
  });

  it('should have extracted definitions', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM definitions').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(50);
  });

  it('should have FTS index rows', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM provisions_fts WHERE provisions_fts MATCH 'datos'"
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });
});

describe('Article retrieval', () => {
  it('should retrieve a provision by document_id and section', () => {
    const row = db.prepare(
      "SELECT content FROM legal_provisions WHERE document_id = 'pe-nl-2480387-2' AND section = '12-A'"
    ).get() as { content: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.content.length).toBeGreaterThan(100);
    expect(row!.content).toContain('datos informáticos');
  });
});

describe('Search', () => {
  it('should find results via FTS search', () => {
    const rows = db.prepare(
      "SELECT COUNT(*) as cnt FROM provisions_fts WHERE provisions_fts MATCH 'digital'"
    ).get() as { cnt: number };
    expect(rows.cnt).toBeGreaterThan(0);
  });
});

describe('Negative tests', () => {
  it('should return no results for fictional document', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'fictional-law-2099'"
    ).get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });

  it('should return no results for invalid section', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'pe-nl-2480387-2' AND section = '999ZZZ-INVALID'"
    ).get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });
});

describe('Key law categories are present', () => {
  it('should contain at least one LEY', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_documents WHERE description LIKE '%LEY%'"
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });

  it('should contain at least one DECRETO LEGISLATIVO', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_documents WHERE description LIKE '%DECRETO LEGISLATIVO%'"
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });

  it('should contain at least one DECRETO DE URGENCIA', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_documents WHERE description LIKE '%DECRETO DE URGENCIA%'"
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });
});

describe('list_sources metadata compatibility', () => {
  it('should have db_metadata table', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM db_metadata').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });

  it('should store PE jurisdiction metadata', () => {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'jurisdiction'"
    ).get() as { value: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.value).toBe('PE');
  });
});
