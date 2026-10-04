import type { AttackMotion } from '../../game/combat/attack';
import { meleePose } from './attack-pose';
import { voxelizePrimitive } from '../voxel/primitive';
import { pbrMaterial } from '../materials/pbr';
import * as THREE from 'three';

export interface AvatarPose { equipment?: string; attack?: number; attackMotion?: AttackMotion; guarding?: boolean; dodging?: boolean; shield?: boolean; grounded?: boolean; gear?:Record<string,string>; tower?:boolean }
export function createAvatarAssets() {
  const box = new THREE.BoxGeometry(1, 1, 1), head = voxelizePrimitive(new THREE.IcosahedronGeometry(0.21, 1));
  const blade = voxelizePrimitive(new THREE.ConeGeometry(0.09, 0.75, 4)), arc = voxelizePrimitive(new THREE.TorusGeometry(0.33, 0.035, 4, 12, Math.PI));
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string) => {
    let value = materials.get(color);
    if (!value) { value = pbrMaterial(color, ['#c8d1c9','#a9b4aa','#bdab77','#d8be81'].includes(color)?'metal':['#795738','#765744','#98744c','#8c6c47'].includes(color)?'wood':color==='#eed0a3'?'skin':color==='#9bd7dc'?'crystal':['#493d34','#65513c','#8d71a3'].includes(color)?'leather':'cloth'); materials.set(color, value); }
    return value;
  };
  function part(parent: THREE.Group, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material(color)); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh); return mesh;
  }
  return {
    create() {
      const group = new THREE.Group(), torso = new THREE.Group(); group.add(torso);
      const chest=part(torso, box, '#c89b47', 0, 0.87, 0, 0.45, 0.55, 0.29);
      part(torso, box, '#65513c', 0, 0.66, 0, 0.47, 0.08, 0.31);
      part(torso, head, '#eed0a3', 0, 1.27, 0.015);
      const hair=part(torso, head, '#463c31',0,1.39,-.025,1.03,.62,1.02);const helmet=part(torso,head,'#65513c',0,1.43,-.01,1.15,.7,1.15);helmet.visible=false;
      part(torso, box, '#252b28',-.075,1.29,.2,.035,.025,.025);part(torso, box, '#252b28',.075,1.29,.2,.035,.025,.025);
      const cloak=part(torso,box,'#466c6c',0,.83,-.21,.51,.67,.055);cloak.rotation.x=-.15;
      part(torso,box,'#d8be81',.16,.96,.165,.055,.48,.035);
      part(torso, box, '#526246', 0, 0.9, -0.22, 0.38, 0.43, 0.22);
      const legs: THREE.Group[] = [], arms: THREE.Group[] = [],trousers:THREE.Mesh[]=[],sleeves:THREE.Mesh[]=[];
      for (const side of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(side * 0.13, 0.59, 0); torso.add(leg); legs.push(leg);
        trousers.push(part(leg, box, '#525845', 0, -0.23, 0, 0.17, 0.42, 0.18));
        part(leg, box, '#493d34', 0, -0.51, 0.045, 0.2, 0.15, 0.28);
        const arm = new THREE.Group(); arm.position.set(side * 0.31, 1.08, 0); torso.add(arm); arms.push(arm);
        sleeves.push(part(arm, box, '#c89b47', 0, -0.16, 0, 0.16, 0.3, 0.17));
        part(arm, box, '#eed0a3', 0, -0.35, 0, 0.15, 0.15, 0.16);
      }
      const hand = new THREE.Group(); hand.position.set(0, -0.35, 0.04); arms[1].add(hand);
      const weapons = new Map<string, THREE.Group>();
      function weapon(name: string): THREE.Group { const w = new THREE.Group(); weapons.set(name, w); hand.add(w); w.visible = false; return w; }
      const sword = weapon('sword'); part(sword, blade, '#c8d1c9', 0, 0.4, 0); part(sword, box, '#795738', 0, 0, 0, 0.08, 0.26, 0.08); part(sword, box, '#bdab77', 0, 0.09, 0, 0.3, 0.045, 0.09);
      const axe = weapon('axe'); part(axe, box, '#795738', 0, 0.24, 0, 0.07, 0.7, 0.07); part(axe, box, '#a9b4aa', 0.1, 0.51, 0, 0.3, 0.2, 0.07);
      const staff = weapon('staff'); part(staff, box, '#765744', 0, 0.23, 0, 0.08, 1.1, 0.08); const crystal = part(staff, head, '#9bd7dc', 0, 0.83, 0, 0.65, 1, 0.65); (crystal.material as THREE.MeshStandardMaterial).emissive.set('#5296c4');(crystal.material as THREE.MeshStandardMaterial).emissiveIntensity=2;
      const spear = weapon('spear'); part(spear, box, '#795738', 0, 0.28, 0, 0.065, 1.35, 0.065); part(spear, blade, '#c8d1c9', 0, 1.03, 0, 0.7, 0.5, 0.7);
      const bow = weapon('bow'); part(bow, arc, '#98744c', 0, 0.2, 0).rotation.z = -Math.PI / 2;
      const club=weapon('club');part(club,box,'#795738',0,.25,0,.11,.75,.11);part(club,head,'#765744',0,.57,0,.7,1,.7);
      const hammer=weapon('hammer');part(hammer,box,'#795738',0,.2,0,.07,.6,.07);part(hammer,box,'#98744c',0,.45,0,.4,.18,.15);
      const hoe=weapon('hoe');part(hoe,box,'#795738',0,.3,0,.07,1,.07);part(hoe,box,'#a9b4aa',0,.75,.13,.32,.05,.3);
      const pick=weapon('pick');part(pick,box,'#795738',0,.25,0,.07,.8,.07);part(pick,arc,'#bdab77',0,.65,0,.9,.6,1).rotation.z=Math.PI;
      const knife=weapon('knife');part(knife,blade,'#a9b4aa',0,.2,0,.7,.5,.7);part(knife,box,'#795738',0,-.03,0,.06,.15,.06);
      const torch=weapon('torch');part(torch,box,'#795738',0,.2,0,.08,.65,.08);const fire=part(torch,blade,'#ffc077',0,.6,0,1,.4,1);(fire.material as THREE.MeshStandardMaterial).emissive.set('#ff8b24');(fire.material as THREE.MeshStandardMaterial).emissiveIntensity=3;
      const rod=weapon('fishingRod');part(rod,box,'#795738',0,.8,0,.035,2,.035).rotation.z=-.12;
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
            const alias:Record<string,string>={crudeBow:'bow',flintAxe:'axe',flintKnife:'knife',flintSpear:'spear',antlerPickaxe:'pick'};
            const kind = alias[id]??(id.endsWith('Sword') || id === 'greatsword' ? 'sword' : id);
            for (const [name, mesh] of weapons) mesh.visible = name === kind;
            sword.scale.setScalar(id === 'greatsword' ? 1.35 : 1);
          }
          shield.visible = next.shield ?? false;shield.scale.y=next.tower?.85:.5;
          if(next.gear){chest.material=material(next.gear.chest==='leatherTunic'?'#65513c':next.gear.chest?'#b2a182':'#eed0a3');for(const mesh of sleeves)mesh.material=chest.material;for(const mesh of trousers)mesh.material=material(next.gear.legs==='leatherPants'?'#65513c':next.gear.legs?'#b2a182':'#493d34');cloak.visible=next.gear.cape==='deerCape';helmet.visible=next.gear.head==='leatherHelmet';hair.visible=!helmet.visible;}
        },
        animate(dt: number): void {
          const p = group.position, distance = initialized ? Math.hypot(p.x - previousX, p.z - previousZ) : 0;
          initialized = true; previousX = p.x; previousZ = p.z;
          const speed = distance < 1 ? Math.min(5, distance / Math.max(dt, 0.001)) : 0;
          moving += (speed / 4 - moving) * (1 - Math.exp(-12 * dt)); phase += speed * dt * 3.3;
          const walk = Math.sin(phase) * 0.55 * moving;
          legs[0].rotation.x = pose.grounded === false ? -0.35 : walk; legs[1].rotation.x = pose.grounded === false ? 0.4 : -walk;
          arms[0].rotation.x = pose.guarding ? -1.05 : -walk * 0.65;
          const strike = pose.attackMotion ? meleePose(pose.attackMotion) : undefined;
          arms[1].rotation.set(pose.guarding ? -.7 : strike ? strike.armX : pose.equipment==='fishingRod'?-.65:(pose.attack??0)>0?-1.05:walk*.65, strike?.armY??0, strike?.armZ??0);
          hand.rotation.x = strike?.handX??0; hand.position.z = .04+(strike?.handZ??0);
          torso.rotation.set(pose.dodging ? .55 : strike?.torsoX??0, strike?.torsoY??0, 0);
          torso.position.y = Math.abs(Math.cos(phase)) * .025 * moving;
        },
      };
    },
    dispose(): void { box.dispose(); head.dispose(); blade.dispose(); arc.dispose(); for (const m of materials.values()) m.dispose(); },
  };
}
