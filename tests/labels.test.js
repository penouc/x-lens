import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../content.js', import.meta.url), 'utf8');

test('visible category labels are bilingual', () => {
  assert.match(source, /'slop \/ 垃圾'/);
  assert.match(source, /'Ad \/ 广告'/);
  assert.match(source, /'AI'/);
});

test('automatic slop prompt uses the bilingual label', () => {
  assert.match(source, /X Lens · slop \/ 垃圾/);
});
