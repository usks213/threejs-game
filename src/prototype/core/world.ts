import { VoxelField } from './voxel';
export interface ObjectState {id:string;kind:'door'|'chest'|'tree'|'valve'|'altar';name:string;open:boolean;hp:number}
export function createArena(){
 const field=new VoxelField(),objects=new Map<string,ObjectState>();
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:number,id?:string)=>field.box({x,y,z},{x:x+w,y:y+h,z:z+d},m,id);
 // A small, entirely editable voxel volume. The pond is excavated out of this volume.
 box(-12,-1,-20,24,1.25,30,1);
 for(let x=-12;x<12;x+=.25)for(let z=-20;z<10;z+=.25){
  if(x>=4&&x<10&&z>=-5&&z<1){box(x,-.5,z,.25,.75,.25,0);continue;}
  box(x,0,z,.25,.25,.25,z<1&&Math.abs(x)<5?3:2);
 }
 // Ruined hall, stepped battlements, door frame and individually occupied masonry.
 box(-5,.25,-12,.5,3.75,13,3);box(4.5,.25,-12,.5,3.75,9,3);box(-5,.25,-12,10,3.75,.5,3);
 box(-5,.25,.75,4,3.5,.5,3);box(1,.25,.75,4,3.5,.5,3);box(-1,2.75,.75,2,1,.5,3);
 for(let z=-12;z<1;z+=2){box(-5,4,z,.5,.5,.75,3);if(z<-3)box(4.5,4,z,.5,.5,.75,3);}
 for(let x=-4.5;x<4.5;x+=2){box(x,4,-12,.75,.5,.5,3);}
 const object=(id:string,kind:ObjectState['kind'],name:string,hp=3)=>objects.set(id,{id,kind,name,open:false,hp});
 object('door','door','樫の扉');setDoor(field,false);
 object('chest','chest','補給箱');box(-3.25,.25,-3.75,1.5,.75,.75,4,'chest');box(-3.25,1,-3.75,1.5,.25,.75,5,'chest');box(-2.75,.65,-3.8,.25,.25,.125,6,'chest');
 for(const [i,x,z] of [[0,-7,3],[1,-8,-7],[2,8,4],[3,-7,-15]]){
  const id='tree'+i;object(id,'tree','樹木',4);box(x,.25,z,.5,3,.5,4,id);
  box(x-.75,2.25,z-.5,2,1.5,1.5,7,id);box(x-.5,3.75,z-.25,1.5,.75,1,7,id);
  box(x+.5,1.75,z,.75,.25,.25,4,id);
 }
 object('valve','valve','水門のレバー');box(3,.25,-3,.5,.75,.5,3,'valve');box(3.125,1,-3,.125,.5,.125,6,'valve');box(3,1.5,-3,.375,.125,.125,6,'valve');
 object('altar','altar','試練の碑');box(-1,.25,-10.75,2,.5,1,3,'altar');box(-.375,.75,-10.5,.75,1.25,.5,8,'altar');
 // Torches are voxel emissive solids, not imported meshes.
 for(const x of [-4,4]){box(x,.25,-5,.25,1.5,.25,4);box(x-.125,1.75,-5.125,.5,.5,.5,9);}
 box(6,-.5,-4,.25,.75,3,3); // A voxel obstacle that forces water around it.
 return {field,objects};
}
export function setDoor(field:VoxelField,open:boolean){
 field.removeObject('door');
 field.box(open?{x:-1,y:.25,z:1}:{x:-1,y:.25,z:.75},open?{x:-.75,y:2.75,z:3}:{x:1,y:2.75,z:1},4,'door');
}
export function creatureVoxels(){
 const f=new VoxelField(.125),b=(x:number,y:number,z:number,w:number,h:number,d:number,m:number)=>f.box({x,y,z},{x:x+w,y:y+h,z:z+d},m);
 b(-.25,.75,-.125,.5,.625,.375,10);b(-.25,1.375,-.125,.5,.375,.375,11);
 b(-.25,0,0,.125,.75,.25,10);b(.125,0,0,.125,.75,.25,10);
 b(-.5,.75,0,.125,.625,.25,10);b(.375,.75,0,.125,.625,.25,10);
 b(-.125,1.5,-.25,.125,.125,.125,9);b(.125,1.5,-.25,.125,.125,.125,9);
 b(.375,.375,-.75,.125,.125,1,6);b(.375,.375,-1.125,.125,.125,.375,11);
 return f;
}
