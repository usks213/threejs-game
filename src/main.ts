import { startPrototype } from './prototype/app';
try { startPrototype(); } catch(error) {const alert=document.querySelector<HTMLElement>('#error');if(alert){alert.hidden=false;alert.textContent='ゲームを起動できません。WebGL対応ブラウザで開いてください。';}console.error(error);}
