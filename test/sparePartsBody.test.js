const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('spare parts accept image JSON above the configured 256 KB limit and reject over 10 MB with 413', async () => {
  process.env.JSON_LIMIT = '256kb';
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/spare-parts/1`;
    const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_after: 'a'.repeat(400 * 1024) }) });
    // Reaches authentication rather than failing in the JSON parser.
    assert.equal(response.status, 401);
    await response.text();
    const oversized = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_after: 'a'.repeat(11 * 1024 * 1024) }) });
    assert.equal(oversized.status, 413);
    assert.ok((await oversized.json()).message);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
