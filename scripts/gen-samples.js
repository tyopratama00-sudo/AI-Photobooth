// One-off: builds public/samples/{base,<style>}.jpg previews for the AI style screen.
// Needs `npm start` running with AI configured. Re-run to resume; existing files are skipped.
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'public/samples');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g, '')]));
const BASE = `http://127.0.0.1:${env.PORT || 4173}`;
const styles = [...fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8').matchAll(/^(\w+):\{n:'/gm)].map(m => m[1]).filter(k => k !== 'custom');
const post = async (u, b) => { const r = await fetch(BASE + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw Error(`${u}: ${j.error}`); return j; };
const isJpeg = b => b[0] === 0xff && b[1] === 0xd8;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const basePath = path.join(OUT, 'base.jpg');
  if (!fs.existsSync(basePath)) {
    if (env.AI_PROVIDER !== 'gemini') throw Error('Base photo generation needs AI_PROVIDER=gemini');
    const r = await fetch(`${env.AI_ENDPOINT.replace(/\/+$/, '')}/models/${encodeURIComponent(env.AI_MODEL)}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': env.AI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Photorealistic photo of one fictional young Indonesian adult (not a real or famous person), friendly natural smile, casual colorful outfit, waist-up, standing in front of a plain light photobooth backdrop, soft studio lighting, landscape framing. No text, no watermark.' }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3' } }
      })
    });
    const j = await r.json(); if (!r.ok) throw Error(`Base: ${r.status} ${j?.error?.message}`);
    const part = j?.candidates?.[0]?.content?.parts?.filter(p => (p.inlineData || p.inline_data) && !p.thought).pop();
    const buf = Buffer.from((part?.inlineData || part?.inline_data)?.data || '', 'base64');
    if (!isJpeg(buf)) throw Error('Base image is not JPEG');
    fs.writeFileSync(basePath, buf); console.log('base.jpg');
  }
  const { id } = await post('/api/sessions', {});
  const photo = await post(`/api/sessions/${id}/photos`, { data: `data:image/jpeg;base64,${fs.readFileSync(basePath).toString('base64')}` });
  for (const k of styles) {
    const out = path.join(OUT, `${k}.jpg`);
    if (fs.existsSync(out)) continue;
    const ai = await post(`/api/sessions/${id}/ai`, { photoId: photo.id, style: k });
    const buf = fs.readFileSync(path.join(ROOT, 'storage/photos/ai', path.basename(ai.url)));
    if (!isJpeg(buf)) throw Error(`${k}: output is not JPEG`);
    fs.writeFileSync(out, buf); console.log(`${k}.jpg`);
  }
  console.log(`done: ${styles.length} styles`);
})().catch(e => { console.error(e.message); process.exit(1); });
