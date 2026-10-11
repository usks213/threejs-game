/** Separate bounded presentation wave field, inspired by the paper's amplitude /
 * vertical-velocity ripple layer. CPU finite differences are a browser adaptation,
 * not a replacement for authoritative water volumes or the paper's GPU solver. */
export class WaterRipples {
 readonly height:Float32Array;readonly velocity:Float32Array;readonly encoded:Uint8Array;
 private readonly next:Float32Array;private accumulator=0;
 readonly stepSeconds=1/60;readonly speed=.65;readonly maxHeight=.035;
 constructor(readonly width:number,readonly depth:number,readonly spacing:number){this.height=new Float32Array(width*depth);this.velocity=new Float32Array(width*depth);this.next=new Float32Array(width*depth);this.encoded=new Uint8Array(width*depth);this.encode();}
 impulse(x:number,z:number,amplitude:number,radius=2){if(!Number.isFinite(x+z+amplitude+radius)||radius<=0)return;for(let zz=Math.max(1,Math.floor(z-radius));zz<=Math.min(this.depth-2,Math.ceil(z+radius));zz++)for(let xx=Math.max(1,Math.floor(x-radius));xx<=Math.min(this.width-2,Math.ceil(x+radius));xx++){const d=Math.hypot(xx-x,zz-z)/radius;if(d>=1)continue;const i=xx+zz*this.width;this.velocity[i]=Math.max(-.3,Math.min(.3,this.velocity[i]+amplitude*(1-d)));}}
 update(dt:number){if(!Number.isFinite(dt)||dt<=0)return 0;this.accumulator=Math.min(.1,this.accumulator+dt);let steps=0;const h=this.height,v=this.velocity,n=this.next,w=this.width,s=this.stepSeconds,k=this.speed**2/this.spacing**2;
  while(this.accumulator+1e-9>=s){this.accumulator-=s;steps++;for(let z=1;z<this.depth-1;z++)for(let x=1;x<w-1;x++){const i=x+z*w,lap=h[i-1]+h[i+1]+h[i-w]+h[i+w]-4*h[i];v[i]=(v[i]+k*lap*s)*.985;n[i]=Math.max(-this.maxHeight,Math.min(this.maxHeight,h[i]+v[i]*s));}h.set(n);}if(steps)this.encode();return steps;
 }
 private encode(){for(let i=0;i<this.height.length;i++)this.encoded[i]=Math.round(127.5+127.5*this.height[i]/this.maxHeight);}
}
