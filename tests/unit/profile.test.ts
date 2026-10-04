import { it, expect } from 'vitest';
import { SdfWorld } from '../../src/world/density';
import { visibleBricks } from '../../src/world/streaming';
import { meshBrick } from '../../src/world/mesher';
it('profiles a streamed spawn area within a bounded triangle budget', () => {
 const world = new SdfWorld(), bricks = visibleBricks({x:0,y:3,z:8});
 const started = performance.now(); let triangles = 0, detailedTriangles=0, draws = 0, bytes = 0, slowest = 0;
 for (const brick of bricks.values()) {
  const mesh = meshBrick(world, brick); detailedTriangles+=mesh.indices.length/3;const distance=Math.hypot(brick.origin.x+4,brick.origin.y+4-4.3,brick.origin.z+4-15);triangles += (distance>28&&mesh.coarse?.indices.length?mesh.coarse:mesh).indices.length / 3;
  if (mesh.indices.length) draws++;
  bytes += mesh.positions.byteLength + mesh.normals.byteLength + mesh.colors.byteLength + mesh.indices.byteLength;
  slowest = Math.max(slowest, mesh.milliseconds);
 }
 console.info(JSON.stringify({profile:'spawn terrain / Node, not a mobile FPS result',bricks:bricks.size,draws,triangles,detailedTriangles,geometryBytes:bytes,loadMs:Math.round(performance.now()-started),slowestBrickMs:Math.round(slowest)}));
 expect(triangles).toBeLessThan(180000); expect(draws).toBeLessThan(240);
},15000);

