// A small WebXR mock for headless tests of the 3D page's headset path (xr-layer.js): navigator.xr with immersive-vr and
// immersive-ar, a session whose frames are stepped by the test (__xrMock.step()), two eyes side by side on the page
// canvas, an XRWebGLLayer on the default framebuffer, and one controller whose ray the test sets (__xrMock.ray).
// Used by cwplans/docklands/test/xr-check.mjs (page.addInitScript). Skill: docklands-3d-page, "WebXR".
(() => {
  const nrm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const pose = (o, f) => { const z = nrm(f.map(v => -v)), x = nrm(cross([0, 1, 0], z)), y = cross(z, x), m = new Float32Array([...x, 0, ...y, 0, ...z, 0, ...o, 1]);
    const inv = new Float32Array(16); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) inv[c * 4 + r] = m[r * 4 + c]; for (let r = 0; r < 3; r++) inv[12 + r] = -(inv[r] * o[0] + inv[4 + r] * o[1] + inv[8 + r] * o[2]); inv[15] = 1;
    return { matrix: m, inverse: { matrix: inv }, position: { x: o[0], y: o[1], z: o[2], w: 1 } }; };
  const persp = (fy, a, n, f) => { const t = 1 / Math.tan(fy / 2), o = new Float32Array(16); o[0] = t / a; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; };
  const M = window.__xrMock = { head: { o: [0, 1.6, 0], f: [0, -.42, -1] }, ray: null, session: null, frames: 0 };
  class XRWebGLLayer { constructor(s, gl) { this.gl = gl; this.framebuffer = null; } get framebufferWidth() { return this.gl.drawingBufferWidth; } get framebufferHeight() { return this.gl.drawingBufferHeight; }
    getViewport(v) { const w = this.framebufferWidth / 2; return { x: v.eye === 'left' ? 0 : w, y: 0, width: w, height: this.framebufferHeight }; } }
  window.XRWebGLLayer = XRWebGLLayer;
  WebGLRenderingContext.prototype.makeXRCompatible = function () { return Promise.resolve(); };
  class Session { constructor(mode) { this.mode = mode; this.ev = {}; this.renderState = { depthNear: .1, depthFar: 1000 }; this.cb = null; this.src = { targetRayMode: 'tracked-pointer', handedness: 'right', targetRaySpace: { ray: true }, gamepad: null }; }
    get inputSources() { return M.ray ? [this.src] : []; }
    updateRenderState(s) { Object.assign(this.renderState, s); } requestReferenceSpace(t) { return Promise.resolve({ t }); }
    requestAnimationFrame(cb) { this.cb = cb; return 1; } addEventListener(n, f) { (this.ev[n] ||= []).push(f); }
    end() { for (const f of this.ev.end || []) f({}); M.session = null; return Promise.resolve(); }
    frame() { const L = this.renderState.baseLayer, a = (L.framebufferWidth / 2) / L.framebufferHeight, h = M.head, f = nrm(h.f), r = nrm(cross(f, [0, 1, 0]));
      const view = (eye, s) => { const o = h.o.map((v, i) => v + r[i] * s * .032); return { eye, projectionMatrix: persp(1.6, a, this.renderState.depthNear, this.renderState.depthFar), transform: pose(o, f) }; };
      return { getViewerPose: () => ({ transform: pose(h.o, f), views: [view('left', -1), view('right', 1)] }), getPose: sp => sp.ray && M.ray ? { transform: pose(M.ray.o, M.ray.d) } : null }; }
    step() { const cb = this.cb; this.cb = null; if (cb) { M.frames++; cb(performance.now(), this.frame()); } }
    select() { const fr = this.frame(); for (const f of this.ev.select || []) f({ inputSource: this.src, frame: fr }); } }
  Object.defineProperty(navigator, 'xr', { configurable: true, value: { isSessionSupported: m => Promise.resolve(m === 'immersive-vr' || m === 'immersive-ar'), requestSession: m => Promise.resolve(M.session = new Session(m)) } });   // Chromium's own navigator.xr is a getter: plain assignment is ignored
  M.step = () => M.session && M.session.step(); M.select = () => M.session && M.session.select();
})();
