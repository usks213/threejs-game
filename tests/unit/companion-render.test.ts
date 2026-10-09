import {it,expect} from 'vitest';
import {Scene,InstancedMesh} from 'three';
import {createCompanions} from '../../src/rendering/game/companions';
import {SessionAuthority} from '../../src/simulation/session';
import {sessionFrame} from '../../src/networking/frame';
import {disposeSurfaceMaps} from '../../src/rendering/materials/pbr';
it('bounds companion model geometry to five instanced batches with finite transforms',()=>{const scene=new Scene(),view=createCompanions(scene),room=new SessionAuthority();view.update(sessionFrame(room,'host'));view.animate(1/30);const batches=scene.children.filter(o=>o instanceof InstancedMesh);expect(batches).toHaveLength(5);expect(batches.map(m=>m.count)).toEqual([6,21,3,6,6]);for(const mesh of batches)expect([...mesh.instanceMatrix.array].every(Number.isFinite)).toBe(true);view.dispose();expect(scene.children).toHaveLength(0);disposeSurfaceMaps();});
