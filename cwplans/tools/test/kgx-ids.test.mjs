import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selfTest, mapLegacy, kid, ID_BASE, VOCAB, REGISTER_VOCAB, IDIOMS_VOCAB } from '../kgx-ids.mjs';

test('kgx-ids: code table, idempotence, unchanged IRIs, error cases', () => {
  assert.ok(selfTest() > 30);
});

test('kgx-ids: kid at the source and mapLegacy of the old name give one ID', () => {
  assert.equal(kid('coverage', '2026-10-06', 'openaerialmap', 'canary-wharf', 'licence-CC-BY-4.0'),
    mapLegacy('https://danbri.github.io/londat/kgx/id/coverage/2026-10-06/openaerialmap/canary-wharf/licence-CC-BY-4.0'));
  assert.equal(kid('facade-tile', 'cwdock', 'brick-tower-17', 'for', 'brick-tower-17'), ID_BASE + 'tilecwdockbricktower17forbricktower17');
  assert.equal(mapLegacy('urn:cwplans:local:data/raw/uprn-amend/'), ID_BASE + 'localdatarawuprnamend');
});

test('kgx-ids: vocabulary terms move to https://kgx.foaf.tv/ with their local names', () => {
  assert.equal(mapLegacy('https://danbri.github.io/londat/kgx/vocab#Building'), VOCAB + 'Building');
  assert.equal(mapLegacy('https://danbri.github.io/glitchcan-minigam/magpie/cwplans/data-register.json#vocab/osmUse'), REGISTER_VOCAB + 'osmUse');
  assert.equal(mapLegacy('https://danbri.github.io/glitchcan-minigam/third_party/cwplans-structured-data/idioms/idioms.shex#HoursText'), IDIOMS_VOCAB + 'HoursText');
  assert.equal(VOCAB, 'https://kgx.foaf.tv/vocab#');
  assert.equal(REGISTER_VOCAB, 'https://kgx.foaf.tv/pipeline#');
  assert.equal(IDIOMS_VOCAB, 'https://kgx.foaf.tv/idioms#');
});
