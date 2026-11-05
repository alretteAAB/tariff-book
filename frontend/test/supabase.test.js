import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMulti, parseList } from '../functions/api/_supabase.js';

test('parseList keeps names with commas whole', () => {
  const p = new URLSearchParams();
  p.append('diagnosis', 'Pneumonia, unspecified');
  p.append('diagnosis', ' Typhoid fever ');
  p.append('diagnosis', '');
  assert.deepEqual(parseList(p, 'diagnosis'), ['Pneumonia, unspecified', 'Typhoid fever']);
  assert.equal(parseList(p, 'other'), null);
  // parseMulti (tarif tab) still splits "A,B"
  assert.deepEqual(parseMulti(new URLSearchParams('tahun=2025,2026'), 'tahun'), ['2025', '2026']);
});
