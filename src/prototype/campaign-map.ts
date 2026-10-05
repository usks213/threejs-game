import {REGIONS,type RegionBounds,type RegionId} from './core/regions';
import {WEST_POINTS,WEST_POIS,WEST_ROUTES} from './core/expedition-west';
import type {WestExpeditionState} from './core/expedition-west-integration';

export interface MapPosition {x:number;z:number}
export interface MapArea {id:string;label:string;code:string;bounds:RegionBounds;climate:string}
export interface MapRoute {id:string;label:string;nodes:readonly MapPosition[];width:number;partial:boolean}
export interface CampaignMapData {
 worldBounds:RegionBounds;areas:MapArea[];routes:MapRoute[];westernPois:string[];
 western:boolean;
}
export interface MapPoint {id:string;label:string;position?:MapPosition;mapIcon?:string}
export const MAP_WIDTH=1000,MAP_HEIGHT=560,MAP_MARGIN=34;
/** The authored land footprint in campaign-world.ts, not a terrain/obstacle survey. */
export const CENTRAL_MAP_FOOTPRINT:Readonly<RegionBounds>={minX:-18,maxX:18,minZ:-42,maxZ:11};
const MAP_OVERVIEW:Readonly<RegionBounds>={
 minX:Math.min(CENTRAL_MAP_FOOTPRINT.minX,...REGIONS.map(r=>r.bounds.minX))-4,maxX:Math.max(CENTRAL_MAP_FOOTPRINT.maxX,...REGIONS.map(r=>r.bounds.maxX))+4,
 minZ:Math.min(CENTRAL_MAP_FOOTPRINT.minZ,...REGIONS.map(r=>r.bounds.minZ))-4,maxZ:Math.max(CENTRAL_MAP_FOOTPRINT.maxZ,...REGIONS.map(r=>r.bounds.maxZ))+4
};
export function campaignMapWorldBounds(western:boolean):RegionBounds{return western?{minX:-128,maxX:128,minZ:-160,maxZ:100}:{minX:-80,maxX:80,minZ:-100,maxZ:30};}
const finite=(p:MapPosition)=>Number.isFinite(p.x)&&Number.isFinite(p.z);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function clampMapPosition(p:MapPosition,bounds:RegionBounds):MapPosition{return {x:clamp(Number.isFinite(p.x)?p.x:0,bounds.minX,bounds.maxX),z:clamp(Number.isFinite(p.z)?p.z:0,bounds.minZ,bounds.maxZ)};}

/** Move one existing private pin in place; never evict another pin at capacity. */
export function moveMapPin(pins:{id:string;x:number;z:number}[],id:string,position:MapPosition,bounds:RegionBounds){
 const pin=pins.find(p=>p.id===id);if(!id.startsWith('pin:')||!pin||!finite(position)||position.x<bounds.minX||position.x>bounds.maxX||position.z<bounds.minZ||position.z>bounds.maxZ)return false;
 pin.x=position.x;pin.z=position.z;return true;
}

/** Coarse discovery is the existing region ledger. Western road strokes require
 * contiguous observed nodes; no line is invented between disjoint observations. */
export function campaignMapData(discovered:readonly RegionId[],unlocked:readonly RegionId[],western:boolean,west:WestExpeditionState|null):CampaignMapData{
 const regions=REGIONS.filter(r=>discovered.includes(r.id)&&unlocked.includes(r.id));
 const areas=regions.map(r=>({id:r.id,label:r.name,code:String.fromCharCode(65+REGIONS.indexOf(r)),bounds:{...r.bounds},climate:r.climate}));
 const routes:MapRoute[]=regions.map(r=>({id:'route:'+r.id,label:r.name+'への道',nodes:r.route,width:2.3,partial:false}));
 const westernPois:string[]=[];
 if(western&&west){
  const seen:MapPosition[]=[];
  for(const route of WEST_ROUTES){
   const progress=west.routes[route.id as keyof typeof west.routes];if(!progress)continue;
   const known=route.nodes.map((_,i)=>i<progress.forward||i>=route.nodes.length-progress.reverse);
   seen.push(...route.nodes.filter((_,i)=>known[i]));
   let start=0;
   while(start<route.nodes.length){while(start<route.nodes.length&&!known[start])start++;let end=start;while(end<route.nodes.length&&known[end])end++;
    if(end-start>=2)routes.push({id:route.id+':'+start,label:route.name,nodes:route.nodes.slice(start,end),width:route.width,partial:end-start<route.nodes.length});
    start=end+1;
   }
  }
  for(const poi of WEST_POIS){
   const observed=seen.some(p=>Math.hypot(p.x-poi.position.x,p.z-poi.position.z)<=8);
   const visited=WEST_POINTS.some(p=>west.claimed.includes(p.id)&&Math.hypot(p.position.x-poi.position.x,p.position.z-poi.position.z)<=10);
   if(observed||visited)westernPois.push(poi.id);
  }
  // The switch confirms the authored return road. Keep it dashed because opening
  // a gate does not prove a full traversal; the destination must also be known.
  if(west.gateOpen&&regions.some(r=>r.id==='coppermesa')){
   const road=WEST_ROUTES.find(r=>r.id==='west-mine-return')!;
   routes.push({id:road.id,label:road.name+'（開通・未踏区間を含む）',nodes:road.nodes,width:road.width,partial:true});
  }
 }
 return {worldBounds:campaignMapWorldBounds(western),areas,routes,westernPois,western};
}
/** Fixed authored overview prevents new pins from rescaling the map. Only an
 * existing pin/player outside that overview expands it, within save-valid bounds. */
export function campaignMapViewport(data:CampaignMapData,points:readonly MapPoint[]):RegionBounds{
 const bounds={...MAP_OVERVIEW,minX:data.western?-72:MAP_OVERVIEW.minX};
 for(const point of points)if(point.position&&finite(point.position)){const p=clampMapPosition(point.position,data.worldBounds);bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.minZ=Math.min(bounds.minZ,p.z);bounds.maxZ=Math.max(bounds.maxZ,p.z);}
 return {minX:clamp(bounds.minX,data.worldBounds.minX,data.worldBounds.maxX),maxX:clamp(bounds.maxX,data.worldBounds.minX,data.worldBounds.maxX),minZ:clamp(bounds.minZ,data.worldBounds.minZ,data.worldBounds.maxZ),maxZ:clamp(bounds.maxZ,data.worldBounds.minZ,data.worldBounds.maxZ)};
}
export interface MapProjection {bounds:RegionBounds;scale:number;left:number;top:number;width:number;height:number}
export function mapProjection(bounds:RegionBounds):MapProjection{
 const width=bounds.maxX-bounds.minX,height=bounds.maxZ-bounds.minZ;
 if(![bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(Number.isFinite)||width<=0||height<=0)throw new Error('Invalid map bounds');
 const scale=Math.min((MAP_WIDTH-2*MAP_MARGIN)/width,(MAP_HEIGHT-2*MAP_MARGIN)/height);
 return {bounds:{...bounds},scale,left:(MAP_WIDTH-width*scale)/2,top:(MAP_HEIGHT-height*scale)/2,width:width*scale,height:height*scale};
}
export function projectMap(p:MapPosition,projection:MapProjection){return {x:projection.left+(p.x-projection.bounds.minX)*projection.scale,y:projection.top+(p.z-projection.bounds.minZ)*projection.scale};}
export function unprojectMap(p:{x:number;y:number},projection:MapProjection):MapPosition{return clampMapPosition({x:projection.bounds.minX+(p.x-projection.left)/projection.scale,z:projection.bounds.minZ+(p.y-projection.top)/projection.scale},projection.bounds);}
export function mapClientPosition(client:{x:number;y:number},rect:{left:number;top:number;width:number;height:number},projection:MapProjection):MapPosition|null{
 if(![client.x,client.y,rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return null;
 return unprojectMap({x:(client.x-rect.left)*MAP_WIDTH/rect.width,y:(client.y-rect.top)*MAP_HEIGHT/rect.height},projection);
}
export const MAP_LABEL_WIDTH=60,MAP_LABEL_HEIGHT=30;
export interface MapLabel {id:string;x:number;y:number;anchorX:number;anchorY:number}
/** Layout runs when the paused map is rendered, never during world geometry ticks.
 * Anchors never move: displaced labels have leader lines to their true coordinates. */
export function layoutMapLabels(anchors:readonly {id:string;x:number;y:number}[]):MapLabel[]{
 const placed:MapLabel[]=[];
 const fits=(x:number,y:number)=>x>=MAP_LABEL_WIDTH/2&&x<=MAP_WIDTH-MAP_LABEL_WIDTH/2&&y>=MAP_LABEL_HEIGHT/2&&y<=MAP_HEIGHT-MAP_LABEL_HEIGHT/2&&!(x+MAP_LABEL_WIDTH/2>MAP_WIDTH-165&&y+MAP_LABEL_HEIGHT/2>MAP_HEIGHT-58)&&!placed.some(p=>Math.abs(p.x-x)<MAP_LABEL_WIDTH+6&&Math.abs(p.y-y)<MAP_LABEL_HEIGHT+6);
 for(const anchor of anchors){let best:{x:number;y:number}|undefined;
  for(let ring=0;ring<=20&&!best;ring++)for(let y=-ring;y<=ring&&!best;y++)for(let x=-ring;x<=ring&&!best;x++){
   if(ring&&Math.abs(x)!==ring&&Math.abs(y)!==ring)continue;
   const px=clamp(anchor.x,MAP_LABEL_WIDTH/2,MAP_WIDTH-MAP_LABEL_WIDTH/2)+x*(MAP_LABEL_WIDTH+6),py=clamp(anchor.y,MAP_LABEL_HEIGHT/2,MAP_HEIGHT-MAP_LABEL_HEIGHT/2)+y*(MAP_LABEL_HEIGHT+6);
   if(fits(px,py))best={x:px,y:py};
  }
  if(best)placed.push({id:anchor.id,...best,anchorX:anchor.x,anchorY:anchor.y});
 }
 return placed;
}
export function mapPointReferences(points:readonly MapPoint[]){let index=0;return new Map(points.filter(p=>p.position&&finite(p.position)).map(p=>[p.id,{number:++index,icon:p.id==='player'?'▲':p.mapIcon??(p.id.startsWith('pin:')?'◆':'●')}]));}
const coordinate=(n:number)=>Number(n.toFixed(1)).toString();
export function mapCoordinates(p:MapPosition){return `X ${coordinate(p.x)} · Z ${coordinate(p.z)}`;}

/** One touch target and one keyboard target avoid tiny/overlapping map buttons.
 * Full names and existing actions stay in the ordinary accessible point list. */
export function createCampaignMap(data:CampaignMapData,points:readonly MapPoint[],onPin:(p:MapPosition)=>void,signal:AbortSignal,selection:{position?:MapPosition;mode?:'move'}={}){
 const section=document.createElement('section');section.className='campaign-map-section';
 const help=document.createElement('p');help.id='campaign-map-help';help.className='campaign-map-help';help.textContent='地形の概略図。北は上（Z減少）、東は右（X増加）。障害物・高低差・建築変更は省略しています。空白は未調査で、歩けるとは限りません。';
 const legend=document.createElement('p');legend.className='campaign-map-legend';legend.setAttribute('aria-label','地図の凡例');legend.textContent='▲ 現在地　⌂ 炉　◆ 手動ピン　● 発見地点　人 工匠　A〜G 地域。淡い輪郭＝谷・尾根の元の地形範囲、塗り＝発見した地域、実線＝記録した道、破線＝一部記録・開通した道。番号の詳細は下の一覧へ。';
 const map=document.createElement('div');map.className='campaign-map';map.id='campaign-map-surface';map.tabIndex=0;map.setAttribute('role','button');map.setAttribute('aria-label',selection.mode==='move'?'移動するピンの行き先を地図で選ぶ':'地図上を選んでピンを置く');map.setAttribute('aria-describedby','campaign-map-help campaign-map-controls');
 const projection=mapProjection(campaignMapViewport(data,points)),refs=mapPointReferences(points);
 for(const [key,value] of Object.entries(projection.bounds))map.dataset[key]=String(value);
 const svg=(name:string,attributes:Record<string,string|number>={},text?:string)=>{const element=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));if(text!==undefined)element.textContent=text;return element;};
 const drawing=svg('svg',{viewBox:`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,'aria-hidden':'true',focusable:'false'});
 const rectangle=(bounds:RegionBounds,className:string)=>{const a=projectMap({x:bounds.minX,z:bounds.minZ},projection),b=projectMap({x:bounds.maxX,z:bounds.maxZ},projection);return svg('rect',{x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y,class:className});};
 drawing.append(rectangle(projection.bounds,'campaign-map-frame'),rectangle(CENTRAL_MAP_FOOTPRINT,'campaign-map-footprint'));
 for(const area of data.areas){const shape=rectangle(area.bounds,'campaign-map-area '+area.climate);shape.setAttribute('data-map-region',area.id);drawing.append(shape);}
 for(const route of data.routes){const line=svg('polyline',{points:route.nodes.map(p=>{const q=projectMap(p,projection);return q.x+','+q.y;}).join(' '),'stroke-width':Math.max(3,route.width*projection.scale),class:'campaign-map-road'+(route.partial?' partial':''),'data-map-route':route.id});drawing.append(line);}
 const located=points.filter((p):p is MapPoint&{position:MapPosition}=>!!p.position&&finite(p.position));
 const anchors=[...located.map(p=>({id:p.id,...projectMap(clampMapPosition(p.position,data.worldBounds),projection)})),...data.areas.map(area=>({id:'area:'+area.id,...projectMap({x:(area.bounds.minX+area.bounds.maxX)/2,z:(area.bounds.minZ+area.bounds.maxZ)/2},projection)}))];
 for(const label of layoutMapLabels(anchors)){
  const point=located.find(p=>p.id===label.id),area=data.areas.find(a=>'area:'+a.id===label.id),ref=refs.get(label.id);
  const group=svg('g',{class:'campaign-map-marker'+(point?.id==='player'?' player':'')+(area?' region':''),'data-map-point':label.id});
  group.append(svg('line',{x1:label.anchorX,y1:label.anchorY,x2:label.x,y2:label.y,class:'campaign-map-leader'}),svg('circle',{cx:label.anchorX,cy:label.anchorY,r:4,class:'campaign-map-anchor'}),svg('rect',{x:label.x-MAP_LABEL_WIDTH/2,y:label.y-MAP_LABEL_HEIGHT/2,width:MAP_LABEL_WIDTH,height:MAP_LABEL_HEIGHT,rx:5,class:'campaign-map-tag'}),svg('text',{x:label.x,y:label.y,'dominant-baseline':'central','text-anchor':'middle'},area?area.code:`${ref!.icon}${ref!.number}`));
  drawing.append(group);
 }
 let cursor=clampMapPosition(selection.position??located.find(p=>p.id==='player')?.position??{x:0,z:0},projection.bounds);
 const cross=svg('g',{class:'campaign-map-cursor',visibility:'hidden'});cross.append(svg('path',{d:'M -12 0 H 12 M 0 -12 V 12'}),svg('circle',{r:8}));drawing.append(cross);
 const status=document.createElement('output');status.className='campaign-map-coordinate';status.setAttribute('aria-live','polite');status.textContent=mapCoordinates(cursor);
 const showCursor=()=>{selection.position={...cursor};const p=projectMap(cursor,projection);cross.setAttribute('transform',`translate(${p.x} ${p.y})`);cross.setAttribute('visibility','visible');status.textContent=mapCoordinates(cursor);};
 const place=()=>onPin(clampMapPosition(cursor,data.worldBounds));
 map.addEventListener('focus',showCursor,{signal});
 // Use the SVG's content box, not the bordered HTML box, for exact touch mapping.
 map.addEventListener('click',event=>{if(event.detail===0){place();return;}const p=mapClientPosition({x:event.clientX,y:event.clientY},drawing.getBoundingClientRect(),projection);if(p){cursor=p;showCursor();place();}},{signal});
 map.addEventListener('keydown',event=>{
  const step=event.shiftKey?5:1;
  if(['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.code)){event.preventDefault();event.stopPropagation();cursor=clampMapPosition({x:cursor.x+(event.code==='ArrowRight'?step:event.code==='ArrowLeft'?-step:0),z:cursor.z+(event.code==='ArrowDown'?step:event.code==='ArrowUp'?-step:0)},projection.bounds);showCursor();}
  if(event.code==='Enter'||event.code==='Space'){event.preventDefault();event.stopPropagation();if(!event.repeat)place();}
 },{signal});
 map.append(drawing);
 const directions=document.createElement('div');directions.className='campaign-map-directions';directions.append(document.createTextNode('北 ↑　東 →'),status);
 const controls=document.createElement('p');controls.id='campaign-map-controls';controls.className='campaign-map-help';controls.textContent=selection.mode==='move'?'地図をタップ・クリック、または矢印とEnterで移動先を選択。下の「この位置へ移動」で確定します。取消なら元のピンは変わりません。':'地図をタップ・クリックしてピンを追加。キーボードは矢印で1m（Shiftで5m）、Enter / Spaceで追加。最大12本、古いピンから置き換えます。';
 const key=document.createElement('ul');key.className='campaign-map-regions';key.setAttribute('aria-label','発見した地域と道');
 const entries=['谷・尾根：元の地形の範囲のみ。内部の通路は未測量。',...data.areas.map(a=>`${a.code} · ${a.label}`),...[...new Set(data.routes.map(r=>r.label+(r.partial&&!r.label.includes('未踏')?'（踏破した区間のみ）':'')))]];
 for(const text of entries){const item=document.createElement('li');item.textContent=text;key.append(item);}
 if(!data.areas.length){const item=document.createElement('li');item.textContent='周辺地域は探索すると記録されます。';key.append(item);}
 const scaleLength=10,scale=svg('g',{class:'campaign-map-scale'});scale.append(svg('path',{d:`M ${MAP_WIDTH-150} ${MAP_HEIGHT-20} h ${scaleLength*projection.scale} m 0 -5 v 10 m ${-scaleLength*projection.scale} -10 v 10`}),svg('text',{x:MAP_WIDTH-150,y:MAP_HEIGHT-32},'10m'));drawing.append(scale);
 section.append(help,legend,directions,map,controls,key);return section;
}
