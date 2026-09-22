import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWeaponIconName } from '../src/components/weaponIconName.js';

test('Demo weapon variants use the longest recognized prefix', () => {
  assert.equal(normalizeWeaponIconName('usp_silencer_txz09'), 'usp_silencer');
  assert.equal(normalizeWeaponIconName('weapon_usp_silencer_txz09'), 'usp_silencer');
  assert.equal(normalizeWeaponIconName('weapon_m4a1_silencer_txz09'), 'm4a1_silencer');
  assert.equal(normalizeWeaponIconName('weapon_ak47_txz09'), 'ak47');
  assert.equal(normalizeWeaponIconName('glock_vip'), 'glock');
  assert.equal(normalizeWeaponIconName('weapon_glock_vip'), 'glock');
  assert.equal(normalizeWeaponIconName('weapon_m4a1_silencer_off_vip'), 'm4a1_silencer_off');
  assert.equal(normalizeWeaponIconName('weapon_usp_silencer'), 'usp_silencer');
  assert.equal(normalizeWeaponIconName('glockenspiel'), 'glockenspiel');
  assert.equal(normalizeWeaponIconName('ak47foo'), 'ak47foo');
  assert.equal(normalizeWeaponIconName('unknown_vip'), 'unknown_vip');
});
