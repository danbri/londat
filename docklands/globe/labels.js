// Labels on the globe of the Three.js port: HTML elements placed by a CPU projection (as the model's labels), chosen by
// level of detail (each candidate has a web-map zoom range, Natural Earth min_label / min_zoom, compared with the zoom
// that the view's ground resolution matches), hidden behind the horizon, then decluttered: by order (class, then the
// data's rank), a label is shown only if its box overlaps no label already placed. At most MAX at once.
// Skill: docklands-3d-page, "Three.js port: globe and world skeleton (2026-10-13)".
const MAX = 70, PAD = 3;
const CLS = { model: 0, country: 1, sea: 2, place: 3, admin1: 4, river: 5, lake: 5, extra: 3 };

export function makeLabels(host) {
  const C = [], shown = new Set();
  let placed = [];
  const L = {
    candidates: C,
    // c: { id, text, cls, P: [x, y, z] ECEF, up: [ux, uy, uz], minZ, maxZ, rank (smaller first), pop, onTap }
    add(c) { c.order = (CLS[c.cls] ?? 3) * 1e4 + (isFinite(c.rank) ? c.rank : 9) * 100 - Math.log10((c.pop || 0) + 1) * 5; C.push(c); L.sorted = false; return c; },
    clear(pred) { for (let i = C.length - 1; i >= 0; i--) if (pred(C[i])) { if (C[i].el) C[i].el.remove(); C.splice(i, 1); } },
    // project(P) -> [x, y] in CSS px or null; eye: ECEF; zoom: the view's web-map zoom; W, H: the screen
    update({ project, eye, zoom, W, H, visible = true, filter }) {
      if (!L.sorted) { C.sort((a, b) => a.order - b.order); L.sorted = true; }
      const next = new Set(); placed = [];
      if (visible) for (const c of C) {
        if (placed.length >= MAX) break;
        if (c.minZ != null && c.minZ > zoom) continue; if (c.maxZ != null && zoom > c.maxZ + 1) continue; if (filter && !filter(c)) continue;
        const d0 = eye[0] - c.P[0], d1 = eye[1] - c.P[1], d2 = eye[2] - c.P[2];
        if (d0 * c.up[0] + d1 * c.up[1] + d2 * c.up[2] < 0) continue;   // behind the horizon
        const s = project(c.P); if (!s) continue; const [x, y] = s;
        const w = c.w || (c.w = Math.min(220, c.text.length * (c.cls === 'country' ? 8 : 6.6) + 14)), h = 18;
        const box = [x - w / 2 - PAD, y - h - PAD, x + w / 2 + PAD, y + PAD];
        if (box[2] < 0 || box[0] > W || box[3] < 0 || box[1] > H) continue;
        let hit = false; for (const b of placed) if (box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]) { hit = true; break; }
        if (hit) continue;
        placed.push(box); next.add(c);
        if (!c.el) { const el = document.createElement('div'); el.className = 'glab ' + c.cls; el.textContent = c.text; if (c.title) el.title = c.title; host.appendChild(el); c.el = el; }
        c.el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-100%)`; c.el.hidden = false; c.box = box;
      }
      for (const c of shown) if (!next.has(c) && c.el) c.el.hidden = true;
      shown.clear(); for (const c of next) shown.add(c);
      return next.size;
    },
    // the label under a screen point (a tap), or null
    at(x, y) { for (const c of shown) { const b = c.box; if (b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return c; } return null; },
    get shown() { return [...shown]; },
  };
  return L;
}
