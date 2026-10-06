import {expect,it} from 'vitest';
import {settledRecoveryAim,type CoopRecoveryAim} from '../helpers/coop-recovery-aim';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {intersectsProtection,protectedVolumes} from '../../src/game/skybound/protection';

const sample=(draws:number,x:number,y=1.1140923677736723,z=5.8075701841908645):CoopRecoveryAim=>({epoch:2,draws,health:25,player:{x:-6,y:1.2640143044745054,z:8,heading:Math.PI/2,vy:0,grounded:true},target:{x,y,z}});

it('rejects the recorded post-respawn camera transit before accepting a settled real view',()=>{
 // Recorded host548 trace poses. These fixtures test the observation predicate;
 // they are never injected into a browser or used to fabricate a terrain edit.
 const views=[sample(1,-.3314315752338709,1.1783135867273815,5.6891922901099905),sample(2,-3.33927386017089,1.1496153978982466,5.773199728637814),sample(3,-5.0593642601570865),sample(4,-5.3436932909154296),sample(5,-5.390692563588905),sample(6,-5.3993744889637)];
 for(let i=1;i<views.length-1;i++)expect(settledRecoveryAim(views[i-1],views[i])).toBe(false);
 expect(settledRecoveryAim(views.at(-2)!,views.at(-1)!)).toBe(true);
 const sim=new GameSimulation(),protectedAreas=protectedVolumes(sim);
 expect(intersectsProtection(views[0].target!,1.7,protectedAreas)).toBe(true);
 expect(intersectsProtection(views.at(-1)!.target!,1.7,protectedAreas)).toBe(false);
});

it('does not accept a cached frame, epoch reset, dead or airborne player, or invalid target',()=>{
 const previous=sample(10,-5.4),next=sample(11,-5.4);expect(settledRecoveryAim(previous,next)).toBe(true);
 expect(settledRecoveryAim(previous,previous)).toBe(false);expect(settledRecoveryAim(previous,{...next,epoch:3})).toBe(false);
 for(const draws of [NaN,Infinity,-1,11.5])expect(settledRecoveryAim(previous,{...next,draws})).toBe(false);
 for(const health of [0,-1,NaN])expect(settledRecoveryAim(previous,{...next,health})).toBe(false);
 expect(settledRecoveryAim({...previous,health:0},next)).toBe(false);
 expect(settledRecoveryAim(previous,{...next,player:{...next.player,grounded:false}})).toBe(false);
 expect(settledRecoveryAim(previous,{...next,player:{...next.player,x:-5}})).toBe(false);
 for(const target of [null,{x:Infinity,y:1,z:5}])expect(settledRecoveryAim(previous,{...next,target})).toBe(false);
});
