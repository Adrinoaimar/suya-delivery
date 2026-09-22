import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'dist/customer');
const port = Number(process.argv[3] ?? 4173);
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Uso: node scripts/qa/static-server.mjs <dist/app> <puerto>');
  console.log('Sirve una app compilada localmente con fallback SPA; no conecta servicios externos.');
  process.exit(0);
}
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

async function readableFile(candidate) {
  try {
    const details = await stat(candidate);
    return details.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const candidate = path.resolve(root, `.${pathname}`);
  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) {
    response.writeHead(403).end();
    return;
  }
  const fallback = path.extname(pathname) ? null : path.join(root, 'index.html');
  const file = await readableFile(candidate) ?? (fallback ? await readableFile(fallback) : null);
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`QA static server: http://127.0.0.1:${port} (${root})`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
