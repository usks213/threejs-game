import { describe, expect, it } from 'vitest';
import { buildStadiumSurfaceGeometry } from '../../../src/beyblade/rendering/arena';
import { bowlHeightAt, bowlNormalAt, pocketFloorAt, getBankSampleRadii, STADIUM } from '../../../src/beyblade/core/physics';

describe('shared continuous stadium bank mesh', () => {
  it('samples only the physical floor through the bank, apron and pocket ramp', () => {
    const geometry = buildStadiumSurfaceGeometry(), positions = geometry.getAttribute('position');
    let outer = 0;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      expect(Number.isFinite(y)).toBe(true);
      expect(Math.abs(y - bowlHeightAt(x, z))).toBeLessThan(8e-8);
      if (Math.hypot(x, z) > STADIUM.radius) outer++;
    }
    expect(outer).toBeGreaterThan(0); geometry.dispose();
  });
  it('includes every explicit narrow bank transition at a front and rear-notched ray', () => {
    const geometry = buildStadiumSurfaceGeometry(), positions = geometry.getAttribute('position');
    for (const angle of [0, Math.PI * 1.5]) for (const radius of getBankSampleRadii(angle, [0, .0015, .003, .0045, .006, ...[0, .0015, .003, .0045, .006].map(offset => STADIUM.bankOuterSlopeStart + offset)])) {
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      let distance = Infinity;
      for (let i = 0; i < positions.count; i++) distance = Math.min(distance, Math.hypot(positions.getX(i) - x, positions.getZ(i) - z));
      expect(distance).toBeLessThan(2e-8);
    }
    geometry.dispose();
  });
  it('does not bridge the catch ramps at triangle centroids', () => {
    const geometry = buildStadiumSurfaceGeometry(), positions = geometry.getAttribute('position'), indices = geometry.getIndex()!;
    let maximum = 0, pocketMaximum = 0;
    for (let i = 0; i < indices.count; i += 3) {
      let x = 0, y = 0, z = 0;
      for (let vertex = 0; vertex < 3; vertex++) { const index = indices.getX(i + vertex); x += positions.getX(index) / 3; y += positions.getY(index) / 3; z += positions.getZ(index) / 3; }
      const error = Math.abs(y - bowlHeightAt(x, z)); maximum = Math.max(maximum, error);
      if (pocketFloorAt(x, z) !== null) pocketMaximum = Math.max(pocketMaximum, error);
    }
    expect(maximum).toBeLessThan(.0006); expect(pocketMaximum).toBeLessThan(.00035);
    expect(geometry.getAttribute('color').count).toBe(positions.count); geometry.dispose();
  });
  it('keeps the measured triangle budget and uses physical surface normals', () => {
    const geometry = buildStadiumSurfaceGeometry(), positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    expect(geometry.getIndex()!.count / 3).toBeLessThan(25000);
    for (let i = 0; i < positions.count; i++) {
      const normal = bowlNormalAt(positions.getX(i), positions.getZ(i));
      expect(Math.hypot(normals.getX(i) - normal.x, normals.getY(i) - normal.y, normals.getZ(i) - normal.z)).toBeLessThan(.001);
    }
    geometry.dispose();
  });
  it('keeps shared adaptive edges conforming rather than leaving internal cracks', () => {
    const geometry = buildStadiumSurfaceGeometry(), positions = geometry.getAttribute('position'), indices = geometry.getIndex()!;
    const vertexKey = (i: number) => `${Math.round(positions.getX(i) * 1e7)}:${Math.round(positions.getZ(i) * 1e7)}`;
    const edges = new Map<string, { count: number; a: number; b: number }>();
    for (let i = 0; i < indices.count; i += 3) for (let side = 0; side < 3; side++) {
      const a = indices.getX(i + side), b = indices.getX(i + (side + 1) % 3), ka = vertexKey(a), kb = vertexKey(b);
      if (ka === kb) continue;
      const key = ka < kb ? `${ka}/${kb}` : `${kb}/${ka}`, edge = edges.get(key);
      if (edge) edge.count++; else edges.set(key, { count: 1, a, b });
    }
    // Subdivided outer-circle chords lie at most 0.074 mm inside the exact circle.
    // Every one-sided edge must remain in that perimeter band, never inside the playfield.
    for (const edge of edges.values()) if (edge.count === 1) {
      for (const index of [edge.a, edge.b]) expect(Math.abs(Math.hypot(positions.getX(index), positions.getZ(index)) - STADIUM.coverRadius)).toBeLessThan(.00008);
    }
    geometry.dispose();
  });
  it('has consistently upward-facing triangles instead of an invisible bank', () => {
    const geometry = buildStadiumSurfaceGeometry(), positions = geometry.getAttribute('position'), indices = geometry.getIndex()!;
    for (let i = 0; i < indices.count; i += 3) {
      const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
      const bax = positions.getX(b) - positions.getX(a), baz = positions.getZ(b) - positions.getZ(a);
      const cax = positions.getX(c) - positions.getX(a), caz = positions.getZ(c) - positions.getZ(a);
      expect(baz * cax - bax * caz).toBeGreaterThanOrEqual(-1e-12);
    }
    geometry.dispose();
  });
});
