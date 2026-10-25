/** Simulation SI units: metres, seconds, kilograms, radians. */
export type BeyType = 'attack' | 'defense' | 'stamina' | 'balance';
export type PartCategory = 'blade' | 'ratchet' | 'bit' | 'lock_chip' | 'main_blade' | 'metal_blade' | 'assist_blade' | 'over_blade';
export interface Ratings { attack: number | null; defense: number | null; stamina: number | null; dash?: number | null; burst_resistance?: number | null; height?: number | null }
export interface Part {
  id: string; name: string; category: PartCategory; family: 'BX' | 'UX' | 'CX' | 'shared'; type: BeyType;
  ratings: Ratings | null; release: 'released' | 'upcoming' | 'unknown'; source: string;
  integratedRatchet?: boolean; integratedBit?: boolean; spin?: 1 | -1; requiresOverBlade?: boolean;
  sourceCategory?:string; ratingScope?:string; canonicalId?:string; requiresSimpleRatchet?:boolean;
  components?:Partial<Record<PartCategory,string>>; modes?:{name:string;ratings:Ratings}[];
  ratingsVariants?:{condition:string;ratings:Ratings;source:string}[]; notes?:string;
  sourceImages?:string[]; releaseDate?:string|null; spinVerification?:'official'|'unverified_model_default';
  availability?:'unknown_not_verified';

}
export interface Build { blade: string; ratchet: string; bit: string; lock_chip?: string; main_blade?: string; metal_blade?: string; bladeMode?:string; bitMode?:string; assist_blade?: string; over_blade?: string }
/** Gameplay estimates, never manufacturer-measured physical constants. */
export interface Profile { name: string; type: BeyType; spin: 1 | -1; mass: number; radius: number; inertia: number; grip: number; drag: number; restitution: number; burstThreshold: number; height: number; railGrip: number; gearRadius:number; gearHeight:number; railEligible:boolean; contactLobes:number; contactLobeDepth:number; color: number }
export interface Launch { power: number; angle: number; tilt: number }
export interface Top { x: number; z: number; vx: number; vz: number; omega: number; phase: number; tilt: number; tiltVelocity: number; lock: number; railCooldown: number; profile: Profile; eliminated: Finish | null }
export type Finish = 'spin' | 'over' | 'burst' | 'xtreme';
export interface BattleEvent { tick: number; kind: 'collision' | 'rail' | 'finish'; top?: number; intensity?: number; finish?: Finish }
export interface BattleResult { winner: 0 | 1 | null; finish: Finish | 'draw'; points: number }
export interface Battle { tick: number; tops: [Top, Top]; events: BattleEvent[]; result: BattleResult | null }
export type Format = 'basic' | 'three-on-three';
export interface Match { format: Format; target: number; scores: [number, number]; round: number; winner: 0 | 1 | null; last: BattleResult | null }
