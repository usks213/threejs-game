import { leafMaterial } from '../materials/leaves';
import { TREE_KINDS } from '../../content/meadows/data';
import { pbrMaterial } from '../materials/pbr';
import * as THREE from 'three';
import type { AdventureSnapshot } from '../../game/types';
import { Instances } from './instances';

export function createResources(scene: THREE.Scene) {
  const geometry = [new THREE.CylinderGeometry(0.15, 0.26, 2.8, 6), new THREE.ConeGeometry(1.1, 2.6, 6), new THREE.IcosahedronGeometry(0.5, 1),new THREE.PlaneGeometry(1,1)];
  const leaves=leafMaterial();
  const definitions: [string, number, string][] = [
    ['leaves',3,'#8b9d66'],['trunk', 0, '#775d43'], ['crown', 1, '#5c814f'], ['canopy',2,'#617d45'],['canopyLight',2,'#7f9856'],['bush', 2, '#56714d'], ['berry', 2, '#cc896e'],
    ['birchTrunk',0,'#d4d3bb'],['flint',2,'#bec4bf'],['mushroom',2,'#b3472e'],['dandelion',2,'#e8c84c'],['relic',2,'#737e77'],['beeNest',2,'#b69c66'],['loot',2,'#b68b45'],['branch',0,'#785a38'],['stone', 2, '#a8a796'], ['copper', 2, '#b99466'], ['iron', 2, '#809199'], ['crystal', 2, '#b0dce1'], ['aether', 2, '#b08ad0'],
  ];
  const materials: THREE.Material[] = [];
  const batches = new Map(definitions.map(([id, shape, color]) => {
    const material = id==='leaves'?leaves.material:pbrMaterial(color, ['trunk','birchTrunk','branch'].includes(id)?'wood':id==='copper'||id==='iron'?'metal':id==='crystal'||id==='aether'?'crystal':id==='stone'?'stone':'foliage');
    materials.push(material);
    return [id, new Instances(scene, geometry[shape], material)];
  }));
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const logDirection=new THREE.Vector3(),axis = new THREE.Vector3(0, 1, 0),leafRotation=new THREE.Euler();
  function part(id: string, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    matrix.compose(position.set(x, y, z), rotation, scale.set(sx, sy, sz));
    batches.get(id)?.add(matrix);
  }
  return {
    update(state: AdventureSnapshot): void {
      leaves.time.value=state.seconds;for (const batch of batches.values()) batch.begin();
      for (const n of state.resources) {
        if (n.ready > state.seconds) continue;
        rotation.setFromAxisAngle(axis, n.id * 2.399);
        if ((!state.meadows&&n.kind === 'wood')||TREE_KINDS.has(n.kind)) {
          const height = (n.kind==='oak'?2:1.35) + (n.id % 7) * 0.1;
          part(n.kind==='birch'?'birchTrunk':'trunk', n.x, n.y + 1.4 * height, n.z, 1.3, height, 1.3);
          if((n.kind==='wood'&&n.id%3===0)||state.biome==='frost'){
            for(let j=0;j<4;j++)part('crown',n.x,n.y+(2.1+j*.75)*height,n.z,1.3-j*.22,height*.75,1.3-j*.22);
          }else{
            for(let j=0;j<22;j++){const a=j*2.4+n.id,r=.4+(j%4)*.45;rotation.setFromEuler(leafRotation.set(Math.sin(a)*1.1,a,Math.cos(a)*.5));part('leaves',n.x+Math.sin(a)*r,n.y+(2.55+Math.sin(j*1.7)*.35)*height,n.z+Math.cos(a)*r,2.2,height*.82,1);}rotation.setFromAxisAngle(axis,n.id*2.399);
          }
        } else if(n.kind==='fallenLog'&&n.log){const a=n.log.a.position,b=n.log.b.position;rotation.setFromUnitVectors(axis,logDirection.set(b.x-a.x,b.y-a.y,b.z-a.z).normalize());part('trunk',n.x,n.y,n.z,1.6,n.log.length/2.8,1.6);
        } else if(n.kind==='stump'){part('trunk',n.x,n.y+.2,n.z,1.6,.15,1.6);
        } else if (n.kind === 'berry') {
          part('bush', n.x, n.y + 0.45, n.z, 1.4, 1.1, 1.4);
          for(let j=0;j<5;j++)part('berry', n.x+Math.sin(j*2.4)*.4,n.y+.65+(j%2)*.15,n.z+Math.cos(j*2.4)*.4,.22,.22,.22);
        } else if(['dolmen','stoneCircle','graveyard'].includes(n.kind)){
          const dolmen=n.kind==='dolmen',grave=n.kind==='graveyard';for(let j=0;j<(dolmen?3:9);j++){const a=j*Math.PI*2/(dolmen?3:9);part('relic',n.x+Math.sin(a)*(grave?1.5:2.5),n.y+.8,n.z+Math.cos(a)*(grave?4:2.5),.8,1.6,.65);}if(dolmen)part('relic',n.x,n.y+1.5,n.z,5,.65,5);
        } else if(['perch','pike'].includes(n.kind)){
          part('stone',n.x,n.y,n.z,n.kind==='pike'?.8:.4,.15,.15);
        } else if(n.kind==='merchant'){
          continue;
        } else if(n.kind==='wood'||n.kind==='finewood'){rotation.setFromEuler(leafRotation.set(Math.PI/2,0,0));for(let j=0;j<3;j++)part('branch',n.x+(j-1)*.18,n.y+.18,n.z,.65,.25,.65);
        } else if(n.kind==='branch'){
          part('branch',n.x,n.y+.1,n.z,.25,.08,2);
        } else if(n.kind==='mushroom'){
          for(let j=0;j<3;j++){part('branch',n.x+j*.15,n.y+.1,n.z,.2,.12,.2);part('mushroom',n.x+j*.15,n.y+.25,n.z,.4,.18,.4);}
        } else if(n.kind==='flint'||n.kind==='dandelion'){
          part(n.kind,n.x,n.y+.12,n.z,.5,.2,.6);
        } else if(['sacrifice','altar','runestone'].includes(n.kind)){
          const altar=n.kind==='altar';
          for(let j=0;j<(n.kind==='runestone'?1:6);j++){const a=j*Math.PI/3;part('relic',n.x+Math.sin(a)*1.7,n.y+1,n.z+Math.cos(a)*1.7,.65,2,.5);}
          if(altar)part('relic',n.x,n.y+.4,n.z,2,.8,1.5);
        } else if(n.kind==='bodyPile'){for(let i=0;i<7;i++)part('relic',n.x+Math.sin(i)*.5,n.y+.25+(i%2)*.2,n.z+Math.cos(i)*.5,.4,.5,.8);
        } else if(n.kind==='beeNest'){
          part('beeNest',n.x,n.y+1.2,n.z,.6,1,.6);
        } else if(n.kind==='lootChest'||n.kind==='buriedChest'){
          part('loot',n.x,n.y+(n.kind==='buriedChest'?-.65:.35),n.z,1.2,.7,.8);
        } else {
          const crystal = n.kind === 'crystal' || n.kind === 'aether';
          part(batches.has(n.kind)?n.kind:'loot', n.x, n.y + (crystal ? 0.8 : 0.4), n.z, crystal ? 0.9 : 1.5, crystal ? 2.1 : 1.5, crystal ? 0.9 : 1.5);
        }
      }
      for (const batch of batches.values()) batch.end();
    },
    dispose(): void {
      for (const batch of batches.values()) batch.dispose();
      leaves.dispose();geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}
