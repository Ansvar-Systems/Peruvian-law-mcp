/**
 * Bulk discovery for Peruvian legal acts via El Peruano GraphQL endpoint.
 *
 * NOTE:
 * - POST requests are blocked from this environment by upstream filters.
 * - GET requests with URL-encoded GraphQL queries are supported.
 */

import { fetchWithRateLimit } from './fetcher.js';
import type { ActIndexEntry } from './parser.js';

const EL_PERUANO_GRAPHQL_ENDPOINT = 'https://busquedas.elperuano.pe/api/graphql';

export interface DiscoveryOptions {
  startDate: string;   // YYYYMMDD
  endDate: string;     // YYYYMMDD
  types: string[];     // tipoDispositivo values (exact match)
  paginatedBy: number; // page size, e.g. 200
  maxActs?: number;
}

interface GenericPublicationHit {
  op: string;
  fechaPublicacion: string;
  tipoPublicacion: string;
  tipoDispositivo: string;
  nombreDispositivo: string;
  sumilla: string;
}

interface GenericPublicationPage {
  totalHits: number;
  start: number;
  hasNext: boolean;
  paginatedBy: number;
  hits: GenericPublicationHit[];
}

function escapeGraphQLString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeDate(raw: string): string {
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  return '1900-01-01';
}

function compactText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function buildGenericPublicationQuery(args: {
  startDate: string;
  endDate: string;
  type: string;
  start: number;
  paginatedBy: number;
}): string {
  return (
    'query{' +
    `results:getGenericPublication(` +
    `fechaIni:"${escapeGraphQLString(args.startDate)}",` +
    `fechaFin:"${escapeGraphQLString(args.endDate)}",` +
    'tipoPublicacion:"NL",' +
    `tipoDispositivo:"${escapeGraphQLString(args.type)}",` +
    'ci:"ONLY",' +
    `start:${args.start},` +
    `paginatedBy:${args.paginatedBy}` +
    '){' +
    'totalHits start hasNext paginatedBy hits{' +
    'op fechaPublicacion tipoPublicacion tipoDispositivo nombreDispositivo sumilla' +
    '}' +
    '}' +
    '}'
  );
}

async function fetchGenericPublicationPage(args: {
  startDate: string;
  endDate: string;
  type: string;
  start: number;
  paginatedBy: number;
}): Promise<GenericPublicationPage> {
  const query = buildGenericPublicationQuery(args);
  const url = `${EL_PERUANO_GRAPHQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await fetchWithRateLimit(url, 3, { accept: 'application/json, */*' });

    if (result.status !== 200) {
      if (result.status === 404 && attempt < maxAttempts - 1) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  GraphQL HTTP 404 (transient), retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      throw new Error(`HTTP ${result.status} from GraphQL endpoint`);
    }

    if (result.body.includes('The specified URL cannot be found')) {
      if (attempt < maxAttempts - 1) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  GraphQL URL-not-found marker (transient), retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      throw new Error('GraphQL endpoint returned URL-not-found marker');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.body);
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  GraphQL JSON parse error (transient), retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      const preview = result.body.slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`Invalid JSON from GraphQL endpoint (preview: ${preview})`);
    }

    const data = parsed as {
      data?: {
        results?: GenericPublicationPage;
      };
      errors?: unknown;
    };

    if (!data?.data?.results) {
      const errors = data?.errors ? JSON.stringify(data.errors) : 'unknown';
      if (attempt < maxAttempts - 1) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  GraphQL missing results (transient), retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      throw new Error(`Missing results in GraphQL response: ${errors}`);
    }

    return data.data.results;
  }

  throw new Error('Unreachable');
}

export async function discoverActs(options: DiscoveryOptions): Promise<ActIndexEntry[]> {
  const byOp = new Map<string, ActIndexEntry>();
  const maxActs = options.maxActs ?? Number.POSITIVE_INFINITY;

  for (const type of options.types) {
    let start = 0;
    let page = 0;
    let totalHits = 0;

    while (true) {
      const response = await fetchGenericPublicationPage({
        startDate: options.startDate,
        endDate: options.endDate,
        type,
        start,
        paginatedBy: options.paginatedBy,
      });

      page += 1;
      totalHits = response.totalHits;

      for (const hit of response.hits ?? []) {
        const op = compactText(hit.op);
        if (!op || byOp.has(op)) continue;

        const issuedDate = normalizeDate(compactText(hit.fechaPublicacion));
        const tipoDispositivo = compactText(hit.tipoDispositivo);
        const nombreDispositivo = compactText(hit.nombreDispositivo);
        const sumilla = compactText(hit.sumilla);

        const title = sumilla || `${tipoDispositivo} ${nombreDispositivo}`.trim() || `Norma ${op}`;
        const shortName = nombreDispositivo || tipoDispositivo || op;
        const description = [tipoDispositivo, nombreDispositivo, sumilla].filter(Boolean).join(' | ');

        byOp.set(op, {
          id: `pe-nl-${op}`,
          title,
          shortName,
          status: 'in_force',
          issuedDate,
          inForceDate: issuedDate,
          op,
          url: `https://busquedas.elperuano.pe/dispositivo/NL/${op}`,
          description: description || undefined,
        });

        if (byOp.size >= maxActs) break;
      }

      console.log(
        `  Discovered type="${type}" page=${page} start=${start} ` +
        `hits=${response.hits?.length ?? 0} total=${totalHits} unique=${byOp.size}`
      );

      if (byOp.size >= maxActs) break;
      if (!response.hasNext) break;

      start += response.paginatedBy;
    }

    console.log(`  Completed type="${type}" totalHits=${totalHits} uniqueSoFar=${byOp.size}`);
    if (byOp.size >= maxActs) break;
  }

  const acts = Array.from(byOp.values()).sort((a, b) => {
    if (a.issuedDate === b.issuedDate) return a.op < b.op ? 1 : -1;
    return a.issuedDate < b.issuedDate ? 1 : -1;
  });

  return acts;
}
