/** Mouse buttons act only on the canvas; DOM menus keep native pointer behavior. */
export function mouseActions(canvas:HTMLCanvasElement,signal:AbortSignal,attack:()=>void,guard:(held:boolean)=>void){
 const unlock=()=>{if(document.pointerLockElement===canvas)document.exitPointerLock();};
 canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
 canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;if(e.button===0){if(document.pointerLockElement!==canvas){try{const p=canvas.requestPointerLock();if(p)p.catch(()=>{});}catch{}return;}attack();}if(e.button===2){e.preventDefault();guard(true);}},{signal});
 window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&e.button===2)guard(false);},{signal});
 window.addEventListener('blur',()=>guard(false),{signal});
 document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)guard(false);},{signal});
 signal.addEventListener('abort',unlock,{once:true});return {unlock};
}
