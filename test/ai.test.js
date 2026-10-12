const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nZcAAAAASUVORK5CYII=';
let reject = false, seen;
const fake = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    seen = { url: req.url, auth: req.headers.authorization, goog: req.headers['x-goog-api-key'], body };
    const ok = req.url.includes(':generateContent') ? { candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: png } }] } }] } : { data: [{ b64_json: png }] };
    res.writeHead(reject ? 401 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reject ? { error: { message: 'Incorrect API key provided: sk-test-secret' } } : ok));
  });
});
const apps = [], sessions = [];
after(() => { apps.forEach(a => a.kill()); fake.close(); for (const id of sessions) { const f = path.join(ROOT, 'storage/sessions', `${id}.json`); try { const s = JSON.parse(fs.readFileSync(f)); for (const p of [...s.photos, ...(s.aiPhotos || [])]) fs.rmSync(path.join(ROOT, p.url.startsWith('/media/ai/') ? 'storage/photos/ai' : 'storage/photos/original', path.basename(p.url)), { force: true }); } catch {} fs.rmSync(f, { force: true }); } });

async function start(provider) {
  if (!fake.listening) await new Promise(r => fake.listen(0, '127.0.0.1', r));
  const port = 43000 + Math.floor(Math.random() * 10000), base = `http://127.0.0.1:${port}`;
  apps.push(spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), AI_PROVIDER: provider, AI_ENDPOINT: `http://127.0.0.1:${fake.address().port}/v1`, AI_MODEL: 'test-model', AI_API_KEY: 'sk-test-secret' } }));
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const { id } = await (await post('/api/sessions', {})).json(); sessions.push(id);
  const photo = await (await post(`/api/sessions/${id}/photos`, { data: `data:image/png;base64,${png}` })).json();
  return { base, ai: b => post(`/api/sessions/${id}/ai`, { photoId: photo.id, ...b }) };
}

test('OpenAI edit: success saves image, 401 gives clear redacted error', async () => {
  reject = false;
  const { base, ai } = await start('openai');
  const ok = await ai({ style: 'manga' });
  assert.equal(ok.status, 201);
  assert.equal(seen.url, '/v1/images/edits');
  assert.equal(seen.auth, 'Bearer sk-test-secret');
  assert.match(seen.body, /name="image\[\]"/);
  assert.match(seen.body, /screentone/);
  assert.equal((await fetch(base + (await ok.json()).url)).status, 200);

  reject = true;
  const bad = await ai({});
  assert.equal(bad.status, 502);
  const err = await bad.json();
  assert.match(err.error, /API key ditolak/);
  assert.doesNotMatch(JSON.stringify(err), /sk-test-secret/);
});

test('Puter: server returns prompt, then stores browser-generated image', async () => {
  const { base, ai } = await start('puter');
  const step1 = await (await ai({ style: 'manga' })).json();
  assert.match(step1.prompt, /screentone/);
  const saved = await ai({ style: 'manga', data: `data:image/png;base64,${png}` });
  assert.equal(saved.status, 201);
  assert.equal((await fetch(base + (await saved.json()).url)).status, 200);
  assert.equal((await ai({ data: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 415);
});

test('Gemini edit: generateContent with inline image, saves inlineData output', async () => {
  reject = false;
  const { base, ai } = await start('gemini');
  const ok = await ai({ style: 'manga' });
  assert.equal(ok.status, 201);
  assert.equal(seen.url, '/v1/models/test-model:generateContent');
  assert.equal(seen.goog, 'sk-test-secret');
  const sent = JSON.parse(seen.body).contents[0].parts;
  assert.match(sent[0].text, /screentone/);
  assert.equal(sent[1].inline_data.data, png);
  assert.equal((await fetch(base + (await ok.json()).url)).status, 200);
});
