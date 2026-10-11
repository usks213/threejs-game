import type {TraversalSnapshot} from '../game/traversal';
export function traversalStatus(t:TraversalSnapshot|undefined):string{
 if(!t)return '';const warning=typeof t.warning==='string'?t.warning:'';
 const breath=t.swimming&&Number.isFinite(t.breath)&&Number.isFinite(t.maxBreath)?`息 ${Math.max(0,Math.ceil(t.breath!))}/${Math.max(1,Math.ceil(t.maxBreath!))}秒`:'',hold=t.hanging?'壁につかまっています。方向キーで登り、もう一度登攀で放す。':'';
 return [breath,warning||hold].filter(Boolean).join(' · ');
}
