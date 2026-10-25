import type {Vec3,SymmetricTensor,MassComponent} from './types';
export const diagonalTensor=(x:number,y:number,z:number):SymmetricTensor=>({xx:x,yy:y,zz:z,xy:0,xz:0,yz:0});
export const multiplyTensor=(i:SymmetricTensor,v:Vec3):Vec3=>({x:i.xx*v.x+i.xy*v.y+i.xz*v.z,y:i.xy*v.x+i.yy*v.y+i.yz*v.z,z:i.xz*v.x+i.yz*v.y+i.zz*v.z});
export function tensorDeterminant(i:SymmetricTensor):number{return i.xx*(i.yy*i.zz-i.yz*i.yz)-i.xy*(i.xy*i.zz-i.yz*i.xz)+i.xz*(i.xy*i.yz-i.yy*i.xz);}
export function positiveDefinite(i:SymmetricTensor):boolean{return Object.values(i).every(Number.isFinite)&&i.xx>0&&i.xx*i.yy-i.xy*i.xy>0&&tensorDeterminant(i)>0;}
export function inverseTensor(i:SymmetricTensor):SymmetricTensor{const d=tensorDeterminant(i);return{xx:(i.yy*i.zz-i.yz*i.yz)/d,yy:(i.xx*i.zz-i.xz*i.xz)/d,zz:(i.xx*i.yy-i.xy*i.xy)/d,xy:(i.xz*i.yz-i.xy*i.zz)/d,xz:(i.xy*i.yz-i.xz*i.yy)/d,yz:(i.xy*i.xz-i.xx*i.yz)/d};}
export function combineMassComponents(components:MassComponent[]):{mass:number;center:Vec3;inertia:SymmetricTensor}{
  const mass=components.reduce((s,p)=>s+p.mass,0);if(!(mass>0))throw new Error('Positive component mass required');
  const center=components.reduce((c,p)=>({x:c.x+p.mass*p.center.x/mass,y:c.y+p.mass*p.center.y/mass,z:c.z+p.mass*p.center.z/mass}),{x:0,y:0,z:0});
  const inertia=diagonalTensor(0,0,0);
  for(const p of components){const x=p.center.x-center.x,y=p.center.y-center.y,z=p.center.z-center.z,m=p.mass;inertia.xx+=p.inertia.xx+m*(y*y+z*z);inertia.yy+=p.inertia.yy+m*(x*x+z*z);inertia.zz+=p.inertia.zz+m*(x*x+y*y);inertia.xy+=p.inertia.xy-m*x*y;inertia.xz+=p.inertia.xz-m*x*z;inertia.yz+=p.inertia.yz-m*y*z;}
  return{mass,center,inertia};
}
