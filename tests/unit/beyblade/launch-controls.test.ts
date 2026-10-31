import { describe, it, expect } from 'vitest';
import { defaultLaunchPosition, validLaunchPosition } from '../../../src/beyblade/core/launch-position';
import { createBattle } from '../../../src/beyblade/core/physics';
import { defaultBuild, profileFor } from '../../../src/beyblade/data/catalog';
import { parseLaunchCommand } from '../../../src/beyblade/core/launch-command';
import { resultText } from '../../../src/beyblade/ui/battle-result';
import { createMatch, scoreRound } from '../../../src/beyblade/core/rules';
import type { BattleResult } from '../../../src/beyblade/core/types';

describe('selected launch positions',()=>{
  const profile=profileFor(defaultBuild),launch={power:.6,angle:.1,tilt:.2};
  it('preserves the complete legacy initial state when default positions are explicit',()=>{
    const old=createBattle([profile,profile],[launch,launch]);
    const explicit=createBattle([profile,profile],[{...launch,position:defaultLaunchPosition(0)},{...launch,position:defaultLaunchPosition(1)}]);
    expect(explicit).toEqual(old);
  });
  it('uses each selected world position without changing the delivered launch energy',()=>{
    const original=createBattle([profile,profile],[launch,launch]);
    const selected=createBattle([profile,profile],[{...launch,position:{x:-.06,z:.02}},{...launch,position:{x:.07,z:-.03}}]);
    expect(selected.tops.map(t=>({x:t.x,z:t.z}))).toEqual([{x:-.06,z:.02},{x:.07,z:-.03}]);
    selected.tops.forEach((t,i)=>{expect(t.angularMomentum).toEqual(original.tops[i].angularMomentum);expect(t.vx).toBe(original.tops[i].vx);expect(Number.isFinite(t.y)).toBe(true);});
  });
  it.each([null,{},[],{x:NaN,z:0},{x:-Infinity,z:0},{x:'-.1',z:0},{x:-.13,z:0},{x:0,z:0},{x:.08,z:0}])('rejects invalid or opposing-lane coordinates %j',position=>{
    expect(validLaunchPosition(position,0)).toBe(false);
    expect(()=>createBattle([profile,profile],[{...launch,position:position as {x:number;z:number}},launch])).toThrow('Invalid launch position');
  });
  it('accepts mirrored lanes and prevents overlap',()=>{expect(validLaunchPosition({x:-.04,z:0},0)).toBe(true);expect(validLaunchPosition({x:.04,z:0},1)).toBe(true);expect(validLaunchPosition({x:-.04,z:0},1)).toBe(false);});
});

describe('reviewable spoken launch settings',()=>{
  it('normalizes Japanese numbers and negative angles into an atomic setting proposal',()=>{
    expect(parseLaunchCommand('パワーを８０、角度はマイナス１０度、傾き５度')).toEqual({ok:true,settings:{power:80,angle:-10,tilt:5},summary:'パワー 80% / 角度 -10° / 傾き 5°'});
    expect(parseLaunchCommand('角度0')).toMatchObject({ok:true,settings:{angle:0}});
  });
  it.each(['シュートして','パワー強め','パワー80、傾き90','パワー80、パワー50','角度-51','パワー19','傾き-1','傾き2.5'])('does not apply invalid or ambiguous commands: %s',text=>{expect(parseLaunchCommand(text).ok).toBe(false);});
});

describe('finish result presentation',()=>{
  it.each([['spin',1,'スピン'],['over',2,'オーバー'],['burst',2,'バースト'],['xtreme',3,'エクストリーム']] as const)('shows %s and awarded points for either player', (finish,points,label)=>{
    for(const winner of [0,1] as const){const result:BattleResult={finish,points,winner},match=scoreRound(createMatch(),result),text=resultText(result,match,'OPPONENT');expect(text.finish).toBe(`${label}フィニッシュ`);expect(text.points).toContain(`+${points} pt`);expect(text.title).toBe(winner===0?'YOU WIN':'OPPONENT WINS');}
  });
  it('shows a draw without awarding points and identifies a match victory',()=>{
    const draw:BattleResult={winner:null,finish:'draw',points:0};expect(resultText(draw,scoreRound(createMatch(),draw),'CPU')).toMatchObject({title:'DRAW',points:'得点なし · 再シュート'});
    const win:BattleResult={winner:0,finish:'burst',points:2};expect(resultText(win,scoreRound(scoreRound(createMatch(),win),win),'CPU').match).toContain('MATCH RESULT · あなたの勝利');
  });
});
