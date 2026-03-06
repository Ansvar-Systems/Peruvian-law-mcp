/**
 * Response metadata utilities for Peruvian Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
  note?: string;
  query_strategy?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Diario Oficial El Peruano (busquedas.elperuano.pe) — Editora Perú / Estado Peruano',
    jurisdiction: 'PE',
    disclaimer:
      'This dataset is derived from official legal publications in Diario Oficial El Peruano. ' +
      'Always verify critical legal interpretations with the official publication and current legal status.',
    freshness,
  };
}
