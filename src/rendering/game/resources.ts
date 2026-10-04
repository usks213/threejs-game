import { voxelizePrimitive } from '../voxel/primitive';
import { treeVoxels } from '../../game/voxel/model';
import { voxelGroup,disposeVoxelGroup } from '../voxel/object-mesh';
import { leafMaterial } from '../materials/leaves';
import { TREE_KINDS } from '../../content/meadows/data';
import { pbrMaterial } from '../materials/pbr';
import * as THREE from 'three';
import type { AdventureSnapshot } from '../../game/types';
import { Instances } from './instances';

export function createResources(scene: THREE.Scene, boundedTemplates = false) {
  const trees=new Map<number,THREE.Group>(),treeBatches=new Map<string,{template:THREE.Group;batches:Instances[]}>();
  const geometry = [voxelizePrimitive(new THREE.CylinderGeometry(0.15, 0.26, 2.8, 6)), voxelizePrimitive(new THREE.ConeGeometry(1.1, 2.6, 6)), voxelizePrimitive(new THREE.IcosahedronGeometry(0.5, 1)),new THREE.PlaneGeometry(1,1)];
  const leaves=leafMaterial();
  const definitions: [string, number, string][] = [
    ['leaves',3,'#8b9d66'],['trunk', 0, '#775d43'], ['crown', 1, '#5c814f'], ['canopy',2,'#617d45'],['canopyLight',2,'#7f9856'],['bush', 2, '#56714d'], ['berry', 2, '#cc896e'],
    ['birchTrunk',0,'#d4d3bb'],['fish',2,'#a1b290'],['fishFin',3,'#758d71'],['flint',2,'#bec4bf'],['mushroom',2,'#b3472e'],['dandelion',2,'#e8c84c'],['relic',2,'#737e77'],['beeNest',2,'#b69c66'],['loot',2,'#b68b45'],['branch',0,'#785a38'],['stone', 2, '#a8a796'], ['copper', 2, '#b99466'], ['iron', 2, '#809199'], ['crystal', 2, '#b0dce1'], ['aether', 2, '#b08ad0'],
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
      leaves.time.value=state.seconds;for (const batch of batches.values()) batch.begin();for(const t of treeBatches.values())for(const b of t.batches)b.begin();
      // Direct-field mode must not replace the terrain stall with a synchronous
      // forest-meshing burst. Revisit the latest snapshot on each update, so no
      // stale queue can publish a tree that has since been removed or felled.
      let templatesRemaining = boundedTemplates ? 1 : Infinity;
      for (const n of state.resources) {
        if (n.ready > state.seconds) continue;
        if (TREE_KINDS.has(n.kind)) {
          if (!n.removed?.length) {
            const key = n.kind + ':' + n.id % 5;
            let tree = treeBatches.get(key);
            if (!tree && templatesRemaining > 0) {
              const template = voxelGroup(treeVoxels(n.kind, n.id));
              tree = { template, batches: template.children.map(object => {
                const mesh = object as THREE.Mesh;
                return new Instances(scene, mesh.geometry, mesh.material as THREE.Material);
              }) };
              treeBatches.set(key, tree); templatesRemaining--;
            }
            if (tree) {
              matrix.makeTranslation(n.x, n.y, n.z);
              for (const batch of tree.batches) batch.add(matrix);
            } else {
              // Already-created voxel primitives keep every pending tree visible
              // without allocating new geometry. Collision remains authoritative.
              const height = n.kind === 'oak' ? 6 : 4 + (n.id % 5) * .25;
              const radius = n.kind === 'oak' ? 2.2 : 1.65, trunk = n.kind === 'oak' ? .45 : .3;
              rotation.identity();
              part('trunk', n.x, n.y + height * .5, n.z, trunk / .26, height / 2.8, trunk / .26);
              part('canopy', n.x, n.y + height * .8, n.z, radius * 2, height * .7, radius * 2);
            }
            continue;
          }
          const signature = n.kind + ':' + n.removed.join(';');
          let group = trees.get(n.id);
          if (group && group.userData.signature !== signature) { scene.remove(group); disposeVoxelGroup(group); trees.delete(n.id); group = undefined; }
          if (!group) { group = voxelGroup(treeVoxels(n.kind, n.id), n.removed); group.userData.signature = signature; trees.set(n.id, group); scene.add(group); }
          group.position.set(n.x, n.y, n.z); continue;
        }
        rotation.setFromAxisAngle(axis, n.id * 2.399);
        if ((!state.meadows&&n.kind === 'wood')||TREE_KINDS.has(n.kind)) {
          const height = (n.kind==='oak'?2:1.35) + (n.id % 7) * 0.1;
          part(n.kind==='birch'?'birchTrunk':'trunk', n.x, n.y + 1.4 * height, n.z, 1.3, height, 1.3);
          if((n.kind==='wood'&&n.id%3===0)||state.biome==='frost'){
            for(let j=0;j<4;j++)part('crown',n.x,n.y+(2.1+j*.75)*height,n.z,1.3-j*.22,height*.75,1.3-j*.22);
          }else{
            for(let j=0;j<4;j++){const a=j*2.4+n.id;part(j%2?'canopyLight':'canopy',n.x+Math.sin(a)*.65,n.y+(2.4+j*.13)*height,n.z+Math.cos(a)*.65,2.4,height*1.5,2.4);}
            for(let j=0;j<16;j++){const a=j*2.4+n.id,r=.4+(j%4)*.45;rotation.setFromEuler(leafRotation.set(Math.sin(a)*1.1,a,Math.cos(a)*.5));part('leaves',n.x+Math.sin(a)*r,n.y+(2.55+Math.sin(j*1.7)*.35)*height,n.z+Math.cos(a)*r,2.2,height*.82,1);}rotation.setFromAxisAngle(axis,n.id*2.399);
          }
        } else if(n.kind==='sapling'){part('trunk',n.x,n.y+.4,n.z,.25,.3,.25);for(let j=0;j<4;j++){rotation.setFromEuler(leafRotation.set(.5,j*1.5,0));part('leaves',n.x,n.y+.7+j*.15,n.z,.5,.45,1);}
        } else if(n.kind==='fallenLog'&&n.log){const a=n.log.a.position,b=n.log.b.position;rotation.setFromUnitVectors(axis,logDirection.set(b.x-a.x,b.y-a.y,b.z-a.z).normalize());part('trunk',n.x,n.y,n.z,1.6,n.log.length/2.8,1.6);
        } else if(n.kind==='stump'){part('trunk',n.x,n.y+.2,n.z,1.6,.15,1.6);
        } else if (n.kind === 'berry') {
          part('bush', n.x, n.y + 0.45, n.z, 1.4, 1.1, 1.4);
          for(let j=0;j<5;j++)part('berry', n.x+Math.sin(j*2.4)*.4,n.y+.65+(j%2)*.15,n.z+Math.cos(j*2.4)*.4,.22,.22,.22);
        } else if(['dolmen','stoneCircle','graveyard'].includes(n.kind)){
          const dolmen=n.kind==='dolmen',grave=n.kind==='graveyard';for(let j=0;j<(dolmen?3:9);j++){const a=j*Math.PI*2/(dolmen?3:9);part('relic',n.x+Math.sin(a)*(grave?1.5:2.5),n.y+.8,n.z+Math.cos(a)*(grave?4:2.5),.8,1.6,.65);}if(dolmen)part('relic',n.x,n.y+1.5,n.z,5,.65,5);
        } else if(['perch','pike'].includes(n.kind)){
          const heading=(n.swimming?.heading??0)+Math.sin(state.seconds*6+n.id)*.08,length=n.kind==='pike'?.85:.5;rotation.setFromAxisAngle(axis,heading);part('fish',n.x,n.y,n.z,.2,.25,length);part('fishFin',n.x-Math.sin(heading)*length*.55,n.y,n.z-Math.cos(heading)*length*.55,.22,.22,1);
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
      for(const [id,g]of trees)if(!state.resources.some(n=>n.id===id&&TREE_KINDS.has(n.kind)&&!!n.removed?.length&&n.ready<=state.seconds)){scene.remove(g);disposeVoxelGroup(g);trees.delete(id);}
      for (const batch of batches.values()) batch.end();for(const t of treeBatches.values())for(const b of t.batches)b.end();
    },
    dispose(): void {for(const g of trees.values()){scene.remove(g);disposeVoxelGroup(g);}trees.clear();for(const t of treeBatches.values()){for(const b of t.batches)b.dispose();disposeVoxelGroup(t.template);}treeBatches.clear();
      for (const batch of batches.values()) batch.dispose();
      leaves.dispose();geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}
