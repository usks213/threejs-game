import type { BuildingState } from '../types';
export function roofHeight(id:string,x:number,z:number):number|null{
 const height=id.includes('45')?2:1;
 if(id==='roof'||id==='roof45')return (z+1)*height/2;
 if(id==='ridge'||id==='ridge45')return (1-Math.abs(z))*height/2;
 if(id==='roofCorner'||id==='roofCorner45')return Math.min(x+1,z+1)*height/2;
 if(id==='roofInner'||id==='roofInner45')return Math.max(x+1,z+1)*height/2;
 return null;
}
export function surfaceHeight(b:BuildingState,x:number,z:number):number|null{
 const roof=roofHeight(b.definition,x,z);if(roof!==null)return b.y+roof+.12;
 if(b.definition==='stairs'||b.definition==='ladder')return b.y+Math.max(0,Math.min(2,z+1));
 return null;
}
