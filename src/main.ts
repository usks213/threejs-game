import './ui/style.css';
import { startGame } from './platform/game';
const dispose = startGame();
window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
if (import.meta.hot) import.meta.hot.dispose(dispose);
