import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopComponents, buildTopMesh, setComponentPose } from '../../../src/beyblade/rendering/top-mesh';
import { getCenterOfMass } from '../../../src/beyblade/core/physics';
import { defaultBuild, profileFor } from '../../../src/beyblade/data/catalog';
const factory = (geometry: THREE.BufferGeometry, color: number) => new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color }));
const profile = profileFor(defaultBuild);
function dispose(root: THREE.Object3D) { root.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); object.material.dispose(); } }); }

describe('solver-driven component rendering', () => {
  it('assembled and separated builders reuse identical component geometry', () => {
    const assembled = buildTopMesh(profile, factory), components = buildTopComponents(profile, factory);
    for (const [i, component] of Object.values(components).entries()) {
      const actual = new THREE.Box3().setFromObject(component), expected = new THREE.Box3().setFromObject(assembled.children[i]);
      expect(actual.min.toArray()).toEqual(expected.min.toArray()); expect(actual.max.toArray()).toEqual(expected.max.toArray());
      expect(component.children.length).toBeGreaterThan(0); dispose(component);
    }
    dispose(assembled);
  });
  it('moves every visual vertex by the full COM without distorting the canonical inner rim or bit axis', () => {
    const centered = { ...profile, centerOfMass: { x: 0, y: .019, z: 0 } };
    const eccentric = { ...profile, centerOfMass: { x: .0013, y: .0205, z: -.0008 } };
    const before = buildTopMesh(centered, factory), after = buildTopMesh(eccentric, factory);
    before.updateMatrixWorld(true); after.updateMatrixWorld(true);
    const originalMeshes: THREE.Mesh[] = [], shiftedMeshes: THREE.Mesh[] = [];
    before.traverse(object => { if (object instanceof THREE.Mesh) originalMeshes.push(object); });
    after.traverse(object => { if (object instanceof THREE.Mesh) shiftedMeshes.push(object); });
    expect(shiftedMeshes.length).toBe(originalMeshes.length);
    const c0 = getCenterOfMass(centered), c1 = getCenterOfMass(eccentric), delta = new THREE.Vector3(c0.x - c1.x, c0.y - c1.y, c0.z - c1.z);
    for (const [index, original] of originalMeshes.entries()) {
      const shifted = shiftedMeshes[index], a = original.geometry.getAttribute('position'), b = shifted.geometry.getAttribute('position');
      expect(a.count).toBe(b.count);
      for (let vertex = 0; vertex < a.count; vertex++) {
        const expected = new THREE.Vector3().fromBufferAttribute(a, vertex).applyMatrix4(original.matrixWorld).add(delta);
        const actual = new THREE.Vector3().fromBufferAttribute(b, vertex).applyMatrix4(shifted.matrixWorld);
        expect(actual.distanceTo(expected)).toBeLessThan(1e-9);
      }
    }
    dispose(before); dispose(after);
  });
  it('changing origin to each fragment COM introduces no position jump, even while tilted', () => {
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.7, 1.2, -.3)), origin = new THREE.Vector3(.12, .035, -.07);
    const components = buildTopComponents({ ...profile, centerOfMass: { x: .0013, y: .0205, z: -.0008 } }, factory);
    for (const [i, shape] of Object.values(components).entries()) {
      const pose = new THREE.Group(); pose.add(shape);
      const localCenter = new THREE.Vector3(.001 * i, .004 - .007 * i, -.0005 * i), fragmentCenter = localCenter.clone().applyQuaternion(orientation).add(origin);
      setComponentPose(pose, shape, true, { ...fragmentCenter, orientation, componentLocalCenter: localCenter }); pose.updateMatrixWorld(true);
      const localVertex = new THREE.Vector3(.018, -.009, .006), expected = localVertex.clone().applyQuaternion(orientation).add(origin);
      expect(shape.localToWorld(localVertex).distanceTo(expected)).toBeLessThan(1e-14);
      expect(pose.visible).toBe(true); dispose(pose);
    }
  });
  it('reset restores assembled transforms, and missing solver fragments are not invented', () => {
    const pose = new THREE.Group(), shape = new THREE.Group(); pose.add(shape);
    setComponentPose(pose, shape, true, { x: 1, y: 2, z: 3, orientation: { x: 0, y: 1, z: 0, w: 0 }, componentLocalCenter: { x: .01, y: .02, z: .03 } });
    setComponentPose(pose, shape, true); expect(pose.visible).toBe(false);
    setComponentPose(pose, shape, false); expect(pose.visible).toBe(true);
    expect(pose.position.toArray()).toEqual([0, 0, 0]); expect(pose.quaternion.toArray()).toEqual([0, 0, 0, 1]); expect(shape.position.toArray()).toEqual([0, 0, 0]);
  });
});
