import fs from 'fs';
const d = JSON.parse(fs.readFileSync('osm-stations.json'));
const cfg = { 'canada-water': [-2085, 831.9, 130], 'canary-wharf': [100, 160, 230] };
for (const [id, [cx, cz, r]] of Object.entries(cfg)) {
  const o = d.stations[id], S = 1000 / (2 * r), X = x => ((x - cx + r) * S).toFixed(1), Z = z => ((z - cz + r) * S).toFixed(1);
  const path = (pts, cl) => 'M' + pts.map(p => X(p[0]) + ',' + Z(p[1])).join('L') + (cl ? 'Z' : '');
  const col = lv => ({ '-3': '#c00', '-2': '#e80', '-1': '#08c', '0': '#0a0', '1': '#888' })[Math.round(lv)] || '#a0a';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><rect width="1000" height="1000" fill="white"/>`;
  for (const b of o.buildings) s += `<path d="${path(b.pts, 1)}" fill="#eee" stroke="#999"/><text x="${X(b.pts[0][0])}" y="${Z(b.pts[0][1])}" font-size="10" fill="#666">h${b.h}</text>`;
  for (const f of o.indoor) s += `<path d="${path(f.pts, f.closed)}" fill="${f.closed ? col(f.lv[0]) + '' : 'none'}" fill-opacity="0.15" stroke="${col(f.lv[0])}" stroke-width="${f.kind === 'steps' ? 3 : 1}"/>`;
  for (const l of o.lines) s += `<path d="${path(l.pts)}" fill="none" stroke="${l.tunnel ? '#000' : '#46f'}" stroke-dasharray="${l.tunnel ? '6,3' : ''}"/>`;
  for (const p of o.pois) if (p.kind !== 'poi') s += `<circle cx="${X(p.x)}" cy="${Z(p.z)}" r="4" fill="#00f"/><text x="${X(p.x) * 1 + 5}" y="${Z(p.z)}" font-size="11">${p.kind}:${(p.name || '').slice(0, 20)}</text>`;
  s += `<text x="10" y="20" font-size="16">${id} plan, x right = east, z down = south, ${2 * r} m across; red -3, orange -2, blue -1, green 0</text></svg>`;
  fs.writeFileSync(`plan-${id}.svg`, s);
}
