import { resolve, sep } from 'node:path';
const root = resolve('dist');
const server = Bun.serve({ port: Number(process.env.PORT || 4173), hostname: '0.0.0.0', async fetch(request) {
  const url = new URL(request.url);
  const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!path.startsWith(root + sep)) return new Response('Forbidden', { status: 403 });
  const file = Bun.file(path);
  if (!await file.exists()) return new Response('Not found', { status: 404 });
  return new Response(file, { headers: { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' } });
} });
console.info(`Serving on port ${server.port}`);
