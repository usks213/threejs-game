import {expect,it} from 'vitest';
import {assistRangedAim} from '../../src/game/combat/aim-assist';
import type {EnemyState} from '../../src/game/types';
const e=(x:number,z:number):EnemyState=>({id:1,definition:'walker',tier:1,x,y:0,z,health:10,homeX:x,homeZ:z,cooldown:1,windup:0,slow:0,boss:false});
it('gently corrects only a visible target within five degrees and 24 meters',()=>{const origin={x:0,y:.8,z:0},aim={x:0,y:0,z:-1},target=e(.5,-10);expect(assistRangedAim(origin,aim,[target],()=>false).x).toBeGreaterThan(0);for(const enemy of[e(2,-10),e(.5,-30),{...target,health:0},{...target,tame:1}])expect(assistRangedAim(origin,aim,[enemy],()=>false)).toEqual(aim);expect(assistRangedAim(origin,aim,[target],()=>true)).toEqual(aim);});
