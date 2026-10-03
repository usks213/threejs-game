import { startDedicated } from './server';
await startDedicated(Number(process.env.PORT ?? 2567));
console.log('Dedicated game server started');
