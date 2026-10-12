const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('every AI style has a valid SVG preview illustration', () => {
  const s = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const code = s.slice(s.indexOf('const LP='), s.indexOf('const aiph='));
  const keys = [...s.matchAll(/^(\w+):\{n:'/gm)].map(m => m[1]);
  const art = new Function('S', 'CM', code + ';return art')({ ai: { cu: { mood: 'Ceria', warna: 'Neon', latar: 'Galaksi' } } }, { Ceria: '' });
  assert.equal(keys.length, 34);
  for (const k of keys) assert.match(art(k), /^<svg[\s\S]*<\/svg>$/, k), assert.doesNotMatch(art(k), /undefined|NaN/, k);
});
