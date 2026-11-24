// Upload only the first n items of a buffer attribute that changes every frame (2026-11-24): an instance buffer sized for
// the most instances (wildlife: 32,768 x 4 floats each, three of them) was sent whole each frame, about 1.5 MB a frame
// for a few hundred animals. three.js r186 honours attribute update ranges on WebGL 2 and WebGPU.
// Skill: docklands-3d-page, "Frame cost by cause".
export function uploadFirst(attr, n) {
  if (!attr) return;
  attr.clearUpdateRanges();
  if (n > 0) attr.addUpdateRange(0, n * attr.itemSize);
  attr.needsUpdate = true;
}
