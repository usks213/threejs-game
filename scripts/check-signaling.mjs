const url = 'https://threejs-game-signaling.usks213.workers.dev/health';
for (let attempt = 0; attempt < 12; attempt++) {
 const response = await fetch(url).catch(() => null);
 if (response?.ok && (await response.json()).service === 'threejs-game-signaling') { console.log('Signaling URL: ' + url); process.exit(0); }
 await new Promise(resolve => setTimeout(resolve, 3000));
}
throw new Error('Signaling service did not respond');
