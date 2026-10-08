// Station models layer of the Three.js port (docklands/): the Blender station boxes of Canary Wharf and Canada Water from
// ../cwplans/docklands/data/stations.json (tools/build-station-mesh.mjs), as in the WebGL page's stations-layer.js:
// platforms, escalators, stairs, lifts, entrances and tracks opaque; halls, canopies and the box see-through (no depth
// write, drawn after the opaque scene). The page's own tunnels are not drawn here, so the "tunnel" parts are left out as
// on the WebGL page. Tap a part for its card. ?stations=0 starts with the layer off.
// Skills: docklands-3d-page, "Three.js port" and "Station models"; blender-station-models, section 8.
const STYLE = {   // stations-layer.js STYLE: colour and opacity by element class (--plat #ff8a3d, --jub #c9ced6)
  platform: ['#ff8a3d', 1], escalator: ['#ffd23f', 1], stair: ['#f2dcb0', 1], lift: ['#ececec', 1], entrance: ['#ff6a5c', 1],
  track: ['#4a4f57', 1], tunnel: ['#c9ced6', 1], hall: ['#cbbfae', .32], canopy: ['#e6e6e6', .35], box: ['#e8ecf0', .1],
};
const NAME = { box: 'Station box (structure)', track: 'Track', tunnel: 'Tunnel', platform: 'Platform', hall: 'Ticket hall / concourse',
  escalator: 'Escalator', stair: 'Stairs', lift: 'Lift', canopy: 'Canopy', entrance: 'Entrance' };
const STN = { 'canary-wharf': 'Canary Wharf', 'canada-water': 'Canada Water' };
const rgb = s => { const n = parseInt(s.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

export default {
  id: 'stations', label: 'Station models', on: true,
  async init(ctx, on) {
    const { THREE } = ctx, doc = await ctx.loadJSON(ctx.DATA + 'stations.json');
    // one bucket for the opaque parts and one for each see-through opacity; non-indexed triangles (flat faces), and the
    // part of each triangle for the tap
    const buckets = new Map(), bucket = a => { if (!buckets.has(a)) buckets.set(a, { p: [], c: [], part: [] }); return buckets.get(a); };
    let tris = 0;
    doc.objects.forEach((o, oi) => {
      if (o.cls === 'tunnel') return;   // the page's own tunnels run up to the box faces
      const [hex, alpha] = STYLE[o.cls] || ['#cccccc', 1], col = rgb(hex), B = bucket(alpha), t = o.t, p = o.p;
      for (let k = 0; k < o.i.length; k += 3) {
        for (let j = 0; j < 3; j++) { const v = o.i[k + j]; B.p.push(t[0] + p[3 * v] / 100, t[1] + p[3 * v + 1] / 100, t[2] + p[3 * v + 2] / 100); B.c.push(...col); }
        B.part.push(oi); tris++;
      }
    });
    const group = new THREE.Group(); group.name = 'stations';
    for (const [alpha, B] of buckets) {
      const G = new THREE.BufferGeometry();
      G.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); G.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
      G.computeVertexNormals(); G.computeBoundingSphere(); G.userData.part = Int32Array.from(B.part);
      const glass = alpha < 1, m = ctx.materials.vertexColourMaterial(glass ? { transparent: true, opacity: alpha, depthWrite: false, flatShading: true } : { flatShading: true });
      const mesh = new THREE.Mesh(G, m); mesh.renderOrder = glass ? 3 + Math.round((1 - alpha) * 10) : 0;   // the faintest (the box) last
      mesh.castShadow = !glass; mesh.receiveShadow = true; mesh.userData.stations = true; group.add(mesh);
    }

    const esc = ctx.esc || (s => String(s));
    function card(o) {
      const rows = [], add = (k, v) => { if (v != null && v !== '') rows.push(`<tr><td>${k}</td><td>${esc(v)}</td></tr>`); }, m = v => `${v} m OD`;
      add('Station', STN[o.station] || o.station); add('Part', NAME[o.cls] || o.cls);
      if (o.from_level_m_od != null) add('From / to', `${m(o.from_level_m_od)} to ${m(o.to_level_m_od)}`); else add('Level', o.level_m_od != null ? m(o.level_m_od) : null);
      add('Top', o.top_m_od != null ? m(o.top_m_od) : null); add('How sure', o.uncertainty); add('Basis', o.basis);
      ctx.showCard(`<h2>${esc(o.name)}</h2><p class="small">station model</p><table>${rows.join('')}</table>` +
        `<p class="small">Model made in Blender on 2026-10-05 (scoping, not survey data). ${esc(doc.meta.licence)} ` +
        `Files: <a href="${doc.meta.source}" target="_blank" rel="noopener">danbri/londat am3d/models</a>.</p>`);
    }
    // tap: a station part, when the page's own pick (buildings, detailed models) finds nothing there
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), el = ctx.renderer.domElement; let down = null;
    el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', e => {
      if (!down || !group.visible) return; const d = down; down = null;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6 || performance.now() - d.t >= 500) return;
      if (globalThis.__docklands3 && __docklands3.pickAt(e.clientX, e.clientY) >= 0) return;
      const r = el.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, ctx.camera);
      const hit = ray.intersectObjects(group.children, false)[0]; if (!hit) return;
      const oi = hit.object.geometry.userData.part[hit.faceIndex]; if (oi != null) card(doc.objects[oi]);
    });

    const setVisible = v => { group.visible = v; ctx.draw(); };
    ctx.ui.toggle('Station models', on, setVisible);
    ctx.ui.note(`Canary Wharf and Canada Water: ${doc.objects.length} parts, ${tris.toLocaleString()} triangles drawn (${doc.meta.triangles.toLocaleString()} in the file; tunnels left out). ` +
      `Mostly below the ground. Tap a part for its source and how sure it is. ${esc(doc.meta.attribution)}; ` +
      `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>.`);
    return { object: group, setVisible, ownUi: true, stats: { parts: doc.objects.length, triangles: tris, meshes: group.children.length } };
  },
};
