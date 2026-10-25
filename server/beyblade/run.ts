import { createArenaServer } from './node';
const port=Number(process.env.PORT??8787);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535');
const app=await createArenaServer({port,host:process.env.HOST??'127.0.0.1',allowedOrigins:process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean)});
console.info(`Beyblade arena server listening on port ${port}; static build /beyblade/, WebSocket /api/beyblade`);
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0));});
