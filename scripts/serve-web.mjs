import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const portArgument = process.argv.indexOf('--port');
const port = portArgument >= 0 ? Number(process.argv[portArgument + 1]) : 8085;

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

await access(path.join(root, 'index.html'));

const server = createServer(async (request, response) => {
  const headers = {
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400, headers).end('Invalid URL');
    return;
  }

  const requestedPath = path.resolve(root, `.${pathname}`);
  if (requestedPath !== root && !requestedPath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403, headers).end('Forbidden');
    return;
  }

  let filePath = requestedPath;
  try {
    if (!(await stat(filePath)).isFile()) filePath = path.join(root, 'index.html');
  } catch {
    filePath = path.join(root, 'index.html');
  }

  const fileInfo = await stat(filePath);
  response.writeHead(200, {
    ...headers,
    'Accept-Ranges': 'bytes',
    'Content-Length': fileInfo.size,
    'Content-Type': contentTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
  });

  if (request.method === 'HEAD') {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Web preview: http://localhost:${port}`);
  console.log('Cross-origin isolation headers enabled for browser SQLite.');
});