import test from 'node:test';
import assert from 'node:assert/strict';
import { cityCameraConflict, canRestoreFlightControls } from '../city-camera-gate.js';

test('base perspective modes and idle location permit checked city playback', () => {
 for(const styleMode of [undefined,'map','paint','lines','vectrex'])for(const locateMode of [undefined,'off','idle'])assert.equal(cityCameraConflict({styleMode,locateMode}),null);
});
test('alternate rendered cameras and known active owners reject checked playback', () => {
 const cases=[[{globe:true},'globe camera'],[{styleMode:'pixel'},'pixel orthographic camera'],[{xrFrame:true},'XR camera'],[{xrPresenting:true},'XR camera'],[{drone:true},'drone camera'],[{autoRotate:true},'automatic orbit rotation'],[{enableDamping:true},'orbit damping']];
 for(const locateMode of ['centred','heading','eye'])cases.push([{locateMode},'geolocation follow camera']);
 for(const [state,reason]of cases)assert.equal(cityCameraConflict(state),reason);
});
test('a city flight does not restore saved controls over another camera owner', () => {
 for(const state of [{styleMode:'pixel'},{globe:true},{xrPresenting:true},{drone:true},{locateMode:'eye'}])assert.equal(canRestoreFlightControls({checkedCity:true,cameraConflict:cityCameraConflict(state)}),false);
 for(const state of [{autoRotate:true},{enableDamping:true}])assert.equal(canRestoreFlightControls({checkedCity:true,cameraConflict:cityCameraConflict(state)}),true);
 assert.equal(canRestoreFlightControls({checkedCity:true,cameraConflict:null}),true);
 assert.equal(canRestoreFlightControls({checkedCity:false,cameraConflict:'drone camera'}),true);
});
