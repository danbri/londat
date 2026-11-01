// Checked-road playback is only valid for the base perspective camera with one owner.
// This is a practical gate for the page's known camera modes, not protection from arbitrary script mutation.
export function cityCameraConflict({ styleMode, globe = false, xrFrame = false, xrPresenting = false, drone = false, locateMode, autoRotate = false, enableDamping = false } = {}) {
  if (globe) return 'globe camera';
  if (styleMode === 'pixel') return 'pixel orthographic camera';
  if (xrFrame || xrPresenting) return 'XR camera';
  if (drone) return 'drone camera';
  if (['centred', 'heading', 'eye'].includes(locateMode)) return 'geolocation follow camera';
  if (autoRotate) return 'automatic orbit rotation';
  if (enableDamping) return 'orbit damping';
  return null;
}
export const canRestoreFlightControls = ({ checkedCity = false, cameraConflict = null } = {}) => !checkedCity || cameraConflict === null || ['automatic orbit rotation', 'orbit damping'].includes(cameraConflict);

// Rotation/damping are incompatible updates, not owners of controls.enabled: cancellation must restore navigation.
