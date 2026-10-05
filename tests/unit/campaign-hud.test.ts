import {it,expect} from 'vitest';
import {campaignHudText} from '../../src/prototype/campaign-hud';
const base={level:2,xp:0,skillPoints:0,region:'火守りの谷',objective:'探す',weather:'雨'};
it('shows imminent hazards before long region/buff text within two short mobile lines',()=>{const v=campaignHudText({...base,shroud:4,oxygen:3,burning:3.8,shock:.4,cold:99,food:120,rest:60,wet:5});expect(v.headline).toBe('霧 0:04');expect(v.detail).toBe('酸素 3秒 ほか3');expect(v.danger).toBe(true);for(const text of ['炎上','感電','寒冷','食事','休息','濡れ','火守りの谷'])expect(v.full).toContain(text);});
it('gives actionable fire advice, then restores regional context after danger clears',()=>{expect(campaignHudText({...base,burning:2})).toMatchObject({headline:'炎上 2秒',detail:'水で消火する',danger:true});expect(campaignHudText({...base,wet:4})).toMatchObject({headline:'Lv.2 · 火守りの谷',detail:'濡れ 4秒',danger:false});});
it('retains a visible ordinary shroud timer instead of hiding it after the region name',()=>{expect(campaignHudText({...base,shroud:83})).toMatchObject({detail:'霧 1:23',danger:false});});
