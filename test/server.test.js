const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const port = 43000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), AI_PROVIDER: '', AI_ENDPOINT: '', AI_MODEL: '', AI_API_KEY: '' }, stdio: 'ignore' });
let sessionId;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nZcAAAAASUVORK5CYII=';

after(async () => {
  server.kill();
  if (sessionId) {
    const file = path.resolve(__dirname, '..', 'storage/sessions', `${sessionId}.json`);
    try { const s = JSON.parse(fs.readFileSync(file, 'utf8')); for (const p of s.photos || []) fs.rmSync(path.resolve(__dirname, '..', 'storage/photos/original', path.basename(p.url)), { force: true }); if (s.finalExport) fs.rmSync(path.resolve(__dirname, '..', 'storage/exports', path.basename(s.finalExport)), { force: true }); fs.rmSync(file, { force: true }); } catch {}
  }
});

test('session, validated photo storage, safe media and QR', async () => {
  let health;
  for (let i = 0; i < 50; i++) { try { health = await fetch(`${base}/api/health`); if (health.ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.equal(health?.status, 200);
  assert.deepEqual(await health.json(), { ok: true, aiMode: 'demo', aiConfigured: false });
  assert.equal((await fetch(`${base}/api/sessions/00000000-0000-4000-8000-000000000000/ai`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 503);
  const created = await fetch(`${base}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quantity: 99 }) });
  assert.equal(created.status, 201);
  ({ id: sessionId } = await created.json());
  assert.equal((await (await fetch(`${base}/api/sessions/${sessionId}`)).json()).quantity, 10);
  const bad = await fetch(`${base}/api/sessions/${sessionId}/photos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: 'data:image/svg+xml;base64,PHN2Zz4=' }) });
  assert.equal(bad.status, 415);
  const saved = await fetch(`${base}/api/sessions/${sessionId}/photos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: png, angle: 2, shot: 1 }) });
  assert.equal(saved.status, 201);
  const photo = await saved.json();
  assert.equal((await fetch(`${base}${photo.url}`)).status, 200);
  assert.equal((await fetch(`${base}/api/qr?url=${encodeURIComponent(`http://127.0.0.1:${port}/result/${sessionId}`)}`)).headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${base}/api/qr?url=${encodeURIComponent('http://example.com/')}`)).status, 400);
  const exported = await fetch(`${base}/api/sessions/${sessionId}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: png }) });
  assert.equal(exported.status, 201);
  assert.equal((await (await fetch(`${base}/api/sessions/${sessionId}`)).json()).status, 'completed');
  const exportInfo = await exported.json();
  assert.equal((await fetch(`${base}${exportInfo.url}`)).status, 200);
  assert.equal((await fetch(`${base}/api/sessions/${sessionId}/photos/${photo.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${base}${photo.url}`)).status, 404);
});
