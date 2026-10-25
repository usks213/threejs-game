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
/** Rating-informed gameplay estimates with explicit provenance; never manufacturer-measured SI constants. */
export interface Profile { name: string; type: BeyType; spin: 1 | -1; mass: number; radius: number; inertia: number; grip: number; drag: number; restitution: number; burstThreshold: number; height: number; railGrip: number; gearRadius:number; gearHeight:number; railEligible:boolean; contactLobes:number; contactLobeDepth:number; color: number;
  /** Rating-informed SI body/contact estimates; not manufacturer-measured constants. */
  centerOfMass?:Vec3;inertiaTensor?:SymmetricTensor;massComponents?:MassComponent[];
  transverseInertia?: number; centerOfMassHeight?: number; tipRadius?: number;
  tipShape?: 'flat'|'ball'|'needle'|'taper'; tipFriction?: number; rollingDrag?: number;
  lockStiffness?:number; lockReleaseAngle?:number; bladeRampAmplitude?:number; bladeSkew?:number;
  bladeStyle?:'sword'|'scythe'|'round-wing'|'shield'|'single-sword'|'broad-wing'|'uppercut'|'smash'|'generic';
  bladeEdgeSharpness?:number; bladeThickness?:number; bladeHandedness?:1|-1;
  ratchetRadius?:number; ratchetCenterHeight?:number; ratchetHalfThickness?:number; ratchetLobes?:number; ratchetLobeDepth?:number; ratchetSkew?:number;
  bitHeightOffset?:number; gearTeeth?:number; gearEngagementBand?:number; bitDiscRadius?:number; bitDiscHeight?:number;
  /** False when actual integrated structure breakup is not modeled; never fabricate removable parts. */
  burstSeparationSupported?:boolean;
  componentMasses?:{blade:number;ratchet:number;bit:number};
  componentAxialWeights?:{blade:number;ratchet:number;bit:number};
  modelPalette?:{metal:number;core:number;ratchet:number;bit:number};
}
export interface Launch { power: number; angle: number; tilt: number }
export interface Vec3 { x:number; y:number; z:number }
export interface SymmetricTensor {xx:number;yy:number;zz:number;xy:number;xz:number;yz:number}
export interface MassComponent {component:BurstComponent;mass:number;center:Vec3;inertia:SymmetricTensor}
export interface Quaternion { x:number; y:number; z:number; w:number }
export interface RailState { engaged:boolean; travel:number; contactPoint:Vec3|null; tangent:Vec3|null; lastContactTick:number; lastReleaseTick:number; dashCount:number; speedBefore:number; spinBefore:number; energyBefore:number }
export interface Top {
  x:number; y:number; z:number; vx:number; vy:number; vz:number;
  orientation:Quaternion; angularMomentum:Vec3; angularVelocity:Vec3; bodyInertia:Vec3;bodyInertiaTensor?:SymmetricTensor;
  centerOfMassHeight:number; tipRadius:number; rail:RailState;
  /** Derived compatibility/telemetry views; orientation and world angular momentum are authoritative. */
  omega:number; phase:number; tilt:number; tiltVelocity:number;
  /** Quasistatic internal detent deflection in radians, driven only by exposed-ratchet work. */
  separated?:boolean;
  lock:number; railCooldown:number; profile:Profile; eliminated:Finish|null;
}
export type Finish = 'spin' | 'over' | 'burst' | 'xtreme';
export interface BattleEvent { tick: number; kind: 'collision' | 'rail' | 'rail-engage' | 'rail-release' | 'dash' | 'finish' | 'burst-split'; top?: number; intensity?: number; finish?: Finish; position?:Vec3; velocity?:Vec3; energyBefore?:number; energyAfter?:number; spinBefore?:number; spinAfter?:number; velocityBefore?:Vec3; velocityAfter?:Vec3; travel?:number }
export interface BattleResult { winner: 0 | 1 | null; finish: Finish | 'draw'; points: number }
export type BurstComponent='blade'|'ratchet'|'bit';
export interface BurstFragment extends Top {
  id:string;sourceTop:0|1;component:BurstComponent;assemblyProfile:Profile;
  /** Component COM in the original assembly's COM-local frame. Shared mesh subtracts this offset. */
  componentLocalCenter:Vec3;
}
export interface Battle { tick: number; tops: [Top, Top]; events: BattleEvent[]; result: BattleResult | null; fragments:BurstFragment[];settling:{elapsed:number;remaining:number}|null }
export type Format = 'basic' | 'three-on-three';
export interface Match { format: Format; target: number; scores: [number, number]; round: number; winner: 0 | 1 | null; last: BattleResult | null }
