import { GameSimulation } from '../../src/simulation/game-simulation';
import { WORLD } from '../../src/world/types';
/** Existing campaign compatibility fixture, independently of new-game defaults. */
export function legacySimulation():GameSimulation{return new GameSimulation({version:1,generator:2,seed:WORLD.seed,player:{x:0,y:2,z:8},edits:[],fluids:[],bodies:[]});}
