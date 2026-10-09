import {describe,it,expect} from 'vitest';
import {moveMapPin,campaignMapData,campaignMapViewport,campaignMapWorldBounds,clampMapPosition,mapProjection,projectMap,unprojectMap,mapClientPosition,layoutMapLabels,mapPointReferences,mapCoordinates,MAP_WIDTH,MAP_HEIGHT,MAP_LABEL_WIDTH,MAP_LABEL_HEIGHT} from '../../src/prototype/campaign-map';
import {REGIONS} from '../../src/prototype/core/regions';
import {WEST_ROUTES,WEST_POIS,WEST_POINTS,WEST_SPECIALISTS} from '../../src/prototype/core/expedition-west';
import {createWestExpeditionState} from '../../src/prototype/core/expedition-west-integration';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {campaignSnapshot} from '../../src/prototype/campaign-presenter';
import {defaultSettings} from '../../src/prototype/campaign-session';

describe('faithful campaign map discovery',()=>{
 it('keeps undiscovered and locked region names, details and coordinates out of map data',()=>{
  const initial=campaignMapData([],[],false,null);expect(initial.areas).toEqual([]);expect(initial.routes).toEqual([]);expect(initial.westernPois).toEqual([]);
  const locked=campaignMapData(['resinwood'],[],false,null);expect(locked.areas).toEqual([]);expect(locked.routes).toEqual([]);
  const text=JSON.stringify(initial);for(const region of REGIONS)expect(text).not.toContain(region.name);for(const poi of WEST_POIS)expect(text).not.toContain(poi.name);
 });
 it('copies only the actual discovered bounds and authored route nodes, with stable region letters',()=>{
  const data=campaignMapData(['rootfen'],['hearthfield','resinwood','rootfen'],false,null),region=REGIONS.find(r=>r.id==='rootfen')!;
  expect(data.areas).toEqual([{id:region.id,label:region.name,code:'C',bounds:region.bounds,climate:region.climate}]);
  expect(data.routes).toEqual([{id:'route:rootfen',label:region.name+'への道',nodes:region.route,width:2.3,partial:false}]);
  data.areas[0].bounds.minX=-999;expect(region.bounds.minX).toBe(22);
 });
 it('does not turn western accessibility into a complete terrain or reward survey',()=>{
  const west=createWestExpeditionState(),data=campaignMapData(['resinwood'],['resinwood'],true,west);
  expect(data.routes.filter(r=>r.id.startsWith('west'))).toEqual([]);expect(data.westernPois).toEqual([]);
  const text=JSON.stringify(data);expect(text).not.toContain('共同金庫');expect(text).not.toContain('採掘監視者');expect(text).not.toContain('singing-copper');
 });
 it('draws separate genuinely observed western prefixes and suffixes without bridging unknown nodes',()=>{
  const west=createWestExpeditionState(),road=WEST_ROUTES.find(r=>r.id==='west-high-road')!;west.routes['west-high-road']={forward:3,reverse:2};
  const data=campaignMapData(['resinwood'],['resinwood'],true,west),routes=data.routes.filter(r=>r.id.startsWith(road.id));
  expect(routes).toHaveLength(2);expect(routes[0].nodes).toEqual(road.nodes.slice(0,3));expect(routes[1].nodes).toEqual(road.nodes.slice(-2));expect(routes.every(r=>r.partial)).toBe(true);
  expect(data.westernPois).toContain('west-fork-mine');expect(data.westernPois).not.toContain('west-log-hamlet');
  west.routes['west-high-road']={forward:1,reverse:1};expect(campaignMapData([],[],true,west).routes).toEqual([]);
 });
 it('joins overlapping observations once and reports a fully traversed road as complete',()=>{
  const west=createWestExpeditionState(),road=WEST_ROUTES.find(r=>r.id==='west-high-road')!;west.routes['west-high-road']={forward:7,reverse:7};
  const routes=campaignMapData([],[],true,west).routes;expect(routes).toHaveLength(1);expect(routes[0].nodes).toEqual(road.nodes);expect(routes[0].partial).toBe(false);
 });
 it('records a visited POI without leaking its enemies or reward objective',()=>{
  const west=createWestExpeditionState();west.claimed=['west-hamlet-cache'];const data=campaignMapData([],[],true,west);
  expect(data.westernPois).toEqual(['west-log-hamlet']);expect(JSON.stringify(data)).not.toContain('補給');expect(JSON.stringify(data)).not.toContain('斧兵');
 });
 it('does not draw the gated return road until open and its destination is discovered and unlocked',()=>{
  const west=createWestExpeditionState();expect(campaignMapData(['coppermesa'],['coppermesa'],true,west).routes.some(r=>r.id==='west-mine-return')).toBe(false);
  west.gateOpen=true;expect(campaignMapData([],['coppermesa'],true,west).routes.some(r=>r.id==='west-mine-return')).toBe(false);
  const road=campaignMapData(['coppermesa'],['coppermesa'],true,west).routes.find(r=>r.id==='west-mine-return')!;
  expect(road.nodes).toEqual(WEST_ROUTES.find(r=>r.id==='west-mine-return')!.nodes);expect(road.partial).toBe(true);expect(road.label).toContain('未踏');
 });
});

describe('exact map projection and pin limits',()=>{
 it.each([false,true])('uses the saved bounds for western=%s and rejects nonfinite projection bounds',western=>{
  const bounds=campaignMapWorldBounds(western);expect(bounds).toEqual(western?{minX:-128,maxX:128,minZ:-160,maxZ:100}:{minX:-80,maxX:80,minZ:-100,maxZ:30});
  expect(clampMapPosition({x:Infinity,z:NaN},bounds)).toEqual({x:0,z:0});expect(clampMapPosition({x:-999,z:999},bounds)).toEqual({x:bounds.minX,z:bounds.maxZ});
  expect(()=>mapProjection({...bounds,maxX:NaN})).toThrow('Invalid map bounds');expect(()=>mapProjection({...bounds,maxX:bounds.minX})).toThrow('Invalid map bounds');
 });
 it.each([false,true])('round-trips exact world coordinates with equal axes and north up, western=%s',western=>{
  const data=campaignMapData([],[],western,null),bounds=campaignMapViewport(data,[]),projection=mapProjection(bounds);
  for(const p of [{x:bounds.minX,z:bounds.minZ},{x:bounds.maxX,z:bounds.maxZ},{x:-3,z:4},{x:-63.5,z:-34}]){
   if(p.x<bounds.minX)continue;const q=unprojectMap(projectMap(p,projection),projection);expect(q.x).toBeCloseTo(p.x,10);expect(q.z).toBeCloseTo(p.z,10);
  }
  const origin=projectMap({x:0,z:0},projection),east=projectMap({x:10,z:0},projection),south=projectMap({x:0,z:10},projection);
  expect(east.x-origin.x).toBeCloseTo(south.y-origin.y,10);expect(east.x).toBeGreaterThan(origin.x);expect(south.y).toBeGreaterThan(origin.y);
  expect(unprojectMap({x:-1000,y:2000},projection)).toEqual({x:bounds.minX,z:bounds.maxZ});
 });
 it('maps CSS-sized mouse and touch coordinates through the exact SVG content rectangle',()=>{
  const projection=mapProjection({minX:-72,maxX:36,minZ:-58,maxZ:15}),world={x:-50.5,z:-11.5},screen=projectMap(world,projection);
  for(const rect of [{left:16,top:90,width:768,height:430.08},{left:28,top:12,width:280,height:156.8}]){
   const point=mapClientPosition({x:rect.left+screen.x/MAP_WIDTH*rect.width,y:rect.top+screen.y/MAP_HEIGHT*rect.height},rect,projection)!;
   expect(point.x).toBeCloseTo(world.x,10);expect(point.z).toBeCloseTo(world.z,10);
  }
  expect(mapClientPosition({x:10,y:10},{left:0,top:0,width:0,height:20},projection)).toBeNull();expect(mapClientPosition({x:NaN,y:10},{left:0,top:0,width:20,height:20},projection)).toBeNull();
 });
 it('keeps view bounds stable as pins are placed and contains boundary saves without overflow',()=>{
  const data=campaignMapData([],[],false,null),base=campaignMapViewport(data,[]);
  expect(campaignMapViewport(data,[{id:'pin:1',label:'',position:{x:base.minX,z:base.maxZ}}])).toEqual(base);
  expect(campaignMapViewport(data,[{id:'pin:1',label:'',position:{x:-1000,z:9999}}])).toEqual({minX:-80,maxX:36,minZ:-58,maxZ:30});
  expect(campaignMapViewport(data,[{id:'bad',label:'',position:{x:NaN,z:NaN}}])).toEqual(base);
 });
});

describe('compact labels without coordinate drift',()=>{
 it('lays out a dense cluster and edge markers without overlapping or moving true anchors',()=>{
  const anchors=Array.from({length:55},(_,i)=>({id:String(i),x:i<10?0:i<20?1000:500,y:i<10?0:i<20?560:280})),labels=layoutMapLabels(anchors);
  expect(labels).toHaveLength(anchors.length);for(const label of labels){const anchor=anchors.find(a=>a.id===label.id)!;expect(label.anchorX).toBe(anchor.x);expect(label.anchorY).toBe(anchor.y);expect(label.x).toBeGreaterThanOrEqual(MAP_LABEL_WIDTH/2);expect(label.x).toBeLessThanOrEqual(MAP_WIDTH-MAP_LABEL_WIDTH/2);expect(label.y).toBeGreaterThanOrEqual(MAP_LABEL_HEIGHT/2);expect(label.y).toBeLessThanOrEqual(MAP_HEIGHT-MAP_LABEL_HEIGHT/2);}
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)expect(Math.abs(labels[i].x-labels[j].x)>=MAP_LABEL_WIDTH+6||Math.abs(labels[i].y-labels[j].y)>=MAP_LABEL_HEIGHT+6).toBe(true);
  expect(layoutMapLabels(anchors)).toEqual(labels);
 });
 it('maps long names to short stable references while the full text remains in the point rows',()=>{
  const points=[{id:'rescue',label:'安全帰還'},{id:'player',label:'現在地',position:{x:1,z:2}},{id:'long',label:'とても長い地点の正式名称'.repeat(12),mapIcon:'⌂',position:{x:2,z:2}},{id:'pin:1',label:'手動ピン',position:{x:2,z:2}}];
  expect([...mapPointReferences(points)]).toEqual([['player',{number:1,icon:'▲'}],['long',{number:2,icon:'⌂'}],['pin:1',{number:3,icon:'◆'}]]);expect(points[2].label.length).toBeGreaterThan(100);expect(mapCoordinates({x:-50.5,z:0.00001})).toBe('X -50.5 · Z 0');
 });
});

describe('presenter map state and moving specialists',()=>{
 it('caches unchanged map geometry and updates discovery without exposing locked content',()=>{
  const sim=new CoreSimulation(true,false,true),settings=defaultSettings(),save={available:false,label:'',status:''};
  const before=campaignSnapshot(sim,settings,save,[],false);expect(before.map?.areas).toHaveLength(0);expect(before.points.filter(p=>p.id.startsWith('rg-'))).toHaveLength(0);
  expect(campaignSnapshot(sim,settings,save,[],false).map).toBe(before.map);
  sim.campaign.state.discoveredRegions.push('rootfen');expect(campaignSnapshot(sim,settings,save,[],false).points.filter(p=>p.id.startsWith('rg-'))).toHaveLength(0);
  sim.campaign.state.unlockedRegions.push('rootfen');const after=campaignSnapshot(sim,settings,save,[],false);expect(after.map).not.toBe(before.map);expect(after.map?.areas.map(r=>r.id)).toEqual(['rootfen']);expect(after.points.some(p=>p.id==='rg-fen-cache')).toBe(true);
 });
 it('uses the actual rescued NPC location and keeps unknown western POIs off the list',()=>{
  const sim=new CoreSimulation(true,false,true,true),settings=defaultSettings(),save={available:false,label:'',status:''};sim.campaign.state.unlockedRegions.push('resinwood');sim.campaign.state.flameTier=2;
  let state=campaignSnapshot(sim,settings,save,[],false);expect(state.points.some(p=>WEST_POIS.some(q=>q.id===p.id))).toBe(false);
  const west=createWestExpeditionState();west.claimed=['west-hamlet-cache','west-return-hearth','west-carpenter'];west.campUnlocked=true;west.defeated=['west-axeguard'];west.completed=['west-supply-road','west-rescue-carpenter'];expect(sim.western!.restore(west)).toBe(true);
  state=campaignSnapshot(sim,settings,save,[],false);const npc=WEST_SPECIALISTS.find(p=>p.id==='west-carpenter')!,row=state.points.find(p=>p.id===npc.id)!;
  expect(row.position).toEqual(npc.homePosition);expect(row.position).not.toEqual(WEST_POINTS.find(p=>p.id===npc.id)!.position);expect(row.mapIcon).toBe('人');expect(state.points.some(p=>p.id==='west-log-hamlet')).toBe(true);expect(state.points.some(p=>p.id==='west-fork-mine')).toBe(false);
  expect(state.points.find(p=>p.id==='west-return-hearth')?.action).toBe('travel');expect(state.points.find(p=>p.id==='rest:west-return-hearth')?.action).toBe('gear');expect(state.points.find(p=>p.id==='rescue')?.action).toBe('gear');
 });
});

it('moves an existing private pin at capacity without replacing its identity or other pins',()=>{const pins=Array.from({length:12},(_,i)=>({id:'pin:'+i,x:i,z:i})),before=structuredClone(pins),selected=pins[3];expect(moveMapPin(pins,'pin:3',{x:-30,z:10},campaignMapWorldBounds(false))).toBe(true);expect(pins).toHaveLength(12);expect(pins[3]).toBe(selected);expect(pins[3]).toEqual({id:'pin:3',x:-30,z:10});expect(pins.filter(p=>p.id!=='pin:3')).toEqual(before.filter(p=>p.id!=='pin:3'));const valid=structuredClone(pins);for(const [id,position] of [['pin:missing',{x:0,z:0}],['hearth',{x:0,z:0}],['pin:3',{x:Infinity,z:0}],['pin:3',{x:81,z:0}]] as const)expect(moveMapPin(pins,id,position,campaignMapWorldBounds(false))).toBe(false);expect(pins).toEqual(valid);});
