import './ui/style.css';
import { startArena } from './ui/app';
const dispose=startArena();
window.addEventListener('pagehide',e=>{if(!e.persisted)dispose();});
if(import.meta.hot)import.meta.hot.dispose(dispose);
