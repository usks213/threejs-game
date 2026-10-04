export function landscapeSize(width:number,height:number){return {width:Math.max(width,height),height:Math.min(width,height),rotated:height>width};}
export function landscapePoint(x:number,y:number,width:number,height:number){return height>width?{x:y,y:width-x}:{x,y};}
export function landscapeDelta(x:number,y:number,width:number,height:number){return height>width?{x:y,y:-x||0}:{x,y};}
export function configureLandscape(app:HTMLElement,signal:AbortSignal){
 const resize=()=>{const v=landscapeSize(innerWidth,innerHeight);app.dataset.landscape='true';app.dataset.rotated=String(v.rotated);app.style.setProperty('--game-width',v.width+'px');app.style.setProperty('--game-height',v.height+'px');};
 window.addEventListener('resize',resize,{signal});resize();
 const fullscreen=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();const orientation=screen.orientation as ScreenOrientation&{lock?:(value:string)=>Promise<void>};await orientation.lock?.('landscape');}catch{/* CSS landscape remains available when native locking is unsupported. */}};
 document.querySelector('#fullscreen')?.addEventListener('click',()=>void fullscreen(),{signal});
 return resize;
}
