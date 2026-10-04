/** Rolling wall timings expose render/driver stalls separately from worker meshing. */
export class FrameTimings {
 private samples=new Map<string,{values:Float32Array;index:number;count:number;peak:number}>();
 record(name:string,milliseconds:number):void{
  if(!Number.isFinite(milliseconds)||milliseconds<0)return;
  let sample=this.samples.get(name);if(!sample){sample={values:new Float32Array(120),index:0,count:0,peak:0};this.samples.set(name,sample);}
  sample.peak=Math.max(sample.peak,milliseconds);sample.values[sample.index]=milliseconds;sample.index=(sample.index+1)%120;sample.count=Math.min(120,sample.count+1);
 }
 snapshot(){const result:Record<string,{last:number;p95:number;max:number;peak:number;samples:number}>={};for(const [name,s]of this.samples){const values=Array.from(s.values.subarray(0,s.count)).sort((a,b)=>a-b);result[name]={last:+s.values[(s.index+119)%120].toFixed(2),p95:+values[Math.floor((values.length-1)*.95)].toFixed(2),max:+values.at(-1)!.toFixed(2),peak:+s.peak.toFixed(2),samples:s.count};}return result;}
}
