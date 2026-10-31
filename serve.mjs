import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.png': 'image/png'
};

const port = Number(process.env.PORT || 2028);

export function createPlayerServer(directory = root) {
return createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Invalid path'); return; }
  const file = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
  
  if (!file.startsWith(directory + path.sep) && file !== directory) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  
  try {
    const bytes = await readFile(file);
    res.writeHead(200, {
      'content-type': mime[path.extname(file)] ?? 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp'
    }).end(bytes);
  } catch {
    res.writeHead(404).end('Not found');
  }
 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createPlayerServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Demo Player running at: http://localhost:${server.address().port}`);
    console.log('Press Ctrl+C to stop.');
  });
}
