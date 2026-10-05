export type ResolutionMode='auto'|'high'|'medium'|'low';
export class AdaptiveResolution {
 scale=1;private slow=0;private samples=0;
 constructor(public mode:ResolutionMode='auto'){this.setMode(mode);}
 setMode(mode:ResolutionMode):void{this.mode=mode;this.scale=mode==='low'?.55:mode==='medium'?.75:1;this.slow=0;this.samples=0;}
 /** Observe active render intervals only; menu pauses and initial shader compilation are excluded. */
 observe(milliseconds:number):boolean{
  if(this.mode!=='auto'||!Number.isFinite(milliseconds)||milliseconds<=0)return false;
  this.samples++;if(this.samples<=2)return false;
  if(milliseconds>48)this.slow++;else this.slow=Math.max(0,this.slow-1);
  if(this.slow>=3&&this.scale>.55){this.scale=Math.max(.55,this.scale-.15);this.slow=0;return true;}return false;
 }
}
