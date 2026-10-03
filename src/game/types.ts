import type { Vec3 } from '../world/types';
import type { EnvironmentState } from '../environment/time';
export interface ResourceNode extends Vec3 { id: number; kind: string; amount: number; ready: number }
export interface EnemyState extends Vec3 { id: number; definition: string; tier: number; health: number; cooldown: number; windup: number; slow: number; boss: boolean; homeX: number; homeZ: number; respawnAt?: number }
export interface BuildingState extends Vec3 { id: number; definition: string; rotation: number; support: number; contents: Record<string, number> }
export interface Projectile extends Vec3 { id: number; vx: number; vy: number; vz: number; life: number; damage: number; element: string; radius: number }
export interface AdventureSave { seconds: number; health: number; stamina: number; mana: number; inventory: Record<string, number>; equipment: string; unlocked: number; defeated: string[]; resources: ResourceNode[]; enemies: EnemyState[]; buildings: BuildingState[]; death: Vec3 | null; food: number; rested: number; spawn: Vec3 | null }
export interface AdventureSnapshot extends AdventureSave { environment: EnvironmentState; biome: string; objective: string; projectiles: Projectile[]; guarding: boolean; dodging: boolean; attack: number; wet: boolean }
export type GameAction = 'gather' | 'attack' | 'heavy' | 'guard' | 'dodge' | 'craft' | 'build' | 'remove' | 'spell' | 'summon' | 'eat' | 'equip' | 'travel' | 'rest' | 'chest';
