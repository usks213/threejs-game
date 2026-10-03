import * as THREE from 'three';

export interface AvatarPose { equipment?: string; attack?: number; guarding?: boolean; dodging?: boolean; shield?: boolean; grounded?: boolean }
export function createAvatarAssets() {
  const box = new THREE.BoxGeometry(1, 1, 1), head = new THREE.IcosahedronGeometry(0.21, 1);
  const blade = new THREE.ConeGeometry(0.09, 0.75, 4), arc = new THREE.TorusGeometry(0.33, 0.035, 4, 12, Math.PI);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string) => {
    let value = materials.get(color);
    if (!value) { value = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }); materials.set(color, value); }
    return value;
  };
  function part(parent: THREE.Group, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material(color)); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh); return mesh;
  }
  return {
    create() {
      const group = new THREE.Group(), torso = new THREE.Group(); group.add(torso);
      part(torso, box, '#c89b47', 0, 0.87, 0, 0.45, 0.55, 0.29);
      part(torso, box, '#65513c', 0, 0.66, 0, 0.47, 0.08, 0.31);
      part(torso, head, '#eed0a3', 0, 1.27, 0.015);
      part(torso, head, '#463c31',0,1.39,-.025,1.03,.62,1.02);
      part(torso, box, '#252b28',-.075,1.29,.2,.035,.025,.025);part(torso, box, '#252b28',.075,1.29,.2,.035,.025,.025);
      const cloak=part(torso,box,'#466c6c',0,.83,-.21,.51,.67,.055);cloak.rotation.x=-.15;
      part(torso,box,'#d8be81',.16,.96,.165,.055,.48,.035);
      part(torso, box, '#526246', 0, 0.9, -0.22, 0.38, 0.43, 0.22);
      const legs: THREE.Group[] = [], arms: THREE.Group[] = [];
      for (const side of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(side * 0.13, 0.59, 0); torso.add(leg); legs.push(leg);
        part(leg, box, '#525845', 0, -0.23, 0, 0.17, 0.42, 0.18);
        part(leg, box, '#493d34', 0, -0.51, 0.045, 0.2, 0.15, 0.28);
        const arm = new THREE.Group(); arm.position.set(side * 0.31, 1.08, 0); torso.add(arm); arms.push(arm);
        part(arm, box, '#c89b47', 0, -0.16, 0, 0.16, 0.3, 0.17);
        part(arm, box, '#eed0a3', 0, -0.35, 0, 0.15, 0.15, 0.16);
      }
      const hand = new THREE.Group(); hand.position.set(0, -0.35, 0.04); arms[1].add(hand);
      const weapons = new Map<string, THREE.Group>();
      function weapon(name: string): THREE.Group { const w = new THREE.Group(); weapons.set(name, w); hand.add(w); w.visible = false; return w; }
      const sword = weapon('sword'); part(sword, blade, '#c8d1c9', 0, 0.4, 0); part(sword, box, '#795738', 0, 0, 0, 0.08, 0.26, 0.08); part(sword, box, '#bdab77', 0, 0.09, 0, 0.3, 0.045, 0.09);
      const axe = weapon('axe'); part(axe, box, '#795738', 0, 0.24, 0, 0.07, 0.7, 0.07); part(axe, box, '#a9b4aa', 0.1, 0.51, 0, 0.3, 0.2, 0.07);
      const staff = weapon('staff'); part(staff, box, '#765744', 0, 0.23, 0, 0.08, 1.1, 0.08); const crystal = part(staff, head, '#9bd7dc', 0, 0.83, 0, 0.65, 1, 0.65); (crystal.material as THREE.MeshStandardMaterial).emissive.set('#22414e');
      const spear = weapon('spear'); part(spear, box, '#795738', 0, 0.28, 0, 0.065, 1.35, 0.065); part(spear, blade, '#c8d1c9', 0, 1.03, 0, 0.7, 0.5, 0.7);
      const bow = weapon('bow'); part(bow, arc, '#98744c', 0, 0.2, 0).rotation.z = -Math.PI / 2;
      const book = weapon('book'); part(book, box, '#8d71a3', 0, 0.07, 0.05, 0.28, 0.36, 0.1);
      const shield = part(arms[0], box, '#8c6c47', -0.08, -0.27, 0.12, 0.08, 0.5, 0.4); shield.visible = false;
      let previousX = 0, previousZ = 0, moving = 0, phase = 0, initialized = false, equipped = '';
      let pose: AvatarPose = {};
      return {
        group,
        setPose(next: AvatarPose): void {
          pose = next; const id = next.equipment ?? 'hands';
          if (id !== equipped) {
            equipped = id;
            const kind = id.endsWith('Sword') || id === 'greatsword' ? 'sword' : id;
            for (const [name, mesh] of weapons) mesh.visible = name === kind;
            sword.scale.setScalar(id === 'greatsword' ? 1.35 : 1);
          }
          shield.visible = next.shield ?? false;
        },
        animate(dt: number): void {
          const p = group.position, distance = initialized ? Math.hypot(p.x - previousX, p.z - previousZ) : 0;
          initialized = true; previousX = p.x; previousZ = p.z;
          const speed = distance < 1 ? Math.min(5, distance / Math.max(dt, 0.001)) : 0;
          moving += (speed / 4 - moving) * (1 - Math.exp(-12 * dt)); phase += speed * dt * 3.3;
          const walk = Math.sin(phase) * 0.55 * moving;
          legs[0].rotation.x = pose.grounded === false ? -0.35 : walk; legs[1].rotation.x = pose.grounded === false ? 0.4 : -walk;
          arms[0].rotation.x = pose.guarding ? -1.05 : -walk * 0.65;
          arms[1].rotation.x = pose.guarding ? -0.7 : (pose.attack ?? 0) > 0 ? -1.25 + Math.sin((pose.attack ?? 0) * 16) * 0.8 : walk * 0.65;
          torso.rotation.x = pose.dodging ? 0.55 : 0;
          torso.position.y = Math.abs(Math.cos(phase)) * 0.025 * moving;
        },
      };
    },
    dispose(): void { box.dispose(); head.dispose(); blade.dispose(); arc.dispose(); for (const m of materials.values()) m.dispose(); },
  };
}
