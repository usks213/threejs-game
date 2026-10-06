import { MERCHANT_STALL } from '../../content/adventure-people';
export type PersonPart=(shape:'box'|'sphere'|'cone',color:string,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>void;
/** Scene assembly is shared by real rendering and bounds verification. */
export function addPersonModel(role:'guide'|'practice'|undefined,add:PersonPart):void{
     if(role==='practice'){
      // A rescue mannequin, not a market stall surrounding the arrival camera.
      add('box','#a58a5d',0,.78,0,.4,.7,.22);
      add('box','#c7b483',0,1.33,0,.3,.32,.28);
      add('box','#76553d',0,.26,0,.15,.52,.15);
      add('box','#76553d',0,.06,0,.65,.12,.55);
      add('box','#a58a5d',0,.99,0,1,.13,.16);
      add('box','#719dad',0,.87,.13,.3,.22,.035);
      return;
     }
     const coat=role==='guide'?'#719dad':'#8a6c4d';
     add('box',coat,0,.7,0,.55,1.25,.4);add('sphere','#d1ac81',0,1.6,0,.55,.55,.55);add('cone','#7d5147',0,1.98,0,.37,.22,.37);
     for(const side of [-1,1]){add('box',coat,side*.36,.85,0,.16,.6,.17);add('box','#574632',side*.16,.18,0,.2,.35,.26);}
     if(!role)for(const p of MERCHANT_STALL)add('box',p.color,p.x,p.y,p.z,p.sx,p.sy,p.sz);
}
