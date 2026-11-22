#!/usr/bin/env node
/*
  Serves the built site (dist/) over HTTP/2 with gzip, the way Cloudflare does,
  so Lighthouse CI measures the protocol visitors get (ADR 0026). Responses carry
  the headers from dist/_headers, with Workers' default Cache-Control (ADR 0027).

  Lighthouse simulates slow 4G from the requests it sees. Over HTTP/1.1 (the
  static server built into lhci) it allows six connections at a time and queues
  the rest, which added most of a second to the home page's LCP that HTTP/2
  doesn't have. The certificate is self-signed, made fresh with openssl for each
  run and thrown away; Chrome is started with --ignore-certificate-errors.

    node --experimental-strip-types scripts/serve-dist.ts [port]
*/
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createSecureServer } from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { headersFor, parseHeadersFile } from '../src/lib/edge.ts';

const ROOT = resolve('dist');
const RULES = parseHeadersFile(readFileSync(join(ROOT, '_headers'), 'utf8'));
const PORT = Number(process.argv[2] ?? 4510);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
  '.m4a': 'audio/mp4',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.ics', '.webmanifest', '.svg']);

const dir = mkdtempSync(join(tmpdir(), 'serve-dist-'));
const key = join(dir, 'key.pem');
const cert = join(dir, 'cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const tls = { key: readFileSync(key), cert: readFileSync(cert) };
rmSync(dir, { recursive: true, force: true });

/** The file a URL path maps to inside dist/, or null. Directories serve their index.html. */
function fileFor(urlPath: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(urlPath.split('?')[0]!);
  } catch {
    return null;
  }
  if (path === '/_headers' || path === '/_redirects') return null; // read by Cloudflare, never served
  const full = resolve(ROOT, `.${path.endsWith('/') ? `${path}index.html` : path}`);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  try {
    return statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

const server = createSecureServer({ ...tls, allowHTTP1: true }, (req, res) => {
  const found = fileFor(req.url ?? '/');
  const file = found ?? join(ROOT, '404.html');
  const ext = extname(file);
  let body = readFileSync(file);
  const path = (req.url ?? '/').split('?')[0]!;
  // _headers wins over the default type, as on Cloudflare.
  const fromRules = Object.fromEntries(Object.entries(headersFor(path, RULES)).map(([name, value]) => [name.toLowerCase(), value]));
  const headers: Record<string, string> = { 'content-type': TYPES[ext] ?? 'application/octet-stream', ...fromRules };
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    body = gzipSync(body);
    headers['content-encoding'] = 'gzip';
    headers['vary'] = 'accept-encoding';
  }
  res.writeHead(found ? 200 : 404, headers);
  res.end(body);
});

server.listen(PORT, '127.0.0.1', () => console.log(`Serving dist on https://localhost:${PORT} (HTTP/2)`));
