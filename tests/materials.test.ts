// Surface materials travel in the normal's length (materials.ts); the Sloane Square area is tagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, hex } from '../src/engine/geometry';
import { MAT, tagColour } from '../src/engine/materials';
import { osmMap, OSM } from '../src/map/osmMap';
import { buildSquareNature } from '../src/map/landmarks/sloaneSquare';

const matsOf = (d: ArrayLike<number>) => { const m = new Map<number, number>(); for (let i = 0; i < d.length; i += 9) { const k = Math.round(Math.hypot(d[i + 3], d[i + 4], d[i + 5])) - 1; m.set(k, (m.get(k) ?? 0) + 1); } return m; };

test('material ids round-trip through the builder, transforms and append, and untagged geometry stays plain', () => {
  const red = tagColour(hex('#123456'), MAT.BRICK);
  const b = new MeshBuilder();
  b.box(0, 0, 0, 1, 1, 1, red);
  b.mat = MAT.PJGLASS; b.quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], hex('#654321')); b.mat = -1;
  b.flat(0, 0, 1, 1, 0, hex('#abcdef'));
  const c = new MeshBuilder();
  c.setTransform(new Float32Array([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 5, 0, 5, 1]));
  c.append(b);
  for (const d of [b.data, c.data]) {
    const m = matsOf(d);
    assert.equal(m.get(MAT.BRICK), 30);
    assert.equal(m.get(MAT.PJGLASS), 6);
    assert.equal(m.get(0), 6);
  }
});

test('the Sloane Square area carries its surface materials', () => {
  const m = matsOf(osmMap.buildStatic().toFloat32());
  for (const k of [MAT.PAVING, MAT.ASPHALT, MAT.BRICK, MAT.STONE, MAT.PJGLASS, MAT.SHOPGLASS, MAT.BRONZE, MAT.KERB]) assert.ok((m.get(k) ?? 0) > 100, `material ${k} present (${m.get(k) ?? 0} vertices)`);
});

test('the fountain has translucent falling water separate from the pool, and bark is marked on the trees', () => {
  const n = buildSquareNature(OSM.square!);
  assert.ok(n.falls.length / 13 > 300, 'falling-water vertices');
  assert.ok(n.water.length / 13 > 30, 'pool vertices');
  let bark = 0;
  for (let i = 0; i < n.branches.length; i += 13) if (n.branches[i + 9] === -1) bark++;
  assert.ok(bark > 1000, `trunks and limbs marked as bark (${bark} of ${n.branches.length / 13} vertices)`);
});
