import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selfTest, mapLegacy, kid, ID_BASE } from '../kgx-ids.mjs';

test('kgx-ids: code table, idempotence, unchanged IRIs, error cases', () => {
  assert.ok(selfTest() > 30);
});

test('kgx-ids: kid at the source and mapLegacy of the old name give one ID', () => {
  assert.equal(kid('coverage', '2026-10-06', 'openaerialmap', 'canary-wharf', 'licence-CC-BY-4.0'),
    mapLegacy('https://danbri.github.io/londat/kgx/id/coverage/2026-10-06/openaerialmap/canary-wharf/licence-CC-BY-4.0'));
  assert.equal(kid('facade-tile', 'cwdock', 'brick-tower-17', 'for', 'brick-tower-17'), ID_BASE + 'tilecwdockbricktower17forbricktower17');
  assert.equal(mapLegacy('urn:cwplans:local:data/raw/uprn-amend/'), ID_BASE + 'localdatarawuprnamend');
});
