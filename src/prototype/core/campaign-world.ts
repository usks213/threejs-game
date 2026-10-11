import {capsule,ellipsoid,type Vec3} from './voxel';
import type {createArena,ObjectState} from './world';
/** Original compact open region, with physical side paths rather than copied game geography. */
export function extendCampaignArena(arena:ReturnType<typeof createArena>,includeTerrain=true){
 const {field,objects}=arena;
 for(const [id,name] of Object.entries({'sample-wood':'倒れた丸太','sample-stone':'崩れた炉石','sample-grass':'繊維草の茂み','sample-metal':'放置された鉱材',valve:'旧水路の水門',altar:'灯守りの記憶碑'})){const object=objects.get(id);if(object)object.name=name;}
 const box=(a:Vec3,b:Vec3,m:number,id?:string,r=.07)=>field.box(a,b,m,id,r);
 const orb=(p:Vec3,r:Vec3,m:number,id?:string)=>field.shape({x:p.x-r.x,y:p.y-r.y,z:p.z-r.z},{x:p.x+r.x,y:p.y+r.y,z:p.z+r.z},ellipsoid(p,r),m,id);
 const limb=(a:Vec3,b:Vec3,r:number,m:number,id?:string)=>field.shape({x:Math.min(a.x,b.x)-r,y:Math.min(a.y,b.y)-r,z:Math.min(a.z,b.z)-r},{x:Math.max(a.x,b.x)+r,y:Math.max(a.y,b.y)+r,z:Math.max(a.z,b.z)+r},capsule(a,b,r),m,id);
 const add=(id:string,kind:ObjectState['kind'],name:string)=>objects.set(id,{id,kind,name,open:false,hp:100});
 // Joined outer land: low western forest, eastern marsh and northern ridge.
 if(includeTerrain)field.shape({x:-18,y:-1,z:-42},{x:18,y:4,z:11},p=>{const ridge=Math.max(0,Math.min(3,(-p.z-20)*.25)),wave=Math.abs(p.x)>12?Math.sin(p.x*.55+p.z*.25)*.14:0,top=.25+ridge+wave;return Math.max(p.y-top,-1-p.y,Math.abs(p.x)-18,Math.abs(p.z+15.5)-26.5);},2);
 // Preserve the open basin authored by the original trial after adding the surrounding land.
 box({x:4,y:-.5,z:-5},{x:10,y:1,z:1},0);
 box({x:-1,y:.25,z:-12.4},{x:1,y:2.8,z:-11.3},0); // northern crypt passage
 // Distinct plateau in the mist, with a real grapple ascent and glide return.
 box({x:5.6,y:.2,z:-10.6},{x:9.3,y:3.25,z:-6.5},3,'mist-plateau',.32);
 add('grapple-mist','anchor','鉤縄の支柱');limb({x:7,y:3.25,z:-6.8},{x:7,y:4.4,z:-6.8},.14,6,'grapple-mist');
 add('mist-cache','cache','霧晶の保管庫');box({x:6.6,y:3.25,z:-9.4},{x:7.4,y:3.9,z:-8.6},6,'mist-cache',.12);
 add('hearth','hearth','火守りの炉');box({x:-3.5,y:.25,z:3.5},{x:-2.5,y:.65,z:4.5},3,'hearth',.18);orb({x:-3,y:.95,z:4},{x:.18,y:.35,z:.18},9,'hearth');
 add('artisan','artisan','囚われの工匠');field.removeObject('chest');objects.delete('chest');
 limb({x:-2.5,y:.3,z:-3.5},{x:-2.5,y:1.4,z:-3.5},.24,10,'artisan');orb({x:-2.5,y:1.65,z:-3.5},{x:.19,y:.23,z:.19},5,'artisan');
 add('ridge-gate','gate','銅風の道標');box({x:-.45,y:.25,z:-17.3},{x:.45,y:2.25,z:-16.8},6,'ridge-gate',.15);
 add('nextcamp','hearth','尾根の灯台');box({x:-.6,y:3.25,z:-31.6},{x:.6,y:4.05,z:-30.4},3,'nextcamp',.15);orb({x:0,y:4.5,z:-31},{x:.22,y:.45,z:.22},9,'nextcamp');
 // Western woods and ruined shelter give independent exploration directions.
 for(const [i,x,z] of [[0,-14,6],[1,-15,-3],[2,-13,-11],[3,14,5],[4,15,-17]]){const id='campaign-tree'+i;add(id,'tree','森の樹木');limb({x,y:.25,z},{x:x+.12,y:3.6,z},.3,4,id);orb({x,y:4.1,z},{x:1.1,y:1.4,z:1.1},7,id);}
 box({x:-16,y:.25,z:-7},{x:-15.65,y:2.6,z:-3},3);box({x:-16,y:.25,z:-7},{x:-12,y:2.6,z:-6.65},3);box({x:-16,y:2.6,z:-7},{x:-12,y:2.85,z:-3},4);
 add('forest-chest','cache','森番の遺した箱');box({x:-14.5,y:.25,z:-5.5},{x:-13.7,y:.9,z:-4.7},4,'forest-chest',.1);
 add('ridge-chest','cache','尾根の収集箱');box({x:7,y:3.25,z:-34},{x:7.8,y:3.9,z:-33.2},6,'ridge-chest',.1);
 // Visible food resources with independent, finite gathering identities.
 for(let i=0;i<7;i++){const x=-5-(i%3)*2,z=7-Math.floor(i/3)*2,id='berries-'+i;add(id,'plant','赤実の低木');orb({x,y:.55,z},{x:.38,y:.45,z:.38},7,id);orb({x:x+.1,y:.85,z},{x:.14,y:.14,z:.14},9,id);}
 return arena;
}
