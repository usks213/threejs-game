import * as THREE from 'three';

/** Opt-in, one-shot regression diagnostic. Uses live water geometry/material, never the
 * main framebuffer, and compares the same water/sun with and without environment light.
 * Call only after water has upward-facing triangles and the direct SH capture is ready.
 */
export async function probeWaterLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene, water: THREE.Mesh) {
  const position = water.geometry.getAttribute('position'), normal = water.geometry.getAttribute('normal');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), center = new THREE.Vector3();
  let radius = 0;
  for (let i = water.geometry.drawRange.start; i + 2 < Math.min(position.count, water.geometry.drawRange.start + water.geometry.drawRange.count); i += 3) {
    if (normal.getY(i) < .5 || normal.getY(i + 1) < .5 || normal.getY(i + 2) < .5) continue;
    a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
    const perimeter = a.distanceTo(b) + b.distanceTo(c) + c.distanceTo(a);
    const area = new THREE.Triangle(a, b, c).getArea();
    if (area < .001) continue;
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3); radius = area * 2 / perimeter; break;
  }
  if (!radius) throw new Error('Water lighting probe requires a live upward-facing water triangle');
  water.updateWorldMatrix(true, false); center.applyMatrix4(water.matrixWorld);
  const half = Math.min(.1, radius * .35), camera = new THREE.OrthographicCamera(-half, half, half, -half, .1, 4);
  camera.position.copy(center).add(new THREE.Vector3(0, 2, 0)); camera.up.set(0, 0, -1); camera.lookAt(center);
  const sample = new THREE.Scene(), mesh = water.clone();
  mesh.matrixAutoUpdate = false; mesh.matrix.copy(water.matrixWorld); mesh.frustumCulled = false;
  sample.add(mesh); sample.environment = scene.environment; sample.environmentIntensity = scene.environmentIntensity;
  for (const child of scene.children) if (child instanceof THREE.Light) {
    const light = child.clone(); light.castShadow = false; sample.add(light);
    if (light instanceof THREE.DirectionalLight) sample.add(light.target);
  }
  const size = 16, litTarget = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType });
  const darkTarget = litTarget.clone(), lit = new Uint16Array(size * size * 4), baseline = new Uint16Array(lit.length);
  const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
  const color = renderer.getClearColor(new THREE.Color()).clone(), alpha = renderer.getClearAlpha();
  const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
  const autoClear = renderer.autoClear, xr = renderer.xr.enabled, shadows = renderer.shadowMap.enabled;
  let reads: Promise<unknown>[] = [];
  try {
    try {
      renderer.autoClear = true; renderer.xr.enabled = false; renderer.shadowMap.enabled = false; renderer.setClearColor(0, 0);
      renderer.setRenderTarget(litTarget); renderer.render(sample, camera);
      reads.push(renderer.readRenderTargetPixelsAsync(litTarget, 0, 0, size, size, lit));
      sample.environment = null;
      for (const light of sample.children) if (light instanceof THREE.LightProbe) light.intensity = 0;
      renderer.setRenderTarget(darkTarget); renderer.render(sample, camera);
      reads.push(renderer.readRenderTargetPixelsAsync(darkTarget, 0, 0, size, size, baseline));
    } finally {
      renderer.setRenderTarget(target, face, mip); renderer.setClearColor(color, alpha);
      renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      renderer.autoClear = autoClear; renderer.xr.enabled = xr; renderer.shadowMap.enabled = shadows;
    }
    await Promise.all(reads);
    let litEnergy = 0, baselineEnergy = 0, invalidPixels = 0, waterPixels = 0;
    for (let i = 0; i < lit.length; i += 4) {
      const values = [lit[i], lit[i + 1], lit[i + 2], baseline[i], baseline[i + 1], baseline[i + 2]].map(THREE.DataUtils.fromHalfFloat);
      if (!values.every(Number.isFinite)) { invalidPixels++; continue; }
      if (THREE.DataUtils.fromHalfFloat(lit[i + 3]) > .1) waterPixels++;
      litEnergy += values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
      baselineEnergy += values[3] * .2126 + values[4] * .7152 + values[5] * .0722;
    }
    return { waterPixels, invalidPixels, litEnergy: litEnergy / (size * size), baselineEnergy: baselineEnergy / (size * size), environmentGain: (litEnergy - baselineEnergy) / (size * size) };
  } finally {
    // Even a failed second render must not release a target while its first read is pending.
    await Promise.allSettled(reads); litTarget.dispose(); darkTarget.dispose();
  }
}
