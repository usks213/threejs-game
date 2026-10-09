import * as THREE from 'three';
import type { AdventureSnapshot } from '../../game/types';
import { bossPartDefinitions, bossPartHealth, bossPartPosition } from '../../game/combat/boss-parts';
import { pbrMaterial } from '../materials/pbr';
/** World-sized armor volumes match authority collision, without body-animation scaling. */
export function createBossParts(scene: THREE.Scene) {
 const groups = new Map<string, THREE.Group>();
 const geometry = new THREE.IcosahedronGeometry(1, 0), barGeometry = new THREE.PlaneGeometry(1, .075);
 const drive = pbrMaterial('#9db5c6', 'metal'), focus = pbrMaterial('#e4d99e', 'crystal');
 const flash = pbrMaterial('#ffffff', 'crystal', { emissive: '#d6ecff', emissiveIntensity: .7 });
 const exposed = pbrMaterial('#b7f4df', 'crystal', { emissive: '#82d3bd', emissiveIntensity: .7 });
 const healthMaterial = new THREE.MeshBasicMaterial({ color: '#e6dc9d', side: THREE.DoubleSide, toneMapped: false });
 function group(key: string): THREE.Group {
  let result = groups.get(key);
  if (!result) {
   result = new THREE.Group(); result.name = 'boss-part-' + key;
   const shell = new THREE.Mesh(geometry, drive); shell.name = 'shell'; shell.castShadow = shell.receiveShadow = true;
   const bar = new THREE.Mesh(barGeometry, healthMaterial); bar.name = 'part-health'; bar.position.y = .82;
   result.add(shell, bar); groups.set(key, result); scene.add(result);
  }
  return result;
 }
 return {
  update(state: AdventureSnapshot) {
   const live = new Set<string>();
   for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    for (const part of bossPartDefinitions(enemy)) {
     const health = bossPartHealth(enemy, part), hit = enemy.bossParts?.lastHit === part.id && enemy.bossParts.hitUntil > state.seconds;
     if (health <= 0 && !hit) continue;
     const key = enemy.id + ':' + part.id, g = group(key), position = bossPartPosition(enemy, part); live.add(key);
     g.position.set(position.x, position.y, position.z); g.rotation.y = enemy.heading ?? enemy.attackYaw ?? 0;
     const shell = g.children[0] as THREE.Mesh; shell.scale.setScalar(part.radius); shell.material = hit && !scene.userData.reducedMotion ? flash : part.id === 'focus' ? focus : drive;
     // On a break, a short shared flash remains before the armor disappears.
     if (health <= 0) shell.scale.setScalar(part.radius * .6);
     const bar = g.children[1]; bar.visible = health > 0 && health < part.health; bar.scale.x = Math.max(.01, health / part.health);
    }
    if (bossPartDefinitions(enemy).length && Math.max(enemy.bossParts?.exposedUntil ?? 0, enemy.attackReady?.exposed ?? 0) > state.seconds) {
     const key = enemy.id + ':core', g = group(key), yaw = enemy.heading ?? enemy.attackYaw ?? 0; live.add(key);
     g.position.set(enemy.x + Math.sin(yaw) * 1.15, enemy.y + 2.1, enemy.z + Math.cos(yaw) * 1.15);
     const shell = g.children[0] as THREE.Mesh; shell.scale.setScalar(.42); shell.material = exposed; g.children[1].visible = false;
    }
   }
   for (const [key, g] of groups) if (!live.has(key)) { scene.remove(g); groups.delete(key); }
  },
  faceCamera(camera: THREE.Camera) { for (const g of groups.values()) g.children[1].lookAt(camera.position); },
  dispose() { for (const g of groups.values()) scene.remove(g); groups.clear(); geometry.dispose(); barGeometry.dispose(); drive.dispose(); focus.dispose(); flash.dispose(); exposed.dispose(); healthMaterial.dispose(); },
 };
}
