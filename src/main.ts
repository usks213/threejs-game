import { startEmberfall } from './emberfall/app';
import { startSurvival } from './emberfall/survival-app';
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root missing');
const dispose = new URLSearchParams(location.search).get('mode') === 'expedition' ? startEmberfall(root) : startSurvival(root);
if (import.meta.hot) import.meta.hot.dispose(dispose);
