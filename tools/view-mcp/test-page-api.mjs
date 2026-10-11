#!/usr/bin/env node
// Drives tools/view-mcp/server.mjs over stdio and checks the page-API tools (goto, describe_view, features_at,
// find_places, set_time, get_view; with --page also page_call, which loads the Three.js port headless: 1 to 3 minutes).
//   node tools/view-mcp/test-page-api.mjs [--page]
// Skill: docklands-3d-page, "Three.js port: page API, WebMCP and non-visual access (2026-10-11)".
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), PAGE = process.argv.includes('--page');
const srv = spawn(process.execPath, ['--no-warnings', path.join(here, 'server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', nextId = 1; const waiting = new Map();
srv.stdout.setEncoding('utf8');
srv.stdout.on('data', d => { buf += d; let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (!line.trim()) continue; const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id); } });
const rpc = (method, params) => new Promise(ok => { const id = nextId++; waiting.set(id, ok); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const call = async (name, args = {}) => { const r = await rpc('tools/call', { name, arguments: args }); if (r.error) throw new Error(`${name}: ${r.error.message}`); const t = r.result.content[0].text; if (r.result.isError) throw new Error(`${name}: ${t}`); return JSON.parse(t); };
let failures = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
try {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  const names = (await rpc('tools/list', {})).result.tools.map(t => t.name);
  check(['goto', 'describe_view', 'features_at', 'find_places', 'set_time', 'get_view', 'page_call'].every(n => names.includes(n)), 'tools/list: ' + names.join(', '));
  const d = await call('describe_view', { view: 'cw', time: '2026-10-11T12:00' });
  check(/One Canada Square/.test(d.text) && d.sun.altitude_deg > 20, 'describe_view view=cw: ' + d.text.slice(0, 200));
  const g = await call('describe_view', { view: 'greenlanddock' });
  check(/Greenland Dock/.test(g.text), 'describe_view view=greenlanddock: ' + g.text.slice(0, 160));
  const go = await call('goto', { place: 'Greenland Dock' });
  check(go.found?.name === 'Greenland Dock' && /^https:\/\/danbri\.github\.io\/londat\/docklands\/#v=1&c=/.test(go.link), 'goto place: ' + go.link);
  const f = await call('features_at', { lon: -0.01952, lat: 51.504938 });
  check(f.building?.name === 'One Canada Square' && f.building.registry?.id === 'cwb-0413', 'features_at: ' + f.text);
  const p = await call('find_places', { query: 'mudchute' });
  check(p.some(x => /Mudchute/.test(x.name)), 'find_places: ' + p.map(x => x.name).join('; '));
  const t = await call('set_time', { time: '2026-10-11T12:45', view: 'greenlanddock' });
  check(t.iso === '2026-10-11T11:45:00.000Z' && t.sun.altitude_deg > 25, `set_time: ${t.local}, sun ${t.sun.altitude_deg} deg`);
  const v = await call('get_view', { lon: -0.0402, lat: 51.4944 });
  check(Math.abs(v.target.lat - 51.4944) < 1e-4, 'get_view: ' + JSON.stringify(v.target));
  if (PAGE) {
    const r1 = await call('page_call', { tool: 'go_to', args: { place: 'Greenland Dock' } });
    const r2 = await call('page_call', { tool: 'describe_view' });
    check(r1.result.found?.name === 'Greenland Dock' && /Greenland Dock/.test(r2.result.text) && !r2.errors.length, 'page_call go_to then describe_view: ' + r2.result.text.slice(0, 160));
  }
} catch (e) { failures++; console.log('FAIL ' + e.message); }
srv.stdin.end();
console.log(failures ? `${failures} FAILED` : 'all passed');
setTimeout(() => process.exit(failures ? 1 : 0), 500);
