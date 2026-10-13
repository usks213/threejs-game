import { Material, MATERIALS } from './materials';
import type { CellWorld } from './materials';

export type Vec3 = readonly [number, number, number];
export interface SurfaceMaterial { roughness: number; metalness: number; f0: number; relief: number; albedo: Vec3 }
const linear = (value: number) => (value / 255) ** 2.2;
const material = (id: Material, roughness: number, metalness = 0, f0 = 0.04, relief = 0.2): SurfaceMaterial => ({ roughness, metalness, f0, relief, albedo: MATERIALS[id].color.map(linear) as unknown as Vec3 });
/** Rendering parameters only. They never change the cellular material rules. */
export const SURFACE_MATERIALS: readonly SurfaceMaterial[] = [
  material(Material.Air, 1, 0, 0, 0), material(Material.Rock, 0.87, 0, 0.04, 0.3),
  material(Material.HardRock, 0.65, 0, 0.045, 0.22), material(Material.Wood, 0.91, 0, 0.035, 0.13),
  material(Material.Sand, 0.98, 0, 0.025, 0.4), material(Material.Water, 0.17, 0, 0.02, 0.08),
  material(Material.Oil, 0.24, 0, 0.045, 0.07), material(Material.Toxic, 0.3, 0, 0.03, 0.08),
  material(Material.Lava, 0.75, 0, 0.035, 0.14), material(Material.Fire, 1, 0, 0, 0),
  material(Material.Smoke, 1, 0, 0, 0), material(Material.Steam, 1, 0, 0, 0),
  material(Material.Gold, 0.3, 0.92, 0.04, 0.2),
];
export const pixelNoise = (x: number, y: number) => ((Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0) % 17;
export function normalize(x: number, y: number, z: number): Vec3 { const length = Math.hypot(x, y, z) || 1; return [x / length, y / length, z / length]; }
/** A deliberately 2.5D height-field estimate, not reconstructed 3D geometry. */
export function surfaceNormal(world: CellWorld, x: number, y: number, time = 0): Vec3 {
  x = Math.floor(x); y = Math.floor(y);
  const id = world.get(x, y), surface = SURFACE_MATERIALS[id];
  if (id >= Material.Water && id <= Material.Lava) {
    const edge = world.get(x, y - 1) !== id ? -0.65 : 0;
    return normalize(Math.sin(x * 0.37 + time * 1.5) * 0.1, edge + Math.sin(x * 0.22 + y * 0.43 + time * 1.2) * 0.07, 1);
  }
  const solid = (xx: number, yy: number) => MATERIALS[world.get(xx, yy)].solid ? 1 : 0;
  const nx = (solid(x - 1, y) - solid(x + 1, y)) * 0.82;
  const ny = (solid(x, y - 1) - solid(x, y + 1)) * 0.82;
  const relief = surface?.relief ?? 0.2;
  return normalize(nx + (pixelNoise(x + 1, y) - pixelNoise(x - 1, y)) / 17 * relief, ny + (pixelNoise(x, y + 1) - pixelNoise(x, y - 1)) / 17 * relief, 1);
}
export interface SurfaceResponse { diffuse: Vec3; specular: Vec3 }
/** Cook–Torrance / GGX, Schlick Fresnel and Smith-Schlick visibility.
 * Reference: https://google.github.io/filament/Filament.md.html
 * View points out of the screen, and lights are lifted 18 cells above the 2D
 * sheet. Exposure is artistic; this is not a full radiometric/3D PBR renderer.
 */
export function surfaceResponse(surface: SurfaceMaterial, normal: Vec3, light: Vec3): SurfaceResponse {
  const n = normalize(...normal), l = normalize(...light), h = normalize(l[0], l[1], l[2] + 1);
  const noL = Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]);
  const noV = Math.max(0.001, n[2]), noH = Math.max(0, n[0] * h[0] + n[1] * h[1] + n[2] * h[2]), voH = Math.max(0, h[2]);
  const rough = Math.max(0.12, Math.min(1, surface.roughness)), metal = Math.max(0, Math.min(1, surface.metalness));
  const alpha2 = rough ** 4, denominator = noH * noH * (alpha2 - 1) + 1;
  const distribution = alpha2 / Math.max(0.000001, Math.PI * denominator * denominator);
  const k = (rough + 1) ** 2 / 8;
  const geometry = noV / (noV * (1 - k) + k) * noL / Math.max(0.000001, noL * (1 - k) + k);
  const fresnel: number[] = [], diffuse: number[] = [], specular: number[] = [];
  for (let i = 0; i < 3; i++) {
    const f0 = surface.f0 * (1 - metal) + surface.albedo[i] * metal;
    fresnel[i] = f0 + (1 - f0) * (1 - voH) ** 5;
    diffuse[i] = (1 - fresnel[i]) * (1 - metal) * noL;
    specular[i] = Math.min(2, distribution * geometry * fresnel[i] / Math.max(0.0001, 4 * noV));
  }
  return { diffuse: diffuse as unknown as Vec3, specular: specular as unknown as Vec3 };
}
/** Extinction per cell; real steam/smoke and liquids attenuate more than air. */
export function extinction(id: Material) { return id === Material.Smoke ? 0.065 : id === Material.Steam ? 0.035 : id >= Material.Water && id <= Material.Lava ? 0.045 : 0.006; }
/** Single scattering in a thin 2.5D atmosphere, with Beer–Lambert attenuation.
 * https://www.pbr-book.org/4ed/Volume_Scattering/Transmittance
 */
export function scattering(opticalDepth: number, density: number, cosine: number) {
  const g = 0.18, phase = (1 - g * g) / (1 + g * g - 2 * g * Math.max(-1, Math.min(1, cosine))) ** 1.5;
  return Math.exp(-Math.max(0, opticalDepth)) * (1 - Math.exp(-Math.max(0, density) * 7)) * phase;
}
