import {capsule,ellipsoid,type Vec3} from './voxel';
import type {createArena,ObjectState} from './world';
import {REGIONS,REGIONAL_POINTS} from './regions';

/** Additional compact SDF pockets. Slabs and short route segments keep authoring bounded;
 * no full-world high-resolution bounding-box pass is needed. Returns the same arena. */
export function extendRegionalWorld(arena:ReturnType<typeof createArena>):ReturnType<typeof createArena>{
 const {field,objects}=arena;
 const p=(x:number,y:number,z:number):Vec3=>({x,y,z});
 const box=(a:Vec3,b:Vec3,m:number,id?:string,r=.06)=>field.box(a,b,m,id,r);
 const orb=(c:Vec3,r:Vec3,m:number,id?:string)=>field.shape(p(c.x-r.x,c.y-r.y,c.z-r.z),p(c.x+r.x,c.y+r.y,c.z+r.z),ellipsoid(c,r),m,id);
 const limb=(a:Vec3,b:Vec3,r:number,m:number,id?:string)=>field.shape(p(Math.min(a.x,b.x)-r,Math.min(a.y,b.y)-r,Math.min(a.z,b.z)-r),p(Math.max(a.x,b.x)+r,Math.max(a.y,b.y)+r,Math.max(a.z,b.z)+r),capsule(a,b,r),m,id);
 const object=(id:string,kind:ObjectState['kind'],name:string)=>objects.set(id,{id,kind,name,open:false,hp:100});
 const route=(a:Vec3,b:Vec3)=>{
  const dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
  field.shape(p(Math.min(a.x,b.x)-1.15,Math.min(a.y,b.y)-.8,Math.min(a.z,b.z)-1.15),p(Math.max(a.x,b.x)+1.15,Math.max(a.y,b.y)+.1,Math.max(a.z,b.z)+1.15),v=>{
   const t=Math.max(0,Math.min(1,((v.x-a.x)*dx+(v.z-a.z)*dz)/(len2||1))),top=a.y+(b.y-a.y)*t;
   return Math.max(Math.hypot(v.x-a.x-dx*t,v.z-a.z-dz*t)-1.15,v.y-top,top-.75-v.y);
  },3);
 };
 for(const r of REGIONS){const b=r.bounds,y=r.groundY;
  box(p(b.minX,y-.85,b.minZ),p(b.maxX,y,b.maxZ),r.material,undefined,.15);
  for(let i=1;i<r.route.length;i++)route(r.route[i-1],r.route[i]);
  // Eroded peripheral rocks give each pocket a readable silhouette without hiding its entry.
  for(let i=0;i<3;i++){const x=b.minX+1+i*3.7,z=b.minZ+.7;orb(p(x,y+.2,z),p(.75,.5+i*.2,.65),3);}
 }
 // Hamlet: open doorway, room interior, roof and a crumbled second wall.
 box(p(-27,.25,1),p(-26.65,2.8,5),3);box(p(-27,.25,1),p(-23,2.8,1.35),3);
 box(p(-27,2.8,1),p(-23,3.1,5),4);limb(p(-23.2,.25,4.8),p(-23.2,2.8,4.8),.2,4);
 box(p(-27,.25,5),p(-25.8,1.25,5.35),3);
 // Forest cave: subtract a walk-in chamber and wide southern mouth from an ellipsoid.
 orb(p(-30,1.5,-10),p(3.3,2.4,3.4),3);
 box(p(-31.6,.2,-12.1),p(-28.4,2.65,-7.5),0,undefined,.18);
 box(p(-31,.2,-8),p(-29,2.4,-6.4),0);
 // Tower platform with an entirely walkable stair; night-only text is runtime gated.
 for(let i=0;i<8;i++)box(p(-27+i*.25,.25,-12.8),p(-26.65+i*.25,.5+i*.25,-11.2),3);
 box(p(-25.7,.25,-12.7),p(-24.3,2.25,-11.3),3);
 limb(p(-25.65,2.25,-12.6),p(-25.65,4,-12.6),.2,4);limb(p(-24.4,2.25,-12.6),p(-24.4,4,-12.6),.2,4);
 box(p(-25.9,4,-12.9),p(-24.1,4.25,-11.1),4);
 // Rootfen: two-metre elevated shrine, root-supported deck and stair alternative.
 box(p(25.5,2,-15.7),p(30,2.25,-12.8),4);
 for(const x of [26,29.5]){limb(p(x,.25,-15),p(x+.2,3.6,-15),.33,4);orb(p(x+.2,4,-15),p(.95,.65,1.1),7);}
 for(let i=0;i<8;i++)box(p(23.4+i*.3,.25,-14),p(23.85+i*.3,.5+i*.25,-12.8),4);
 limb(p(26,2.25,-15.5),p(26,4,-15.5),.2,3);limb(p(29.5,2.25,-15.5),p(29.5,4,-15.5),.2,3);
 box(p(25.7,4,-15.9),p(29.8,4.3,-14.9),3);
 // Mine: rounded rocky hood, a real tunnel, timber support portals and exposed ore.
 orb(p(-30,4.55,-28),p(3.25,2.5,3.4),3);
 box(p(-31.5,3.2,-30.3),p(-28.4,5.7,-24.7),0,undefined,.12);
 box(p(-31,3.2,-25.3),p(-29,5.5,-23.9),0);
 for(const z of [-25.5,-28.5]){for(const x of [-31.25,-28.65])limb(p(x,3.25,z),p(x,5.6,z),.2,5);limb(p(-31.25,5.6,z),p(-28.65,5.6,z),.2,5);}
 // Castle: courtyard, gate with open arch, battlements, roofed side crypt and bell tower.
 box(p(24,3.25,-36),p(24.4,6,-29),3);box(p(30.6,3.25,-36),p(31,6,-29),3);box(p(24,3.25,-36),p(31,6,-35.6),3);
 box(p(24,3.25,-29.4),p(25.1,5.6,-29),3);box(p(27,3.25,-29.4),p(31,5.6,-29),3);box(p(25.1,5.6,-29.4),p(27,6.1,-29),3);
 for(const x of [24,26,28,30])box(p(x,6,-36),p(x+.7,6.6,-35.6),3);
 box(p(28.2,5.9,-35.5),p(30.6,6.2,-33.6),3);
 for(const x of [24.6,26])limb(p(x,3.25,-35),p(x,7.4,-35),.28,3);
 box(p(24.3,7.4,-35.4),p(26.3,7.7,-34.6),3);orb(p(25.3,6.9,-35),p(.4,.45,.35),6);
 // Snow: a roofed refuge and pale frost seams, with a raised combat clearing.
 for(const x of [-11,-9])limb(p(x,5.25,-47.5),p(x,7.5,-47.5),.2,3);
 box(p(-11.5,7.5,-48),p(-8.5,7.8,-46),3);
 for(const [x,z] of [[-11,-50],[-3,-53],[-3,-49]])orb(p(x,5.35,z),p(.6,.22,1.15),8);
 // Lake: physical depressed basin with shallow return steps along its western bank.
 box(p(11,1.2,-52),p(16,3.7,-47),0,undefined,.2);
 box(p(11,1.05,-52),p(16,1.25,-47),3);
 for(let i=0;i<8;i++)box(p(10.9+i*.25,1.25,-48.4),p(11.25+i*.25,3.25-i*.25,-47.2),3);
 // Submerged temple columns leave room above the lakebed for a swimming character.
 for(const x of [11.5,15.5])limb(p(x,1.25,-51.5),p(x,3.6,-51.5),.2,3);
 box(p(11.2,3.6,-51.8),p(15.8,3.85,-51.2),3);
 // Trees differ in silhouette: broadleaf woodland, tall rootfen and tiered alpine conifers.
 const trees:[string,number,number,number,'broad'|'pine'|'small'][]=[
  ['field-a',-20,.25,9,'small'],['field-b',-27,.25,7,'small'],['wood-a',-33,.25,-12,'broad'],['wood-b',-26,.25,-5,'broad'],['wood-c',-33,.25,-5,'broad'],['fen-a',31,.25,-16,'broad'],['snow-a',-11,5.25,-45,'pine'],['snow-b',-3,5.25,-51,'pine'],['lake-a',17,3.25,-45,'small']
 ];
 for(const [key,x,y,z,form] of trees){const id=`rg-tree-${key}`,h=form==='small'?2:3.8;object(id,'tree',form==='pine'?'雪風の針葉樹':'地域の樹木');limb(p(x,y,z),p(x,y+h,z),.23,4,id);
  if(form==='pine')for(let i=0;i<3;i++)orb(p(x,y+1.6+i*.85,z),p(1.05-i*.22,.85,1.05-i*.22),7,id);
  else for(const [dx,dz] of [[-.6,0],[.6,.3],[0,-.4]]){limb(p(x,y+h*.6,z),p(x+dx,y+h,z+dz),.2,4,id);orb(p(x+dx,y+h,z+dz),p(form==='small'?.65:1,.7,.8),7,id);}
 }
 // Every catalogue point is an actual persistent object layer, not merely a map label.
 for(const point of REGIONAL_POINTS){const {id,kind,name,position:q}=point;object(id,kind,name);
  if(kind==='cache'){box(p(q.x-.4,q.y,q.z-.3),p(q.x+.4,q.y+.6,q.z+.3),4,id,.1);box(p(q.x-.08,q.y+.2,q.z-.36),p(q.x+.08,q.y+.45,q.z-.27),6,id);}
  else if(kind==='hearth'){orb(p(q.x,q.y+.2,q.z),p(.55,.25,.55),3,id);orb(p(q.x,q.y+.65,q.z),p(.2,.4,.2),9,id);}
  else if(kind==='anchor'){limb(q,p(q.x,q.y+1.25,q.z),.22,6,id);limb(p(q.x-.35,q.y+1.1,q.z),p(q.x+.35,q.y+1.1,q.z),.2,6,id);}
  else if(kind==='plant'){orb(p(q.x,q.y+.45,q.z),p(.5,.5,.5),7,id);orb(p(q.x+.15,q.y+.75,q.z),p(.17,.22,.15),8,id);}
  else if(kind==='altar'){box(q,p(q.x+.6,q.y+1,q.z+.2),8,id,.1);}
  else {orb(p(q.x,q.y+.45,q.z),p(.6,.6,.5),3,id);orb(p(q.x-.22,q.y+.7,q.z-.2),p(.27,.28,.25),kind==='resource'?6:7,id);}
 }
 return arena;
}
