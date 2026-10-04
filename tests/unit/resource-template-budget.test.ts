import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createResources } from '../../src/rendering/game/resources';
import { disposeSurfaceMaps } from '../../src/rendering/materials/pbr';
import { treeVoxels } from '../../src/game/voxel/model';
import { environmentAt } from '../../src/environment/time';
import type { AdventureSnapshot, ResourceNode } from '../../src/game/types';

const views: ReturnType<typeof createResources>[] = [];
function snapshot(resources: ResourceNode[]): AdventureSnapshot {
  return { seconds: 1, health: 25, stamina: 50, mana: 0, inventory: {}, equipment: 'hand', unlocked: 1,
    defeated: [], resources, enemies: [], buildings: [], death: null, food: 0, rested: 0, spawn: null,
    environment: environmentAt(1, 1), generator: 3, biome: 'verdant', objective: '', projectiles: [],
    guarding: false, dodging: false, attack: 0, wet: false };
}
const nodes = (): ResourceNode[] => ['beech', 'oak', 'birch'].map((kind, id) => ({ id, kind, x: id * 8, y: 0, z: 0, ready: 0, amount: 10 }));
function setup(direct = true) {
  const scene = new THREE.Scene(), view = createResources(scene, direct); views.push(view);
  return { scene, view, baseCount: scene.children.length, trunks: scene.children[1] as THREE.InstancedMesh };
}
beforeEach(() => {
  // Only the decorative leaf atlas needs a DOM canvas. Geometry, model creation,
  // materials and instance matrices below are real Three.js objects, with no GPU.
  const context = new Proxy({}, { get: () => () => {}, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
});
afterEach(() => { views.splice(0).forEach(view => view.dispose()); vi.unstubAllGlobals(); });
afterAll(disposeSurfaceMaps);

describe('direct-mode tree template admission', () => {
  it('builds one new template per update while keeping all deferred trees visible', () => {
    const { scene, view, baseCount, trunks } = setup(), state = snapshot(nodes());
    for (let admitted = 1; admitted <= 3; admitted++) {
      view.update(state);
      expect(scene.children.length).toBe(baseCount + admitted * 2);
      expect(trunks.count).toBe(3 - admitted);
      const fullParts = scene.children.slice(baseCount) as THREE.InstancedMesh[];
      expect(fullParts.reduce((count, part) => count + part.count, 0)).toBe(admitted * 2);
    }
    view.update(state); expect(scene.children.length).toBe(baseCount + 6);
    expect(trunks.count).toBe(0);
  });
  it('preserves immediate full-template creation in normal mode', () => {
    const { scene, view, baseCount, trunks } = setup(false);
    view.update(snapshot(nodes()));
    expect(scene.children.length).toBe(baseCount + 6); expect(trunks.count).toBe(0);
  });
  it('uses the latest snapshot rather than publishing stale pending trees', () => {
    const { scene, view, baseCount, trunks } = setup();
    view.update(snapshot(nodes())); expect(scene.children.length).toBe(baseCount + 2);
    view.update(snapshot([])); expect(scene.children.length).toBe(baseCount + 2);
    expect((scene.children as THREE.InstancedMesh[]).every(mesh => mesh.count === 0)).toBe(true);
    const tree = nodes()[0]; view.update(snapshot([tree]));
    expect(scene.children.length).toBe(baseCount + 2); expect(trunks.count).toBe(0);
    const future = { ...nodes()[1], ready: 100 }; view.update(snapshot([tree, future]));
    expect(scene.children.length).toBe(baseCount + 2);
  });
  it('preserves damaged-tree replacement and disposes owned template geometry exactly once', () => {
    const { scene, view, baseCount } = setup(), tree = nodes()[0];
    view.update(snapshot([tree]));
    const template = scene.children[baseCount] as THREE.InstancedMesh, disposeTemplate = vi.spyOn(template.geometry, 'dispose');
    const removed = [treeVoxels(tree.kind, tree.id).cells.keys().next().value!];
    view.update(snapshot([{ ...tree, removed }]));
    const damaged = scene.children.find(child => child instanceof THREE.Group) as THREE.Group;
    const damagedGeometry = (damaged.children[0] as THREE.Mesh).geometry, disposeDamaged = vi.spyOn(damagedGeometry, 'dispose');
    expect(template.count).toBe(0); expect(damaged).toBeDefined();
    view.update(snapshot([{ ...tree, kind: 'stump' }]));
    expect(disposeDamaged).toHaveBeenCalledTimes(1); expect(disposeTemplate).not.toHaveBeenCalled();
    view.update(snapshot([tree])); expect(template.count).toBe(1);
    views.splice(views.indexOf(view), 1); view.dispose();
    expect(disposeTemplate).toHaveBeenCalledTimes(1); expect(scene.children).toHaveLength(0);
  });
});
