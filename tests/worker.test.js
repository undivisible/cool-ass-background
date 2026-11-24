import { test, expect } from 'bun:test';
import worker from '../src/worker.js';
test('assets retain their body, media type, status and ranges when adding CORS headers', async () => {
  for (const [status, body, type] of [[200, '<canvas></canvas>', 'text/html'], [404, 'Not found', 'text/plain'], [206, 'video bytes', 'video/mp4']]) {
    const response = await worker.fetch(new Request('https://example.test/'), {
      ASSETS: { fetch: async () => new Response(body, { status, headers: { 'content-type': type, 'content-range': 'bytes 0-10/100' } }) },
    });
    expect(response.status).toBe(status);
    expect(await response.text()).toBe(body);
    expect(response.headers.get('content-type')).toBe(type);
    expect(response.headers.get('content-range')).toBe('bytes 0-10/100');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  }
});
