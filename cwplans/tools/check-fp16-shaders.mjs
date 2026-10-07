// What a phone GPU would do with the 3D page's shaders, checked without a phone (magpie/cwplans/docklands/index.html,
// sky.js and line-styles.js). Two parts:
//  1. The page is opened in headless Chromium (SwiftShader); every shader source the page compiles is captured, and for
//     each program (the line styles are switched on once so that their programs compile) the tool lists its precision and counts its uniform vectors, varyings, attributes and samplers
//     against the WebGL 1 minimums (what any conforming phone must offer) and against what this Chromium reports.
//  2. The maths that a GPU running mediump as 16-bit floats (Apple's, at least) would get wrong is re-run in Node with
//     every intermediate rounded to fp16 (IEEE binary16: 10-bit mantissa, exponents to 2^15, subnormals, overflow to
//     infinity), against the same maths in fp32. Each case names the shader text it mirrors; the tool fails when that
//     text is no longer in the page (the case would be stale).
//
//   node magpie/cwplans/tools/check-fp16-shaders.mjs [--no-browser]
//
// Method, results and what only a real phone can show: the docklands-3d-page skill, "fp16 and WebGL 1 limits".
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { join, extname } from 'path';
import { TOOLS } from './lib.mjs';

const ROOT = join(TOOLS, '..', '..', '..'), PAGE = join(TOOLS, '..', 'docklands', 'index.html'), SKY = join(TOOLS, '..', 'docklands', 'sky.js'), LINES = join(TOOLS, '..', 'docklands', 'line-styles.js');
const src = readFileSync(PAGE, 'utf8') + readFileSync(SKY, 'utf8') + readFileSync(LINES, 'utf8');
let failed = 0;

// ---------- fp16 arithmetic
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function h(x) {   // round a number to the nearest IEEE binary16 value (ties to even)
  if (!isFinite(x) || x === 0) return x; const s = x < 0 ? -1 : 1, a = Math.abs(x);
  if (a >= 65520) return s * Infinity;
  const e = Math.max(-14, Math.floor(Math.log2(a))), q = 2 ** (e - 10);   // spacing of binary16 at this exponent (subnormals below 2^-14)
  let m = a / q, r = Math.round(m); if (Math.abs(m - Math.trunc(m) - .5) < 1e-12) r = Math.trunc(m) % 2 ? Math.trunc(m) + 1 : Math.trunc(m);
  return s * r * q;
}
const f = x => { f32[0] = x; return f32[0]; };   // fp32
const fract = (x, R) => R(x - Math.floor(x));
const ops = R => ({ R, add: (a, b) => R(a + b), mul: (a, b) => R(a * b), sin: a => R(Math.sin(a)), fract: a => fract(a, R) });

// ---------- part 2: the cases
const cases = [];
const need = (txt, what) => { if (!src.includes(txt)) { console.log(`STALE: ${what}: the page no longer has \`${txt.slice(0, 70)}\``); failed++; return false; } return true; };

// (a) the window hash of the facade shader (prF): fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453). Runs at highp
// where the GPU has it (HIP); on a GPU without highp in fragment shaders it would run at mediump.
if (need('float h(vec2 q){return fract(sin(dot(q,vec2(12.9898,78.233)))*43758.5453);}', 'window hash')) {
  const hash = (O, x, y) => O.fract(O.mul(O.sin(O.add(O.mul(O.R(x), O.R(12.9898)), O.mul(O.R(y), O.R(78.233)))), O.R(43758.5453)));
  for (const [nm, O] of [['fp32', ops(f)], ['fp16', ops(h)]]) { let z = 0, set = new Set(); for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) { const v = hash(O, i + 7.3, j + 7.3); if (v === 0) z++; set.add(v); }
    cases.push({ id: 'window hash (prF, HIP)', prec: nm, result: `${z} of 3600 cells hash to 0; ${set.size} distinct values`, bad: false, note: nm === 'fp16' && z > 360 ? 'this shader asks for highp (HIP); only a GPU without highp in fragment shaders would run it like this (the black towers of 2026-10-04 were before HIP)' : '' }); }
}
// (b) the glow pulse of the ground program (pr, mediump): k=.55+.45*sin(time*3.3+wy*.09+v.a*40.). time is a uniform.
if (need('k=.55+.45*sin(time*3.3+wy*.09+v.a*40.)', 'glow pulse')) {
  const wrapped = src.includes('gl.uniform1f(uTime, performance.now() / 1000 % (20 * Math.PI / 3.3))');
  for (const T of [60, 600, 3600, 86400]) {
    const t = wrapped ? T % (20 * Math.PI / 3.3) : T, step = h(t * 3.3 + 1e-3) - h(t * 3.3), arg = O => O.add(O.add(O.mul(O.R(t), O.R(3.3)), O.mul(O.R(120), O.R(.09))), O.mul(O.R(.5), O.R(40)));
    const e = Math.abs(Math.sin(arg(ops(h))) - Math.sin(arg(ops(f))));
    cases.push({ id: `glow pulse at ${T} s after load (pr, mediump)${wrapped ? ', time wrapped' : ''}`, prec: 'fp16', result: `sin argument ${(t * 3.3).toFixed(1)} rad, fp16 spacing there ${(2 ** (Math.floor(Math.log2(Math.max(1e-6, t * 3.3))) - 10)).toFixed(4)} rad; |sin error| ${e.toFixed(3)}`, bad: e > .05 });
  }
}
// (c) the reflection ripples (lpr, HIP): sin(y*fr*.23+time*1.7+sd*6.), time = seconds % 1000; only a GPU without highp
// in fragment shaders would run this at mediump.
if (need('sin(y*fr*.23+time*1.7+sd*6.)', 'ripples')) for (const t of [10, 500, 999]) {
  const a = O => O.add(O.add(O.mul(O.mul(O.R(700), O.R(.6)), O.R(.23)), O.mul(O.R(t), O.R(1.7))), O.mul(O.R(.37), O.R(6)));
  const e = Math.abs(Math.sin(a(ops(h))) - Math.sin(a(ops(f))));
  cases.push({ id: `ripples at time ${t} (lpr, HIP; mediump only without highp)`, prec: 'fp16', result: `|sin error| ${e.toFixed(3)}`, bad: false, note: e > .05 ? 'wrong on a mediump-only GPU (none of the phones we target: every OpenGL ES 3 GPU has highp)' : '' });
}
// (d) the sky noise (sky.js NOISE, PRE = highp where available): hs(p) with p = mod(p,289.); q=fract(vec3(p.xyx)*.1031)...
if (need('float hs(vec2 p){p=mod(p,289.);vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}', 'sky noise hash')) {
  const hs = (O, x, y) => { x = O.R(x - 289 * Math.floor(x / 289)); y = O.R(y - 289 * Math.floor(y / 289)); let q = [O.fract(O.mul(x, O.R(.1031))), O.fract(O.mul(y, O.R(.1031))), O.fract(O.mul(x, O.R(.1031)))];
    const d = O.add(O.add(O.mul(q[0], O.add(q[1], O.R(33.33))), O.mul(q[1], O.add(q[2], O.R(33.33)))), O.mul(q[2], O.add(q[0], O.R(33.33)))); q = q.map(v => O.add(v, d)); return O.fract(O.mul(O.add(q[0], q[1]), q[2])); };
  for (const [nm, O] of [['fp32', ops(f)], ['fp16', ops(h)]]) { const set = new Set(); let s = 0, s2 = 0; for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) { const v = hs(O, i * 3 + 100, j * 3 + 40); set.add(v); s += v; s2 += v * v; }
    const n = 4096, sd = Math.sqrt(s2 / n - (s / n) ** 2); cases.push({ id: 'sky cloud noise hash (sky.js, PRE)', prec: nm, result: `${set.size} distinct of 4096; mean ${(s / n).toFixed(3)}, sd ${sd.toFixed(3)} (uniform: 0.5, 0.289)`, bad: false, note: nm === 'fp16' && set.size < 1000 ? 'clumped in fp16: only a GPU without highp in fragment shaders' : '' }); }
}
// (e) cloud-layer positions far out (sky.js layer()): p=(ck.xy+d.xz*t+dr)/sc with t up to (H-eye)/0.004 km
for (const [H, sc] of [[1, 1.7], [8, 10]]) { const t = H / .004, p = t / sc; cases.push({ id: `cloud layer ${H} km at the horizon (sky.js, PRE)`, prec: 'fp16', result: `noise coordinate ${p.toFixed(0)}, fp16 spacing ${(2 ** (Math.floor(Math.log2(p)) - 10)).toFixed(2)} (a noise cell is 1)`, bad: false, note: 'highp on every OpenGL ES 3 GPU; with mediump the far clouds would be blocky' }); }
// (f) the moonlight normal (prF, HIP): normalize(cross(dFdx(wq),dFdy(wq))) with wq up to about 5,000 m from the origin
if (need('vec3 N=normalize(cross(dFdx(wq),dFdy(wq)))', 'moonlight normal')) {
  const x = 4800, d = .9;   // a pixel step of 0.9 m on a far wall
  cases.push({ id: 'moonlight face normal far from the origin (prF, HIP)', prec: 'fp16', result: `position ${x} m: fp16 spacing ${2 ** (Math.floor(Math.log2(x)) - 10)} m against a ${d} m step between pixels: the derivative is 0 or 4 m`, bad: false, note: 'mediump only without highp' });
  cases.push({ id: 'moonlight face normal far from the origin (prF, HIP)', prec: 'fp32', result: `fp32 spacing ${(2 ** (Math.floor(Math.log2(x)) - 23)).toExponential(1)} m: fine`, bad: false });
}
// (g) the splat falloff (prS, mediump): exp(-dot(vq,vq)) for |vq| <= 2, and the palette search of the pixel-art pass (ppr, mediump) starts at bd=1e9
if (need('float A=-dot(vq,vq);if(A<-4.)discard;float B=exp(A)*vc.a;', 'splat falloff')) {
  let e = 0; for (let r = 0; r <= 2; r += .01) e = Math.max(e, Math.abs(h(Math.exp(h(-r * r))) - Math.exp(-r * r))); cases.push({ id: 'splat falloff (prS, mediump)', prec: 'fp16', result: `largest error ${e.toExponential(1)} (8-bit output step 3.9e-3)`, bad: e > 2e-3 });
}
if (need('vec3 near(vec3 c){float bd=1e9;', 'palette search')) cases.push({ id: 'pixel-art palette search (ppr, mediump)', prec: 'fp16', result: `bd=1e9 is ${h(1e9)} in fp16 (infinity): every first comparison still succeeds, so the result is the same`, bad: false });

// (h) the line styles (line-styles.js, mediump fragment shaders): the cut test on the world height wy, and the afterglow,
// which must fade an 8-bit value to 0 (max(new, old * fade - 1.5 / 255))
if (need('if(wy>cut)discard;', 'line cut test')) for (const y of [2.15, 60.3, 245.3, 320.4]) cases.push({ id: `line styles: cut test at ${y} m OD (mediump)`, prec: 'fp16', result: `wy ${y} is ${h(y)} (error ${Math.abs(h(y) - y).toFixed(3)} m); the cut level is passed as at most 1e4 (${h(1e4)})`, bad: Math.abs(h(y) - y) > .25 });
if (need('texture2D(t2,uv).rgb*v.x-v.y', 'afterglow')) for (const fps of [30, 60, 120]) { const d = h(Math.exp(-1 / fps / .09)), e = h(1.5 / 255); let v = 1, n = 0; while (v > 0 && n < 2000) { v = Math.max(0, Math.round(h(h(v * d) - e) * 255) / 255); n++; }
  cases.push({ id: `line styles: afterglow at ${fps} frames a second (mediump, 8-bit texture)`, prec: 'fp16', result: `a full-bright pixel reaches 0 after ${n} frames (${(n / fps).toFixed(2)} s)`, bad: v > 0 }); }

// ---------- part 1: the shader sources and their counts, from the running page
async function capture() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gz': 'application/gzip', '.bin': 'application/octet-stream' };
  const srv = createServer((q, r) => { try { const p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); const b = readFileSync(p); r.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); } });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok)); const port = srv.address().port;
  const { chromium } = await import(join(ROOT, 'node_modules', 'playwright', 'index.mjs'));
  const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { const P = WebGLRenderingContext.prototype, S = new Map(), out = window.__shaders = [];
    const cs = P.createShader; P.createShader = function (t) { const s = cs.call(this, t); S.set(s, { t }); return s; };
    const ss = P.shaderSource; P.shaderSource = function (s, x) { if (S.has(s)) S.get(s).src = x; return ss.call(this, s, x); };
    const at = P.attachShader; P.attachShader = function (p, s) { (p.__sh || (p.__sh = [])).push(S.get(s)); return at.call(this, p, s); };
    const lk = P.linkProgram; P.linkProgram = function (p) { out.push((p.__sh || []).map(o => ({ type: o.t === this.FRAGMENT_SHADER ? 'fragment' : 'vertex', src: o.src }))); return lk.call(this, p); };
    const gc = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, o) { const g = gc.call(this, k, o); if (g && /webgl/.test(k) && !window.__gl) window.__gl = g; return g; }; });
  await page.goto(`http://127.0.0.1:${port}/magpie/cwplans/docklands/index.html?t=photo&view=greenland`);
  await page.waitForFunction(() => window.__docklands?.AT && window.__docklands.NIGHT.built && window.DocklandsSky?.S?.ready, null, { timeout: 240000 });
  for (const m of ['lines', 'vectrex']) {   // the line styles compile their programs when first drawn
    await page.evaluate(m => window.__docklands.setStyle(m), m); await page.waitForFunction(() => window.DocklandsLines?.built, null, { timeout: 240000 });
    await page.evaluate(() => window.__docklands.renderNow()); }
  await page.evaluate(() => window.__docklands.setStyle('normal'));
  const r = await page.evaluate(() => { const g = window.__gl, L = n => g.getParameter(g[n]); return { progs: window.__shaders, lim: Object.fromEntries(['MAX_VERTEX_UNIFORM_VECTORS', 'MAX_FRAGMENT_UNIFORM_VECTORS', 'MAX_VARYING_VECTORS', 'MAX_TEXTURE_IMAGE_UNITS', 'MAX_VERTEX_ATTRIBS'].map(n => [n, L(n)])),
    hp: g.getShaderPrecisionFormat(g.FRAGMENT_SHADER, g.HIGH_FLOAT).precision, mp: g.getShaderPrecisionFormat(g.FRAGMENT_SHADER, g.MEDIUM_FLOAT).precision }; });
  await browser.close(); srv.close(); return { ...r, errors };
}
// rows a declaration takes (GLSL ES 1.0 packing, conservatively: every float, vec2 and vec3 takes a whole row)
const rows = t => ({ float: 1, int: 1, bool: 1, vec2: 1, vec3: 1, vec4: 1, ivec2: 1, ivec3: 1, ivec4: 1, mat2: 2, mat3: 3, mat4: 4 })[t] || 0;
function count(code, kind) {
  const c = code.replace(/\/\/.*$/gm, ''); let n = 0, samp = 0; const re = new RegExp(`\\b${kind}\\s+(?:(?:lowp|mediump|highp)\\s+)?(\\w+)\\s+([^;]+);`, 'g'); let m;
  while ((m = re.exec(c))) for (const v of m[2].split(',')) { const a = /\[(\d+)\]/.exec(v), k = a ? +a[1] : 1; if (/sampler/.test(m[1])) samp += k; else n += rows(m[1]) * k; }
  return { n, samp };
}
const names = s => s.type === 'fragment' ? (/uniform float add;/.test(s.src) ? 'line styles (line-styles.js)' : /uniform sampler2D t2;/.test(s.src) ? 'afterglow (line-styles.js)' : /pal\[33\]/.test(s.src) ? 'ppr pixel-art pass' : /nightCol/.test(s.src) ? 'prF buildings' : /fslot|vq\.w/.test(s.src) && /refl/.test(s.src) ? 'lpr light sprites' : /float A=-dot\(vq,vq\)/.test(s.src) ? 'prS splats' : /uniform vec2 v;/.test(s.src) && /texture2D\(t,uv/.test(s.src) ? 'bloom pass' : /layer\(vec3 d/.test(s.src) ? 'sky (sky.js)' : /gl_PointCoord/.test(s.src) ? 'sky points (sky.js)' : /mono/.test(s.src) ? 'pr ground, water, lines' : 'other') : '';
if (!process.argv.includes('--no-browser')) {
  const C = await capture(), MIN = { MAX_VERTEX_UNIFORM_VECTORS: 128, MAX_FRAGMENT_UNIFORM_VECTORS: 16, MAX_VARYING_VECTORS: 8, MAX_TEXTURE_IMAGE_UNITS: 8, MAX_VERTEX_ATTRIBS: 8 };
  console.log(`page errors: ${C.errors.length ? C.errors.join(' | ') : 'none'}`);
  console.log(`this Chromium (SwiftShader): ${Object.entries(C.lim).map(([k, v]) => `${k} ${v}`).join(', ')}; fragment highp ${C.hp} bits, mediump ${C.mp} bits (a phone may give mediump 10 bits)`);
  console.log('\nprogram | precision | vertex uniform rows | fragment uniform rows | varyings | samplers | attributes');
  const seen = new Set();
  for (const p of C.progs) { const v = p.find(s => s.type === 'vertex'), fr = p.find(s => s.type === 'fragment'); if (!v || !fr) continue; const nm = names(fr); if (seen.has(nm + fr.src.length)) continue; seen.add(nm + fr.src.length);
    const prec = /GL_FRAGMENT_PRECISION_HIGH/.test(fr.src) ? 'highp where present, else mediump' : /precision mediump/.test(fr.src) ? 'mediump' : /precision highp/.test(fr.src) ? 'highp' : '?';
    const vu = count(v.src, 'uniform'), fu = count(fr.src, 'uniform'), vy = count(v.src, 'varying'), at = count(v.src, 'attribute');
    const over = [vu.n > MIN.MAX_VERTEX_UNIFORM_VECTORS && 'vertex uniforms', fu.n > MIN.MAX_FRAGMENT_UNIFORM_VECTORS && 'fragment uniforms', vy.n > MIN.MAX_VARYING_VECTORS && 'varyings', vu.samp + fu.samp > MIN.MAX_TEXTURE_IMAGE_UNITS && 'samplers', at.n > MIN.MAX_VERTEX_ATTRIBS && 'attributes'].filter(Boolean);
    console.log(`${nm} | ${prec} | ${vu.n} | ${fu.n} | ${vy.n} | ${vu.samp + fu.samp} | ${at.n}${over.length ? '  OVER the WebGL 1 minimum: ' + over.join(', ') : ''}`); }
  console.log(`(WebGL 1 minimums: ${Object.entries(MIN).map(([k, v]) => `${k} ${v}`).join(', ')}; rows counted without packing, so a real count is at most this)`);
}
console.log('\ncase | precision | result');
for (const c of cases) { console.log(`${c.bad ? 'FAIL ' : ''}${c.id} | ${c.prec} | ${c.result}${c.note ? ' — ' + c.note : ''}`); if (c.bad) failed++; }
process.exit(failed ? 1 : 0);
