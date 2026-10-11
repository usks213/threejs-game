import {capsule,ellipsoid,type Vec3,type VoxelField} from './voxel';
import type {createArena,ObjectState} from './world';
import type {RegionalReward,RegionalTactic} from './regions';
import type {CampaignProfession} from './campaign';

/** Additive content identity. Connecting route samples intentionally change at legacy
 * borders: migration must retain existing absolute edits/tombstones, not reseed saves. */
export const WEST_EXPEDITION_MANIFEST='campaign-west-expedition-v1';
export const WEST_EXPEDITION_ACCESS={region:'resinwood',minimumFlameTier:2,recommendedMineTier:3} as const;
const p=(x:number,y:number,z:number):Vec3=>({x,y,z});
export interface WestRoute {id:string;name:string;nodes:Vec3[];width:number;shortcut?:string}
export const WEST_ROUTES:readonly WestRoute[]=[
 {id:'west-high-road',name:'琥珀枝の伐採道',width:3.2,nodes:[p(-30,.25,-6),p(-30,.25,-3),p(-36,.25,-3),p(-39,.5,-10),p(-46,.75,-13),p(-45,.75,-17),p(-51,.75,-19),p(-59,1.75,-23),p(-64,3,-30),p(-63.5,4.25,-34),p(-63,4.25,-38)]},
 {id:'west-low-road',name:'木運びの谷道',width:3,nodes:[p(-30,.25,-6),p(-30,.25,-3),p(-36,.25,-3),p(-36,.25,-18),p(-39,1.25,-22),p(-43,1.25,-26),p(-49,1.75,-25),p(-54,2.5,-31),p(-59,4.25,-35),p(-63,4.25,-35),p(-63,4.25,-38)]},
 {id:'west-mine-return',name:'開通した銅運び道',width:3,nodes:[p(-55.5,4.25,-43),p(-50,3.75,-39),p(-46,3.25,-33),p(-46,3.25,-29),p(-38,3.25,-29),p(-36,3.25,-22),p(-30,3.25,-23.6)],shortcut:'west-shortcut-gate'},
 {id:'west-settlement-crossing',name:'谷と集落の連絡路',width:2.8,nodes:[p(-49,.75,-18),p(-49,1.25,-22),p(-49,1.75,-25)]},
];
export const WEST_POIS=[
 {id:'west-log-hamlet',name:'木霊の荷場',tags:['settlement','camp'],position:p(-49,.75,-14),entry:p(-45,.75,-13),exit:p(-49,.75,-18),objective:'残された補給と樹脂を集め、帰還炉を点火する',obstacle:'斧兵の巡回と荷場の射手',rewardPoint:'west-hamlet-cache'},
 {id:'west-fork-mine',name:'二口の響銅坑',tags:['mine','treasure'],position:p(-61,4.25,-43),entry:p(-63,4.25,-38),exit:p(-55.5,4.25,-43),objective:'左右の坑道で鉱脈を回収し、運搬門の開閉機を操作する',obstacle:'中央の岩柱、坑夫の盾守、詠唱する採掘監視者',rewardPoint:'west-mine-cache'},
] as const;
export interface WestPoint {id:string;name:string;kind:ObjectState['kind'];position:Vec3;reward:RegionalReward;requires?:string[];lore?:string}
export interface WestSpecialist extends WestPoint {
 kind:'artisan';role:CampaignProfession;homePosition:Vec3;requiresClaims:readonly string[];requiresDefeats:readonly string[];
 recipes:readonly string[];rescueHint:string;dialogue:string;
}
/** Rescues are optional side progression. Residents move once to a real SDF body
 * in the roofed hamlet; no daily schedule or walking/escort AI is implied. */
export const WEST_SPECIALISTS:readonly WestSpecialist[]=[
 {id:'west-carpenter',name:'木工師マキ',kind:'artisan',role:'carpenter',position:p(-43.5,.75,-17),homePosition:p(-50.5,.75,-11.5),requiresClaims:['west-hamlet-cache','west-return-hearth'],requiresDefeats:['west-axeguard'],recipes:['windwoven-glider'],reward:{materials:{4:8,10:4},xp:60},rescueHint:'荷場の斧兵を倒し、保存箱の補給と帰還炉を確保する',dialogue:'樹脂で木枠をしならせると、速く長く飛べる。木霊の風織り翼を灯守りの炉か木霊の帰還炉で作ろう。木材10・布8・琥珀樹脂4が必要だ。'},
 {id:'west-alchemist',name:'錬金師セナ',kind:'artisan',role:'alchemist',position:p(-64.25,4.25,-40.15),homePosition:p(-51,.75,-13.8),requiresClaims:['west-return-hearth','west-mine-switch'],requiresDefeats:['west-pitguard','west-orewatch'],recipes:['resin-staff'],reward:{materials:{7:6,6:4},xp:80},rescueHint:'帰還炉を確保し、坑道の盾守と監視者を倒して運搬門を開く',dialogue:'鳴銅と琥珀樹脂で術を調律する。響銅の調律杖は属性術の威力を40%高める。炉で木材6・石4・鳴銅2・琥珀樹脂2を組み合わせよう。'},
];
export const WEST_POINTS:readonly WestPoint[]=[
 {id:'west-hamlet-cache',name:'荷守りの保存箱',kind:'cache',position:p(-50,.75,-13),reward:{materials:{4:12,10:3},items:{'amber-resin':2},xp:45}},
 {id:'west-return-hearth',name:'木霊の帰還炉',kind:'hearth',position:p(-46.5,.75,-16),reward:{xp:15}},
 {id:'west-mine-cache',name:'二口坑の共同金庫',kind:'cache',position:p(-58,4.25,-45),reward:{materials:{6:10,3:8},items:{'singing-copper':2},xp:70}},
 {id:'west-mine-switch',name:'銅運び道の開閉機',kind:'valve',position:p(-64,4.25,-44.5),reward:{xp:40}},
 {id:'west-shortcut-gate',name:'銅運び道の運搬門',kind:'gate',position:p(-42,3.25,-29),reward:{xp:0},requires:['west-mine-switch']},
 {id:'west-logging-note',name:'荷場の引継ぎ板',kind:'altar',position:p(-52,.75,-17),reward:{items:{'lore-leaf':1},xp:20},lore:'一人が道を開け、もう一人が灯を残す。空の荷車も帰り道を覚えている。'},
 ...WEST_SPECIALISTS,
];
export const WEST_RESOURCES:readonly WestPoint[]=[
 {id:'west-resin-a',name:'荷場の琥珀樹脂',kind:'resource',position:p(-44,.75,-10),reward:{materials:{4:6},items:{'amber-resin':2},xp:10}},
 {id:'west-timber-a',name:'伐り出し材の束',kind:'resource',position:p(-52,.75,-11),reward:{materials:{4:12},xp:10}},
 {id:'west-herb-a',name:'谷風の薬草',kind:'plant',position:p(-43,1.25,-25),reward:{materials:{7:6},items:{'sun-herb':2},xp:10}},
 {id:'west-stone-a',name:'尾根の露出岩',kind:'resource',position:p(-61.7,2.8,-29.4),reward:{materials:{3:12},xp:10}},
 {id:'west-copper-a',name:'西坑の鳴銅脈',kind:'resource',position:p(-64,4.25,-41),reward:{materials:{6:6},items:{'singing-copper':2},xp:15}},
 {id:'west-copper-b',name:'東坑の鳴銅脈',kind:'resource',position:p(-58,4.25,-40),reward:{materials:{6:6},items:{'singing-copper':2},xp:15}},
];
export const WEST_ENCOUNTERS:readonly {id:string;name:string;position:Vec3;tactic:RegionalTactic;hp:number;damage:number;reward:RegionalReward}[]=[
 {id:'west-axeguard',name:'荷場の斧兵',position:p(-47,.75,-11),tactic:'melee',hp:90,damage:12,reward:{materials:{4:3},xp:25}},
 {id:'west-lookout',name:'谷道の射手',position:p(-45,1.25,-25),tactic:'archer',hp:85,damage:14,reward:{materials:{10:2},xp:30}},
 {id:'west-pitguard',name:'西坑の盾守',position:p(-63,4.25,-42),tactic:'spear',hp:130,damage:17,reward:{materials:{6:3},xp:40}},
 {id:'west-orewatch',name:'響銅の監視者',position:p(-58,4.25,-43),tactic:'caster',hp:120,damage:18,reward:{materials:{6:4},xp:45}},
];
export const WEST_QUESTS=[
 {id:'west-supply-road',name:'消えた荷場の灯',requires:['region-resinwood'],objectives:['west-hamlet-cache','west-return-hearth'],reward:{xp:45},next:'west-two-mouths'},
 {id:'west-two-mouths',name:'二つの出口をつなぐ',requires:['west-supply-road'],objectives:['west-mine-cache','west-mine-switch'],reward:{xp:70},next:'west-safe-return'},
 {id:'west-safe-return',name:'銅運び道の帰還',requires:['west-two-mouths'],objectives:['west-shortcut-gate'],reward:{xp:30},next:'free-exploration'},
] as const;
export const WEST_SPECIALIST_QUESTS=[
 {id:'west-rescue-carpenter',name:'荷場に木工師を迎える',specialist:'west-carpenter',objectives:['west-carpenter'],reward:{xp:25}},
 {id:'west-rescue-alchemist',name:'坑道から錬金師を救う',specialist:'west-alchemist',objectives:['west-alchemist'],reward:{xp:35}},
] as const;
export const WEST_MINE_CLEARANCE=[p(-63,4.3,-37.5),p(-63,4.3,-39),p(-63,4.3,-43),p(-61,4.3,-45),p(-58,4.3,-43),p(-55,4.3,-43)] as const;
export const WEST_SHORTCUT_CLEARANCE=p(-42,3.28,-29);

/** Author and relocate the same protected object identity. Arms and role tools
 * remain solid SDF surfaces, so targeting, mesh and collision share one body. */
export function setWestSpecialistLocation(field:VoxelField,specialist:WestSpecialist,rescued:boolean){
 const q=rescued?specialist.homePosition:specialist.position,id=specialist.id;
 field.removeObject(id);
 const limb=(a:Vec3,b:Vec3,r:number,m:number)=>field.shape(p(Math.min(a.x,b.x)-r,Math.min(a.y,b.y)-r,Math.min(a.z,b.z)-r),p(Math.max(a.x,b.x)+r,Math.max(a.y,b.y)+r,Math.max(a.z,b.z)+r),capsule(a,b,r),m,id);
 const orb=(c:Vec3,r:Vec3,m:number)=>field.shape(p(c.x-r.x,c.y-r.y,c.z-r.z),p(c.x+r.x,c.y+r.y,c.z+r.z),ellipsoid(c,r),m,id);
 for(const dx of [-.13,.13])limb(p(q.x+dx,q.y+.13,q.z),p(q.x+dx,q.y+.62,q.z),.12,5);
 limb(p(q.x,q.y+.62,q.z),p(q.x,q.y+1.15,q.z),.25,10);
 orb(p(q.x,q.y+1.51,q.z),p(.19,.24,.19),5);
 for(const dx of [-.3,.3])limb(p(q.x+dx,q.y+1.1,q.z),p(q.x+dx,q.y+.78,q.z-.04),.1,10);
 if(specialist.role==='carpenter')limb(p(q.x-.32,q.y+.9,q.z-.2),p(q.x+.3,q.y+.9,q.z-.2),.09,4);
 else orb(p(q.x+.29,q.y+.82,q.z-.18),p(.12,.16,.12),6);
}

export function setWestShortcut(field:VoxelField,open:boolean){
 field.removeObject('west-shortcut-gate');
 // Open gate folds alongside its northern stone support, leaving the full road clear.
 field.box(open?p(-42.2,3.25,-30.8):p(-42.2,3.25,-30.4),open?p(-39.8,5.8,-30.5):p(-41.8,5.8,-27.6),6,'west-shortcut-gate',.04);
}
/** Host action helper applies geometry/state once. Reward claims remain the campaign's job. */
export function operateWestSwitch(arena:ReturnType<typeof createArena>,switchId:string){
 if(switchId!=='west-mine-switch')return false;const control=arena.objects.get(switchId),gate=arena.objects.get('west-shortcut-gate');if(!control||!gate||control.open)return false;
 setWestShortcut(arena.field,true);control.open=true;gate.open=true;return true;
}

/** Pure authoring entry point: accepts a recorder for bounded generation. It never
 * activates content or changes a global factory, save identity, or existing quest state. */
export function authorWesternExpedition(arena:ReturnType<typeof createArena>):ReturnType<typeof createArena>{
 const {field,objects}=arena;
 const box=(a:Vec3,b:Vec3,m:number,id?:string,r=.08)=>field.box(a,b,m,id,r);
 const orb=(c:Vec3,r:Vec3,m:number,id?:string)=>field.shape(p(c.x-r.x,c.y-r.y,c.z-r.z),p(c.x+r.x,c.y+r.y,c.z+r.z),ellipsoid(c,r),m,id);
 const limb=(a:Vec3,b:Vec3,r:number,m:number,id?:string)=>field.shape(p(Math.min(a.x,b.x)-r,Math.min(a.y,b.y)-r,Math.min(a.z,b.z)-r),p(Math.max(a.x,b.x)+r,Math.max(a.y,b.y)+r,Math.max(a.z,b.z)+r),capsule(a,b,r),m,id);
 const floor=(x:number,z:number,w:number,d:number,y:number,m=2)=>box(p(x,y-.8,z),p(x+w,y,z+d),m,undefined,.18);
 // Three broader clearings joined by two independently walkable approaches.
 floor(-54,-21,13,14,.75);floor(-48,-28,9,6,1.25);floor(-67,-48,13,12,4.25,3);floor(-62.5,-30.1,1.6,1.4,2.8,3);
 for(const route of WEST_ROUTES)for(let i=1;i<route.nodes.length;i++){const a=route.nodes[i-1],b=route.nodes[i],dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz,r=route.width/2;
  field.shape(p(Math.min(a.x,b.x)-r,Math.min(a.y,b.y)-.8,Math.min(a.z,b.z)-r),p(Math.max(a.x,b.x)+r,Math.max(a.y,b.y),Math.max(a.z,b.z)+r),q=>{const length=Math.sqrt(length2),along=((q.x-a.x)*dx+(q.z-a.z)*dz)/length,across=Math.abs((q.x-a.x)*dz-(q.z-a.z)*dx)/length,t=Math.max(0,Math.min(1,along/length)),top=a.y+(b.y-a.y)*t;return Math.max(across-r,-along-.12,along-length-.12,q.y-top,top-.75-q.y);},route.id==='west-high-road'?2:3);
 }
 // Hamlet: roofed storehouse, visible doorway, open work yard, abandoned cart platform.
 box(p(-52,.75,-15),p(-51.65,3.55,-11),5);box(p(-52,.75,-15),p(-48,3.55,-14.65),4);
 box(p(-52,3.55,-15),p(-47.8,3.85,-10.8),5);limb(p(-48,.75,-11),p(-48,3.55,-11),.22,4);
 box(p(-44,.75,-21),p(-41,1.2,-19),4);for(const x of [-43.5,-41.5])orb(p(x,1,-19),p(.3,.3,.16),3);
 // Mine dome has two genuine exits and a bifurcated interior around the central pillar.
 orb(p(-61,5.5,-42),p(5.8,3.2,5.6),3);
 box(p(-64.7,4.2,-45.9),p(-57,6.8,-39),0,undefined,.12);
 box(p(-64.2,4.2,-40),p(-61.8,6.8,-35.5),0);
 box(p(-58,4.2,-44.2),p(-53.5,6.8,-41.8),0);
 orb(p(-61,5.45,-42),p(.75,1.3,.8),3);
 for(const z of [-38.7,-44.8]){for(const x of [-64.1,-62])limb(p(x,4.25,z),p(x,6.7,z),.2,5);limb(p(-64.1,6.7,z),p(-62,6.7,z),.2,5);}
 // The switch controls an actual obstacle across the return road; a long alternate road remains.
 for(const z of [-30.75,-27.25])box(p(-44,3.25,z-.2),p(-40,6,z+.2),3);
 box(p(-42.5,5.8,-31),p(-41.5,6.2,-27),3);setWestShortcut(field,false);
 // Original broadleaf silhouettes and rock shoulders leave the routes readable.
 for(const [i,x,y,z] of [[0,-40,.5,-8],[1,-53,.75,-19],[2,-43,.75,-8],[3,-58,1.75,-24],[4,-65,3,-31],[5,-48,1.25,-27]]){
  const id=`west-tree-${i}`;objects.set(id,{id,kind:'tree',name:'荷場の広葉樹',open:false,hp:100});limb(p(x,y,z),p(x+.1,y+3.5,z),.25,4,id);orb(p(x-.5,y+3.4,z),p(1.1,.9,1),7,id);orb(p(x+.7,y+3.8,z+.3),p(.9,.75,.85),7,id);
 }
 for(const [x,y,z] of [[-55,.75,-18],[-60.5,2.3,-27.5],[-44,2.8,-35]])orb(p(x,y,z),p(1,.75,.85),3);
 for(const point of [...WEST_POINTS,...WEST_RESOURCES]){const {id,name,kind,position:q}=point;objects.set(id,{id,name,kind,open:false,hp:100});
  if(kind==='gate')continue;
  if(kind==='artisan')setWestSpecialistLocation(field,WEST_SPECIALISTS.find(s=>s.id===id)!,false);
  else if(kind==='cache'){box(p(q.x-.4,q.y,q.z-.35),p(q.x+.4,q.y+.6,q.z+.35),4,id,.08);box(p(q.x-.1,q.y+.2,q.z-.4),p(q.x+.1,q.y+.4,q.z-.25),6,id);}
  else if(kind==='hearth'){orb(p(q.x,q.y+.2,q.z),p(.6,.25,.6),3,id);orb(p(q.x,q.y+.65,q.z),p(.22,.4,.22),9,id);}
  else if(kind==='valve'){box(q,p(q.x+.5,q.y+.5,q.z+.5),3,id);limb(p(q.x+.25,q.y+.5,q.z+.25),p(q.x+.25,q.y+1.25,q.z),.2,6,id);}
  else if(kind==='altar')box(q,p(q.x+.65,q.y+1,q.z+.25),8,id);
  else if(kind==='plant'){orb(p(q.x,q.y+.35,q.z),p(.5,.4,.5),7,id);orb(p(q.x+.1,q.y+.6,q.z),p(.18,.18,.18),8,id);}
  else if(id==='west-timber-a'){for(const dz of [-.3,.3])limb(p(q.x-.75,q.y+.3,q.z+dz),p(q.x+.75,q.y+.3,q.z+dz),.25,4,id);}
  else{orb(p(q.x,q.y+.35,q.z),p(.6,.55,.5),3,id);orb(p(q.x-.2,q.y+.6,q.z-.15),p(.3,.3,.3),id.includes('copper')?6:8,id);}
 }
 return arena;
}
