import type {BuildingState} from '../game/types';
import type {BossAttack} from '../game/bosses';
import type {BossDefinition} from './catalog';
export const SITES=[
 {id:850001,name:'裂帆の中継庫',layer:'surface',x:24,z:-32,y:undefined,npc:855001,guide:'荷守りハル',boss:'loadwarden',task:'輸送',line:'昔は三層の荷がここで行き交った。青い荷箱を奥の荷台へ。道が壊れていたら、新しい道でもいい。',reward:'wood'},
 {id:850002,name:'残響の揚水院',layer:'depths',x:-18,z:-12,y:-10.5,npc:855002,guide:'音記しセナ',boss:'echowarden',task:'救助',line:'壁の向こうに帰れない測り手がいる。声をかけて、入口の灯まで一緒に歩いてほしい。',reward:'crystal'},
 {id:850003,name:'薄明の記録庭',layer:'sky',x:-22,z:-30,y:34,npc:855003,guide:'綴り手ミオ',boss:'sailwarden',task:'復旧',line:'三つの灯の記録が、ここで途切れた。装置をつなぎ、熱を水で鎮めれば、遠い観測台へ声が届く。',reward:'resin'},
] as const;
export const SITE_IDS=SITES.map(s=>s.id);
export const SITE_BOSSES:BossDefinition[]=[
 {id:'loadwarden',name:'荷殻の番人',health:130,damage:9,color:'#bd9470',summon:{},reward:'wood',element:'physical'},
 {id:'echowarden',name:'響膜の番人',health:145,damage:9,color:'#8caec3',summon:{},reward:'crystal',element:'frost'},
 {id:'sailwarden',name:'帆環の番人',health:155,damage:10,color:'#b6bd79',summon:{},reward:'resin',element:'magic'},
];
export function siteBossAttack(id:string):BossAttack|undefined{
 if(id==='loadwarden')return {windup:2.2,cooldown:5,radius:3.2,charge:true,shots:0,element:'physical'};
 if(id==='echowarden')return {windup:1.9,cooldown:4.8,radius:7,charge:false,shots:3,element:'frost'};
 if(id==='sailwarden')return {windup:2.5,cooldown:5.5,radius:4.5,charge:false,shots:2,element:'magic'};
 return undefined;
}
/** Three communicating rooms, two open approaches and open roof bays. No terrain edits. */
export function sitePieces(site:number,x:number,y:number,z:number):Omit<BuildingState,'id'>[]{
 const pieces:Omit<BuildingState,'id'>[]=[];
 const add=(definition:string,dx:number,dy:number,dz:number,rotation=0)=>pieces.push({site,definition,x:x+dx,y:y+dy,z:z+dz,rotation,support:8,contents:{},salvage:{},health:100,shared:true});
 for(const dx of [-4,-2,0,2,4])for(const dz of [-3,-1,1,3])add('foundation',dx,-.2,dz);
 // South entrance and west side door remain physically open.
 for(const dx of [-4,-2,2,4])add('wall',dx,.15,4);for(const dx of [-4,-2,0,2,4])add('wall',dx,.15,-4);
 for(const dz of [-3,-1,1,3])add('wall',5,.15,dz,Math.PI/2);for(const dz of [-3,-1,3])add('wall',-5,.15,dz,Math.PI/2);
 // West room and two east rooms; 2m openings connect them.
 for(const dz of [-3,3])add('wall',-1,.15,dz,Math.PI/2);add('wall',4,.15,0);
 for(const [dx,dz]of[[-4,-3],[-2,-3],[2,-3],[4,-3],[-4,3],[4,3]])add(dx===4&&dz===3?'floor':'roof',dx,2.15,dz);
 // A permanent ordinary stair gives the roof route; destruction remains allowed.
 add('stairs',-3,.15,-5);return pieces;
}
export const SITE_ROOMS=[{id:0,name:'受け渡し室',x:-2.5,z:0},{id:1,name:'記録室',x:2.5,z:-2},{id:2,name:'機関室',x:2.5,z:2}] as const;
export const SITE_ROUTES={front:[{x:0,z:5},{x:0,z:3},{x:0,z:1},{x:2,z:1},{x:2,z:-1},{x:2,z:-2}],side:[{x:-6,z:1},{x:-4,z:1},{x:-2,z:1},{x:0,z:1},{x:2,z:1},{x:2,z:-1}]} as const;
