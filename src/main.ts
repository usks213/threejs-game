import { startEmberfall } from './emberfall/app';
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root missing');
const dispose = startEmberfall(root);
if (import.meta.hot) import.meta.hot.dispose(dispose);
