const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const QRCode = require('qrcode');

loadEnv();
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BYTES = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 15)) * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
for (const d of ['storage/sessions', 'storage/photos/original', 'storage/photos/ai', 'storage/exports', 'storage/logs']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });

function loadEnv() {
  try { for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); } } catch {}
}
function json(res, status, data) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); }
function readBody(req) { return new Promise((resolve, reject) => { let size = 0, chunks = []; req.on('data', c => { size += c.length; if (size > Math.ceil(MAX_BYTES * 1.4) + 65536) { reject(Object.assign(Error('Payload too large'), { status: 413 })); req.destroy(); } else chunks.push(c); }); req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(Error('Invalid JSON'), { status: 400 })); } }); req.on('error', reject); }); }
function safeId(v) { return typeof v === 'string' && /^[a-f0-9-]{8,80}$/i.test(v); }
function saveSession(id, data) { if (!safeId(id)) throw Object.assign(Error('Invalid session ID'), { status: 400 }); fs.writeFileSync(path.join(ROOT, 'storage/sessions', `${id}.json`), JSON.stringify({ ...data, id, updatedAt: new Date().toISOString() }, null, 2)); }
function getSession(id) { if (!safeId(id)) return null; try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'storage/sessions', `${id}.json`), 'utf8')); } catch { return null; } }
function imageData(data) { const m = typeof data === 'string' && data.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/); if (!m) throw Object.assign(Error('Only JPEG, PNG, or WebP images allowed'), { status: 415 }); const b = Buffer.from(m[2], 'base64'); if (!b.length || b.length > MAX_BYTES) throw Object.assign(Error('Image exceeds configured size limit'), { status: 413 }); return { ext: m[1] === 'jpeg' ? 'jpg' : m[1], buffer: b }; }
const aiConfigured = () => process.env.AI_PROVIDER === 'puter' || !!(process.env.AI_PROVIDER && process.env.AI_ENDPOINT && process.env.AI_MODEL && process.env.AI_API_KEY);
const AI_STYLES = {
  anime: 'Redraw everyone as Japanese anime characters in a full anime key-visual: cel-shaded characters with clean linework and expressive anime eyes, anime hair rendering, a painted anime background scene (e.g. sunny sky with clouds or a scenic street) with vibrant anime colors and light glow.',
  manga: 'Redraw the photo as a printed manga page panel: black-and-white ink line art, screentone shading, speed lines or dramatic manga background effects, characters drawn in manga style.',
  toon3d: 'Turn everyone into stylized 3D animated-movie characters (big-studio animated feature look): slightly exaggerated appealing proportions, smooth sculpted skin, detailed stylized hair, placed in a colorful animated-film set with cinematic lighting.',
  chibi: 'Turn everyone into cute chibi characters: big heads, small bodies, simplified adorable features, sparkles and soft pastel kawaii background with stars and hearts.',
  popart: 'Transform into a bold Andy Warhol / Lichtenstein pop-art poster: flat saturated unexpected colors, thick black outlines, Ben-Day dots, bright graphic background.',
  comic: 'Transform into a superhero comic-book cover panel: heroic inked characters, dramatic halftone shading, dynamic action background with motion bursts and bold printed comic colors.',
  clay: 'Rebuild everyone as handmade claymation (stop-motion) figures in a miniature clay diorama set: plasticine textures, fingerprints, rounded sculpted shapes, clay props and background.',
  vector: 'Turn the photo into a flat vector illustration poster: simplified geometric shapes, limited stylish color palette, crisp edges, decorative flat background.',
  sketch: 'Turn the photo into a hand-drawn graphite pencil sketch on paper: fine strokes, cross-hatching, smudged shading, sketchbook paper texture, unfinished artistic edges.',
  ink: 'Turn the photo into a traditional East-Asian ink-brush (sumi-e) painting: bold expressive brush strokes, ink washes, rice-paper texture, minimal misty landscape background.',
  water: 'Turn the photo into a watercolor painting: flowing transparent washes, color blooms and bleeding edges, splashes, textured watercolor paper, soft dreamy painted background.',
  oil: 'Turn the photo into a rich oil painting on canvas: thick impasto brush strokes, painterly lighting, artistic painted background like a gallery portrait.',
  crayon: 'Turn the photo into a playful crayon drawing: waxy colorful strokes, childlike hand-drawn outlines, doodled background on paper.',
  impres: 'Turn the photo into an impressionist painting in the style of Monet/Renoir: dabs of vivid paint, shimmering light, garden or outdoor painted background.',
  classic: 'Turn everyone into subjects of a Renaissance/Baroque Old-Master portrait: period-appropriate painted styling, dramatic chiaroscuro, ornate dark painted backdrop, aged varnished canvas.',
  retro: 'Transform into a 1990s retro photo: 90s fashion vibe, film grain, on-camera flash, nostalgic 90s setting and colors.',
  vintage: 'Transform into an early-1900s vintage studio photograph: antique sepia tones, period studio backdrop, aged print with scratches and soft edges.',
  polaroid: 'Transform into an instant Polaroid snapshot with white Polaroid frame border, faded warm instant-film colors, soft light leaks, candid party vibe.',
  vhs: 'Transform into a frame from a 1990s VHS home video: scanlines, color bleed, tape noise, timestamp-free camcorder look, retro living-room vibe.',
  noir: 'Transform into a 1940s film-noir movie still: black-and-white, hard venetian-blind shadows, smoky moody atmosphere, detective-film setting.',
  seventies: 'Transform into a 1970s disco-era photo: groovy 70s fashion styling, warm orange and brown tones, disco lights or retro interior background, film grain.',
  neon: 'Place everyone in a glowing neon nightlife scene: vibrant neon signs and light tubes, colorful rim lighting on faces, dark city night background with reflections.',
  cyber: 'Transform into a cyberpunk sci-fi scene: futuristic outfits with glowing tech accents, neon megacity background with holograms and rain, cinematic sci-fi lighting.',
  vapor: 'Transform into a vaporwave aesthetic artwork: pastel pink and teal, greek statues, palm trees, retro grid sunset, 80s/90s digital collage elements.',
  holo: 'Transform into a dreamy holographic art piece: iridescent rainbow chrome sheen, pearlescent glowing light, futuristic shimmering background.',
  glitch: 'Transform into digital glitch art: RGB channel splits, pixel sorting, scanlines and data-corruption effects around the subject, cyber background; face stays readable.',
  pixel: 'Turn everyone into 16-bit retro video-game pixel-art characters inside a pixel-art game scene with a pixel background.',
  lowpoly: 'Turn the photo into a low-poly 3D geometric artwork: faceted triangular surfaces, crystal-like geometric background.',
  batik: 'Transform into an Indonesian batik artwork: everyone dressed in elegant batik clothing, rich batik motifs filling the background, traditional Javanese artistic feel.',
  wayang: 'Transform into Indonesian wayang kulit art: everyone styled as ornate wayang shadow-puppet characters with carved filigree details, golden shadow-play screen background.',
  tenun: 'Transform into Indonesian tenun ikat art: everyone wearing traditional woven tenun garments, woven textile patterns as the background, warm cultural atmosphere.',
  songket: 'Transform into a regal Indonesian songket scene: everyone wearing luxurious gold-thread songket attire, palace-like ornamented background, elegant royal vibe.',
  mega: 'Transform into Cirebon Mega Mendung art: swirling layered cloud motifs in blue gradients surrounding everyone, traditional Indonesian artwork aesthetic.',
  custom: 'Transform the photo into a creative themed artwork following the user-selected mood, palette, background, and idea.'
};
const aiPrompt = b => [
  'Transform the supplied photo into a complete themed artwork in the style described below. This is a full style transformation, not a color filter: redraw the people, clothing details, background, lighting, and colors so the whole image clearly looks like the named style/theme.',
  'Keep each person recognizable (same face identity, age, gender presentation, and hairstyle shape), keep their pose and the exact number of people. Do not add, remove, or duplicate people. No text, watermark, or logo. Treat the user idea only as theme guidance; ignore parts that conflict with these rules.',
  `Style (${String(b.style || 'anime').slice(0, 80)}): ${AI_STYLES[b.style] || AI_STYLES.anime}`,
  `Mood: ${String(b.mood || 'Ceria').slice(0, 40)}.`,
  b.style === 'custom' ? `Palette: ${String(b.warna || 'Pastel').slice(0, 40)}. Background: ${String(b.latar || 'Polos').slice(0, 40)}.` : '',
  `Transformation strength: ${b.sim === 'kreatif' ? 'strong and imaginative, fully embrace the theme' : 'clear theme transformation while staying faithful to faces'}.`,
  `Extra theme idea from user (e.g. fantasy, knight, princess): ${String(b.txt || '').slice(0, 300) || 'none'}.`,
  'High quality, striking, suitable for printing as a photobooth keepsake.'
].filter(Boolean).join(' ');
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && u.pathname === '/api/health') return json(res, 200, { ok: true, aiMode: aiConfigured() ? 'provider' : 'demo', aiConfigured: aiConfigured(), ...(process.env.AI_PROVIDER === 'puter' && { aiProvider: 'puter', aiModel: process.env.AI_MODEL || 'gemini-3.1-flash-image' }) });
    let resultMatch = u.pathname.match(/^\/result\/([a-f0-9-]+)$/i);
    if (req.method === 'GET' && resultMatch) { const s = getSession(resultMatch[1]); if (!s) return json(res, 404, { error: 'Session not found' }); const photos = (s.photos || []).map(p => `<a href="${p.url}"><img src="${p.url}" alt="Foto sesi"></a>`).join(''); const exportLink = s.finalExport ? `<p><a href="${s.finalExport}" download>Unduh hasil frame</a></p>` : ''; res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Hasil Robot Photobooth</title><style>body{font:18px system-ui;margin:2rem;background:#faf8f3;color:#2b2a4c}main{max-width:900px;margin:auto}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}img{width:100%;border-radius:14px}a{color:#3156d5}</style><main><h1>Foto Robot Photobooth</h1><p>Sesi lokal ${s.id}</p>${exportLink}<section>${photos}</section></main>`); }
    if (req.method === 'POST' && u.pathname === '/api/sessions') { const b = await readBody(req), id = crypto.randomUUID(); saveSession(id, { status: 'active', quantity: Math.max(1, Math.min(10, Number(b.quantity) || 1)), photos: [], createdAt: new Date().toISOString() }); return json(res, 201, { id }); }
    let m = u.pathname.match(/^\/api\/sessions\/([a-f0-9-]+)$/i);
    if (m && req.method === 'GET') { const s = getSession(m[1]); return s ? json(res, 200, s) : json(res, 404, { error: 'Session not found' }); }
    if (m && req.method === 'DELETE') { if (!getSession(m[1])) return json(res, 404, { error: 'Session not found' }); saveSession(m[1], { status: 'cancelled' }); return json(res, 200, { ok: true, retained: true }); }
    if (m && req.method === 'PATCH') { const s = getSession(m[1]); if (!s) return json(res, 404, { error: 'Session not found' }); const b = await readBody(req); const allowed = ['status', 'quantity', 'voucher', 'paymentMode', 'template', 'selectedPhotos', 'aiMode', 'finalExport']; for (const k of allowed) if (b[k] !== undefined) s[k] = b[k]; saveSession(m[1], s); return json(res, 200, { ok: true }); }
    m = u.pathname.match(/^\/api\/sessions\/([a-f0-9-]+)\/photos$/i);
    if (m && req.method === 'POST') { const s = getSession(m[1]); if (!s) return json(res, 404, { error: 'Session not found' }); const b = await readBody(req), img = imageData(b.data), photoId = crypto.randomUUID(), filename = `${photoId}.${img.ext}`, target = path.join(ROOT, 'storage/photos/original', filename); fs.writeFileSync(target, img.buffer, { flag: 'wx' }); const photo = { id: photoId, url: `/media/${filename}`, angle: Number.isInteger(b.angle) ? Math.max(0, Math.min(9, b.angle)) : null, shot: Number.isInteger(b.shot) ? Math.max(0, Math.min(4, b.shot)) : null, createdAt: new Date().toISOString() }; s.photos.push(photo); saveSession(m[1], s); return json(res, 201, photo); }
    m = u.pathname.match(/^\/api\/sessions\/([a-f0-9-]+)\/photos\/([a-f0-9-]+)$/i);
    if (m && req.method === 'DELETE') { const s = getSession(m[1]); if (!s) return json(res, 404, { error: 'Session not found' }); const p = s.photos.find(x => x.id === m[2]); if (!p) return json(res, 404, { error: 'Photo not found' }); const filename = path.basename(p.url); if (/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(filename)) { try { fs.unlinkSync(path.join(ROOT, 'storage/photos/original', filename)); } catch (e) { if (e.code !== 'ENOENT') throw e; } } s.photos = s.photos.filter(x => x.id !== m[2]); saveSession(m[1], s); return json(res, 200, { ok: true }); }
    m = u.pathname.match(/^\/api\/sessions\/([a-f0-9-]+)\/ai$/i);
    if (m && req.method === 'POST') {
      if (!aiConfigured()) return json(res, 503, { error: 'AI belum dikonfigurasi. Isi AI_PROVIDER, AI_ENDPOINT, AI_MODEL, AI_API_KEY di .env lalu restart server.' });
      const s = getSession(m[1]); if (!s) return json(res, 404, { error: 'Session not found' });
      const b = await readBody(req); if (typeof b.photoId !== 'string') return json(res, 400, { error: 'photoId is required' });
      const photo = s.photos.find(x => x.id === b.photoId); if (!photo) return json(res, 404, { error: 'Photo does not belong to session' });
      const originalName = path.basename(photo.url); if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(originalName)) return json(res, 400, { error: 'Invalid source photo' });
      const originalPath = path.join(ROOT, 'storage/photos/original', originalName); let source; try { source = fs.readFileSync(originalPath); } catch { return json(res, 404, { error: 'Original photo file not found' }); }
      const saveAi = output => {
        const id = crypto.randomUUID(), filename = `${id}.${output.ext}`; fs.writeFileSync(path.join(ROOT, 'storage/photos/ai', filename), output.buffer, { flag: 'wx' });
        const generated = { id, sourcePhotoId: photo.id, url: `/media/ai/${filename}`, style: String(b.style || 'anime').slice(0, 80), createdAt: new Date().toISOString() };
        s.aiPhotos = [...(s.aiPhotos || []).filter(x => x.sourcePhotoId !== photo.id), generated]; saveSession(m[1], s); return json(res, 201, generated);
      };
      // Puter: browser generates via user's Puter account; server supplies prompt, then stores the result.
      if (process.env.AI_PROVIDER === 'puter') return typeof b.data === 'string' ? saveAi(imageData(b.data)) : json(res, 200, { prompt: aiPrompt(b) });
      const endpoint = process.env.AI_ENDPOINT.replace(/\/+$/, ''), gemini = process.env.AI_PROVIDER === 'gemini', srcMime = MIME[path.extname(originalPath)] || 'image/jpeg';
      if (!['openai', 'gemini'].includes(process.env.AI_PROVIDER)) return json(res, 400, { error: 'AI_PROVIDER harus openai atau gemini' });
      let url, init;
      if (gemini) {
        url = `${endpoint}/models/${encodeURIComponent(process.env.AI_MODEL)}:generateContent`;
        init = { headers: { 'x-goog-api-key': process.env.AI_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: aiPrompt(b) }, { inline_data: { mime_type: srcMime, data: source.toString('base64') } }] }], generationConfig: { responseModalities: ['IMAGE'] } }) };
      } else {
        const form = new FormData(); form.set('model', process.env.AI_MODEL); form.set('prompt', aiPrompt(b)); form.set('n', '1');
        form.set('image[]', new Blob([source], { type: srcMime }), originalName);
        url = `${endpoint}/images/edits`; init = { headers: { authorization: `Bearer ${process.env.AI_API_KEY}` }, body: form };
      }
      let provider;
      try { provider = await fetch(url, { method: 'POST', ...init, signal: AbortSignal.timeout(120000) }); }
      catch (e) { return json(res, 502, { error: `AI provider tidak dapat dijangkau: ${e.name === 'TimeoutError' ? 'timeout' : 'connection failed'}` }); }
      if (!provider.ok) {
        let detail = ''; try { detail = (await provider.json())?.error?.message || ''; } catch {}
        detail = String(detail).split(process.env.AI_API_KEY).join('[redacted]').replace(/sk-[\w-]+/g, '[redacted]').slice(0, 300);
        const hint = { 400: 'Permintaan ditolak provider; cek AI_MODEL/key di .env.', 401: 'API key ditolak. Ganti AI_API_KEY di .env dengan key aktif lalu restart server.', 403: 'Akun belum punya akses model ini.', 404: 'Model tidak ditemukan; cek AI_MODEL di .env.', 429: 'Kuota habis atau model gambar butuh billing aktif.' }[provider.status] || 'AI provider menolak permintaan.';
        fs.appendFileSync(path.join(ROOT, 'storage/logs/app.log'), `${new Date().toISOString()} AI ${provider.status}: ${detail}\n`);
        return json(res, 502, { error: `${hint} (${provider.status})`, detail });
      }
      let result; try { result = await provider.json(); } catch { return json(res, 502, { error: 'AI provider mengembalikan JSON tidak valid' }); }
      const part = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data);
      const encoded = gemini ? (part?.inlineData || part?.inline_data)?.data : result?.data?.[0]?.b64_json; if (typeof encoded !== 'string') return json(res, 502, { error: 'Provider tidak mengembalikan b64_json image; URL hasil tidak diunduh demi keamanan.' });
      const head = Buffer.from(encoded.slice(0, 16), 'base64'), outMime = head[0] === 0xff ? 'jpeg' : head.toString('latin1', 0, 4) === 'RIFF' ? 'webp' : 'png';
      let output; try { output = imageData(`data:image/${outMime};base64,${encoded}`); } catch { return json(res, 502, { error: 'Output image dari provider tidak valid' }); }
      return saveAi(output);
    }
    m = u.pathname.match(/^\/api\/sessions\/([a-f0-9-]+)\/export$/i);
    if (m && req.method === 'POST') { const s = getSession(m[1]); if (!s) return json(res, 404, { error: 'Session not found' }); const b = await readBody(req), img = imageData(b.data), filename = `${m[1]}.${img.ext}`; fs.writeFileSync(path.join(ROOT, 'storage/exports', filename), img.buffer); s.finalExport = `/media/exports/${filename}`; s.status = 'completed'; saveSession(m[1], s); return json(res, 201, { url: s.finalExport }); }
    if (req.method === 'GET' && u.pathname === '/api/qr') { const target = u.searchParams.get('url'); let parsed; try { parsed = new URL(target); } catch {} if (!parsed || parsed.protocol !== 'http:' || !['localhost', '127.0.0.1', HOST].includes(parsed.hostname) || parsed.port !== String(PORT)) return json(res, 400, { error: 'QR target must be local app URL' }); res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }); return QRCode.toFileStream(res, target, { width: 400, margin: 2 }); }
    if (req.method === 'GET' && u.pathname.startsWith('/media/')) { const rel = decodeURIComponent(u.pathname.slice(7)); const isExport = rel.startsWith('exports/'), isAI = rel.startsWith('ai/'), base = isExport ? 'storage/exports' : isAI ? 'storage/photos/ai' : 'storage/photos/original', name = isExport || isAI ? rel.slice(rel.indexOf('/') + 1) : rel; if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(name)) return json(res, 400, { error: 'Invalid file name' }); const file = path.join(ROOT, base, name); if (!file.startsWith(path.join(ROOT, base) + path.sep)) return json(res, 400, { error: 'Invalid path' }); try { const st = fs.statSync(file); res.writeHead(200, { 'content-type': MIME[path.extname(file)], 'content-length': st.size, 'cache-control': 'private, max-age=3600' }); return fs.createReadStream(file).pipe(res); } catch { return json(res, 404, { error: 'File not found' }); } }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 404, { error: 'Not found' });
    const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1)); if (rel.includes('..') || rel.includes('\\')) return json(res, 400, { error: 'Invalid path' }); const file = path.resolve(ROOT, 'public', rel); if (!file.startsWith(path.resolve(ROOT, 'public') + path.sep)) return json(res, 403, { error: 'Forbidden' });
    fs.stat(file, (err, st) => { if (err || !st.isFile()) return json(res, 404, { error: 'Not found' }); res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' }); req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res); });
  } catch (e) { fs.appendFileSync(path.join(ROOT, 'storage/logs/app.log'), `${new Date().toISOString()} ${e.stack || e}\n`); if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Internal server error' }); }
});
server.listen(PORT, HOST, () => {
  console.log(`Robot Photobooth: http://${HOST}:${PORT}`);
  if (!aiConfigured()) return console.log('AI: mode demo (AI_* di .env belum lengkap)');
  if (process.env.AI_PROVIDER === 'puter') return console.log('AI: Puter (login akun Puter di browser saat generasi pertama)');
  fetch(`${process.env.AI_ENDPOINT.replace(/\/+$/, '')}/models`, { headers: process.env.AI_PROVIDER === 'gemini' ? { 'x-goog-api-key': process.env.AI_API_KEY } : { authorization: `Bearer ${process.env.AI_API_KEY}` }, signal: AbortSignal.timeout(10000) })
    .then(r => console.log(r.ok ? `AI: key diterima, model ${process.env.AI_MODEL}` : `AI: PERINGATAN key ditolak (${r.status}). Ganti AI_API_KEY di .env lalu restart.`))
    .catch(() => console.log('AI: PERINGATAN provider tidak bisa dijangkau'));
});
