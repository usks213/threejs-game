import * as THREE from 'three';
import type { FieldData } from '../../world/field-data';
import { FIELD_MAX_STEPS, fieldNormal, fieldRayInterval, intersectFieldRay } from './field-raycast';
import { fieldFragmentShader, fieldVertexShader } from './field-shader';
import { fieldSurfaceBounds } from './field-bounds';

interface FieldEntry {
  data: FieldData;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial> | null;
  texture: THREE.Data3DTexture | null;
}

/**
 * Experimental mesh-free surface renderer. The only triangles are twelve proxy
 * box faces per nonempty brick; density never becomes a surface vertex buffer.
 * This bounded, local prototype intentionally does not claim PBR/shadow parity.
 */
export function createFieldTerrain(scene: THREE.Scene) {
  const entries = new Map<string, FieldEntry>(), geometry = new THREE.BoxGeometry(1, 1, 1);
  const adventure={value:0};
  const sunlight = { value: new THREE.Color(3.2, 3.0, 2.7) };
  const sunDirection = { value: new THREE.Vector3(.5, .8, -.3).normalize() };
  const pointLights={value:Array.from({length:5},()=>new THREE.Vector4())},pointColors={value:Array.from({length:5},()=>new THREE.Color())},fogColor={value:new THREE.Color()},fogRange={value:new THREE.Vector3()};
  const lamps:THREE.PointLight[]=[];scene.traverse(object=>{if(object instanceof THREE.PointLight&&lamps.length<5)lamps.push(object);});
  const ambient = { value: new THREE.Color(.20, .25, .31) };
  const sunPosition = new THREE.Vector3(), targetPosition = new THREE.Vector3();
  let sun: THREE.DirectionalLight | undefined, active: ReadonlySet<string> | null = null, disposed = false;
  scene.traverse(object => { if (!sun && object instanceof THREE.DirectionalLight) sun = object; });
  const stats = { uploadSubmissionMs: 0, bytes: 0, count: 0, warmed: false, residentBricks: 0, surfaceBricks: 0, residentBytes: 0, maxSteps: FIELD_MAX_STEPS, surfaceTriangles: 0 };
  const raycastStats = { boxes: 0, candidates: 0 };
  function remove(id: string) {
    const entry = entries.get(id); if (!entry) return;
    if (entry.mesh) { scene.remove(entry.mesh); entry.mesh.material.dispose(); stats.surfaceBricks--; }
    if (entry.texture) { stats.residentBytes -= entry.texture.image.data.byteLength; entry.texture.dispose(); }
    entries.delete(id); stats.residentBricks = entries.size;
  }
  function validate(data: FieldData) {
    if (!Number.isInteger(data.size) || data.size < 2 || data.size > 33 || !Number.isFinite(data.step) || data.step <= 0 ||
      ![data.origin.x, data.origin.y, data.origin.z].every(Number.isFinite) || data.density.length !== data.size ** 3) throw new Error('Invalid density brick layout');
    let min = Infinity, max = -Infinity;
    for (const value of data.density) {
      if (!Number.isFinite(value) || Math.abs(value) > 65504) throw new Error('Density brick exceeds finite half-float range');
      min = Math.min(min, value); max = Math.max(max, value);
    }
    return min <= 0 && max >= 0;
  }
  return {
    update(data: FieldData, renderer?: THREE.WebGLRenderer) {
      if (disposed) throw new Error('Field terrain is disposed');
      const started = performance.now(), bounds = validate(data) ? fieldSurfaceBounds(data) : null;
      let mesh: FieldEntry['mesh'] = null, texture: THREE.Data3DTexture | null = null;
      if (bounds) {
        // R16F is linearly filterable in core WebGL2. R32F linear filtering would
        // require OES_texture_float_linear, which is not universal on phones.
        const values = new Uint16Array(data.density.length);
        for (let i = 0; i < values.length; i++) values[i] = THREE.DataUtils.toHalfFloat(data.density[i]);
        texture = new THREE.Data3DTexture(values, data.size, data.size, data.size);
        texture.format = THREE.RedFormat; texture.type = THREE.HalfFloatType;
        texture.minFilter = texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.NoColorSpace; texture.unpackAlignment = 1;
        texture.generateMipmaps = false; texture.needsUpdate = true;
        const material = new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3, side: THREE.BackSide, depthTest: true, depthWrite: true,
          vertexShader: fieldVertexShader, fragmentShader: fieldFragmentShader,
          uniforms: {
            fieldDensity: { value: texture }, fieldOrigin: { value: new THREE.Vector3(data.origin.x, data.origin.y, data.origin.z) },
            fieldBoundsMin: { value: new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z) },
            fieldBoundsMax: { value: new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z) },
            fieldAdventure:adventure,fieldStep: { value: data.step }, fieldSize: { value: data.size }, fieldCameraNear: { value: .1 },
            fieldSunDirection: sunDirection, fieldSunColor: sunlight, fieldAmbient: ambient,fieldPointLights:pointLights,fieldPointColors:pointColors,fieldFogColor:fogColor,fieldFogRange:fogRange,
          },
        });
        mesh = new THREE.Mesh(geometry, material); mesh.name = `density:${data.id}`;
        // The proxy encloses every potentially crossing trilinear cell, not
        // uniform air/solid slabs. Texture coordinates still use the full brick.
        mesh.position.set((bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2);
        mesh.scale.set(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z); mesh.updateMatrixWorld(true);
        mesh.visible = active === null || active.has(data.id);
        // A normal/depth override material would render the cube instead of the
        // field. This prototype uses the direct beauty path; no proxy shadows.
        mesh.castShadow = false; mesh.receiveShadow = false;
        mesh.onBeforeRender = (_renderer, _scene, camera) => {
          material.uniforms.fieldCameraNear.value = camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera ? camera.near : .1;
        };
        try { if (renderer) renderer.initTexture(texture); }
        catch (error) { texture.dispose(); material.dispose(); throw error; }
      }
      // Keep the previous visible brick until the replacement texture is ready.
      remove(data.id); entries.set(data.id, { data, mesh, texture });
      if (mesh) { scene.add(mesh); stats.surfaceBricks++; }
      const bytes = texture?.image.data.byteLength ?? 0;
      stats.residentBytes += bytes; stats.residentBricks = entries.size;
      stats.bytes += bytes; stats.count++; stats.uploadSubmissionMs += performance.now() - started;
      if (renderer) stats.warmed = true;
    },
    setActive(ids: readonly string[]) {
      active = new Set(ids);
      for (const [id, entry] of entries) if (entry.mesh) entry.mesh.visible = active.has(id);
    },
    // Shader compilation happens on the first direct render. This synchronous
    // compatibility hook does not claim to have compiled it ahead of time.
    prepareUploads(_renderer: THREE.WebGLRenderer) {},
    beginUploadFrame() { stats.bytes = 0; stats.count = 0; stats.uploadSubmissionMs = 0; },
    stats, raycastStats,
    ids: () => [...entries.keys()], has: (id: string) => entries.has(id),
    updateDetails(_player: THREE.Vector3, _seconds: number) {
      adventure.value=scene.userData.generator===4?1:0;
      for(let i=0;i<5;i++){const lamp=lamps[i];pointLights.value[i].set(lamp?.position.x??0,lamp?.position.y??0,lamp?.position.z??0,lamp&&lamp.intensity>0?lamp.distance:0);pointColors.value[i].copy(lamp?.color??ambient.value).multiplyScalar(lamp?.intensity??0);}
      if(scene.fog instanceof THREE.Fog){fogColor.value.copy(scene.fog.color);fogRange.value.set(scene.fog.near,scene.fog.far,1);}else fogRange.value.z=0;
      if (!sun) return;
      sun.getWorldPosition(sunPosition); sun.target.getWorldPosition(targetPosition);
      sunDirection.value.copy(sunPosition).sub(targetPosition).normalize();
      sunlight.value.copy(sun.color).multiplyScalar(sun.intensity);
      const daylight = .12 + .88 * THREE.MathUtils.clamp(sun.intensity / 1.2, 0, 1);
      ambient.value.setRGB(.20 * daylight, .25 * daylight, .31 * daylight);
    },
    remove(ids: readonly string[]) { ids.forEach(remove); },
    raycast(raycaster: THREE.Raycaster): THREE.Intersection | undefined {
      raycastStats.boxes = 0; raycastStats.candidates = 0;
      let nearest: THREE.Intersection | undefined, far = Math.min(raycaster.far, 32);
      for (const [id, entry] of entries) {
        if (!entry.mesh || (active && !active.has(id))) continue;
        raycastStats.boxes++;
        const interval = fieldRayInterval(raycaster.ray, entry.data, raycaster.near, far);
        if (!interval) continue;
        raycastStats.candidates++;
        const distance = intersectFieldRay(raycaster.ray, entry.data, interval);
        if (distance === null) continue;
        const point = raycaster.ray.at(distance, new THREE.Vector3()), normal = fieldNormal(entry.data, point);
        // The reticle transforms face directions through object.matrixWorld.
        // Counteract the proxy's nonuniform scale; it must not tilt the actual
        // density normal. The explicit normal remains in world coordinates.
        const faceNormal = normal.clone().divide(entry.mesh.scale).normalize();
        nearest = { distance, point, object: entry.mesh, normal, face: { a: 0, b: 0, c: 0, normal: faceNormal, materialIndex: 0 } };
        far = distance;
      }
      return nearest;
    },
    dispose() { if (disposed) return; disposed = true; [...entries.keys()].forEach(remove); geometry.dispose(); },
  };
}
