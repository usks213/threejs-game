import type { BattleResult, Match } from '../core/types';
export const finishLabel={spin:'スピンフィニッシュ',over:'オーバーフィニッシュ',burst:'バーストフィニッシュ',xtreme:'エクストリームフィニッシュ',draw:'ドロー / リシュート'};
export function resultText(result:BattleResult,match:Match,opponent:string){
  return{
    title:result.winner===null?'DRAW':result.winner===0?'YOU WIN':`${opponent} WINS`,
    finish:finishLabel[result.finish],
    points:result.winner===null?'得点なし · 再シュート':`${result.winner===0?'あなた':opponent} +${result.points} pt`,
    score:`合計スコア  YOU ${match.scores[0]} : ${match.scores[1]} ${opponent}`,
    match:match.winner===null?'ROUND RESULT':match.winner===0?'MATCH RESULT · あなたの勝利':`MATCH RESULT · ${opponent}の勝利`,
  };
}
export function setupBattleResult(root:HTMLElement){
  const get=(id:string)=>root.querySelector<HTMLElement>(`#${id}`)!;
  const panel=get('battle-result'),banner=get('finish-banner');let key='';
  return{
    hide(){key='';panel.hidden=true;banner.hidden=true;},
    show(result:BattleResult,match:Match,opponent:string){const next=JSON.stringify([result,match.scores,match.winner,match.round,opponent]);if(next===key)return;key=next;const text=resultText(result,match,opponent);panel.hidden=false;banner.hidden=false;panel.dataset.finish=result.finish;panel.dataset.winner=String(result.winner);for(const name of ['title','finish','points','score','match'] as const)get(`result-${name}`).textContent=text[name];banner.textContent=text.finish;},
    forfeit(winner:0|1|null,scores:[number,number]){const next=`forfeit:${winner}:${scores}`;if(next===key)return;key=next;panel.hidden=false;banner.hidden=false;panel.dataset.finish='forfeit';panel.dataset.winner=String(winner);get('result-title').textContent=winner===null?'NO CONTEST':winner===0?'YOU WIN':'OPPONENT WINS';get('result-finish').textContent='退出・接続切れによる決着';get('result-points').textContent='フィニッシュによる加点なし';get('result-score').textContent=`合計スコア  YOU ${scores[0]} : ${scores[1]} OPPONENT`;get('result-match').textContent='MATCH RESULT';banner.textContent='試合終了';},
  };
}
