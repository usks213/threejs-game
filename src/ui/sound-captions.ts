import {SkyContactCursor} from '../game/skybound/contact-events';
import type {Snapshot} from '../simulation/protocol';
/** Snapshot-driven captions also work when audio is muted or autoplay is blocked. */
export class SoundCaptions{
 private contacts=new SkyContactCursor();private tick=-1;private grounded:boolean|undefined;private tells=new Set<number>();private expires=0;private text='';
 update(s:Snapshot):string{
  if(s.tick<this.tick){this.tells.clear();this.grounded=undefined;this.text='';this.expires=0;}
  if(s.tick!==this.tick){const cues:string[]=[];
   if(this.grounded===false&&s.player.grounded)cues.push(s.adventure.wet?'水しぶき・着水':'着地音');this.grounded=s.player.grounded;
   for(const e of s.adventure.enemies){if(e.health<=0||Math.hypot(e.x-s.player.x,e.y-s.player.y,e.z-s.player.z)>25)continue;if(e.windup>0&&!this.tells.has(e.id))cues.push('敵の攻撃予告音');}
   this.tells=new Set(s.adventure.enemies.filter(e=>e.health>0&&e.windup>0).map(e=>e.id));
   for(const e of this.contacts.take(s.adventure.skybound?.contactEvents,s.tick))if(Math.hypot(e.position.x-s.player.x,e.position.y-s.player.y,e.position.z-s.player.z)<32)cues.push(e.kind==='explosion'?'爆発音':e.material==='metal'?'金属の衝突音':'構造物の衝突音');
   if(cues.length){this.text=[...new Set(cues)].slice(0,3).join(' / ');this.expires=s.tick+90;}this.tick=s.tick;
  }
  return s.tick<this.expires?this.text:'';
 }
}
export function soundCaptionUI(signal:AbortSignal,enabled:()=>boolean){const node=document.createElement('p');node.id='sound-captions';node.hidden=true;node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.querySelector('#app')!.append(node);const captions=new SoundCaptions();signal.addEventListener('abort',()=>node.remove(),{once:true});return {update(s:Snapshot){const text=captions.update(s);node.hidden=!enabled()||!text;if(node.textContent!==text)node.textContent=text;}};}
