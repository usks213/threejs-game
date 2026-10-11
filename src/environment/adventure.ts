import {environmentAt,type EnvironmentState} from './time';
import type {Vec3} from '../world/types';
export type AdventureRegion='windfield'|'forest'|'rock'|'shore'|'frost'|'cinder'|'cavern';
export const ADVENTURE_REGIONS:Record<AdventureRegion,{name:string;temperature:number;fog:string;surface:string}>={
 windfield:{name:'風原',temperature:22,fog:'#a6c5bd',surface:'#709454'},forest:{name:'こだまの森',temperature:17,fog:'#779b8d',surface:'#355e43'},rock:{name:'鳴石の丘',temperature:14,fog:'#a9b9bd',surface:'#9a9e93'},shore:{name:'葦の水庭',temperature:20,fog:'#9cc7cb',surface:'#779990'},frost:{name:'白凪の高嶺',temperature:-12,fog:'#c7dce8',surface:'#d3e0db'},cinder:{name:'熾灯の洞',temperature:48,fog:'#583946',surface:'#75413b'},cavern:{name:'灯の洞海',temperature:12,fog:'#102b38',surface:'#38505c'},
};
export function adventureRegion(p:Vec3):AdventureRegion{
 if(p.y<-3)return p.x>42?'cinder':'cavern';if(p.y>31||p.z<-48)return 'frost';if(p.x<-18&&p.z>-20&&p.y<2)return 'shore';if(p.x<-18)return 'forest';if(p.x>32&&p.z<0)return 'rock';return 'windfield';
}
export function adventureEnvironment(seconds:number,p:Vec3):EnvironmentState{
 const base=environmentAt(seconds),region=adventureRegion(p),zone=ADVENTURE_REGIONS[region],underground=p.y<-3;
 const strength=base.weather==='storm'?1.4:.5,phase=Math.floor(seconds/30)*.17;
 return {...base,region:zone.name,regionId:region,temperature:zone.temperature-(base.daylight<.1?6:0),weather:underground?'fog':region==='frost'?'snow':base.weather,wind:underground?{x:0,z:0}:{x:Math.sin(phase)*strength,z:Math.cos(phase)*strength}};
}
