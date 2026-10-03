import { afterAll, expect, test } from 'vitest';
import { SRGBColorSpace, NoColorSpace } from 'three';
import { pbrMaterial, surfaceMaps, disposeSurfaceMaps, type Surface } from '../../src/rendering/materials/pbr';
afterAll(disposeSurfaceMaps);
test('PBR textures preserve albedo/data color spaces and separate metal from dielectric surfaces',()=>{
 const kinds:Surface[]=['stone','wood','cloth','leather','skin','foliage','metal','crystal'];
 for(const kind of kinds){const textures=surfaceMaps(kind),material=pbrMaterial('#aaaaaa',kind);
  expect(textures.map.colorSpace).toBe(SRGBColorSpace);expect(textures.normalMap.colorSpace).toBe(NoColorSpace);expect(textures.roughnessMap.colorSpace).toBe(NoColorSpace);
  expect(material.metalness).toBe(kind==='metal'?1:0);expect(material.roughness).toBeGreaterThan(0);expect(material.roughness).toBeLessThanOrEqual(1);
  const data=textures.normalMap.image.data!;for(let i=2;i<data.length;i+=4)expect(data[i]).toBeGreaterThan(200);
  expect(surfaceMaps(kind)).toBe(textures);material.dispose();
 }
});
