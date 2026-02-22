/**
 * Rate-limited HTTP client for Peruvian legislation from Diario Oficial El Peruano.
 *
 * Source endpoint pattern:
 *   https://busquedas.elperuano.pe/api/visor_html/{OP}
 *
 * - 1.2s minimum delay between requests (respectful to government servers)
 * - User-Agent header identifying this MCP
 * - Retry on 429/5xx/network timeout with exponential backoff
 */

import { spawn } from 'node:child_process';

const USER_AGENT = 'Peruvian-Law-MCP/1.0 (https://github.com/Ansvar-Systems/Peruvian-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = Math.max(1000, Number.parseInt(process.env.MCP_FETCH_DELAY_MS ?? '1200', 10) || 1200);
const REQUEST_TIMEOUT_MS = 20000;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export interface FetchResult {
  status: number;
  body: string;
  contentType: string;
  url: string;
}

export interface FetchOptions {
  accept?: string;
  extraHeaders?: Record<string, string>;
}

async function fetchWithCurl(url: string, options: FetchOptions): Promise<FetchResult> {
  const acceptHeader = options.accept ?? 'text/html, application/xhtml+xml, */*';

  const runCurlOnce = async (): Promise<FetchResult> => {
    const args = [
      '-sS',
      '-L',
      '--http1.1',
      '--tls-max',
      '1.2',
      '--max-time',
      String(Math.ceil(REQUEST_TIMEOUT_MS / 1000)),
      '-A',
      USER_AGENT,
      '-H',
      `Accept: ${acceptHeader}`,
      '-w',
      '\\n%{http_code}',
    ];

    for (const [key, value] of Object.entries(options.extraHeaders ?? {})) {
      args.push('-H', `${key}: ${value}`);
    }
    args.push(url);

    return await new Promise<FetchResult>((resolve, reject) => {
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

        const idx = stdout.lastIndexOf('\n');
        if (idx === -1) {
          reject(new Error('curl response missing HTTP status trailer'));
          return;
        }

        const body = stdout.slice(0, idx);
        const status = Number.parseInt(stdout.slice(idx + 1).trim(), 10);
        if (!Number.isFinite(status)) {
          reject(new Error('curl response had non-numeric HTTP status'));
          return;
        }

        resolve({
          status,
          body,
          contentType: '',
          url,
        });
      });
    });
  };

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await runCurlOnce();
    } catch (error) {
      if (attempt >= maxAttempts - 1) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  Curl fallback error for ${url} (${msg}), retrying in 1000ms...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('unreachable');
}

/**
 * Fetch a URL with rate limiting and proper headers.
 * Retries up to 3 times on 429/5xx or timeout errors with exponential backoff.
 */
export async function fetchWithRateLimit(
  url: string,
  maxRetries = 3,
  options: FetchOptions = {},
): Promise<FetchResult> {
  await rateLimit();
  const acceptHeader = options.accept ?? 'text/html, application/xhtml+xml, */*';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': acceptHeader,
          ...(options.extraHeaders ?? {}),
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          console.log(`  HTTP ${response.status} for ${url}, retrying in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
      }

      const body = await response.text();
      return {
        status: response.status,
        body,
        contentType: response.headers.get('content-type') ?? '',
        url: response.url,
      };
    } catch (error) {
      clearTimeout(timeout);

      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  Fetch error for ${url} (${msg}), retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      try {
        console.log(`  Fetch error for ${url} (${msg}), trying curl fallback...`);
        return await fetchWithCurl(url, { ...options, accept: acceptHeader });
      } catch (fallbackError) {
        const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`fetch failed (${msg}); curl fallback failed (${fallbackMsg})`);
      }
    }
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}
