import {CAMPAIGN_ITEMS} from './campaign';
import type {Vec3} from './voxel';
import {createHomesteadAnimalState,validHomesteadAnimalState,HOMESTEAD_ANIMAL_RULES,type HomesteadAnimalState} from './homestead-animal';

export interface HomesteadContext {position:Vec3;basePosition:Vec3;baseActive:boolean;artisanRescued:boolean;animalPosition?:Vec3;animalVisible?:boolean}
export interface HomesteadResult {ok:boolean;message:string}
export interface ProcessingRecipe {id:string;label:string;materialCost:Record<number,number>;itemCost:Record<string,number>;seconds:number;materialOutput:Record<number,number>;itemOutput:Record<string,number>;requiresArtisan:boolean}
export const PROCESSING_RECIPES:readonly ProcessingRecipe[]=[
 {id:'weave',label:'繊維を布へ織る',materialCost:{7:6},itemCost:{},seconds:30,materialOutput:{10:2},itemOutput:{},requiresArtisan:true},
 {id:'meal',label:'薬草の煮込み',materialCost:{4:1},itemCost:{herbs:3},seconds:20,materialOutput:{},itemOutput:{'berry-meal':1},requiresArtisan:false},
 {id:'bandages',label:'包帯を仕立てる',materialCost:{7:3,10:1},itemCost:{},seconds:15,materialOutput:{},itemOutput:{bandage:2},requiresArtisan:true},
];
export const FURNITURE:readonly {id:string;label:string;cost:Record<number,number>;comfort:number}[]=[
 {id:'bed',label:'布張りの寝台',cost:{4:6,10:3},comfort:2},
 {id:'west-carpenter-bed',label:'荷場のマキの寝台',cost:{4:6,10:3},comfort:0},
 {id:'west-alchemist-bed',label:'荷場のセナの寝台',cost:{4:6,10:3},comfort:0},
 {id:'table',label:'木の食卓',cost:{4:4},comfort:1},
 {id:'brazier',label:'石の火鉢',cost:{3:5,4:3},comfort:1},
 {id:'rug',label:'織物の敷物',cost:{10:4,7:2},comfort:2},
];
export const STORAGE_CAPACITY=500,CROP_SECONDS=60,ANIMAL_SECONDS=45;
export interface HomesteadState {
 version:1;storage:{materials:Record<number,number>;items:Record<string,number>};
 jobs:{id:number;recipe:string;remaining:number}[];nextJobId:number;
 plots:{id:number;planted:boolean;remaining:number}[];
 animal:{tamed:boolean;remaining:number;ready:boolean;physical?:HomesteadAnimalState};furniture:string[];
}
const materialIds=[2,3,4,6,7,10],clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const ok=(message:string):HomesteadResult=>({ok:true,message}),fail=(message:string):HomesteadResult=>({ok:false,message});
const count=(n:unknown,max=999999):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=max;
const finite=(n:unknown,max:number):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const itemLimit=(id:string)=>CAMPAIGN_ITEMS[id]?.stackLimit??0;
const materialRecord=(value:unknown):value is Record<number,number>=>object(value)&&Object.entries(value).every(([id,n])=>materialIds.includes(Number(id))&&String(Number(id))===id&&count(n));
const itemRecord=(value:unknown):value is Record<string,number>=>object(value)&&Object.entries(value).every(([id,n])=>Object.hasOwn(CAMPAIGN_ITEMS,id)&&count(n));
const position=(p:Vec3)=>p&&[p.x,p.y,p.z].every(n=>Number.isFinite(n)&&Math.abs(n)<1000);
function fresh():HomesteadState{return {version:1,storage:{materials:{},items:{}},jobs:[],nextJobId:1,plots:[0,1,2].map(id=>({id,planted:false,remaining:0})),animal:{tamed:false,remaining:0,ready:false,physical:createHomesteadAnimalState()},furniture:[]};}

/** All production uses explicit live simulation time. No wall clock or offline catch-up. */
export class HomesteadSystem {
 state:HomesteadState=fresh();
 constructor(readonly materials:Record<number,number>,readonly items:Record<string,number>={}){}
 get storedCount(){return [...Object.values(this.state.storage.materials),...Object.values(this.state.storage.items)].reduce((sum,n)=>sum+n,0);}
 get comfort(){return this.state.furniture.reduce((sum,id)=>sum+(FURNITURE.find(f=>f.id===id)?.comfort??0),0);}
 get restBonusSeconds(){return this.comfort*30;}
 snapshot(){return clone(this.state);}
 private gate(context:HomesteadContext,artisan=false):HomesteadResult|null {
  if(!context.baseActive)return fail('先に拠点の炉を灯してください。');
  if(!position(context.position)||!position(context.basePosition)||Math.hypot(context.position.x-context.basePosition.x,context.position.y-context.basePosition.y,context.position.z-context.basePosition.z)>4)return fail('拠点の4m以内で操作してください。');
  if(artisan&&!context.artisanRescued)return fail('鍛冶師を救出すると利用できます。');return null;
 }
 /** Read-only eligibility shared by menu affordances and all animal transactions.
  * Missing live context fails closed; inventory and production never depend on UI. */
 animalInteractionStatus(context:HomesteadContext):HomesteadResult {
  const gate=this.gate(context);if(gate)return gate;
  const p=context.animalPosition,actual=this.state.animal.physical;
  if(actual?.recovering)return fail(actual.recoveryReason==='overlap'?'山羊の居場所が建築と重なっています。拠点の庭に空きを作ってください。':'山羊を安全な場所へ戻しています。');
  if(!p||!position(p)||context.animalVisible!==true)return fail('山羊が見える場所まで近づいてください。');
  if(actual&&Math.hypot(p.x-actual.position.x,p.y-actual.position.y,p.z-actual.position.z)>.001)return fail('山羊の現在位置を確認してください。');
  if(Math.hypot(context.position.x-p.x,context.position.y-p.y,context.position.z-p.z)>HOMESTEAD_ANIMAL_RULES.interactionRange)return fail('山羊の2.75m以内で操作してください。');
  if(actual&&(actual.burning>0||actual.fright>0||actual.shock>0))return fail('山羊が落ち着くのを待ってください。');
  return ok('山羊の世話ができます。');
 }
 private canPay(materials:Record<number,number>,items:Record<string,number>={}){return Object.entries(materials).every(([id,n])=>count(this.materials[Number(id)]??0)&&(this.materials[Number(id)]??0)>=n)&&Object.entries(items).every(([id,n])=>count(this.items[id]??0)&&(this.items[id]??0)>=n);}
 private pay(materials:Record<number,number>,items:Record<string,number>={}){for(const [id,n] of Object.entries(materials))this.materials[Number(id)]-=n;for(const [id,n] of Object.entries(items))this.items[id]-=n;}
 private canReceive(materials:Record<number,number>,items:Record<string,number>={}){return Object.entries(materials).every(([id,n])=>count((this.materials[Number(id)]??0)+n))&&Object.entries(items).every(([id,n])=>count((this.items[id]??0)+n,itemLimit(id)));}
 private receive(materials:Record<number,number>,items:Record<string,number>={}){for(const [id,n] of Object.entries(materials))this.materials[Number(id)]=(this.materials[Number(id)]??0)+n;for(const [id,n] of Object.entries(items))this.items[id]=(this.items[id]??0)+n;}
 deposit(id:number|string,amount:number,context:HomesteadContext):HomesteadResult {
  const gate=this.gate(context);if(gate)return gate;
  if(!count(amount)||amount===0)return fail('預ける数を正しく指定してください。');
  if(typeof id==='number'?!materialIds.includes(id):!Object.hasOwn(CAMPAIGN_ITEMS,id))return fail('この品物は預けられません。');
  const source:Record<string,number>=typeof id==='number'?this.materials:this.items,target:Record<string,number>=typeof id==='number'?this.state.storage.materials:this.state.storage.items;
  if(!count(source[id])||source[id]<amount)return fail('所持数が足りません。');if(this.storedCount+amount>STORAGE_CAPACITY)return fail('収納がいっぱいです。');
  source[id]-=amount;target[id]=(target[id]??0)+amount;return ok('収納に預けました。');
 }
 withdraw(id:number|string,amount:number,context:HomesteadContext):HomesteadResult {
  const gate=this.gate(context);if(gate)return gate;if(!count(amount)||amount===0)return fail('取り出す数を正しく指定してください。');
  if(typeof id==='number'?!materialIds.includes(id):!Object.hasOwn(CAMPAIGN_ITEMS,id))return fail('この品物は取り出せません。');
  const source:Record<string,number>=typeof id==='number'?this.state.storage.materials:this.state.storage.items,target:Record<string,number>=typeof id==='number'?this.materials:this.items;
  if(!count(source[id])||source[id]<amount)return fail('収納内の数が足りません。');if(!count((target[id]??0)+amount,typeof id==='number'?999999:itemLimit(id)))return fail('持ち物の上限に達しています。');
  source[id]-=amount;target[id]=(target[id]??0)+amount;return ok('収納から取り出しました。');
 }
 /** Materials only: equipped and quest items are deliberately not moved in bulk. */
 depositAll(context:HomesteadContext):HomesteadResult {
  const gate=this.gate(context);if(gate)return gate;const total=materialIds.reduce((sum,id)=>sum+(this.materials[id]??0),0);
  if(!materialIds.every(id=>count(this.materials[id]??0)))return fail('所持数が不正です。');if(!total)return fail('預ける素材がありません。');if(this.storedCount+total>STORAGE_CAPACITY)return fail('収納の空きが足りません。素材は移動していません。');
  for(const id of materialIds){this.state.storage.materials[id]=(this.state.storage.materials[id]??0)+(this.materials[id]??0);this.materials[id]=0;}return ok('すべての素材を預けました。');
 }
 startProcessing(id:string,context:HomesteadContext):HomesteadResult {
  const recipe=PROCESSING_RECIPES.find(r=>r.id===id);if(!recipe)return fail('未知の加工です。');const gate=this.gate(context,recipe.requiresArtisan);if(gate)return gate;
  if(this.state.jobs.length>=3)return fail('加工は同時に3件までです。');if(!this.canPay(recipe.materialCost,recipe.itemCost))return fail('加工に必要な素材が足りません。');
  this.pay(recipe.materialCost,recipe.itemCost);this.state.jobs.push({id:this.state.nextJobId++,recipe:id,remaining:recipe.seconds});return ok(recipe.label+'を始めました。');
 }
 claimProcessing(id:number,context:HomesteadContext):HomesteadResult {
  const gate=this.gate(context);if(gate)return gate;const job=this.state.jobs.find(j=>j.id===id);if(!job)return fail('受け取れる加工品がありません。');if(job.remaining>0)return fail('まだ加工中です。');const recipe=PROCESSING_RECIPES.find(r=>r.id===job.recipe)!;
  if(!this.canReceive(recipe.materialOutput,recipe.itemOutput))return fail('持ち物の空きを作ってください。');this.receive(recipe.materialOutput,recipe.itemOutput);this.state.jobs.splice(this.state.jobs.indexOf(job),1);return ok(recipe.label+'を受け取りました。');
 }
 prepareSeeds(context:HomesteadContext):HomesteadResult {const gate=this.gate(context);if(gate)return gate;if(!this.canPay({7:2,2:1}))return fail('種を選別するには草葉2・土1が必要です。');if(!this.canReceive({}, {'herb-seed':2}))return fail('種の所持上限です。');this.pay({7:2,2:1});this.receive({}, {'herb-seed':2});return ok('薬草の種を2つ選別しました。');}
 plant(id:number,context:HomesteadContext):HomesteadResult {const gate=this.gate(context);if(gate)return gate;const plot=this.state.plots.find(p=>p.id===id);if(!plot)return fail('畑がありません。');if(plot.planted)return fail('この畑は育成中です。');if(!this.canPay({}, {'herb-seed':1}))return fail('薬草の種が必要です。');this.pay({}, {'herb-seed':1});plot.planted=true;plot.remaining=CROP_SECONDS;return ok('薬草の種をまきました。');}
 harvest(id:number,context:HomesteadContext):HomesteadResult {const gate=this.gate(context);if(gate)return gate;const plot=this.state.plots.find(p=>p.id===id);if(!plot?.planted||plot.remaining>0)return fail('まだ収穫できません。');const output={herbs:3,'herb-seed':2};if(!this.canReceive({},output))return fail('持ち物の空きを作ってください。');this.receive({},output);plot.planted=false;plot.remaining=0;return ok('薬草3・種2を収穫しました。');}
 tame(context:HomesteadContext):HomesteadResult {const gate=this.animalInteractionStatus(context);if(!gate.ok)return gate;if(this.state.animal.tamed)return fail('山羊はすでに仲間です。');if(!this.canPay({7:8}))return fail('山羊をなつかせるには草葉8が必要です。');this.pay({7:8});this.state.animal.tamed=true;return ok('山羊が拠点に仲間入りしました。');}
 feed(context:HomesteadContext):HomesteadResult {const gate=this.animalInteractionStatus(context);if(!gate.ok)return gate;const animal=this.state.animal;if(!animal.tamed)return fail('先に山羊をなつかせてください。');if(animal.ready||animal.remaining>0)return fail('先に搾乳を待ち、ミルクを受け取ってください。');if(!this.canPay({7:2}))return fail('餌の草葉2が必要です。');this.pay({7:2});animal.remaining=ANIMAL_SECONDS;return ok('山羊に餌を与えました。');}
 claimAnimal(context:HomesteadContext):HomesteadResult {const gate=this.animalInteractionStatus(context);if(!gate.ok)return gate;if(!this.state.animal.ready)return fail('まだミルクを受け取れません。');if(!this.canReceive({}, {milk:1}))return fail('ミルクの所持上限です。');this.receive({}, {milk:1});this.state.animal.ready=false;return ok('山羊のミルクを受け取りました。');}
 placeFurniture(id:string,context:HomesteadContext):HomesteadResult {const gate=this.gate(context);if(gate)return gate;const furniture=FURNITURE.find(f=>f.id===id);if(!furniture)return fail('未知の家具です。');if(this.state.furniture.includes(id))return fail('同じ種類の家具は設置済みです。');if(!this.canPay(furniture.cost))return fail('家具の素材が足りません。');this.pay(furniture.cost);this.state.furniture.push(id);return ok(furniture.label+'を設置しました。');}
 tick(dt:number){if(!Number.isFinite(dt)||dt<=0)return;const seconds=Math.min(dt,1);for(const job of this.state.jobs)job.remaining=Math.max(0,job.remaining-seconds);for(const plot of this.state.plots)if(plot.planted)plot.remaining=Math.max(0,plot.remaining-seconds);const animal=this.state.animal;if(animal.tamed&&animal.remaining>0){animal.remaining=Math.max(0,animal.remaining-seconds);if(animal.remaining===0)animal.ready=true;}}
 restore(value:unknown):boolean {
  if(!object(value)||value.version!==1||!object(value.storage)||!materialRecord(value.storage.materials)||!itemRecord(value.storage.items))return false;
  if([...Object.values(value.storage.materials),...Object.values(value.storage.items)].reduce((s,n)=>s+n,0)>STORAGE_CAPACITY)return false;
  if(!Array.isArray(value.jobs)||value.jobs.length>3||!count(value.nextJobId)||value.nextJobId<1)return false;
  const ids=new Set<number>();for(const job of value.jobs){if(!object(job)||!count(job.id)||job.id<1||job.id>=value.nextJobId||ids.has(job.id)||typeof job.recipe!=='string')return false;const recipe=PROCESSING_RECIPES.find(r=>r.id===job.recipe);if(!recipe||!finite(job.remaining,recipe.seconds))return false;ids.add(job.id);}
  if(!Array.isArray(value.plots)||value.plots.length!==3)return false;const plots=new Set<number>();for(const p of value.plots){if(!object(p)||!count(p.id,2)||plots.has(p.id)||typeof p.planted!=='boolean'||!finite(p.remaining,CROP_SECONDS)||!p.planted&&p.remaining!==0)return false;plots.add(p.id);}
  const a=value.animal;if(!object(a)||typeof a.tamed!=='boolean'||typeof a.ready!=='boolean'||!finite(a.remaining,ANIMAL_SECONDS)||!a.tamed&&(a.ready||a.remaining!==0)||a.ready&&a.remaining!==0||a.physical!==undefined&&!validHomesteadAnimalState(a.physical))return false;
  if(!Array.isArray(value.furniture)||value.furniture.length>FURNITURE.length||value.furniture.some(id=>typeof id!=='string'||!FURNITURE.some(f=>f.id===id))||new Set(value.furniture).size!==value.furniture.length)return false;
  // Construct only known fields. Failed validation never mutates existing state or ledgers.
  this.state={version:1,storage:clone(value.storage) as HomesteadState['storage'],jobs:clone(value.jobs) as HomesteadState['jobs'],nextJobId:value.nextJobId,plots:clone(value.plots) as HomesteadState['plots'],animal:{tamed:a.tamed,remaining:a.remaining,ready:a.ready,physical:a.physical===undefined?createHomesteadAnimalState():clone(a.physical) as HomesteadAnimalState},furniture:[...value.furniture] as string[]};return true;
 }
}
