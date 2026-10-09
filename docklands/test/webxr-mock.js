// A small WebXR mock for headless tests of the headset mode of the Three.js port (docklands/xr.js), copied from the
// WebGL page's cwplans/docklands/test/webxr-mock.js and extended for three.js r186 renderer.xr: WebGL2 makeXRCompatible,
// no XRWebGLBinding (so three.js takes its XRWebGLLayer path), enabledFeatures, removeEventListener and
// cancelAnimationFrame on the session. navigator.xr with immersive-vr and immersive-ar, a session whose frames are stepped
// by the test (__xrMock.step()), two eyes side by side on the page canvas, two controllers whose rays the test sets
// (__xrMock.ray, __xrMock.ray2); press(i) and release(i) send selectstart and selectend, select() both.
// Used by docklands/test/xr-check.mjs (page.addInitScript). Skill: docklands-3d-page, "WebXR" and "Three.js port".
(() => {
  const nrm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const pose = (o, f) => { const z = nrm(f.map(v => -v)), x = nrm(cross([0, 1, 0], z)), y = cross(z, x), m = new Float32Array([...x, 0, ...y, 0, ...z, 0, ...o, 1]);
    const inv = new Float32Array(16); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) inv[c * 4 + r] = m[r * 4 + c]; for (let r = 0; r < 3; r++) inv[12 + r] = -(inv[r] * o[0] + inv[4 + r] * o[1] + inv[8 + r] * o[2]); inv[15] = 1;
    return { matrix: m, inverse: { matrix: inv }, position: { x: o[0], y: o[1], z: o[2], w: 1 } }; };
  const persp = (fy, a, n, f) => { const t = 1 / Math.tan(fy / 2), o = new Float32Array(16); o[0] = t / a; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; };
  // pads[i]: an xr-standard gamepad for controller i ({ axes: [0, 0, x, y], buttons: [{ pressed }] x 6 }) or null
  const pad = () => ({ axes: [0, 0, 0, 0], buttons: Array.from({ length: 6 }, () => ({ pressed: false, value: 0 })), hapticActuators: [] });
  const M = window.__xrMock = { head: { o: [0, 1.6, 0], f: [0, -.42, -1] }, ray: null, session: null, frames: 0, pads: [null, null], pad };
  // the layer's framebuffer: a real one (three.js keys its state by it; null is the page canvas on the WebGL page, not here),
  // copied to the page canvas after each frame so the test can read both eyes
  class XRWebGLLayer { constructor(s, gl) { this.gl = gl; const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, fb = gl.createFramebuffer(), c = gl.createRenderbuffer(), d = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, c); gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8 || gl.RGBA4, w, h); gl.bindRenderbuffer(gl.RENDERBUFFER, d); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8 || gl.DEPTH_STENCIL, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, d);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindRenderbuffer(gl.RENDERBUFFER, null); this.framebuffer = fb; this.w = w; this.h = h; M.layer = this; }
    blit() { const gl = this.gl; if (!gl.blitFramebuffer) return; gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer); } get framebufferWidth() { return this.w; } get framebufferHeight() { return this.h; }
    getViewport(v) { const w = this.framebufferWidth / 2; return { x: v.eye === 'left' ? 0 : w, y: 0, width: w, height: this.framebufferHeight }; } }
  window.XRWebGLLayer = XRWebGLLayer;
  WebGLRenderingContext.prototype.makeXRCompatible = function () { return Promise.resolve(); };
  if (window.WebGL2RenderingContext) WebGL2RenderingContext.prototype.makeXRCompatible = function () { return Promise.resolve(); };
  try { Object.defineProperty(window, 'XRWebGLBinding', { configurable: true, writable: true, value: undefined }); } catch { /* not defined */ }
  try { Object.defineProperty(window, 'XRGPUBinding', { configurable: true, writable: true, value: undefined }); } catch { /* not defined */ }
  class Session { constructor(mode) { this.mode = mode; this.ev = {}; this.enabledFeatures = ['local-floor']; this.renderState = { depthNear: .1, depthFar: 1000 }; this.cb = null; this.srcs = [{ targetRayMode: 'tracked-pointer', handedness: 'right', targetRaySpace: { ray: 0 }, get gamepad() { return M.pads[0]; } }, { targetRayMode: 'tracked-pointer', handedness: 'left', targetRaySpace: { ray: 1 }, get gamepad() { return M.pads[1]; } }]; }
    get inputSources() { return [M.ray, M.ray2].map((r, i) => r ? this.srcs[i] : null).filter(Boolean); }
    updateRenderState(s) { Object.assign(this.renderState, s); } requestReferenceSpace(t) { return Promise.resolve({ t }); }
    requestAnimationFrame(cb) { this.cb = cb; return 1; } cancelAnimationFrame() { this.cb = null; } addEventListener(n, f) { (this.ev[n] ||= []).push(f); } removeEventListener(n, f) { const l = this.ev[n]; if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } }
    end() { for (const f of [...(this.ev.end || [])]) f({}); M.session = null; return Promise.resolve(); }
    frame() { const L = this.renderState.baseLayer, a = (L.framebufferWidth / 2) / L.framebufferHeight, h = M.head, f = nrm(h.f), r = nrm(cross(f, [0, 1, 0]));
      const view = (eye, s) => { const o = h.o.map((v, i) => v + r[i] * s * .032); return { eye, projectionMatrix: persp(1.6, a, this.renderState.depthNear, this.renderState.depthFar), transform: pose(o, f) }; };
      return { getViewerPose: () => ({ transform: pose(h.o, f), views: [view('left', -1), view('right', 1)] }), getPose: sp => { const r = sp.ray === 0 ? M.ray : sp.ray === 1 ? M.ray2 : null; return r ? { transform: pose(r.o, r.d) } : null; } }; }
    step() { const cb = this.cb; this.cb = null; if (cb) { M.frames++; cb(performance.now(), this.frame()); const L = this.renderState.baseLayer; if (L && L.blit) L.blit(); } }
    send(n, i) { const fr = this.frame(); for (const f of this.ev[n] || []) f({ inputSource: this.srcs[i], frame: fr }); }
    select(i = 0) { this.send('selectstart', i); this.send('selectend', i); } }
  Object.defineProperty(navigator, 'xr', { configurable: true, value: { isSessionSupported: m => Promise.resolve(m === 'immersive-vr' || m === 'immersive-ar'), requestSession: m => Promise.resolve(M.session = new Session(m)) } });   // Chromium's own navigator.xr is a getter: plain assignment is ignored
  M.step = () => M.session && M.session.step(); M.select = (i = 0) => M.session && M.session.select(i);
  M.press = (i = 0) => M.session && M.session.send('selectstart', i); M.release = (i = 0) => M.session && M.session.send('selectend', i);
})();
