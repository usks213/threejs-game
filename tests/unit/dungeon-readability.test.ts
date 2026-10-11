import {describe,it,expect} from 'vitest';
import {MeshStandardMaterial} from 'three';
import {createActor,DungeonSimulation} from '../../src/dungeon/simulation';
import {combatReadout,focusedOpponent,receivedDamage} from '../../src/dungeon/readability';
import {configureDungeonMasonry} from '../../src/dungeon/materials';
import {configureVoxelMaterial} from '../../src/prototype/rendering/meshes';

function fixture(){const sim=new DungeonSimulation();const p=sim.join('a'.repeat(64),'You')!;sim.command(p.actor.id,1,{kind:'ready'});sim.command(p.actor.id,2,{kind:'start'});const s=sim.snapshot(p.actor.id);s.actors[0].position={x:0,y:0,z:3};s.enemies=[];s.doors=[];return s;}
describe('dungeon combat readability',()=>{
 it('shows only an alive opponent in the sightline, never self or a target behind a wall',()=>{
  const s=fixture(),enemy=createActor('e0','Sentinel');enemy.status='alive';enemy.position={x:0,y:0,z:0};s.enemies=[{...enemy,home:{...enemy.position},alert:0,lootClaimed:false}];
  expect(focusedOpponent(s,{yaw:0,pitch:0})?.id).toBe('e0');
  expect(focusedOpponent(s,{yaw:Math.PI,pitch:0})).toBeNull();
  expect(focusedOpponent(s,{yaw:0,pitch:1})).toBeNull();
  s.doors=[{id:'south',open:false,position:{x:0,y:0,z:1}}];expect(focusedOpponent(s,{yaw:0,pitch:0})).toBeNull();
  s.doors[0].open=true;s.enemies[0].status='dead';expect(focusedOpponent(s,{yaw:0,pitch:0})).toBeNull();
 });
 it('does not show distant or off-axis targets and selects the nearer visible body',()=>{
  const s=fixture();for(const [id,x,z] of [['far',0,-7],['side',3,0],['near',0,1]] as const){const a=createActor(id,id);a.status='alive';a.position={x,y:0,z};s.actors.push(a);}
  expect(focusedOpponent(s,{yaw:0,pitch:0})?.id).toBe('near');s.actors.pop();expect(focusedOpponent(s,{yaw:0,pitch:0})).toBeNull();
 });
 it('uses real weapon timings and identifies recovery instead of declaring ready too soon',()=>{
  const actor=createActor('a','a','ravager');actor.phase='windup';actor.time=.28;expect(combatReadout(actor)).toMatchObject({label:'振りかぶり',progress:.5});actor.phase='recover';actor.time=.35;expect(combatReadout(actor)).toMatchObject({label:'立て直し',progress:.5});actor.phase='idle';actor.guard=1;expect(combatReadout(actor).label).toBe('防御の構え');expect(combatReadout(actor,true).label).toBe('盾なし');actor.bag.push({id:'shield',kind:'shield',count:1,quality:0,x:0,y:0,rotated:false,found:false});expect(combatReadout(actor,true).label).toBe('防御中');
 });
 it('flashes only confirmed local damage, not joining, healing, switching player or starting a new raid',()=>{
  const before=fixture(),after=structuredClone(before);after.actors[0].hp-=12;expect(receivedDamage(before,after)).toBe(12);expect(receivedDamage(null,after)).toBe(0);expect(receivedDamage(after,before)).toBe(0);after.raid++;expect(receivedDamage(before,after)).toBe(0);after.raid=before.raid;after.you='other';expect(receivedDamage(before,after)).toBe(0);
 });
 it('adds dungeon masonry while preserving the shared SDF material attributes',()=>{
  const material=configureDungeonMasonry(configureVoxelMaterial(new MeshStandardMaterial()));
  const shader={vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <emissivemap_fragment>',uniforms:{}};
  material.onBeforeCompile(shader as never,{} as never);
  expect(shader.vertexShader).toContain('attribute vec3 voxelSurface');expect(shader.vertexShader).toContain('vVaultPosition = position');expect(shader.fragmentShader).toContain('fwidth(vaultGrid)');expect(shader.fragmentShader).toContain('vVoxelSurface.x');expect(material.customProgramCacheKey()).toBe('ashen-vault-masonry-v1');material.dispose();
 });
});
